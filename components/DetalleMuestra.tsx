"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Muestra } from "@/lib/tipos";
import Cantidad from "./Cantidad";
import { IconoBasura } from "./Iconos";
import type { EstadoVisor } from "./VisorFotos";
import type { ConSesion } from "./tipos";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Hoja con todo lo de una muestra: fotos, datos, estatus, cantidad y acciones.
// La lista queda limpia y aquí está el detalle.
export default function DetalleMuestra({
  m,
  conSesion,
  alCambiar,
  alCerrar,
  alEditar,
  alAgregarFoto,
  alVerFotos,
  ocupado,
  setOcupado,
  alError,
}: {
  m: Muestra;
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
  alCerrar: () => void;
  alEditar: () => void;
  alAgregarFoto: () => void;
  alVerFotos: (v: EstadoVisor) => void;
  ocupado: string; // texto de lo que se está haciendo con esta muestra ("" si nada)
  setOcupado: (texto: string) => void;
  alError: (mensaje: string) => void;
}) {
  const [cantidad, setCantidad] = useState(m.cantidad ?? 1);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prendas = m.fotos_prenda ?? [];
  const todas = [...prendas, ...m.fotos];

  async function accion(texto: string, fn: () => Promise<unknown>, error: string) {
    setOcupado(texto);
    try {
      await conSesion(fn);
      await alCambiar();
    } catch (e) {
      alError(`${error}: ${(e as Error).message}`);
    } finally {
      setOcupado("");
    }
  }

  const patch = (cuerpo: object) => () =>
    api(`/api/samples/${m.id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });

  function cambiarCantidad(n: number) {
    setCantidad(n);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => accion("", patch({ cantidad: n }), "No se pudo guardar la cantidad"), 600);
  }

  const datos: [string, string | null | undefined][] = [
    ["Departamento", m.dept],
    ["Key item", m.key_item_nombre],
    ["Tienda", m.tienda],
    ["Talla", m.talla],
    ["Color", m.color],
    ["Composición", m.tela],
    ["Estilo", m.estilo],
    ["Código", m.codigo],
  ];

  return (
    <div className="hoja-fondo" onClick={alCerrar}>
      <div className="hoja hoja-editar detalle" onClick={(e) => e.stopPropagation()}>
        <div className="detalle-cabeza">
          <div style={{ minWidth: 0 }}>
            {m.marca && <div className="detalle-marca">{m.marca}</div>}
            <h2>{m.descripcion || "Sin descripción"}</h2>
          </div>
          <button className="visor-cerrar en-hoja" aria-label="Cerrar" onClick={alCerrar}>×</button>
        </div>

        {/* Fotos */}
        <div className="detalle-fotos">
          {todas.map((f, i) => (
            <button key={f} className="detalle-foto" onClick={() => alVerFotos({ id: m.id, fotos: todas, i, prenda: prendas[0] })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt="" loading="lazy" />
              <span>{i < prendas.length ? "Prenda" : "Etiqueta"}</span>
            </button>
          ))}
          <button className="detalle-foto agregar" onClick={alAgregarFoto} disabled={Boolean(ocupado)}>
            <span className="mas">+</span>
            {prendas.length ? "Otra foto" : "Foto prenda"}
          </button>
        </div>

        {ocupado && (
          <div className="estado" style={{ marginTop: 0, marginBottom: 12 }}>
            <span className="girando" /> {ocupado}
          </div>
        )}

        {/* Precio, estatus y cantidad */}
        <div className="detalle-compra">
          <div>
            <div className="detalle-precio">{m.precio_usd !== null ? usd.format(m.precio_usd) : "Sin precio"}</div>
            {m.precio_usd !== null && cantidad > 1 && (
              <div className="pequeno">Total {usd.format(m.precio_usd * cantidad)}</div>
            )}
          </div>
          <Cantidad chico valor={cantidad} alCambiar={cambiarCantidad} />
        </div>
        <div className="segmentos estatus" role="group" aria-label="Estatus">
          <button aria-pressed={m.status === "solo_foto"} onClick={() => accion("", patch({ status: "solo_foto" }), "No se pudo cambiar")}>
            Solo foto
          </button>
          <button
            className="comprado"
            aria-pressed={m.status === "comprado"}
            onClick={() => accion("", patch({ status: "comprado" }), "No se pudo cambiar")}
          >
            ✓ Comprado
          </button>
        </div>

        {/* Datos */}
        <dl className="detalle-datos">
          {datos
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {m.notas && <p className="detalle-notas">{m.notas}</p>}

        {/* Acciones */}
        <div className="detalle-acciones">
          <button onClick={alEditar}>Editar datos</button>
          {prendas.length === 0 && (
            <button
              disabled={Boolean(ocupado)}
              onClick={() =>
                accion("Buscando foto en internet…", () => api(`/api/samples/${m.id}/buscar-foto`, { method: "POST" }), "No se encontró foto")
              }
            >
              Buscar foto en internet
            </button>
          )}
          <button
            disabled={Boolean(ocupado) || todas.length === 0}
            onClick={() =>
              accion(
                "Analizando…",
                () => api(`/api/samples/${m.id}/analizar`, { method: "POST", body: JSON.stringify({ modo: "llenar" }) }),
                "No se pudo analizar",
              )
            }
          >
            Completar datos con Claude
          </button>
          <button
            disabled={Boolean(ocupado) || todas.length === 0}
            onClick={() =>
              confirm("¿Revisar esta prenda desde cero? Los datos anteriores quedan respaldados.") &&
              accion(
                "Revisando desde cero…",
                () => api(`/api/samples/${m.id}/analizar`, { method: "POST", body: JSON.stringify({ modo: "reemplazar" }) }),
                "No se pudo analizar",
              )
            }
          >
            Revisar desde cero
          </button>
          <button
            className="peligro"
            disabled={Boolean(ocupado)}
            onClick={async () => {
              if (!confirm(`¿Quitar "${m.descripcion || "esta muestra"}" de la lista? No se borra, se puede recuperar.`)) return;
              await accion("Quitando…", () => api(`/api/samples/${m.id}`, { method: "DELETE" }), "No se pudo quitar");
              alCerrar();
            }}
          >
            <IconoBasura tam={16} /> Quitar de la lista
          </button>
        </div>

        {(m.fuentes ?? []).length > 0 && (
          <details className="detalle-fuentes">
            <summary>Fuentes consultadas ({m.fuentes.length})</summary>
            <ul>
              {m.fuentes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.titulo || f.url}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
