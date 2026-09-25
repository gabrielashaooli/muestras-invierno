"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Coleccion } from "@/lib/tipos";
import type { ConSesion } from "./tipos";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Lista de colecciones (ej. "Invierno NY"). Al tocar una se entra a sus tiendas.
export default function Colecciones({
  colecciones,
  alElegir,
  conSesion,
  alCambiar,
}: {
  colecciones: Coleccion[];
  alElegir: (id: number) => void;
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}) {
  const [error, setError] = useState("");

  async function nueva() {
    const nombre = prompt("Nombre de la colección (ej. Verano Miami):")?.trim();
    if (!nombre) return;
    try {
      const c = await conSesion(() => api<Coleccion>("/api/colecciones", { method: "POST", body: JSON.stringify({ nombre }) }));
      await alCambiar();
      if (c) alElegir(c.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function renombrar(c: Coleccion) {
    const nombre = prompt("Nuevo nombre:", c.nombre)?.trim();
    if (!nombre || nombre === c.nombre) return;
    try {
      await conSesion(() => api(`/api/colecciones/${c.id}`, { method: "PATCH", body: JSON.stringify({ nombre }) }));
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      {error && <div className="aviso error">{error}</div>}
      <ul className="lista">
        {colecciones.map((c) => (
          <li key={c.id} className="fila-coleccion" onClick={() => alElegir(c.id)}>
            <div className="miniatura">
              {c.portadas[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.portadas[0]} alt="" loading="lazy" />
              ) : (
                <span>{c.nombre.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="fila-cuerpo">
              <div className="fila-titulo">{c.nombre}</div>
              <div className="fila-sub">
                {c.muestras} muestras · {c.tiendas} tiendas · {usd.format(c.gasto)}
              </div>
            </div>
            <button
              className="icono-boton"
              aria-label="Cambiar nombre"
              onClick={(e) => {
                e.stopPropagation();
                renombrar(c);
              }}
            >
              ✎
            </button>
            <span className="chevron" aria-hidden>›</span>
          </li>
        ))}
      </ul>
      <button className="boton ancho" onClick={nueva}>+ Nueva colección</button>
    </>
  );
}
