// Lectura/escritura segura de localStorage (puede fallar en modo privado).
export function leerLocal(llave: string): string | null {
  try {
    return localStorage.getItem(llave);
  } catch {
    return null;
  }
}

export function guardarLocal(llave: string, valor: string) {
  try {
    localStorage.setItem(llave, valor);
  } catch {
    /* sin almacenamiento local */
  }
}

export const TIPO_CAMBIO_INICIAL = 18.5;
