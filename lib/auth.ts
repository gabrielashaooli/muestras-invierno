// Autenticación sencilla con un código compartido por el equipo (TEAM_CODE).
// La cookie guarda un hash del código, nunca el código en claro.

export const COOKIE_EQUIPO = "equipo";

export async function firmaEquipo(codigo: string): Promise<string> {
  const datos = new TextEncoder().encode(`muestras-invierno:${codigo}`);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// true si la cookie recibida corresponde al TEAM_CODE actual.
// Si no hay TEAM_CODE configurado la app queda abierta (útil en desarrollo).
export async function cookieValida(valor: string | undefined): Promise<boolean> {
  const codigo = process.env.TEAM_CODE;
  if (!codigo) return true;
  if (!valor) return false;
  return valor === (await firmaEquipo(codigo));
}
