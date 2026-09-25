import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson, texto } from "@/lib/respuestas";

// GET /api/colecciones — colecciones con conteos, gasto y fotos de portada.
export async function GET() {
  const sql = await db();
  const filas = await sql`
    SELECT c.id, c.nombre, c.creado_en,
      COUNT(s.id)::int AS muestras,
      COUNT(s.id) FILTER (WHERE s.status = 'comprado')::int AS compradas,
      COALESCE(SUM(s.precio_usd * s.cantidad) FILTER (WHERE s.status = 'comprado'), 0)::float AS gasto,
      COUNT(DISTINCT lower(trim(s.tienda))) FILTER (WHERE trim(s.tienda) <> '')::int AS tiendas,
      (SELECT COALESCE(json_agg(x.f), '[]'::json) FROM (
        SELECT s2.fotos_prenda->>0 AS f FROM samples s2
        WHERE s2.coleccion_id = c.id AND s2.eliminado_en IS NULL AND jsonb_array_length(s2.fotos_prenda) > 0
        ORDER BY s2.creado_en DESC LIMIT 4) x) AS portadas
    FROM colecciones c
    LEFT JOIN samples s ON s.coleccion_id = c.id AND s.eliminado_en IS NULL
    WHERE c.eliminado_en IS NULL
    GROUP BY c.id ORDER BY c.creado_en DESC`;
  return NextResponse.json(filas);
}

// POST /api/colecciones { nombre } — nueva colección.
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  const nombre = texto(c?.nombre, 80);
  if (!nombre) return errorJson("Escribe el nombre de la colección");
  const sql = await db();
  const [fila] = await sql`INSERT INTO colecciones (nombre) VALUES (${nombre}) RETURNING *`;
  return NextResponse.json(fila, { status: 201 });
}
