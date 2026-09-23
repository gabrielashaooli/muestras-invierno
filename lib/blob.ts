// Token de Vercel Blob. Normalmente es BLOB_READ_WRITE_TOKEN, pero si el store se
// conectó con un prefijo personalizado (ej. MUESTRAS_READ_WRITE_TOKEN) se busca por su formato.
export function tokenBlob(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  return Object.values(process.env).find((v): v is string => typeof v === "string" && v.startsWith("vercel_blob_rw_"));
}

// Prefijo de las fotos guardadas en la base de datos (cuando no hay Vercel Blob).
export const PREFIJO_FOTO_BD = "/api/foto/";

// Acepta URLs de Vercel Blob (https://) o fotos guardadas en la base de datos.
export function urlFotoValida(f: unknown): f is string {
  return typeof f === "string" && (f.startsWith("https://") || /^\/api\/foto\/[a-f0-9-]{36}$/.test(f));
}
