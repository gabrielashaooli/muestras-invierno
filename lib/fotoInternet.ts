import { consultarClaude } from "./analisis";
import { db } from "./db";
import { PREFIJO_FOTO_BD } from "./blob";

// Busca en internet una foto de producto para una prenda y la guarda en la base.
// Es "mejor esfuerzo": algunas tiendas bloquean la descarga de sus imágenes.

const INSTRUCCIONES_FOTO = `Encuentras la página de producto en internet de una prenda de ropa específica.
Usa web_search con marca + descripción + código/UPC o número de estilo. Prefiere la página oficial de la tienda o marca
(walmart.com, target.com, oldnavy.gap.com, etc.). Solo responde con páginas que correspondan a ESTA prenda (misma marca y
mismo tipo de prenda; si hay código, el mismo). Si no estás seguro, deja vacío.
Responde SOLO con JSON: {"paginas":["https://..."],"imagenes":["https://...jpg"]}
- "paginas": hasta 3 URLs de páginas de producto, la mejor primero.
- "imagenes": URLs directas de imagen del producto si aparecieron en los resultados (si no, []).`;

const AGENTE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// Solo URLs https a dominios públicos (nada de IPs ni localhost).
function urlSegura(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return null;
    if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(url.hostname) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function descargar(url: string, tiempo = 8000): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": AGENTE, Accept: "text/html,image/*,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(tiempo),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// Extrae la imagen principal de una página de producto (og:image, twitter:image o JSON-LD).
function imagenDePagina(html: string, base: string): string[] {
  const encontradas: string[] = [];
  const meta = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi;
  for (const etiqueta of html.match(meta) ?? []) {
    const c = etiqueta.match(/content=["']([^"']+)["']/i)?.[1];
    if (c) encontradas.push(c);
  }
  const ld = html.match(/"image"\s*:\s*(?:\[\s*)?"([^"]+)"/i)?.[1];
  if (ld) encontradas.push(ld);
  return encontradas
    .map((u) => {
      try {
        return new URL(u.replace(/&amp;/g, "&"), base).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

async function guardarImagen(url: string): Promise<string | null> {
  const res = await descargar(url);
  if (!res) return null;
  const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 3000 || buffer.length > 5 * 1024 * 1024) return null; // íconos o archivos enormes
  const id = crypto.randomUUID();
  const sql = await db();
  await sql`INSERT INTO fotos (id, tipo, datos) VALUES (${id}, ${tipo}, decode(${buffer.toString("base64")}, 'base64'))`;
  return `${PREFIJO_FOTO_BD}${id}`;
}

export async function buscarFotoEnInternet(p: {
  marca: string;
  descripcion: string;
  codigo: string;
  estilo: string;
  color: string;
  tienda: string;
}): Promise<{ foto: string | null; pagina: string | null }> {
  const pista = [
    p.marca && `Marca: ${p.marca}`,
    p.descripcion && `Prenda: ${p.descripcion}`,
    p.codigo && `UPC/código: ${p.codigo}`,
    p.estilo && `Estilo: ${p.estilo}`,
    p.color && `Color: ${p.color}`,
    p.tienda && `Tienda donde se vio: ${p.tienda}`,
  ].filter(Boolean).join("\n");

  const { datos } = await consultarClaude(INSTRUCCIONES_FOTO, [{ type: "text", text: `${pista}\n\nBusca la página del producto.` }], 3);
  const paginas = (Array.isArray(datos.paginas) ? datos.paginas : []).map(urlSegura).filter(Boolean).slice(0, 3) as string[];
  const directas = (Array.isArray(datos.imagenes) ? datos.imagenes : []).map(urlSegura).filter(Boolean).slice(0, 3) as string[];

  // Primero imágenes sacadas de las páginas (más confiables), luego las directas.
  for (const pagina of paginas) {
    const res = await descargar(pagina);
    if (!res) continue;
    const html = (await res.text()).slice(0, 2_000_000);
    for (const img of imagenDePagina(html, pagina)) {
      const segura = urlSegura(img);
      const foto = segura ? await guardarImagen(segura) : null;
      if (foto) return { foto, pagina };
    }
  }
  for (const img of directas) {
    const foto = await guardarImagen(img);
    if (foto) return { foto, pagina: paginas[0] ?? null };
  }
  return { foto: null, pagina: paginas[0] ?? null };
}
