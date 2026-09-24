import { NextResponse } from "next/server";
import { analizarImagenes, ErrorAnalisis, MAX_IMAGENES, TIPOS_IMAGEN, type Imagen, type TipoImagen } from "@/lib/analisis";
import { PREFIJO_FOTO_BD } from "@/lib/blob";
import { copiaDeDatos, db, normalizarMuestra } from "@/lib/db";
import { parsePrecio } from "@/lib/precio";
import { errorJson } from "@/lib/respuestas";
import { esDepartamento, type Fuente } from "@/lib/tipos";

export const maxDuration = 120; // la búsqueda web puede tardar

// POST /api/samples/:id/analizar — analiza con Claude las fotos ya guardadas de una muestra.
//   { modo: "llenar" } (por defecto) → llena SOLO los campos vacíos.
//   { modo: "reemplazar" }           → vuelve a revisar desde cero y reemplaza los datos de la prenda
//                                       (tienda, estatus y cantidad no se tocan; el precio solo si Claude lo leyó).
//   En modo reemplazar, los datos anteriores se guardan en "respaldo".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");
  const cuerpo = await req.json().catch(() => ({}));
  const reemplazar = cuerpo?.modo === "reemplazar";

  const sql = await db();
  const [m] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
  if (!m) return errorJson("No existe la muestra", 404);

  // Etiquetas primero (tienen los datos), luego la foto de la prenda.
  const urls = [...((m.fotos as string[]) ?? []), ...((m.fotos_prenda as string[]) ?? [])].slice(0, MAX_IMAGENES);
  if (urls.length === 0) return errorJson("Esta muestra no tiene fotos para analizar");

  const imagenes: Imagen[] = [];
  for (const url of urls) {
    try {
      if (url.startsWith(PREFIJO_FOTO_BD)) {
        const [f] = (await sql`SELECT tipo, encode(datos, 'base64') AS b64 FROM fotos WHERE id = ${url.slice(PREFIJO_FOTO_BD.length)}`) as {
          tipo: string;
          b64: string;
        }[];
        if (f && TIPOS_IMAGEN.includes(f.tipo as TipoImagen)) imagenes.push({ data: f.b64.replace(/\s/g, ""), media_type: f.tipo as TipoImagen });
      } else {
        const res = await fetch(url);
        const tipo = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0] as TipoImagen;
        if (res.ok && TIPOS_IMAGEN.includes(tipo)) {
          imagenes.push({ data: Buffer.from(await res.arrayBuffer()).toString("base64"), media_type: tipo });
        }
      }
    } catch (e) {
      console.error("No se pudo leer la foto", url, e);
    }
  }
  if (imagenes.length === 0) return errorJson("No se pudieron leer las fotos de esta muestra");

  let r;
  try {
    r = await analizarImagenes(imagenes, esDepartamento(m.dept) ? m.dept : null);
  } catch (e) {
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }

  const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  const fuentes = new Map<string, Fuente>(reemplazar ? [] : ((m.fuentes as Fuente[]) ?? []).map((f) => [f.url, f]));
  for (const f of r.fuentes) if (!fuentes.has(f.url)) fuentes.set(f.url, f);

  if (reemplazar) {
    const precio = parsePrecio(r.precio);
    const respaldo = [...((m.respaldo as unknown[]) ?? []), copiaDeDatos(m)].slice(-10);
    const filas = (await sql`
      UPDATE samples SET
        descripcion = ${r.desc},
        marca = ${r.marca},
        precio_usd = ${precio ?? (vacio(m.precio_usd) ? null : Number(m.precio_usd))},
        talla = ${r.talla},
        color = ${r.color},
        tela = ${r.tela},
        codigo = ${r.codigo},
        estilo = ${r.estilo},
        key_item_id = ${r.keyItemId ?? (vacio(m.key_item_id) ? null : Number(m.key_item_id))},
        notas = ${r.notas},
        fuentes = ${JSON.stringify([...fuentes.values()])}::jsonb,
        respaldo = ${JSON.stringify(respaldo)}::jsonb
      WHERE id = ${id}
      RETURNING *`) as Record<string, unknown>[];
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  // Solo se llenan los vacíos.
  const elegir = (actual: unknown, nuevo: string) => (vacio(actual) ? nuevo : String(actual));

  const filas = (await sql`    UPDATE samples SET
      descripcion = ${elegir(m.descripcion, r.desc)},
      marca = ${elegir(m.marca, r.marca)},
      precio_usd = ${vacio(m.precio_usd) ? parsePrecio(r.precio) : Number(m.precio_usd)},
      talla = ${elegir(m.talla, r.talla)},
      color = ${elegir(m.color, r.color)},
      tela = ${elegir(m.tela, r.tela)},
      codigo = ${elegir(m.codigo, r.codigo)},
      estilo = ${elegir(m.estilo, r.estilo)},
      key_item_id = ${vacio(m.key_item_id) ? r.keyItemId : Number(m.key_item_id)},
      notas = ${elegir(m.notas, r.notas)},
      fuentes = ${JSON.stringify([...fuentes.values()])}::jsonb
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(filas[0]));
}
