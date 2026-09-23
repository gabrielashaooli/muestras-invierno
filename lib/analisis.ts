import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { parsePrecio } from "@/lib/precio";
import { esDepartamento, type Analisis, type Departamento, type Fuente } from "@/lib/tipos";

// Lógica compartida del análisis con Claude (visión + búsqueda web).
// La usan /api/analyze (captura) y /api/samples/[id]/analizar (muestras ya guardadas).

export class ErrorAnalisis extends Error {
  constructor(mensaje: string, public estado = 502) {
    super(mensaje);
  }
}

const MODELO = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const MAX_VUELTAS = 5; // máximo de reanudaciones por pause_turn
export const MAX_IMAGENES = 6;

export const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type TipoImagen = (typeof TIPOS_IMAGEN)[number];

const INSTRUCCIONES = `Eres un asistente de compras de muestras (market sample shopping) para un equipo de diseño de ropa.
Recibes fotos de una prenda y de sus etiquetas (etiqueta de precio, etiqueta de cuidado/composición, código de barras).
Las fotos vienen numeradas desde 0 en el orden en que se enviaron.

Sigue este orden:
1. Lee con cuidado TODAS las etiquetas visibles: marca, número de estilo, código de barras (UPC/EAN), talla, precio, composición, color.
2. Busca en internet con la herramienta web_search usando marca + número de estilo, o el código de barras, para completar
   el nombre comercial de la prenda y la composición de la tela.
3. Responde con el JSON final.

Regla principal: ES MEJOR DEJAR UN CAMPO VACÍO QUE PONER UN DATO DUDOSO. La persona lo llenará a mano.
- Solo llena un campo si lo leíste con claridad en una etiqueta o lo confirmaste en una fuente de internet
  que corresponde exactamente a esta prenda (misma marca y mismo estilo o código).
- Nada de aproximaciones, rangos, "posiblemente", "aprox.", "N/A", "desconocido" ni signos de interrogación:
  en esos casos pon "".
- Si un dato se lee a medias (borroso, cortado, tapado), pon "".

Precio ("precio") — sé muy estricto:
- Es el precio que la tienda cobra HOY por esta pieza, leído de la etiqueta física de la foto. Nunca de internet.
- Si la etiqueta tiene varios precios (original tachado y rebaja), usa el precio de rebaja vigente,
  solo si es inequívoco cuál aplica. Si hay duda (ej. "30% extra en caja", precio por pieza vs. por paquete), pon "".
- Si el precio no está en dólares estadounidenses (ej. MXN, CAD, EUR), pon "" y anota el precio con su moneda en "notas".
- Si no hay etiqueta de precio visible, pon "". Si encontraste el precio de lista en internet, escríbelo solo en "notas"
  (ej. "Precio de lista en línea: $49.99").
- Formato: solo el número con punto decimal, sin símbolo ni moneda (ej. "39.99").

Otros campos:
- "desc": descripción corta en español de la prenda (ej. "Suéter de punto trenzado cuello redondo").
- "marca", "talla", "estilo", "codigo": tal como aparecen en la etiqueta. "codigo" es el UPC/EAN completo.
- "tela": composición tal cual (ej. "60% algodón, 40% poliéster"), de la etiqueta o de una fuente confirmada.
- "color": en español, según la etiqueta o lo que se ve claramente en la foto. Si la prenda tiene varios colores,
  ponlos todos separados por coma (ej. "Negro, Blanco").
- "dept": uno de Caballero, Mujer, Infantiles (bebés cuenta como Infantiles), o "" si no es claro.
- "keyItemId": id numérico del key item de la lista que corresponda claramente, o null.
- "confianza": "alta", "media" o "baja".
- "fotoPrenda": número de la foto (desde 0) que mejor muestra la prenda completa (no una etiqueta), o null si todas son etiquetas.
- "notas": en español, una sola frase corta y útil (ej. "Precio de lista en línea: $49.99"). Si no hay nada relevante, "".

Tu respuesta final debe ser SOLO un objeto JSON, sin texto adicional ni bloques de código, con exactamente estas llaves:
{"desc":"","marca":"","precio":"","talla":"","color":"","tela":"","estilo":"","codigo":"","dept":"","keyItemId":null,"notas":"","confianza":"","fotoPrenda":null}`;

// Quita el prefijo data:...;base64, si viene incluido.
export function limpiarImagen(entrada: unknown): { data: string; media_type: TipoImagen } | null {
  if (typeof entrada !== "string" || entrada.length < 100) return null;
  const coincidencia = entrada.match(/^data:(image\/[a-z]+);base64,(.*)$/s);
  const media = (coincidencia?.[1] ?? "image/jpeg") as TipoImagen;
  if (!TIPOS_IMAGEN.includes(media)) return null;
  return { data: coincidencia ? coincidencia[2] : entrada, media_type: media };
}

// Extrae las fuentes (url + título) de los bloques web_search_tool_result.
function extraerFuentes(contenido: Anthropic.ContentBlock[], acumuladas: Map<string, Fuente>) {
  for (const bloque of contenido) {
    if (bloque.type !== "web_search_tool_result") continue;
    // En error, content es un objeto; en éxito, una lista de resultados.
    if (!Array.isArray(bloque.content)) continue;
    for (const r of bloque.content) {
      if (r.type === "web_search_result" && !acumuladas.has(r.url)) {
        acumuladas.set(r.url, { url: r.url, titulo: r.title ?? r.url });
      }
    }
  }
}

