import { NextResponse, type NextRequest } from "next/server";
import { urlFotoValida } from "@/lib/blob";
import { parsePrecio } from "@/lib/precio";
import { cantidadValida, esDepartamento } from "@/lib/tipos";
import { copiaDeDatos, db, normalizarMuestra } from "@/lib/db";
import { errorJson, texto } from "@/lib/respuestas";

// DELETE /api/samples/:id — solo oculta la muestra (borrado suave). No se borran datos ni fotos.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = await sql`UPDATE samples SET eliminado_en = now() WHERE id = ${id} AND eliminado_en IS NULL RETURNING id`;
  if (filas.length === 0) return errorJson("No existe la muestra", 404);
  return NextResponse.json({ ok: true });
}

// PATCH /api/samples/:id — cambia el estatus o cuál es la foto de la prenda. Nunca borra fotos.
//   { status }           → "comprado" o "solo_foto".
//   { cantidad }         → número de piezas.
//   { foto_prenda: url } → foto nueva como portada; la anterior pasa al final de las demás fotos.
//   { portada: url }     → una foto que ya estaba en la muestra pasa a ser la portada (intercambio).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return errorJson("Id inválido");

  const c = await req.json().catch(() => null);
  const sql = await db();

  // { editar: {...} } — corrección a mano de los datos; lo anterior queda en "respaldo".
  if (c?.editar && typeof c.editar === "object") {
    const e = c.editar;
    const [m] = (await sql`SELECT * FROM samples WHERE id = ${id}`) as Record<string, unknown>[];
    if (!m) return errorJson("No existe la muestra", 404);
    if (!esDepartamento(e.dept)) return errorJson("Departamento inválido");
    const vacio = e.precio_usd === "" || e.precio_usd === null || e.precio_usd === undefined;
    const precio = vacio ? null : parsePrecio(e.precio_usd);
    if (!vacio && precio === null) return errorJson("Precio inválido: escribe solo el número, ej. 29.99");
    const keyItemId = Number(e.key_item_id) > 0 ? Number(e.key_item_id) : null;
    const respaldo = [...((m.respaldo as unknown[]) ?? []), copiaDeDatos(m)].slice(-10);
    const filas = (await sql`
      UPDATE samples SET
        dept = ${e.dept}, descripcion = ${texto(e.descripcion)}, key_item_id = ${keyItemId},
        tienda = ${texto(e.tienda, 200)}, marca = ${texto(e.marca, 200)}, precio_usd = ${precio},
        talla = ${texto(e.talla, 100)}, color = ${texto(e.color, 100)}, tela = ${texto(e.tela, 300)},
        codigo = ${texto(e.codigo, 100)}, estilo = ${texto(e.estilo, 100)}, notas = ${texto(e.notas, 2000)},
        respaldo = ${JSON.stringify(respaldo)}::jsonb
      WHERE id = ${id}
      RETURNING *`) as Record<string, unknown>[];
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  // { agregar_prenda: url } — agrega otra foto de prenda (ej. otro color) sin quitar las que ya tiene.
  if (urlFotoValida(c?.agregar_prenda)) {
    const filas = (await sql`
      UPDATE samples SET fotos_prenda = fotos_prenda || ${JSON.stringify([c.agregar_prenda])}::jsonb
      WHERE id = ${id}
      RETURNING *`) as Record<string, unknown>[];
    if (filas.length === 0) return errorJson("No existe la muestra", 404);
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  // { quitar_foto: url } — quita una foto de la muestra. No se borra: queda en "fotos_quitadas".
  if (typeof c?.quitar_foto === "string") {
    const [m] = (await sql`SELECT fotos, fotos_prenda, fotos_quitadas FROM samples WHERE id = ${id}`) as {
      fotos: string[];
      fotos_prenda: string[];
      fotos_quitadas: string[];
    }[];
    if (!m) return errorJson("No existe la muestra", 404);
    const url = c.quitar_foto;
    if (![...(m.fotos ?? []), ...(m.fotos_prenda ?? [])].includes(url)) return errorJson("Esa foto no es de esta muestra");
    const filas = (await sql`
      UPDATE samples SET
        fotos = ${JSON.stringify((m.fotos ?? []).filter((f) => f !== url))}::jsonb,
        fotos_prenda = ${JSON.stringify((m.fotos_prenda ?? []).filter((f) => f !== url))}::jsonb,
        fotos_quitadas = ${JSON.stringify([...(m.fotos_quitadas ?? []), url])}::jsonb
      WHERE id = ${id}
      RETURNING *`) as Record<string, unknown>[];
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  // { cantidad } — cambia solo la cantidad de piezas.
  if (c?.cantidad !== undefined) {
    const filas = (await sql`UPDATE samples SET cantidad = ${cantidadValida(c.cantidad)} WHERE id = ${id} RETURNING *`) as Record<string, unknown>[];
    if (filas.length === 0) return errorJson("No existe la muestra", 404);
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  // { status: "comprado" | "solo_foto" } — cambia solo el estatus.
  if (c?.status === "comprado" || c?.status === "solo_foto") {
    const filas = (await sql`UPDATE samples SET status = ${c.status} WHERE id = ${id} RETURNING *`) as Record<string, unknown>[];
    if (filas.length === 0) return errorJson("No existe la muestra", 404);
    return NextResponse.json(normalizarMuestra(filas[0]));
  }

  const [actual] = (await sql`SELECT fotos, fotos_prenda FROM samples WHERE id = ${id}`) as {
    fotos: string[];
    fotos_prenda: string[];
  }[];
  if (!actual) return errorJson("No existe la muestra", 404);

  let fotos = actual.fotos ?? [];
  let prenda = actual.fotos_prenda ?? [];

  if (urlFotoValida(c?.foto_prenda)) {
    fotos = [...fotos, ...prenda];
    prenda = [c.foto_prenda];
  } else if (typeof c?.portada === "string" && fotos.includes(c.portada)) {
    // Intercambio: la portada anterior toma el lugar de la foto elegida.
    fotos = prenda.length ? fotos.map((f) => (f === c.portada ? prenda[0] : f)) : fotos.filter((f) => f !== c.portada);
    prenda = [c.portada, ...prenda.slice(1)];
  } else {
    return errorJson("Foto inválida");
  }

  const filas = (await sql`
    UPDATE samples SET fotos = ${JSON.stringify(fotos)}::jsonb, fotos_prenda = ${JSON.stringify(prenda)}::jsonb
    WHERE id = ${id}
    RETURNING *`) as Record<string, unknown>[];
  return NextResponse.json(normalizarMuestra(filas[0]));
}
