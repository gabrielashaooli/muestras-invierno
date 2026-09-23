import { NextResponse, type NextRequest } from "next/server";
import { db, normalizarMuestra } from "@/lib/db";
import { errorJson, texto } from "@/lib/respuestas";
import { urlFotoValida } from "@/lib/blob";
import { parsePrecio } from "@/lib/precio";
import { esDepartamento, type Fuente } from "@/lib/tipos";

// GET /api/samples?dept=Mujer — lista de muestras (más recientes primero).
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
  const vacio = c.precio_usd === "" || c.precio_usd === null || c.precio_usd === undefined;
  const precio = vacio ? null : parsePrecio(c.precio_usd);
  if (!vacio && precio === null) return errorJson("Precio inválido: escribe solo el número, ej. 29.99");

  const keyItemId = Number.isInteger(Number(c.key_item_id)) && Number(c.key_item_id) > 0
    ? Number(c.key_item_id)
    : null;

  const urls = (lista: unknown): string[] =>
    Array.isArray(lista)
      ? lista.filter(urlFotoValida).slice(0, 12)
      : [];
  const fotos = urls(c.fotos);
  const fotosPrenda = urls(c.fotos_prenda);
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
      talla, color, tela, codigo, estilo, notas, fuentes, fotos, fotos_prenda
    ) VALUES (
      ${c.dept}, ${status}, ${texto(c.descripcion)}, ${keyItemId}, ${texto(c.tienda, 200)},
      ${texto(c.marca, 200)}, ${precio}, ${texto(c.talla, 100)}, ${texto(c.color, 100)},
      ${texto(c.tela, 300)}, ${texto(c.codigo, 100)}, ${texto(c.estilo, 100)},
      ${texto(c.notas, 2000)}, ${JSON.stringify(fuentes)}::jsonb, ${JSON.stringify(fotos)}::jsonb, ${JSON.stringify(fotosPrenda)}::jsonb
    )
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(fila), { status: 201 });
}
