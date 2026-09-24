// Genera en el teléfono un PDF con las muestras: foto de la prenda, miniatura de la
// etiqueta y sus datos. Se hace en el navegador para no tener límite de tamaño.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Muestra } from "./tipos";

const ANCHO = 612; // carta, en puntos
const ALTO = 792;
const MARGEN = 36;
const POR_PAGINA = 3;
const ALTO_FICHA = (ALTO - MARGEN * 2 - 40) / POR_PAGINA;

const GRIS = rgb(0.42, 0.4, 0.38);
const NEGRO = rgb(0.11, 0.11, 0.1);
const VERDE = rgb(0.12, 0.48, 0.3);
const LINEA = rgb(0.88, 0.86, 0.82);

// Las fuentes estándar del PDF solo aceptan caracteres latinos (acentos y ñ sí).
function limpiar(texto: string): string {
  return texto
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

// Parte un texto en renglones que caben en el ancho dado.
function renglones(texto: string, fuente: PDFFont, tam: number, ancho: number, max: number): string[] {
  const palabras = limpiar(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
    } else {
      if (actual) lineas.push(actual);
      actual = p;
    }
    if (lineas.length === max) break;
  }
  if (actual && lineas.length < max) lineas.push(actual);
  if (lineas.length === max && palabras.join(" ").length > lineas.join(" ").length) {
    lineas[max - 1] = lineas[max - 1].replace(/\s*\S*$/, "") + "...";
  }
  return lineas;
}

// Descarga una foto y la reduce para que el PDF no pese demasiado.
async function fotoReducida(url: string, ladoMax: number): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext("2d")?.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.72));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// Dibuja la imagen dentro de un recuadro sin deformarla.
function dibujarFoto(pagina: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  const escala = Math.min(w / img.width, h / img.height);
  const iw = img.width * escala;
  const ih = img.height * escala;
  pagina.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
}

function recuadroVacio(pagina: PDFPage, x: number, y: number, w: number, h: number, fuente: PDFFont, texto: string) {
  pagina.drawRectangle({ x, y, width: w, height: h, borderColor: LINEA, borderWidth: 1, color: rgb(0.97, 0.96, 0.94) });
  const tw = fuente.widthOfTextAtSize(texto, 8);
  pagina.drawText(texto, { x: x + (w - tw) / 2, y: y + h / 2 - 3, size: 8, font: fuente, color: GRIS });
}

