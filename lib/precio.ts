// Interpreta un precio escrito a mano o leído de una etiqueta.
// Acepta "$1,299.00", "25,99", "25.99 USD", "US$ 40". Devuelve null si no es claro.
export function parsePrecio(entrada: unknown): number | null {
  if (typeof entrada === "number") return Number.isFinite(entrada) && entrada >= 0 ? redondear(entrada) : null;
  if (typeof entrada !== "string") return null;

  const limpio = entrada.replace(/US\$|USD|MXN|\$|\s/gi, "");
  if (!limpio) return null;
  // Más de un número (ej. "19.99-24.99" o "39.99/29.99") es ambiguo.
  if (!/^[0-9.,]+$/.test(limpio)) return null;

  let normal = limpio;
  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    // El separador que aparece al final es el decimal.
    normal = ultimaComa > ultimoPunto
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(/,/g, "");
  } else if (ultimaComa !== -1) {
    // "25,99" es decimal; "1,299" es de miles.
    normal = /,\d{1,2}$/.test(limpio) ? limpio.replace(",", ".") : limpio.replace(/,/g, "");
  }
  if ((normal.match(/\./g) ?? []).length > 1) return null;

  const valor = Number(normal);
  return Number.isFinite(valor) && valor >= 0 ? redondear(valor) : null;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}
