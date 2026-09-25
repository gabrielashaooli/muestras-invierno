import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { consultarClaude, ErrorAnalisis, TIPOS_IMAGEN, type Imagen, type TipoImagen } from "@/lib/analisis";
import { PREFIJO_FOTO_BD } from "@/lib/blob";
import { db, normalizarMuestra } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

export const maxDuration = 60;

const INSTRUCCIONES = `Lees etiquetas de ropa en fotos. Solo transcribe números impresos, sin buscar en internet ni inventar.
- "codigo": el UPC/EAN del código de barras (solo dígitos), o "".
- "estilo": en Target el DPCI (formato 000-00-0000); en otras tiendas el número de estilo/artículo; o "".
- "marca": la marca si se lee, o "".
Si un número no se lee completo, pon "". Responde SOLO con JSON: {"codigo":"","estilo":"","marca":""}`;

// POST /api/samples/:id/leer-codigos — lectura rápida (sin internet) de UPC / DPCI / estilo de las fotos,
// para reconocer la muestra en los tickets. Solo llena campos vacíos; no toca fotos ni lo demás.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");
  const sql = await db();
  const [m] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
  if (!m) return errorJson("No existe la muestra", 404);

  // Etiquetas primero; si no hay, la foto de la prenda (a veces trae la etiqueta colgando).
  const urls = [...((m.fotos as string[]) ?? []), ...((m.fotos_prenda as string[]) ?? [])].slice(0, 3);
  const imagenes: Imagen[] = [];
  for (const url of urls) {
    if (!url.startsWith(PREFIJO_FOTO_BD)) continue;
    const [f] = (await sql`SELECT tipo, encode(datos, 'base64') AS b64 FROM fotos WHERE id = ${url.slice(PREFIJO_FOTO_BD.length)}`) as {
      tipo: string;
      b64: string;
    }[];
    if (f && TIPOS_IMAGEN.includes(f.tipo as TipoImagen)) imagenes.push({ data: f.b64.replace(/\s/g, ""), media_type: f.tipo as TipoImagen });
  }
  for (const url of urls) {
    if (!url.startsWith("https://") || imagenes.length >= 3) continue;
    try {
      const res = await fetch(url);
      const tipo = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0] as TipoImagen;
      if (res.ok && TIPOS_IMAGEN.includes(tipo)) imagenes.push({ data: Buffer.from(await res.arrayBuffer()).toString("base64"), media_type: tipo });
    } catch {
      /* se ignora */
    }
  }
  if (imagenes.length === 0) {
    await sql`UPDATE samples SET codigos_leidos = true WHERE id = ${id}`;
    return errorJson("Sin fotos para leer");
  }

  let datos: Record<string, unknown>;
  try {
    ({ datos } = await consultarClaude(
      INSTRUCCIONES,
      [
        ...imagenes.map((img): Anthropic.ContentBlockParam => ({
          type: "image",
          source: { type: "base64", media_type: img.media_type, data: img.data },
        })),
        { type: "text", text: "Transcribe los números de la etiqueta. Solo JSON." },
      ],
      0,
    ));
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }

  const s = (v: unknown) => String(v ?? "").trim();
  const codigo = s(datos.codigo).replace(/\D/g, "");
  const estilo = s(datos.estilo).slice(0, 60);
  const [fila] = (await sql`
    UPDATE samples SET
      codigo = ${s(m.codigo) || (codigo.length >= 8 ? codigo : "")},
      estilo = ${s(m.estilo) || estilo},
      marca = ${s(m.marca) || s(datos.marca).slice(0, 100)},
      codigos_leidos = true
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(fila));
}
