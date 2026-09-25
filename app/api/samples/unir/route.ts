import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { gruposDuplicados } from "@/lib/duplicados";
import { errorJson } from "@/lib/respuestas";
import { mejorParaConservar, unirMuestras } from "@/lib/unir";

// POST /api/samples/unir
//   { ids: number[] } → junta esas muestras en una (se conserva la más completa).
//   { todas: true }   → junta todos los grupos de repetidas que detecte.
// Las que se juntan quedan ocultas (no se borran) con "unida_a".
export async function POST(req: NextRequest) {
  const c = await req.json().catch(() => null);
  const sql = await db();
  const filas = (await sql`SELECT * FROM samples WHERE eliminado_en IS NULL`) as Record<string, unknown>[];

  let grupos: Record<string, unknown>[][];
  if (c?.todas === true) {
    const lista = filas.map((f) => ({
      ...f,
      id: Number(f.id),
      codigo: String(f.codigo ?? ""),
      estilo: String(f.estilo ?? ""),
      marca: String(f.marca ?? ""),
      descripcion: String(f.descripcion ?? ""),
      tienda: String(f.tienda ?? ""),
    }));
    grupos = gruposDuplicados(lista);
  } else if (Array.isArray(c?.ids) && c.ids.length >= 2) {
    const ids = new Set(c.ids.map(Number));
    grupos = [filas.filter((f) => ids.has(Number(f.id)))];
    if (grupos[0].length < 2) return errorJson("Elige al menos dos muestras");
  } else {
    return errorJson("Nada que unir");
  }

  const resultado = [];
  for (const g of grupos) {
    const conservar = mejorParaConservar(g);
    resultado.push(await unirMuestras(conservar, g.map((f) => Number(f.id))));
  }
  return NextResponse.json({ unidas: resultado.length, muestras: resultado });
}
