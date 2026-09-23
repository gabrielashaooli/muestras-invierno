import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { PREFIJO_FOTO_BD, tokenBlob, urlFotoValida } from "@/lib/blob";
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
  // Fotos guardadas en la base de datos.
  const idsBd = fotos.filter((f) => f.startsWith(PREFIJO_FOTO_BD)).map((f) => f.slice(PREFIJO_FOTO_BD.length));
  if (idsBd.length > 0) await sql`DELETE FROM fotos WHERE id = ANY(${idsBd}::uuid[])`;

  // Fotos en Vercel Blob.
  const enBlob = fotos.filter((f) => f.startsWith("https://"));
  const token = tokenBlob();
  if (enBlob.length > 0 && token) {
    // Si falla el borrado de fotos no bloqueamos la respuesta.
    await del(enBlob, { token }).catch((e) => console.error("No se pudieron borrar fotos", e));
  }
  return NextResponse.json({ ok: true });
}

// PATCH /api/samples/:id { foto_prenda: string } — pone o cambia la foto de la prenda (portada).
// Si ya había una, se mueve a las fotos de etiqueta para no perderla.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const c = await req.json().catch(() => null);
  const url = c?.foto_prenda;
  if (!urlFotoValida(url)) return errorJson("Foto inválida");

  const sql = await db();
  const filas = (await sql`
    UPDATE samples
    SET fotos = fotos_prenda || fotos,
        fotos_prenda = jsonb_build_array(${url}::text)
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  if (filas.length === 0) return errorJson("No existe la muestra", 404);
  return NextResponse.json(normalizarMuestra(filas[0]));
}
