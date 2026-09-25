"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ConSesion } from "./tipos";

export interface EstadoVisor {
  id: number; // muestra
  fotos: string[];
  i: number;
  prenda?: string; // foto que es la portada
}

// Visor de fotos a pantalla completa: ver, elegir portada y quitar fotos (sin borrarlas).
export default function VisorFotos({
  visor,
  setVisor,
  conSesion,
  alCambiar,
  alError,
}: {
  visor: EstadoVisor;
  setVisor: (v: EstadoVisor | null) => void;
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
  alError: (mensaje: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const actual = visor.fotos[visor.i];
  const esPrenda = actual === visor.prenda;

  async function usarComoPrenda() {
    setOcupado(true);
    try {
      await conSesion(() => api(`/api/samples/${visor.id}`, { method: "PATCH", body: JSON.stringify({ portada: actual }) }));
      setVisor({ ...visor, prenda: actual });
      await alCambiar();
    } catch (e) {
      alError(`No se pudo cambiar: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    if (!confirm("¿Quitar esta foto de la muestra? (queda guardada aparte)")) return;
    setOcupado(true);
    try {
      await conSesion(() => api(`/api/samples/${visor.id}`, { method: "PATCH", body: JSON.stringify({ quitar_foto: actual }) }));
      const restantes = visor.fotos.filter((f) => f !== actual);
      setVisor(restantes.length ? { ...visor, fotos: restantes, i: 0, prenda: esPrenda ? undefined : visor.prenda } : null);
      await alCambiar();
    } catch (e) {
      alError(`No se pudo quitar la foto: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="visor" role="dialog" aria-label="Fotos" onClick={() => setVisor(null)}>
      <button className="visor-cerrar" aria-label="Cerrar" onClick={() => setVisor(null)}>×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={actual}
        alt=""
        onClick={(e) => {
          e.stopPropagation();
          setVisor({ ...visor, i: (visor.i + 1) % visor.fotos.length });
        }}
      />
      <div className="visor-info">
        {esPrenda ? "Foto de la prenda" : "Etiqueta / otra foto"}
        {visor.fotos.length > 1 && ` · ${visor.i + 1} de ${visor.fotos.length} (toca para la siguiente)`}
      </div>
      <div className="visor-acciones" onClick={(e) => e.stopPropagation()}>
        {!esPrenda && (
          <button className="boton chico" disabled={ocupado} onClick={usarComoPrenda}>Usar como portada</button>
        )}
        <a className="boton chico" href={actual} target="_blank" rel="noreferrer">Guardar</a>
        <button className="boton chico" style={{ color: "var(--peligro)" }} disabled={ocupado} onClick={quitar}>
          Quitar
        </button>
      </div>
    </div>
  );
}
