import { NextResponse, type NextRequest } from "next/server";
import { copiaDeDatos, db } from "@/lib/db";
import { parsePrecio } from "@/lib/precio";
import { errorJson, texto } from "@/lib/respuestas";
import { cantidadValida, esDepartamento } from "@/lib/tipos";

// POST /api/ticket/aplicar — aplica lo que la persona confirmó del ticket.
//   accion "ligar": marca la muestra como comprada con el precio y la cantidad del ticket.
//   accion "crear": crea una muestra nueva (comprada) con los datos del ticket.
//   accion "ignorar": no hace nada.
// Nada se borra ni se duplica: al ligar, los datos anteriores quedan en "respaldo"; la misma prenda en
// varios colores queda en una sola muestra (piezas sumadas, colores juntos); si el mismo ticket se sube
// otra vez, se reconoce y no se repite.
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  const renglones: Record<string, unknown>[] = Array.isArray(c?.renglones) ? c.renglones.slice(0, 100) : [];
  if (renglones.length === 0) return errorJson("No hay artículos para aplicar");
  const tienda = texto(c?.tienda, 200);

  const sql = await db();
  const actualizadas: number[] = [];
  const creadas: number[] = [];
  const precioDe = (r: Record<string, unknown>) =>
    r.precio === null || r.precio === undefined || r.precio === "" ? null : parsePrecio(String(r.precio));

  const fecha = texto(c?.fecha, 50);

  // Colores sin repetir, en el orden en que aparecen.
  const unirColores = (...listas: string[]) =>
    [...new Map(listas.flatMap((l) => l.split(/\s*,\s*/)).filter(Boolean).map((c) => [c.toLowerCase(), c])).values()].join(", ");

  // 1) Ligar: todos los renglones que van a la misma muestra (ej. la misma prenda en 2 colores)
  //    se juntan: se suman las piezas y se agregan los colores.
  const ligar = new Map<number, { cantidad: number; precio: number | null; codigo: string; estilo: string; colores: string }>();
  for (const r of renglones) {
    if (r.accion !== "ligar" || !(Number(r.muestraId) > 0)) continue;
    const id = Number(r.muestraId);
    const previo = ligar.get(id);
    ligar.set(id, {
      cantidad: (previo?.cantidad ?? 0) + cantidadValida(r.cantidad),
      precio: previo?.precio ?? precioDe(r),
      codigo: previo?.codigo || texto(r.codigo, 100),
      estilo: previo?.estilo || texto(r.estilo, 100),
      colores: unirColores(previo?.colores ?? "", texto(r.color, 60)),
    });
  }

  // 2) Muestras existentes: se marcan como compradas (la cantidad se reemplaza, no se suma a la anterior,
  //    así subir el mismo ticket dos veces no duplica nada).
  for (const [id, d] of ligar) {
    const [m] = (await sql`SELECT * FROM samples WHERE id = ${id} AND eliminado_en IS NULL`) as Record<string, unknown>[];
    if (!m) continue;
    const respaldo = [...((m.respaldo as unknown[]) ?? []), copiaDeDatos(m)].slice(-10);
    await sql`
      UPDATE samples SET
        status = 'comprado',
        precio_usd = ${d.precio ?? (m.precio_usd === null ? null : Number(m.precio_usd))},
        cantidad = ${d.cantidad},
        codigo = ${String(m.codigo ?? "").trim() ? m.codigo : d.codigo},
        estilo = ${String(m.estilo ?? "").trim() ? m.estilo : d.estilo},
        color = ${unirColores(String(m.color ?? ""), d.colores)},
        tienda = ${String(m.tienda ?? "").trim() ? m.tienda : tienda},
        respaldo = ${JSON.stringify(respaldo)}::jsonb
      WHERE id = ${id}`;
    actualizadas.push(id);
  }

  // 3) Nuevas: una muestra por prenda. Los renglones del mismo estilo (otro color) se juntan:
  //    piezas sumadas y colores juntos. Si el mismo ticket se sube otra vez, se reconoce y no se repite.
  const grupos = new Map<string, Record<string, unknown>[]>();
  renglones.forEach((r, i) => {
    if (r.accion !== "crear") return;
    const clave = texto(r.grupo, 300) || `r${i}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
  });

  for (const [clave, rs] of grupos) {
    const primero = rs[0];
    const cantidad = rs.reduce((t, r) => t + cantidadValida(r.cantidad), 0);
    const colores = unirColores(...rs.map((r) => texto(r.color, 60)));
    const precio = precioDe(primero);
    const linea = [tienda.toLowerCase(), fecha, clave].join("|");

    const [previa] = (await sql`
      SELECT id FROM samples WHERE ticket_linea = ${linea} AND eliminado_en IS NULL LIMIT 1`) as { id: number }[];
    if (previa) {
      await sql`UPDATE samples SET status = 'comprado', cantidad = ${cantidad} WHERE id = ${previa.id}`;
      if (!actualizadas.includes(previa.id)) actualizadas.push(previa.id);
      continue;
    }
    const dept = esDepartamento(primero.dept) ? primero.dept : "Mujer";
    const [nueva] = (await sql`
      INSERT INTO samples (dept, status, descripcion, tienda, precio_usd, cantidad, codigo, estilo, color, origen, ticket_linea)
      VALUES (${dept}, 'comprado', ${texto(primero.descripcion)}, ${tienda}, ${precio}, ${cantidad},
              ${texto(primero.codigo, 100)}, ${texto(primero.estilo, 100)}, ${colores}, 'ticket', ${linea})
      RETURNING id`) as { id: number }[];
    creadas.push(nueva.id);
  }

  return NextResponse.json({ actualizadas, creadas });
}
