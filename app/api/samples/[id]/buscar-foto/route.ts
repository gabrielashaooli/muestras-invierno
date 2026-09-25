import { NextResponse } from "next/server";
import { ErrorAnalisis } from "@/lib/analisis";
import { db, normalizarMuestra } from "@/lib/db";
import { buscarFotosPorColor } from "@/lib/fotoInternet";
import { errorJson } from "@/lib/respuestas";
import type { Fuente } from "@/lib/tipos";

export const maxDuration = 120;

// POST /api/samples/:id/buscar-foto — busca en internet una foto de la prenda y la pone como foto de prenda
// (solo si la muestra no tiene una). No borra nada.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const [m] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
  if (!m) return errorJson("No existe la muestra", 404);
  if (((m.fotos_prenda as string[]) ?? []).length > 0) return errorJson("Esta muestra ya tiene foto de prenda");
  if (!String(m.descripcion ?? "").trim() && !String(m.codigo ?? "").trim()) {
    return errorJson("Faltan datos (descripción o código) para buscar la foto");
  }

  let resultado;
  try {
    resultado = await buscarFotosPorColor({
      marca: String(m.marca ?? ""),
      descripcion: String(m.descripcion ?? ""),
      codigo: String(m.codigo ?? ""),
      estilo: String(m.estilo ?? ""),
      color: String(m.color ?? ""),
      tienda: String(m.tienda ?? ""),
    });
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }
  if (resultado.fotos.length === 0) {
    return errorJson(
      resultado.paginas.length ? "Se encontró el producto pero la tienda no deja descargar la foto" : "No se encontró la foto en internet",
      404,
    );
  }

  const fuentes = [...((m.fuentes as Fuente[]) ?? [])];
  for (const pagina of resultado.paginas) {
    if (!fuentes.some((f) => f.url === pagina)) fuentes.push({ url: pagina, titulo: "Foto tomada de esta página" });
  }
  const filas = (await sql`
    UPDATE samples SET fotos_prenda = ${JSON.stringify(resultado.fotos)}::jsonb, fuentes = ${JSON.stringify(fuentes)}::jsonb
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(filas[0]));
}
