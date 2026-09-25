// Comparación de códigos (UPC, número de artículo, estilo). Sin dependencias: sirve en cliente y servidor.

const digitos = (v: string) => (v ?? "").replace(/\D/g, "").replace(/^0+/, "");

// ¿Es el mismo código? Los tickets a veces omiten el dígito verificador del UPC o agregan ceros al inicio.
export function mismoCodigo(a: string, b: string): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 6 || y.length < 6) return false;
  if (x === y) return true;
  if (x.slice(0, -1) === y || y.slice(0, -1) === x) return true;
  return Math.min(x.length, y.length) >= 8 && (x.includes(y) || y.includes(x));
}

export const textoNormal = (t: string) =>
  (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Colores sin repetir, en el orden en que aparecen ("Negro, Beige").
export function unirColores(...listas: string[]): string {
  return [
    ...new Map(
      listas
        .flatMap((l) => (l ?? "").split(/\s*,\s*/))
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => [textoNormal(c), c]),
    ).values(),
  ].join(", ");
}
