import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// DELETE /api/samples/:id — borra la muestra y sus fotos en Blob.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = (await sql`DELETE FROM samples WHERE id = ${id} RETURNING fotos`) as { fotos: string[] }[];
  if (filas.length === 0) return errorJson("No existe la muestra", 404);

  const fotos = filas[0].fotos ?? [];
  if (fotos.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    // Si falla el borrado de fotos no bloqueamos la respuesta.
    await del(fotos).catch((e) => console.error("No se pudieron borrar fotos", e));
  }
  return NextResponse.json({ ok: true });
}
