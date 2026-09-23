"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Departamento, KeyItem } from "@/lib/tipos";
import FiltroDept from "./FiltroDept";
import { IconoBasura, IconoLista } from "./Iconos";
import type { ConSesion } from "./tipos";

interface Props {
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

export default function KeyItems({ keyItems, conSesion, alCambiar }: Props) {
  const [dept, setDept] = useState<Departamento>("Mujer");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const lista = keyItems.filter((k) => k.dept === dept);
  const cubiertos = lista.filter((k) => k.muestras > 0).length;
  const porcentaje = lista.length ? Math.round((cubiertos / lista.length) * 100) : 0;
  const renglones = texto.split(/\r?\n/).filter((r) => r.trim()).length;

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
    if (!confirm(`¿Quitar "${k.nombre}" de la lista? Sus muestras no se tocan.`)) return;
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <strong>{cubiertos} de {lista.length} con muestra</strong>
          <span className="pequeno">{porcentaje}%</span>
        </div>
        <div className="progreso"><span style={{ width: `${porcentaje}%` }} /></div>
      </section>

      {lista.length === 0 ? (
        <div className="vacio">
          <span className="icono-vacio"><IconoLista /></span>
          <p>Sin key items en {dept}. Pega tu lista abajo.</p>
        </div>
      ) : (
        <ul className="key-items" style={{ marginBottom: 14 }}>
          {lista.map((k) => (
            <li key={k.id} className={k.muestras > 0 ? "cubierto" : ""}>
              <span className="punto">{k.muestras > 0 ? k.muestras : ""}</span>
              <span className="nombre">{k.nombre}</span>
              <button className="boton-x" onClick={() => eliminar(k)} aria-label={`Eliminar ${k.nombre}`}>
                <IconoBasura />
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="tarjeta">
        <h2>Agregar a {dept}</h2>
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
        <button className="boton primario ancho" onClick={agregar} disabled={!renglones || guardando}>
          {guardando ? "Agregando…" : renglones > 1 ? `Agregar ${renglones} key items` : "Agregar"}
        </button>
        {error && <div className="estado error">{error}</div>}
      </section>
    </>
  );
}
