import { NextResponse, type NextRequest } from "next/server";
import { ErrorAnalisis, limpiarImagen, type Imagen } from "@/lib/analisis";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";
import { leerTicket, type MuestraParaTicket } from "@/lib/ticket";

export const maxDuration = 120;

// POST /api/ticket { imagenes: string[] } — lee el ticket y propone a qué muestra corresponde cada artículo.
// No cambia nada: solo devuelve la propuesta para que la persona la confirme.
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null);
  const imagenes = Array.isArray(cuerpo?.imagenes)
    ? (cuerpo.imagenes.map(limpiarImagen).filter(Boolean).slice(0, 4) as Imagen[])
    : [];
  if (imagenes.length === 0) return errorJson("No se recibió la foto del ticket");

  const sql = await db();
  const muestras = (await sql`
    SELECT id, marca, descripcion, codigo, estilo, talla, color, precio_usd
    FROM samples WHERE eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 400`) as Record<string, unknown>[];
  const lista: MuestraParaTicket[] = muestras.map((m) => ({
    id: Number(m.id),
    marca: String(m.marca ?? ""),
    descripcion: String(m.descripcion ?? ""),
    codigo: String(m.codigo ?? ""),
    estilo: String(m.estilo ?? ""),
    talla: String(m.talla ?? ""),
    color: String(m.color ?? ""),
    precio_usd: m.precio_usd === null ? null : Number(m.precio_usd),
  }));

  try {
    return NextResponse.json(await leerTicket(imagenes, lista));
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }
}
