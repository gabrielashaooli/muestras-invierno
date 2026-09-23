import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// DELETE /api/keyitems/:id — las muestras ligadas quedan sin key item.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = await sql`DELETE FROM key_items WHERE id = ${id} RETURNING id`;
  if (filas.length === 0) return errorJson("No existe el key item", 404);
  return NextResponse.json({ ok: true });
}
