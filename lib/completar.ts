import { consultarClaude } from "./analisis";
import { esDepartamento } from "./tipos";

// Completa una muestra creada desde un ticket: el ticket trae textos abreviados
// (ej. "FA CABLE POLO"); con búsqueda web se identifica la prenda y se escribe bien.

const INSTRUCCIONES_COMPLETAR = `Te dan un artículo de ropa tal como aparece en un ticket de compra de una tienda en Estados Unidos
(texto abreviado, código/UPC o número de artículo, tienda y precio). Busca en internet con web_search para identificar
exactamente qué prenda es (usa el código/UPC y la tienda; por ejemplo "walmart 198566802913" o el texto del ticket).

Reglas:
- PROHIBIDO inventar. Solo llena un campo si lo confirmaste en una fuente que corresponde a ESTE artículo, o si es obvio
  por el texto del ticket. Si no, "".
- "desc": descripción corta y clara en español de la prenda (ej. "Polo de punto trenzado manga corta"). Si no pudiste
  confirmar el producto, traduce solo lo que es seguro del texto del ticket (ej. "POLO" → "Polo"); nunca dejes abreviaturas.
- "marca": marca real (ej. "FA" en Walmart es "Free Assembly") solo si se confirmó.
- "color", "tela" (composición), "estilo" (número de estilo): solo si se confirmaron.
- "dept": Caballero, Mujer o Infantiles si es claro; si no, "".
- "notas": una frase corta y útil (ej. "Precio de lista en línea: $24.98"), o "".
Responde SOLO con JSON: {"desc":"","marca":"","color":"","tela":"","estilo":"","dept":"","notas":""}`;

const DUDOSO = /\?|\b(aprox|posibl|probabl|quiz|descono|n\/a|sin dato|no disponible|unknown)/i;
const limpio = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return DUDOSO.test(s) ? "" : s;
};

export async function completarDesdeTicket(p: { texto: string; codigo: string; tienda: string; precio: number | null }) {
  const pista = [
    `Texto en el ticket: ${p.texto || "(sin texto)"}`,
    p.codigo && `Código/UPC: ${p.codigo}`,
    p.tienda && `Tienda: ${p.tienda}`,
    p.precio !== null && `Precio pagado: $${p.precio}`,
  ].filter(Boolean).join("\n");

  const { datos, fuentes } = await consultarClaude(INSTRUCCIONES_COMPLETAR, [{ type: "text", text: pista }], 4);
  return {
    desc: limpio(datos.desc),
    marca: limpio(datos.marca),
    color: limpio(datos.color),
    tela: limpio(datos.tela),
    estilo: limpio(datos.estilo),
    dept: esDepartamento(datos.dept) ? datos.dept : "",
    notas: typeof datos.notas === "string" ? datos.notas.trim() : "",
    fuentes,
  };
}
