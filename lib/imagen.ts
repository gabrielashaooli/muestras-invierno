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

// Reduce la foto a 1400 px en su lado mayor y la recomprime a JPEG 0.78.
export async function comprimirImagen(archivo: File): Promise<Blob> {
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.round(img.naturalWidth * escala);
  const alto = Math.round(img.naturalHeight * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El navegador no soporta canvas");
  ctx.drawImage(img, 0, 0, ancho, alto);

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
