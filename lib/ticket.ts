import type Anthropic from "@anthropic-ai/sdk";
import { consultarClaude, type Imagen } from "./analisis";
import { parsePrecio } from "./precio";
import { cantidadValida } from "./tipos";

// Lectura de tickets de compra y búsqueda de la muestra que corresponde a cada renglón.

export interface RenglonTicket {
  descripcion: string;
  codigo: string;
  precio: number | null;
  cantidad: number;
  estilo: string; // número de producto común a todos los colores/tallas
  color: string;
  grupo: string; // renglones con el mismo grupo son la misma prenda en otro color: se juntan
  muestraId: number | null; // muestra que corresponde (si se encontró)
  coincidencia: "codigo" | "claude" | "grupo" | null; // cómo se encontró
}

export interface MuestraParaTicket {
  id: number;
  marca: string;
  descripcion: string;
  codigo: string;
  estilo: string;
  talla: string;
  color: string;
  precio_usd: number | null;
}

const INSTRUCCIONES_TICKET = `Lees tickets (recibos) de compra de tiendas de ropa en Estados Unidos (Walmart, Target, Old Navy, etc.).
Extrae cada artículo comprado. Ignora subtotales, impuestos (TAX), descuentos generales, bolsas, totales y formas de pago.

Para cada artículo:
- "descripcion": el texto del artículo tal cual (ej. "FA CABLE POLO").
- "codigo": el número del artículo o UPC que aparece junto a él (solo dígitos), o "".
- "estilo": el número de producto que comparten todos los colores y tallas de la misma prenda, o "".
  (Ej. en Uniqlo el número de artículo trae producto + color + talla: el estilo son los primeros 6 dígitos.)
- "color": el color si aparece en el ticket (en español), o "".
- "precio": precio unitario en USD como número con punto (ej. "12.98"). Si hay descuento en ese renglón, el precio final. Si no se lee claro, "".
- "cantidad": número de piezas (si dice "2 @ 9.98" son 2). Si no dice, 1.
- "muestraId": el id de la muestra de la lista que corresponde CLARAMENTE a este artículo (misma marca/tipo de prenda y
  precio parecido, o código igual). Si hay duda, null. Nunca repitas un id en dos artículos.

No inventes renglones ni juntes renglones: un objeto por cada renglón del ticket. Responde SOLO con JSON:
{"tienda":"","fecha":"","articulos":[{"descripcion":"","codigo":"","estilo":"","color":"","precio":"","cantidad":1,"muestraId":null}]}`;

const digitos = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "");

// ¿El código del ticket corresponde al de la etiqueta? Los tickets a veces omiten el
// dígito verificador del UPC o agregan ceros al inicio.
export function mismoCodigo(a: string, b: string): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 6 || y.length < 6) return false;
  if (x === y) return true;
  if (x.slice(0, -1) === y || y.slice(0, -1) === x) return true;
  return Math.min(x.length, y.length) >= 8 && (x.includes(y) || y.includes(x));
}

export async function leerTicket(imagenes: Imagen[], muestras: MuestraParaTicket[]) {
  const lista = muestras
    .map((m) =>
      [m.id, m.marca, m.descripcion, m.codigo && `UPC ${m.codigo}`, m.estilo && `estilo ${m.estilo}`, m.talla, m.color,
        m.precio_usd !== null ? `$${m.precio_usd}` : ""].filter(Boolean).join(" | "),
    )
    .join("\n");

  const { datos } = await consultarClaude(
    INSTRUCCIONES_TICKET,
    [
      ...imagenes.map((img): Anthropic.ContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })),
      {
        type: "text",
        text: `Muestras registradas (id | marca | descripción | códigos | talla | color | precio):\n${lista || "(ninguna)"}\n\nLee el ticket y responde solo con el JSON.`,
      },
    ],
    0,
  );

  const idsValidos = new Set(muestras.map((m) => m.id));
  const usados = new Set<number>();
  const articulos = Array.isArray(datos.articulos) ? (datos.articulos as Record<string, unknown>[]) : [];

  const normal = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const renglones: RenglonTicket[] = articulos.slice(0, 100).map((a) => {
    const codigo = String(a.codigo ?? "").replace(/\D/g, "");
    const estilo = String(a.estilo ?? "").replace(/\s/g, "");
    const descripcion = String(a.descripcion ?? "").trim().slice(0, 200);
    const precio = parsePrecio(String(a.precio ?? ""));
    const precioOk = precio !== null && precio > 0 && precio < 10000 ? precio : null;
    // Misma prenda en otro color: mismo estilo, o (si no hay estilo) mismo texto y mismo precio.
    const grupo = estilo ? `e:${estilo.toLowerCase()}` : `d:${normal(descripcion)}|${precioOk ?? ""}`;

    let muestraId: number | null = null;
    let coincidencia: RenglonTicket["coincidencia"] = null;

    // 1) Por código o estilo (lo más seguro).
    const porCodigo = muestras.find(
      (m) =>
        !usados.has(m.id) &&
        ((codigo && (mismoCodigo(codigo, m.codigo) || mismoCodigo(codigo, m.estilo))) ||
          (estilo.length >= 5 && (mismoCodigo(estilo, m.estilo) || mismoCodigo(estilo, m.codigo)))),
    );
    if (porCodigo) {
      muestraId = porCodigo.id;
      coincidencia = "codigo";
    } else {
      // 2) Lo que sugirió Claude por descripción y precio.
      const sugerido = Number(a.muestraId);
      if (idsValidos.has(sugerido) && !usados.has(sugerido)) {
        muestraId = sugerido;
        coincidencia = "claude";
      }
    }
    if (muestraId !== null) usados.add(muestraId);

    return {
      descripcion,
      codigo,
      estilo,
      color: String(a.color ?? "").trim().slice(0, 60),
      grupo,
      precio: precioOk,
      cantidad: cantidadValida(a.cantidad),
      muestraId,
      coincidencia,
    };
  });

  // Los otros colores de una prenda que ya se ligó van a la misma muestra.
  for (const r of renglones) {
    if (r.muestraId !== null) continue;
    const hermano = renglones.find((x) => x !== r && x.grupo === r.grupo && x.muestraId !== null);
    if (hermano) {
      r.muestraId = hermano.muestraId;
      r.coincidencia = "grupo";
    }
  }

  return {
    tienda: String(datos.tienda ?? "").trim().slice(0, 200),
    fecha: String(datos.fecha ?? "").trim().slice(0, 50),
    renglones: renglones.filter((r) => r.descripcion || r.codigo),
  };
}
