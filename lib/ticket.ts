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
  muestraId: number | null; // muestra que corresponde (si se encontró)
  coincidencia: "codigo" | "claude" | null; // cómo se encontró
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
- "precio": precio unitario en USD como número con punto (ej. "12.98"). Si hay descuento en ese renglón, el precio final. Si no se lee claro, "".
- "cantidad": número de piezas (si dice "2 @ 9.98" son 2). Si no dice, 1.
- "muestraId": el id de la muestra de la lista que corresponde CLARAMENTE a este artículo (misma marca/tipo de prenda y
  precio parecido, o código igual). Si hay duda, null. Nunca repitas un id en dos artículos.

No inventes renglones. Responde SOLO con JSON:
{"tienda":"","fecha":"","articulos":[{"descripcion":"","codigo":"","precio":"","cantidad":1,"muestraId":null}]}`;

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

  const renglones: RenglonTicket[] = articulos.slice(0, 100).map((a) => {
    const codigo = String(a.codigo ?? "").replace(/\D/g, "");
    let muestraId: number | null = null;
    let coincidencia: RenglonTicket["coincidencia"] = null;

    // 1) Por código (lo más seguro).
    // (Si dos renglones traen el mismo código, ambos van a la misma muestra y se suman).
    const porCodigo = codigo
      ? muestras.find((m) => mismoCodigo(codigo, m.codigo) || mismoCodigo(codigo, m.estilo))
      : undefined;
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

    const precio = parsePrecio(String(a.precio ?? ""));
    return {
      descripcion: String(a.descripcion ?? "").trim().slice(0, 200),
      codigo,
      precio: precio !== null && precio > 0 && precio < 10000 ? precio : null,
      cantidad: cantidadValida(a.cantidad),
      muestraId,
      coincidencia,
    };
  });

  return {
    tienda: String(datos.tienda ?? "").trim().slice(0, 200),
    fecha: String(datos.fecha ?? "").trim().slice(0, 50),
    renglones: renglones.filter((r) => r.descripcion || r.codigo),
  };
}
