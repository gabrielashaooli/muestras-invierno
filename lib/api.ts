// Cliente fetch para la API propia. Lanza un Error con el mensaje del servidor.

export class NoAutorizado extends Error {}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const cabeceras = new Headers(opciones.headers);
  if (opciones.body && typeof opciones.body === "string" && !cabeceras.has("Content-Type")) {
    cabeceras.set("Content-Type", "application/json");
  }
  const res = await fetch(ruta, { ...opciones, headers: cabeceras, credentials: "same-origin" });
  if (res.status === 401 && !ruta.startsWith("/api/auth")) throw new NoAutorizado("Sesión vencida");
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos as T;
}
