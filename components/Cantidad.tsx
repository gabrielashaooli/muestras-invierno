"use client";

// Selector de cantidad de piezas con botones − y +.
export default function Cantidad({
  valor,
  alCambiar,
  chico = false,
}: {
  valor: number;
  alCambiar: (n: number) => void;
  chico?: boolean;
}) {
  return (
    <div className={`cantidad${chico ? " chico" : ""}`} role="group" aria-label="Cantidad">
      <button onClick={() => alCambiar(Math.max(1, valor - 1))} disabled={valor <= 1} aria-label="Menos">−</button>
      <span aria-live="polite">
        {valor} {valor === 1 ? "pza" : "pzas"}
      </span>
      <button onClick={() => alCambiar(Math.min(999, valor + 1))} aria-label="Más">+</button>
    </div>
  );
}
