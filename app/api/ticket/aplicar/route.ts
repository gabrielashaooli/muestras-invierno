import { NextResponse, type NextRequest } from "next/server";
import { copiaDeDatos, db } from "@/lib/db";
import { parsePrecio } from "@/lib/precio";
import { errorJson, texto } from "@/lib/respuestas";
import { mismoCodigo } from "@/lib/ticket";
import { cantidadValida, esDepartamento } from "@/lib/tipos";

// POST /api/ticket/aplicar — aplica lo que la persona confirmó del ticket.
//   accion "ligar": marca la muestra como comprada con el precio y la cantidad del ticket.
//   accion "crear": crea una muestra nueva (comprada) con los datos del ticket.
//   accion "ignorar": no hace nada.
// Nada se borra ni se duplica: al ligar, los datos anteriores quedan en "respaldo"; renglones repetidos
// se suman y no se crea una muestra si ya existe una con el mismo código o descripción.
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

  // 1) Agrupa: varios renglones de la misma muestra (o del mismo código nuevo) se suman en uno solo.
  const ligar = new Map<number, { cantidad: number; precio: number | null; codigo: string }>();
  const crear = new Map<string, { r: Record<string, unknown>; cantidad: number }>();
  for (const r of renglones) {
    const cantidad = cantidadValida(r.cantidad);
    if (r.accion === "ligar" && Number(r.muestraId) > 0) {
      const id = Number(r.muestraId);
      const previo = ligar.get(id);
      ligar.set(id, {
        cantidad: (previo?.cantidad ?? 0) + cantidad,
        precio: previo?.precio ?? precioDe(r),
        codigo: previo?.codigo || texto(r.codigo, 100),
      });
    } else if (r.accion === "crear") {
      const clave = texto(r.codigo, 100) || `${texto(r.descripcion)}|${precioDe(r) ?? ""}`;
      const previo = crear.get(clave);
      crear.set(clave, { r: previo?.r ?? r, cantidad: (previo?.cantidad ?? 0) + cantidad });
    }
  }

  // 2) Muestras existentes: se marcan como compradas (se reemplaza la cantidad, no se suma a la anterior,
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
        tienda = ${String(m.tienda ?? "").trim() ? m.tienda : tienda},
        respaldo = ${JSON.stringify(respaldo)}::jsonb
      WHERE id = ${id}`;
    actualizadas.push(id);
  }

  // 3) Nuevas: antes de crear, se revisa que no exista ya una muestra con el mismo código
  //    o con la misma descripción del ticket (por si el ticket ya se había subido).
  const existentes = (await sql`
    SELECT id, codigo, estilo, descripcion FROM samples WHERE eliminado_en IS NULL`) as {
    id: number;
    codigo: string;
    estilo: string;
    descripcion: string;
  }[];
  for (const { r, cantidad } of crear.values()) {
    const codigo = texto(r.codigo, 100);
    const descripcion = texto(r.descripcion);
    const yaExiste = existentes.find(
      (m) =>
        (codigo && (mismoCodigo(codigo, m.codigo) || mismoCodigo(codigo, m.estilo))) ||
        (descripcion && m.descripcion.trim().toLowerCase() === descripcion.toLowerCase()),
    );
    if (yaExiste) {
      if (!actualizadas.includes(yaExiste.id)) {
        await sql`UPDATE samples SET status = 'comprado', cantidad = ${cantidad},
                  precio_usd = COALESCE(${precioDe(r)}::numeric, precio_usd)
                  WHERE id = ${yaExiste.id}`;
        actualizadas.push(yaExiste.id);
      }
      continue;
    }
    const dept = esDepartamento(r.dept) ? r.dept : "Mujer";
    const [nueva] = (await sql`
      INSERT INTO samples (dept, status, descripcion, tienda, precio_usd, cantidad, codigo, notas)
      VALUES (${dept}, 'comprado', ${descripcion}, ${tienda}, ${precioDe(r)}, ${cantidad}, ${codigo}, ${"Creada desde ticket"})
      RETURNING id`) as { id: number }[];
    creadas.push(nueva.id);
    existentes.push({ id: nueva.id, codigo, estilo: "", descripcion });
  }

  return NextResponse.json({ actualizadas, creadas });
}