export async function generarPdfMuestras(
  muestras: Muestra[],
  titulo: string,
  alAvanzar: (hechas: number, total: number) => void,
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

  let pagina: PDFPage | null = null;
  let enPagina = 0;
  let numPagina = 0;

  const nuevaPagina = () => {
    pagina = pdf.addPage([ANCHO, ALTO]);
    numPagina++;
    enPagina = 0;
    pagina.drawText(limpiar(titulo), { x: MARGEN, y: ALTO - MARGEN - 12, size: 14, font: negrita, color: NEGRO });
    const derecha = limpiar(`${fecha} · pág. ${numPagina}`);
    pagina.drawText(derecha, {
      x: ANCHO - MARGEN - normal.widthOfTextAtSize(derecha, 9),
      y: ALTO - MARGEN - 11,
      size: 9,
      font: normal,
      color: GRIS,
    });
    return pagina;
  };

  for (let i = 0; i < muestras.length; i++) {
    const m = muestras[i];
    alAvanzar(i, muestras.length);
    const p: PDFPage = !pagina || enPagina === POR_PAGINA ? nuevaPagina() : (pagina as PDFPage);

    const arriba = ALTO - MARGEN - 40 - enPagina * ALTO_FICHA;
    const abajo = arriba - ALTO_FICHA + 12;
    const altoUtil = arriba - abajo;

    // Foto de la prenda (grande) y etiqueta (chica).
    const urlPrenda = m.fotos_prenda?.[0] ?? null;
    const urlEtiqueta = m.fotos[0] ?? null;
    const anchoPrenda = 150;
    const anchoEtiqueta = 80;

    const [bytesPrenda, bytesEtiqueta] = await Promise.all([
      urlPrenda ? fotoReducida(urlPrenda, 700) : null,
      urlEtiqueta ? fotoReducida(urlEtiqueta, 400) : null,
    ]);

    if (bytesPrenda) dibujarFoto(p, await pdf.embedJpg(bytesPrenda), MARGEN, abajo, anchoPrenda, altoUtil);
    else recuadroVacio(p, MARGEN, abajo, anchoPrenda, altoUtil, normal, "Sin foto de prenda");

    const xEtiqueta = MARGEN + anchoPrenda + 8;
    const altoEtiqueta = anchoEtiqueta * 1.33;
    if (bytesEtiqueta) dibujarFoto(p, await pdf.embedJpg(bytesEtiqueta), xEtiqueta, arriba - altoEtiqueta, anchoEtiqueta, altoEtiqueta);
    else recuadroVacio(p, xEtiqueta, arriba - altoEtiqueta, anchoEtiqueta, altoEtiqueta, normal, "Sin etiqueta");
    p.drawText("Etiqueta", { x: xEtiqueta, y: arriba - altoEtiqueta - 11, size: 8, font: normal, color: GRIS });

    // Datos.
    const xTexto = xEtiqueta + anchoEtiqueta + 14;
    const anchoTexto = ANCHO - MARGEN - xTexto;
    let y = arriba - 12;

    if (m.marca) {
      p.drawText(limpiar(m.marca.toUpperCase()), { x: xTexto, y, size: 9, font: negrita, color: GRIS });
      y -= 14;
    }
    for (const l of renglones(m.descripcion || "Sin descripción", negrita, 12.5, anchoTexto, 2)) {
      p.drawText(l, { x: xTexto, y, size: 12.5, font: negrita, color: NEGRO });
      y -= 15;
    }
    y -= 2;

    const cant = m.cantidad ?? 1;
    const precio =
      m.precio_usd === null
        ? `Sin precio${cant > 1 ? ` · ${cant} pzas` : ""}`
        : cant > 1
          ? `${usd.format(m.precio_usd)} x ${cant} = ${usd.format(m.precio_usd * cant)}`
          : usd.format(m.precio_usd);
    const estatus = m.status === "comprado" ? "COMPRADO" : "Solo foto";
    p.drawText(precio, { x: xTexto, y, size: 12, font: negrita, color: NEGRO });
    const anchoPrecio = negrita.widthOfTextAtSize(precio, 12);
    p.drawText(estatus, {
      x: xTexto + anchoPrecio + 10,
      y: y + 1,
      size: 9,
      font: negrita,
      color: m.status === "comprado" ? VERDE : GRIS,
    });
    y -= 17;

    const datos: [string, string | null | undefined][] = [
      ["Depto.", m.dept],
      ["Key item", m.key_item_nombre],
      ["Tienda", m.tienda],
      ["Talla", m.talla],
      ["Color", m.color],
      ["Composición", m.tela],
      ["Estilo", m.estilo],
      ["UPC", m.codigo],
    ];
    for (const [rotulo, valor] of datos) {
      if (!valor || y < abajo + 20) continue;
      p.drawText(limpiar(`${rotulo}:`), { x: xTexto, y, size: 9, font: negrita, color: GRIS });
      const xValor = xTexto + 66;
      const [linea] = renglones(valor, normal, 9.5, anchoTexto - 66, 1);
      p.drawText(linea ?? "", { x: xValor, y, size: 9.5, font: normal, color: NEGRO });
      y -= 13;
    }
    if (m.notas && y > abajo + 14) {
      for (const l of renglones(m.notas, normal, 8.5, anchoTexto, Math.max(1, Math.floor((y - abajo) / 11)))) {
        p.drawText(l, { x: xTexto, y, size: 8.5, font: normal, color: GRIS });
        y -= 11;
      }
    }

    // Separador entre fichas.
    p.drawLine({
      start: { x: MARGEN, y: abajo - 6 },
      end: { x: ANCHO - MARGEN, y: abajo - 6 },
      thickness: 0.6,
      color: LINEA,
    });
    enPagina++;
  }

  alAvanzar(muestras.length, muestras.length);
  if (muestras.length === 0) nuevaPagina();
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

// Comparte el archivo (iPhone: guardar en Archivos, WhatsApp, correo) o lo descarga.
export async function compartirArchivo(blob: Blob, nombre: string) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // la persona cerró el menú
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
