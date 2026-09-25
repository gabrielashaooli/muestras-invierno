import { NextResponse } from "next/server";
import { ErrorAnalisis } from "@/lib/analisis";
import { completarDesdeTicket } from "@/lib/completar";
import { copiaDeDatos, db, normalizarMuestra } from "@/lib/db";
import { buscarFotosPorColor } from "@/lib/fotoInternet";
import { errorJson } from "@/lib/respuestas";
import type { Fuente } from "@/lib/tipos";

export const maxDuration = 180; // búsqueda del producto + búsqueda de foto

// POST /api/samples/:id/completar — para muestras creadas desde un ticket: escribe una descripción clara,
// llena los datos que falten y, si no tiene foto de prenda, intenta encontrarla en internet.
// Se marca como revisada aunque no se encuentre nada, para no repetir. Nada se borra (hay respaldo).
// Body opcional: { texto_ticket } — texto del renglón del ticket (para muestras que ya existían).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const [m] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
  if (!m) return errorJson("No existe la muestra", 404);

  const s = (v: unknown) => String(v ?? "").trim();
  const cuerpo = await req.json().catch(() => ({}));
  const textoTicket = s(cuerpo?.texto_ticket).slice(0, 200);
  let r;
  try {
    r = await completarDesdeTicket({
      texto: [textoTicket, s(m.marca), s(m.descripcion)].filter(Boolean).join(" · "),
      codigo: s(m.codigo),
      tienda: s(m.tienda),
      precio: m.precio_usd === null ? null : Number(m.precio_usd),
    });
  } catch (e) {
    if (e instanceof ErrorAnalisis && e.estado === 429) return errorJson(e.message, 429); // reintentar después
    await sql`UPDATE samples SET auto_revisado = true WHERE id = ${id}`;
    if (e instanceof ErrorAnalisis) return errorJson(e.message, e.estado);
    throw e;
  }

  const elegir = (actual: unknown, nuevo: string) => (s(actual) ? s(actual) : nuevo);
  const fuentes = new Map<string, Fuente>(((m.fuentes as Fuente[]) ?? []).map((f) => [f.url, f]));
  for (const f of r.fuentes) if (!fuentes.has(f.url)) fuentes.set(f.url, f);
  const respaldo = [...((m.respaldo as unknown[]) ?? []), copiaDeDatos(m)].slice(-10);

  // La descripción del ticket (abreviada) se reemplaza; lo demás solo si está vacío.
  const [fila] = (await sql`
    UPDATE samples SET
      descripcion = ${r.desc || s(m.descripcion)},
      marca = ${elegir(m.marca, r.marca)},
      color = ${elegir(m.color, r.color)},
      tela = ${elegir(m.tela, r.tela)},
      estilo = ${elegir(m.estilo, r.estilo)},
      notas = ${elegir(m.notas, r.notas)},
      fuentes = ${JSON.stringify([...fuentes.values()])}::jsonb,
      respaldo = ${JSON.stringify(respaldo)}::jsonb,
      auto_revisado = true
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];

  // Fotos de la prenda, una por color (mejor esfuerzo).
  if (((fila.fotos_prenda as string[]) ?? []).length === 0) {
    try {
      const r2 = await buscarFotosPorColor({
        marca: s(fila.marca),
        descripcion: s(fila.descripcion),
        codigo: s(fila.codigo),
        estilo: s(fila.estilo),
        color: s(fila.color),
        tienda: s(fila.tienda),
      });
      if (r2.fotos.length) {
        const conFuente = [...((fila.fuentes as Fuente[]) ?? [])];
        for (const pagina of r2.paginas) {
          if (!conFuente.some((f) => f.url === pagina)) conFuente.push({ url: pagina, titulo: "Foto tomada de esta página" });
        }
        // Solo si sigue sin foto (por si alguien le puso una mientras tanto).
        await sql`
          UPDATE samples SET fotos_prenda = ${JSON.stringify(r2.fotos)}::jsonb, fuentes = ${JSON.stringify(conFuente)}::jsonb
          WHERE id = ${id} AND fotos_prenda = '[]'::jsonb`;
      }
    } catch (e) {
      console.error("No se pudo buscar la foto", e);
    }
  }

  const [final] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(final));
}
