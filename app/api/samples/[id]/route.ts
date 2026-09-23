import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { db, normalizarMuestra } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// DELETE /api/samples/:id — borra la muestra y sus fotos en Blob.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = (await sql`DELETE FROM samples WHERE id = ${id} RETURNING fotos, fotos_prenda`) as {
    fotos: string[];
    fotos_prenda: string[];
  }[];
  if (filas.length === 0) return errorJson("No existe la muestra", 404);

  const fotos = [...(filas[0].fotos ?? []), ...(filas[0].fotos_prenda ?? [])];
  if (fotos.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    // Si falla el borrado de fotos no bloqueamos la respuesta.
    await del(fotos).catch((e) => console.error("No se pudieron borrar fotos", e));
  }
  return NextResponse.json({ ok: true });
}

// PATCH /api/samples/:id { agregar_fotos_prenda: string[] } — agrega fotos de la prenda a una muestra ya guardada.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const c = await req.json().catch(() => null);
  const nuevas: string[] = Array.isArray(c?.agregar_fotos_prenda)
    ? c.agregar_fotos_prenda.filter((f: unknown): f is string => typeof f === "string" && f.startsWith("https://")).slice(0, 12)
    : [];
  if (nuevas.length === 0) return errorJson("No hay fotos para agregar");

  const sql = await db();
  const filas = (await sql`
    UPDATE samples SET fotos_prenda = fotos_prenda || ${JSON.stringify(nuevas)}::jsonb
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  if (filas.length === 0) return errorJson("No existe la muestra", 404);
  return NextResponse.json(normalizarMuestra(filas[0]));
}
