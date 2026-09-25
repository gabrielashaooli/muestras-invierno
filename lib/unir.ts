import { unirColores } from "./codigos";
import { copiaDeDatos, db, normalizarMuestra } from "./db";
import type { Fuente } from "./tipos";

// Junta varias muestras que son la misma prenda en una sola.
// La que se conserva recibe todas las fotos, colores y los datos que le falten.
// Las demás quedan ocultas (eliminado_en) con "unida_a" apuntando a la conservada: nada se borra.
export async function unirMuestras(conservarId: number, otrosIds: number[]) {
  const sql = await db();
  const ids = [conservarId, ...otrosIds.filter((i) => i !== conservarId)];
  const filas = (await sql`SELECT * FROM samples WHERE id = ANY(${ids}::int[]) AND eliminado_en IS NULL`) as Record<string, unknown>[];
  const base = filas.find((f) => Number(f.id) === conservarId);
  if (!base) throw new Error("No existe la muestra a conservar");
  const otras = filas.filter((f) => Number(f.id) !== conservarId);
  if (otras.length === 0) return normalizarMuestra(base);

  const todas = [base, ...otras];
  const texto = (v: unknown) => String(v ?? "").trim();
  const primero = (campo: string) => todas.map((f) => texto(f[campo])).find(Boolean) ?? "";
  const unicos = (campo: string) => [...new Set(todas.flatMap((f) => (f[campo] as string[]) ?? []))];

  const compradas = todas.filter((f) => f.status === "comprado");
  const status = compradas.length ? "comprado" : "solo_foto";
  // Cantidad: la de la compra (ticket) si hay; si no, la mayor.
  const cantidad = Math.max(1, ...(compradas.length ? compradas : todas).map((f) => Number(f.cantidad ?? 1) || 1));
  const conPrecio = [...compradas, ...todas].find((f) => f.precio_usd !== null && f.precio_usd !== undefined);
  const fuentes = [...new Map(todas.flatMap((f) => (f.fuentes as Fuente[]) ?? []).map((f) => [f.url, f])).values()];
  const respaldo = [...((base.respaldo as unknown[]) ?? []), ...todas.map((f) => ({ ...copiaDeDatos(f), id: f.id }))].slice(-20);
  const keyItem = todas.map((f) => f.key_item_id).find((k) => k !== null && k !== undefined) ?? null;

  const [unida] = (await sql`
    UPDATE samples SET
      status = ${status},
      cantidad = ${cantidad},
      precio_usd = ${conPrecio ? Number(conPrecio.precio_usd) : null},
      descripcion = ${primero("descripcion")},
      marca = ${primero("marca")},
      tienda = ${primero("tienda")},
      talla = ${primero("talla")},
      tela = ${primero("tela")},
      codigo = ${primero("codigo")},
      estilo = ${primero("estilo")},
      notas = ${primero("notas")},
      color = ${unirColores(...todas.map((f) => texto(f.color)))},
      key_item_id = ${keyItem === null ? null : Number(keyItem)},
      fotos_prenda = ${JSON.stringify(unicos("fotos_prenda"))}::jsonb,
      fotos = ${JSON.stringify(unicos("fotos"))}::jsonb,
      fuentes = ${JSON.stringify(fuentes)}::jsonb,
      respaldo = ${JSON.stringify(respaldo)}::jsonb
    WHERE id = ${conservarId}
    RETURNING *`) as Record<string, unknown>[];

  const idsOtras = otras.map((f) => Number(f.id));
  await sql`UPDATE samples SET eliminado_en = now(), unida_a = ${conservarId} WHERE id = ANY(${idsOtras}::int[])`;
  return normalizarMuestra(unida);
}

// Cuál conviene conservar: la comprada, con foto de prenda y con más datos llenos.
export function mejorParaConservar(lista: Record<string, unknown>[]): number {
  const puntos = (f: Record<string, unknown>) =>
    (f.status === "comprado" ? 100 : 0) +
    (((f.fotos_prenda as string[]) ?? []).length ? 50 : 0) +
    ["descripcion", "marca", "talla", "color", "tela", "codigo", "estilo", "tienda"].filter((c) => String(f[c] ?? "").trim()).length;
  return Number([...lista].sort((a, b) => puntos(b) - puntos(a))[0].id);
}