// Obtiene el primer objeto JSON del texto del modelo.
function parsearJson(texto: string): Record<string, unknown> | null {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

// Valores que indican que el modelo no estaba seguro: mejor dejar el campo vacío.
const DUDOSO = /\?|\b(aprox|posibl|probabl|quiz|descono|no visible|no legible|ilegible|n\/a|sin dato|no disponible|unknown)/i;

const cadena = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return DUDOSO.test(s) ? "" : s;
};

// El precio solo se acepta si es un número claro y razonable; si no, vacío.
function precioSeguro(v: unknown): string {
  const n = parsePrecio(cadena(v));
  return n !== null && n > 0 && n < 10000 ? n.toFixed(2) : "";
}

export type Imagen = { data: string; media_type: TipoImagen };

// Analiza las fotos de una prenda y devuelve los campos detectados (vacíos si no hay certeza).
export async function analizarImagenes(imagenes: Imagen[], dept: Departamento | null): Promise<Analisis> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorAnalisis("Falta ANTHROPIC_API_KEY", 500);
  imagenes = imagenes.slice(0, MAX_IMAGENES);

  // Key items del departamento para que el modelo pueda ligar la muestra.
  let keyItems: { id: number; nombre: string }[] = [];
  try {
    const sql = await db();
    keyItems = (dept
      ? await sql`SELECT id, nombre FROM key_items WHERE dept = ${dept} AND eliminado_en IS NULL ORDER BY id`
      : await sql`SELECT id, nombre FROM key_items WHERE eliminado_en IS NULL ORDER BY id`) as { id: number; nombre: string }[];
  } catch (e) {
    console.error("No se pudieron leer key items", e);
  }

  const contexto = [
    dept ? `Departamento seleccionado: ${dept}.` : "Departamento no seleccionado.",
    keyItems.length
      ? `Key items disponibles (id: nombre):\n${keyItems.map((k) => `${k.id}: ${k.nombre}`).join("\n")}`
      : "No hay key items registrados; usa keyItemId null.",
  ].join("\n");

  const cliente = new Anthropic();
  const herramientas: Anthropic.ToolUnion[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 4 },
  ];
  const mensajes: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        ...imagenes.flatMap((img, i): Anthropic.ContentBlockParam[] => [
          { type: "text", text: `Foto ${i}:` },
          { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
        ]),
        { type: "text", text: `${contexto}\n\nAnaliza la prenda y responde solo con el JSON.` },
      ],
    },
  ];

  const fuentes = new Map<string, Fuente>();
  let respuesta: Anthropic.Message;

  try {
    respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: INSTRUCCIONES,
      tools: herramientas,
      messages: mensajes,
    });
    extraerFuentes(respuesta.content, fuentes);

    // pause_turn: el servidor pausó su ciclo de búsqueda. Se reenvía el mensaje
    // del assistant sin modificar para que continúe donde se quedó.
    for (let vuelta = 0; respuesta.stop_reason === "pause_turn" && vuelta < MAX_VUELTAS; vuelta++) {
      mensajes.push({ role: "assistant", content: respuesta.content });
      respuesta = await cliente.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: INSTRUCCIONES,
        tools: herramientas,
        messages: mensajes,
      });
      extraerFuentes(respuesta.content, fuentes);
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ErrorAnalisis("Demasiadas solicitudes a Claude, intenta en un momento", 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Error de la API de Claude", e.status, e.message);
      throw new ErrorAnalisis(`Error de Claude: ${e.message}`, 502);
    }
    throw e;
  }

  if (respuesta.stop_reason === "refusal") throw new ErrorAnalisis("Claude no pudo analizar estas fotos", 422);

  // El JSON viene en los bloques de texto de la última respuesta.
  const textoFinal = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const datos = parsearJson(textoFinal);
  if (!datos) {
    console.error("Respuesta sin JSON", respuesta.stop_reason, textoFinal.slice(0, 500));
    throw new ErrorAnalisis("No se pudo interpretar la respuesta de Claude", 502);
  }

  const idSugerido = Number(datos.keyItemId);
  const resultado: Analisis = {
    desc: cadena(datos.desc),
    marca: cadena(datos.marca),
    precio: precioSeguro(datos.precio),
    talla: cadena(datos.talla),
    color: cadena(datos.color),
    tela: cadena(datos.tela),
    estilo: cadena(datos.estilo),
    codigo: cadena(datos.codigo),
    dept: esDepartamento(datos.dept) ? datos.dept : "",
    keyItemId: keyItems.some((k) => k.id === idSugerido) ? idSugerido : null,
    notas: typeof datos.notas === "string" ? datos.notas.trim() : "",
    confianza: cadena(datos.confianza),
    fotoPrenda:
      Number.isInteger(datos.fotoPrenda) && (datos.fotoPrenda as number) >= 0 && (datos.fotoPrenda as number) < imagenes.length
        ? (datos.fotoPrenda as number)
        : null,
    fuentes: [...fuentes.values()],
  };
  return resultado;
}
