"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Departamento, Muestra } from "@/lib/tipos";
import FiltroDept from "./FiltroDept";
import type { ConSesion } from "./tipos";

interface Props {
  muestras: Muestra[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

export default function ListaMuestras({ muestras, conSesion, alCambiar }: Props) {
  const [filtro, setFiltro] = useState<Departamento | "">("");
  const [borrando, setBorrando] = useState<number | null>(null);
  const [error, setError] = useState("");

  const visibles = filtro ? muestras.filter((m) => m.dept === filtro) : muestras;

  async function eliminar(m: Muestra) {
    if (!confirm(`¿Eliminar "${m.descripcion || "muestra sin nombre"}"? También se borran sus fotos.`)) return;
    setBorrando(m.id);
    setError("");
    try {
      await conSesion(() => api(`/api/samples/${m.id}`, { method: "DELETE" }));
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBorrando(null);
    }
  }

  return (
    <>
      <FiltroDept valor={filtro} alCambiar={setFiltro} />
      {error && <div className="estado error" style={{ marginBottom: 12 }}>{error}</div>}

      {visibles.length === 0 && <p className="vacio">Aún no hay muestras{filtro ? ` en ${filtro}` : ""}.</p>}

      {visibles.map((m) => {
        const detalles = [
          m.marca,
          m.tienda && `@ ${m.tienda}`,
          m.precio_usd !== null && `$${m.precio_usd.toFixed(2)} USD`,
          m.talla && `Talla ${m.talla}`,
          m.color,
          m.tela,
          m.estilo && `Estilo ${m.estilo}`,
          m.codigo && `UPC ${m.codigo}`,
        ].filter(Boolean);
        return (
          <article key={m.id} className="tarjeta muestra">
            {m.fotos[0] ? (
              <a href={m.fotos[0]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="foto" src={m.fotos[0]} alt={m.descripcion} loading="lazy" />
              </a>
            ) : (
              <div className="foto" aria-hidden>🧥</div>
            )}
            <div>
              <h3>{m.descripcion || "Sin descripción"}</h3>
              <div style={{ marginBottom: 6 }}>
                <span className={`insignia${m.status === "comprado" ? " comprado" : ""}`}>
                  {m.status === "comprado" ? "Comprado" : "Solo foto"}
                </span>
                <span className="insignia">{m.dept}</span>
                {m.key_item_nombre && <span className="insignia">{m.key_item_nombre}</span>}
              </div>
              <p className="datos">{detalles.join(" · ")}</p>
              {m.notas && <p className="datos">{m.notas}</p>}
              {m.fotos.length > 1 && <p className="datos">{m.fotos.length} fotos</p>}
              <button className="boton peligro chico" onClick={() => eliminar(m)} disabled={borrando === m.id}>
                {borrando === m.id ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
}
