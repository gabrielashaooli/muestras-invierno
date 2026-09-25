"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Coleccion } from "@/lib/tipos";
import { IconoPrenda } from "./Iconos";
import type { ConSesion } from "./tipos";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Tarjetas de colecciones (ej. "Invierno NY"). Al tocar una se entra a sus tiendas.
export default function Colecciones({
  colecciones,
  activa,
  alElegir,
  conSesion,
  alCambiar,
}: {
  colecciones: Coleccion[];
  activa: number | null;
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
      {error && <div className="estado error" style={{ marginTop: 0, marginBottom: 12 }}>{error}</div>}
      <div className="colecciones">
        {colecciones.map((c) => (
          <article
            key={c.id}
            className={`coleccion${c.id === activa ? " activa" : ""}`}
            onClick={() => alElegir(c.id)}
          >
            <div className={`coleccion-mosaico n${Math.min(c.portadas.length, 4)}`}>
              {c.portadas.length ? (
                c.portadas.slice(0, 4).map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f} src={f} alt="" loading="lazy" />
                ))
              ) : (
                <span className="coleccion-vacia"><IconoPrenda tam={34} /></span>
              )}
            </div>
            <div className="coleccion-texto">
              <div className="coleccion-nombre">
                {c.nombre}
                <button
                  className="coleccion-editar"
                  aria-label="Cambiar nombre"
                  onClick={(e) => {
                    e.stopPropagation();
                    renombrar(c);
                  }}
                >
                  ✎
                </button>
              </div>
              <div className="coleccion-datos">
                <span><strong>{c.muestras}</strong> muestras</span>
                <span><strong>{c.tiendas}</strong> tiendas</span>
                <span><strong>{usd.format(c.gasto)}</strong> gastado</span>
              </div>
            </div>
          </article>
        ))}
        <button className="coleccion nueva" onClick={nueva}>
          <span className="mas">+</span>
          Nueva colección
        </button>
      </div>
    </>
  );
}
