import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson, texto } from "@/lib/respuestas";

// PATCH /api/colecciones/:id { nombre } — cambia el nombre.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const c = await req.json().catch(() => null);
  const nombre = texto(c?.nombre, 80);
  if (!Number.isInteger(id) || !nombre) return errorJson("Datos inválidos");
  const sql = await db();
  const [fila] = await sql`UPDATE colecciones SET nombre = ${nombre} WHERE id = ${id} RETURNING *`;
  if (!fila) return errorJson("No existe la colección", 404);
  return NextResponse.json(fila);
}
