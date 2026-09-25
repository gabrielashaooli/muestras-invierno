import { NextResponse, type NextRequest } from "next/server";
import { ErrorAnalisis, limpiarImagen, type Imagen } from "@/lib/analisis";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";
import { aMuestrasParaTicket, leerTicket } from "@/lib/ticket";

export const maxDuration = 300;

// POST /api/ticket { imagenes: string[] } — lee el ticket y propone a qué muestra corresponde cada artículo.
// No cambia nada: solo devuelve la propuesta para que la persona la confirme.
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null);
  const imagenes = Array.isArray(cuerpo?.imagenes)
    ? (cuerpo.imagenes.map(limpiarImagen).filter(Boolean).slice(0, 4) as Imagen[])
    : [];
  if (imagenes.length === 0) return errorJson("No se recibió la foto del ticket");

  const sql = await db();
  const coleccionId = Number(cuerpo?.coleccion_id) > 0 ? Number(cuerpo.coleccion_id) : null;
  // Solo se comparan las muestras de la colección actual (si se indicó).
  const muestras = (coleccionId
    ? await sql`
        SELECT id, marca, descripcion, codigo, estilo, talla, color, precio_usd
        FROM samples WHERE eliminado_en IS NULL AND coleccion_id = ${coleccionId} ORDER BY creado_en DESC LIMIT 400`
    : await sql`
        SELECT id, marca, descripcion, codigo, estilo, talla, color, precio_usd
        FROM samples WHERE eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 400`) as Record<string, unknown>[];
  const lista = aMuestrasParaTicket(muestras);

  try {
    return NextResponse.json(await leerTicket(imagenes, lista));
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }
}
