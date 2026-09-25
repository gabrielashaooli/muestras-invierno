// Cliente fetch para la API propia. Lanza un Error con el mensaje del servidor.

// Errores que manda el servidor sin mensaje propio.
const MENSAJES: Record<number, string> = {
  413: "Las fotos pesan demasiado. Intenta con menos fotos a la vez.",
  504: "Se tardó demasiado. Intenta de nuevo (o con menos fotos a la vez).",
  502: "El servidor no respondió. Intenta de nuevo.",
};

export class NoAutorizado extends Error {}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const cabeceras = new Headers(opciones.headers);
  if (opciones.body && typeof opciones.body === "string" && !cabeceras.has("Content-Type")) {
    cabeceras.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(ruta, { ...opciones, headers: cabeceras, credentials: "same-origin" });
  } catch {
    throw new Error("Sin conexión o se cortó la señal. Intenta de nuevo.");
  }
  if (res.status === 401 && !ruta.startsWith("/api/auth")) throw new NoAutorizado("Sesión vencida");
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || MENSAJES[res.status] || `Error ${res.status}`);
  return datos as T;
}
