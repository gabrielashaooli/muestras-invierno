import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";
import { esDepartamento } from "@/lib/tipos";

// GET /api/keyitems?dept=Mujer — key items con el número de muestras ligadas.
export async function GET(req: NextRequest) {
  const sql = await db();
  const dept = req.nextUrl.searchParams.get("dept");
  const filas = esDepartamento(dept)
    ? await sql`
        SELECT k.*, COUNT(s.id)::int AS muestras
        FROM key_items k LEFT JOIN samples s ON s.key_item_id = k.id
        WHERE k.dept = ${dept}
        GROUP BY k.id ORDER BY k.id`
    : await sql`
        SELECT k.*, COUNT(s.id)::int AS muestras
        FROM key_items k LEFT JOIN samples s ON s.key_item_id = k.id
        GROUP BY k.id ORDER BY k.dept, k.id`;
  return NextResponse.json(filas);
}

// POST /api/keyitems { dept, texto } — un key item por renglón.
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  if (!c || !esDepartamento(c.dept)) return errorJson("Departamento inválido");

  const renglones: string[] = typeof c.texto === "string" ? c.texto.split(/\r?\n/) : [];
  const nombres = [...new Set(
    renglones
      .map((r) => r.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()) // quita viñetas y numeración
      .filter(Boolean)
      .map((r) => r.slice(0, 200)),
  )].slice(0, 200);
  if (nombres.length === 0) return errorJson("No hay key items para agregar");

  const sql = await db();
  const filas = await sql`
    INSERT INTO key_items (dept, nombre)
    SELECT ${c.dept}, n FROM unnest(${nombres}::text[]) AS n
    RETURNING *, 0 AS muestras`;
  return NextResponse.json(filas, { status: 201 });
}
