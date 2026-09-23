"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Departamento, KeyItem } from "@/lib/tipos";
import FiltroDept from "./FiltroDept";
import type { ConSesion } from "./tipos";

interface Props {
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

export default function KeyItems({ keyItems, conSesion, alCambiar }: Props) {
  const [dept, setDept] = useState<Departamento>("Damas");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const lista = keyItems.filter((k) => k.dept === dept);
  const cubiertos = lista.filter((k) => k.muestras > 0).length;

  async function agregar() {
    setGuardando(true);
    setError("");
    try {
      const r = await conSesion(() =>
        api("/api/keyitems", { method: "POST", body: JSON.stringify({ dept, texto }) }),
      );
      if (r) setTexto("");
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(k: KeyItem) {
    const aviso = k.muestras > 0 ? ` Tiene ${k.muestras} muestra(s) ligada(s); quedarán sin key item.` : "";
    if (!confirm(`¿Eliminar "${k.nombre}"?${aviso}`)) return;
    try {
      await conSesion(() => api(`/api/keyitems/${k.id}`, { method: "DELETE" }));
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <FiltroDept valor={dept} alCambiar={(d) => d && setDept(d)} conTodos={false} />

      <section className="tarjeta">
        <h2>Agregar key items a {dept}</h2>
        <div className="campo">
          <label htmlFor="texto-key-items">Pega la lista, uno por renglón</label>
          <textarea
            id="texto-key-items"
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"Chamarra puffer\nSuéter cuello alto\nPantalón cargo"}
          />
        </div>
        <button className="boton primario ancho" onClick={agregar} disabled={!texto.trim() || guardando}>
          {guardando ? "Agregando…" : "Agregar"}
        </button>
        {error && <div className="estado error">{error}</div>}
      </section>

      <p className="pequeno">
        {cubiertos} de {lista.length} key items con muestra. Los verdes ya tienen al menos una.
      </p>

      {lista.length === 0 ? (
        <p className="vacio">Sin key items en {dept}.</p>
      ) : (
        <ul className="key-items">
          {lista.map((k) => (
            <li key={k.id} className={k.muestras > 0 ? "cubierto" : ""}>
              <span className="nombre">
                {k.muestras > 0 ? "✓ " : ""}{k.nombre}
              </span>
              {k.muestras > 0 && <span className="pequeno" style={{ color: "inherit" }}>{k.muestras}</span>}
              <button className="boton-x" onClick={() => eliminar(k)} aria-label={`Eliminar ${k.nombre}`}>×</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
