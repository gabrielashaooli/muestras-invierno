import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";
import { aMuestrasParaTicket, emparejar, type RenglonTicket } from "@/lib/ticket";

// POST /api/ticket/emparejar { renglones, coleccion_id } — vuelve a ligar los renglones ya leídos con las muestras
// (después de leer los códigos de las etiquetas). No lee el ticket otra vez ni cambia nada.
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  const renglones: RenglonTicket[] = Array.isArray(c?.renglones) ? c.renglones.slice(0, 100) : [];
  if (!renglones.length) return errorJson("Sin renglones");
  const coleccionId = Number(c?.coleccion_id) > 0 ? Number(c.coleccion_id) : null;
  const sql = await db();
  const filas = (coleccionId
    ? await sql`SELECT id, marca, descripcion, codigo, estilo, talla, color, precio_usd FROM samples
                WHERE eliminado_en IS NULL AND coleccion_id = ${coleccionId}`
    : await sql`SELECT id, marca, descripcion, codigo, estilo, talla, color, precio_usd FROM samples
                WHERE eliminado_en IS NULL`) as Record<string, unknown>[];
  const limpios = renglones.map((r) => ({
    ...r,
    codigo: String(r.codigo ?? ""),
    estilo: String(r.estilo ?? ""),
    grupo: String(r.grupo ?? ""),
  }));
  return NextResponse.json({ renglones: emparejar(limpios, aMuestrasParaTicket(filas)) });
}
