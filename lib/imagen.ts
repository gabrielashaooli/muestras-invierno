// Utilidades de imagen del lado del cliente.

const LADO_MAXIMO = 1400;
const CALIDAD = 0.78;

// Carga un archivo en un elemento <img> (soporta HEIC en Safari).
function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo leer la imagen ${archivo.name}`));
    };
    img.src = url;
  });
}

// Carga la imagen con el método disponible (createImageBitmap respeta la orientación del iPhone).
async function decodificar(archivo: File): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
      return { fuente: bmp, ancho: bmp.width, alto: bmp.height };
    } catch {
      /* se intenta con <img> */
    }
  }
  const img = await cargarImagen(archivo);
  return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight };
}

// Reduce la foto a 1400 px en su lado mayor y la recomprime a JPEG 0.78.
export async function comprimirImagen(archivo: File, ladoMax = LADO_MAXIMO): Promise<Blob> {
  let imagen: Awaited<ReturnType<typeof decodificar>>;
  try {
    imagen = await decodificar(archivo);
  } catch (e) {
    // Último recurso: si ya es JPEG/PNG ligero, se usa tal cual.
    if (/^image\/(jpeg|png)$/.test(archivo.type) && archivo.size < 3.5 * 1024 * 1024) return archivo;
    throw e;
  }
  const escala = Math.min(1, ladoMax / Math.max(imagen.ancho, imagen.alto));
  const ancho = Math.max(1, Math.round(imagen.ancho * escala));
  const alto = Math.max(1, Math.round(imagen.alto * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El navegador no soporta canvas");
  ctx.drawImage(imagen.fuente, 0, 0, ancho, alto);

  return new Promise((resolve, reject) => {
    lienzo.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen"))),
      "image/jpeg",
      CALIDAD,
    );
  });
}

// Convierte un Blob a data URL base64.
export function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

// Foto de ticket: en blanco y negro con más contraste (pesa mucho menos y se lee mejor) y
// cuidando que no pase de `maxBytes`, porque el servidor rechaza envíos de más de ~4 MB.
export async function comprimirTicket(archivo: File, maxBytes: number): Promise<Blob> {
  const imagen = await decodificar(archivo);
  let lado = 2200;
  let calidad = 0.8;
  for (let intento = 0; intento < 6; intento++) {
    const escala = Math.min(1, lado / Math.max(imagen.ancho, imagen.alto));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(imagen.ancho * escala));
    lienzo.height = Math.max(1, Math.round(imagen.alto * escala));
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no soporta canvas");
    ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.drawImage(imagen.fuente, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen"))), "image/jpeg", calidad),
    );
    if (blob.size <= maxBytes) return blob;
    lado = Math.round(lado * 0.82);
    calidad = Math.max(0.6, calidad - 0.05);
  }
  throw new Error("La foto del ticket es demasiado pesada");
}
