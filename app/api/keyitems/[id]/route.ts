import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// DELETE /api/keyitems/:id — solo oculta el key item (borrado suave); las muestras conservan su liga.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = await sql`UPDATE key_items SET eliminado_en = now() WHERE id = ${id} AND eliminado_en IS NULL RETURNING id`;
  if (filas.length === 0) return errorJson("No existe el key item", 404);
  return NextResponse.json({ ok: true });
}
