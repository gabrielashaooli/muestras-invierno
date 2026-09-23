import { db, normalizarMuestra } from "@/lib/db";
import type { Fuente } from "@/lib/tipos";

// Escapa un valor para CSV (comillas dobles y separadores).
function celda(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/export — CSV con BOM para que Excel respete acentos.
export async function GET(req: Request) {
  // Las fotos guardadas en la base tienen ruta relativa; en el CSV van completas.
  const origen = new URL(req.url).origin;
  const absolutas = (lista: unknown) =>
    ((lista as string[]) ?? []).map((u) => (u.startsWith("/") ? origen + u : u)).join(" ");

  const sql = await db();
  const filas = ((await sql`
    SELECT s.*, k.nombre AS key_item_nombre
    FROM samples s LEFT JOIN key_items k ON k.id = s.key_item_id
    ORDER BY s.dept, s.creado_en`) as Record<string, unknown>[]).map(normalizarMuestra);

  const columnas: [string, (f: Record<string, unknown>) => unknown][] = [
    ["ID", (f) => f.id],
    ["Departamento", (f) => f.dept],
    ["Estatus", (f) => (f.status === "comprado" ? "Comprado" : "Solo foto")],
    ["Prenda", (f) => f.descripcion],
    ["Key item", (f) => f.key_item_nombre],
    ["Tienda", (f) => f.tienda],
    ["Marca", (f) => f.marca],
    ["Precio USD", (f) => f.precio_usd],
    ["Talla", (f) => f.talla],
    ["Color", (f) => f.color],
    ["Composición", (f) => f.tela],
    ["Código de barras", (f) => f.codigo],
    ["Número de estilo", (f) => f.estilo],
    ["Notas", (f) => f.notas],
    ["Fotos prenda", (f) => absolutas(f.fotos_prenda)],
    ["Fotos etiquetas", (f) => absolutas(f.fotos)],
    ["Fuentes", (f) => ((f.fuentes as Fuente[]) ?? []).map((x) => x.url).join(" ")],
    ["Creado", (f) => new Date(f.creado_en as string).toISOString()],
  ];

  const lineas = [
    columnas.map(([titulo]) => celda(titulo)).join(","),
    ...filas.map((f) => columnas.map(([, valor]) => celda(valor(f))).join(",")),
  ];
  const csv = "﻿" + lineas.join("\r\n");
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muestras-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
