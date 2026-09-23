import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";
import { esDepartamento, type Analisis, type Fuente } from "@/lib/tipos";

export const maxDuration = 120; // la búsqueda web puede tardar

const MODELO = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const MAX_VUELTAS = 5; // máximo de reanudaciones por pause_turn
const MAX_IMAGENES = 6;

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type TipoImagen = (typeof TIPOS_IMAGEN)[number];

const INSTRUCCIONES = `Eres un asistente de compras de muestras (market sample shopping) para un equipo de diseño de ropa.
Recibes fotos de una prenda y de sus etiquetas (etiqueta de precio, etiqueta de cuidado/composición, código de barras).

Sigue este orden:
1. Lee con cuidado TODAS las etiquetas visibles: marca, número de estilo, código de barras (UPC/EAN), talla, precio, composición, color.
2. Busca en internet con la herramienta web_search usando marca + número de estilo, o el código de barras, para completar
   el nombre comercial de la prenda, el precio de lista en USD y la composición de la tela.
3. Responde con el JSON final.

Reglas estrictas:
- PROHIBIDO inventar. Si un dato no se lee en las fotos ni se confirma en una fuente, deja el campo como cadena vacía "".
- Si el precio de la etiqueta y el de internet difieren, usa el de la etiqueta y menciona el otro en "notas".
- "precio" es solo el número en USD, sin símbolo (ej. "39.99").
- "desc" es una descripción corta en español de la prenda (ej. "Suéter de punto trenzado cuello redondo").
- "tela" es la composición tal cual (ej. "60% algodón, 40% poliéster").
- "codigo" es el código de barras UPC/EAN si es legible.
- "dept" es uno de: Damas, Caballeros, Infantiles, Bebés (o "" si no es claro).
- "keyItemId" es el id numérico del key item de la lista que mejor corresponda, o null si ninguno aplica claramente.
- "confianza" es "alta", "media" o "baja" según qué tanto se confirmó.
- "notas" en español, breve: qué se confirmó en internet y cualquier discrepancia.

Tu respuesta final debe ser SOLO un objeto JSON, sin texto adicional ni bloques de código, con exactamente estas llaves:
{"desc":"","marca":"","precio":"","talla":"","color":"","tela":"","estilo":"","codigo":"","dept":"","keyItemId":null,"notas":"","confianza":""}`;

// Quita el prefijo data:...;base64, si viene incluido.
function limpiarImagen(entrada: unknown): { data: string; media_type: TipoImagen } | null {
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

const cadena = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// POST /api/analyze { imagenes: string[] (base64), dept }
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return errorJson("Falta ANTHROPIC_API_KEY", 500);

  const cuerpo = await req.json().catch(() => null);
  const imagenes = Array.isArray(cuerpo?.imagenes)
    ? cuerpo.imagenes.map(limpiarImagen).filter(Boolean).slice(0, MAX_IMAGENES) as { data: string; media_type: TipoImagen }[]
    : [];
  if (imagenes.length === 0) return errorJson("No se recibieron imágenes");
  const dept = esDepartamento(cuerpo?.dept) ? cuerpo.dept : null;

  // Key items del departamento para que el modelo pueda ligar la muestra.
  let keyItems: { id: number; nombre: string }[] = [];
  try {
    const sql = await db();
    keyItems = (dept
      ? await sql`SELECT id, nombre FROM key_items WHERE dept = ${dept} ORDER BY id`
      : await sql`SELECT id, nombre FROM key_items ORDER BY id`) as { id: number; nombre: string }[];
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
        ...imagenes.map((img): Anthropic.ImageBlockParam => ({
          type: "image",
          source: { type: "base64", media_type: img.media_type, data: img.data },
        })),
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
    if (e instanceof Anthropic.RateLimitError) return errorJson("Demasiadas solicitudes a Claude, intenta en un momento", 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Error de la API de Claude", e.status, e.message);
      return errorJson(`Error de Claude: ${e.message}`, 502);
    }
    throw e;
  }

  if (respuesta.stop_reason === "refusal") return errorJson("Claude no pudo analizar estas fotos", 422);

  // El JSON viene en los bloques de texto de la última respuesta.
  const textoFinal = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const datos = parsearJson(textoFinal);
  if (!datos) {
    console.error("Respuesta sin JSON", respuesta.stop_reason, textoFinal.slice(0, 500));
    return errorJson("No se pudo interpretar la respuesta de Claude", 502);
  }

  const idSugerido = Number(datos.keyItemId);
  const resultado: Analisis = {
    desc: cadena(datos.desc),
    marca: cadena(datos.marca),
    precio: cadena(datos.precio).replace(/[^0-9.]/g, ""),
    talla: cadena(datos.talla),
    color: cadena(datos.color),
    tela: cadena(datos.tela),
    estilo: cadena(datos.estilo),
    codigo: cadena(datos.codigo),
    dept: esDepartamento(datos.dept) ? datos.dept : "",
    keyItemId: keyItems.some((k) => k.id === idSugerido) ? idSugerido : null,
    notas: cadena(datos.notas),
    confianza: cadena(datos.confianza),
    fuentes: [...fuentes.values()],
  };
  return NextResponse.json(resultado);
}
