import { NextResponse, type NextRequest } from "next/server";
import { analizarImagenes, ErrorAnalisis, limpiarImagen, MAX_IMAGENES, type Imagen } from "@/lib/analisis";
import { errorJson } from "@/lib/respuestas";
import { esDepartamento } from "@/lib/tipos";

export const maxDuration = 120; // la búsqueda web puede tardar

// POST /api/analyze { imagenes: string[] (base64), dept }
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null);
  const imagenes = Array.isArray(cuerpo?.imagenes)
    ? (cuerpo.imagenes.map(limpiarImagen).filter(Boolean).slice(0, MAX_IMAGENES) as Imagen[])
    : [];
  if (imagenes.length === 0) return errorJson("No se recibieron imágenes");
  const dept = esDepartamento(cuerpo?.dept) ? cuerpo.dept : null;

  try {
    return NextResponse.json(await analizarImagenes(imagenes, dept));
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }
}
