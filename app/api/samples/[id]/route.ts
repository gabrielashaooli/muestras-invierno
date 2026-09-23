import { NextResponse, type NextRequest } from "next/server";
import { urlFotoValida } from "@/lib/blob";
import { db, normalizarMuestra } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// DELETE /api/samples/:id — solo oculta la muestra (borrado suave). No se borran datos ni fotos.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = await sql`UPDATE samples SET eliminado_en = now() WHERE id = ${id} AND eliminado_en IS NULL RETURNING id`;
  if (filas.length === 0) return errorJson("No existe la muestra", 404);
  return NextResponse.json({ ok: true });
}

// PATCH /api/samples/:id — cambia cuál es la foto de la prenda (portada). Nunca borra fotos.
//   { foto_prenda: url } → foto nueva como portada; la anterior pasa al final de las demás fotos.
//   { portada: url }     → una foto que ya estaba en la muestra pasa a ser la portada (intercambio).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const c = await req.json().catch(() => null);
  const sql = await db();
  const [actual] = (await sql`SELECT fotos, fotos_prenda FROM samples WHERE id = ${id}`) as {
    fotos: string[];
    fotos_prenda: string[];
  }[];
  if (!actual) return errorJson("No existe la muestra", 404);

  let fotos = actual.fotos ?? [];
  let prenda = actual.fotos_prenda ?? [];

  if (urlFotoValida(c?.foto_prenda)) {
    fotos = [...fotos, ...prenda];
    prenda = [c.foto_prenda];
  } else if (typeof c?.portada === "string" && fotos.includes(c.portada)) {
    // Intercambio: la portada anterior toma el lugar de la foto elegida.
    fotos = prenda.length ? fotos.map((f) => (f === c.portada ? prenda[0] : f)) : fotos.filter((f) => f !== c.portada);
    prenda = [c.portada, ...prenda.slice(1)];
  } else {
    return errorJson("Foto inválida");
  }

  const filas = (await sql`
    UPDATE samples SET fotos = ${JSON.stringify(fotos)}::jsonb, fotos_prenda = ${JSON.stringify(prenda)}::jsonb
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(filas[0]));
}
