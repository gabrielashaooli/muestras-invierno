// Firma de la función que ejecuta llamadas a la API manejando la sesión vencida.
export type ConSesion = <T>(fn: () => Promise<T>) => Promise<T | undefined>;
