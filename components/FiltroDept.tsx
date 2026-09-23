"use client";

import { DEPARTAMENTOS, type Departamento } from "@/lib/tipos";

// Selector de departamento con opción "Todos".
export default function FiltroDept({
  valor,
  alCambiar,
  conTodos = true,
}: {
  valor: Departamento | "";
  alCambiar: (d: Departamento | "") => void;
  conTodos?: boolean;
}) {
  return (
    <div className="segmentos" role="group" aria-label="Departamento">
      {conTodos && (
        <button aria-pressed={valor === ""} onClick={() => alCambiar("")}>Todos</button>
      )}
      {DEPARTAMENTOS.map((d) => (
        <button key={d} aria-pressed={valor === d} onClick={() => alCambiar(d)}>{d}</button>
      ))}
    </div>
  );
}
