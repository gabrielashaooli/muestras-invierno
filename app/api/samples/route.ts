import { NextResponse, type NextRequest } from "next/server";
import { db, normalizarMuestra } from "@/lib/db";
import { errorJson, texto } from "@/lib/respuestas";
import { esDepartamento, type Fuente } from "@/lib/tipos";

// GET /api/samples?dept=Damas — lista de muestras (más recientes primero).
export async function GET(req: NextRequest) {
  const sql = await db();
  const dept = req.nextUrl.searchParams.get("dept");
  const filas = (esDepartamento(dept)
    ? await sql`
        SELECT s.*, k.nombre AS key_item_nombre
        FROM samples s LEFT JOIN key_items k ON k.id = s.key_item_id
        WHERE s.dept = ${dept}
        ORDER BY s.creado_en DESC`
    : await sql`
        SELECT s.*, k.nombre AS key_item_nombre
        FROM samples s LEFT JOIN key_items k ON k.id = s.key_item_id
        ORDER BY s.creado_en DESC`) as Record<string, unknown>[];
  return NextResponse.json(filas.map(normalizarMuestra));
}

// POST /api/samples — guarda una muestra nueva.
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  if (!c || typeof c !== "object") return errorJson("Cuerpo inválido");
  if (!esDepartamento(c.dept)) return errorJson("Departamento inválido");

  const status = c.status === "comprado" ? "comprado" : "solo_foto";
  const precio = c.precio_usd === "" || c.precio_usd === null || c.precio_usd === undefined
    ? null
    : Number(String(c.precio_usd).replace(/[^0-9.]/g, ""));
  if (precio !== null && !Number.isFinite(precio)) return errorJson("Precio inválido");

  const keyItemId = Number.isInteger(Number(c.key_item_id)) && Number(c.key_item_id) > 0
    ? Number(c.key_item_id)
    : null;

  const fotos: string[] = Array.isArray(c.fotos)
    ? c.fotos.filter((f: unknown): f is string => typeof f === "string" && f.startsWith("https://")).slice(0, 12)
    : [];
  const fuentes: Fuente[] = Array.isArray(c.fuentes)
    ? c.fuentes
        .filter((f: Fuente) => f && typeof f.url === "string")
        .map((f: Fuente) => ({ url: f.url, titulo: texto(f.titulo, 300) }))
        .slice(0, 20)
    : [];

  const sql = await db();
  const [fila] = (await sql`
    INSERT INTO samples (
      dept, status, descripcion, key_item_id, tienda, marca, precio_usd,
      talla, color, tela, codigo, estilo, notas, fuentes, fotos
    ) VALUES (
      ${c.dept}, ${status}, ${texto(c.descripcion)}, ${keyItemId}, ${texto(c.tienda, 200)},
      ${texto(c.marca, 200)}, ${precio}, ${texto(c.talla, 100)}, ${texto(c.color, 100)},
      ${texto(c.tela, 300)}, ${texto(c.codigo, 100)}, ${texto(c.estilo, 100)},
      ${texto(c.notas, 2000)}, ${JSON.stringify(fuentes)}::jsonb, ${JSON.stringify(fotos)}::jsonb
    )
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(fila), { status: 201 });
}
