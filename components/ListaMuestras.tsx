"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Departamento, Muestra } from "@/lib/tipos";
import FiltroDept from "./FiltroDept";
import { IconoBasura, IconoPrenda } from "./Iconos";
import type { ConSesion } from "./tipos";

interface Props {
  muestras: Muestra[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ListaMuestras({ muestras, conSesion, alCambiar }: Props) {
  const [filtro, setFiltro] = useState<Departamento | "">("");
  const [borrando, setBorrando] = useState<number | null>(null);
  const [visor, setVisor] = useState<{ fotos: string[]; i: number } | null>(null);
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

      {visibles.length === 0 && (
        <div className="vacio">
          <span className="icono-vacio"><IconoPrenda /></span>
          <p>Aún no hay muestras{filtro ? ` en ${filtro}` : ""}.</p>
        </div>
      )}

      {visibles.map((m) => {
        // Primero las fotos de la prenda (portada), luego las de etiquetas.
        const todas = [...(m.fotos_prenda ?? []), ...m.fotos];
        const detalles = [
          m.tienda,
          m.talla && `Talla ${m.talla}`,
          m.color,
          m.tela,
          m.estilo && `Estilo ${m.estilo}`,
          m.codigo && `UPC ${m.codigo}`,
        ].filter(Boolean);
        return (
          <article key={m.id} className="tarjeta muestra">
            {todas[0] ? (
              <button
                onClick={() => setVisor({ fotos: todas, i: 0 })}
                style={{ border: 0, padding: 0, background: "none", position: "relative", cursor: "pointer" }}
                aria-label="Ver fotos"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="foto" src={todas[0]} alt={m.descripcion} loading="lazy" />
                {todas.length > 1 && (
                  <span className="insignia" style={{ position: "absolute", right: 6, bottom: 6 }}>
                    {todas.length}
                  </span>
                )}
              </button>
            ) : (
              <div className="foto" aria-hidden><IconoPrenda tam={30} /></div>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="cabeza">
                <div style={{ minWidth: 0 }}>
                  {m.marca && <div className="pequeno" style={{ fontWeight: 700 }}>{m.marca}</div>}
                  <h3>{m.descripcion || "Sin descripción"}</h3>
                </div>
                {m.precio_usd !== null ? (
                  <span className="precio">{usd.format(m.precio_usd)}</span>
                ) : (
                  <span className="precio vacio-precio">Sin precio</span>
                )}
              </div>
              <div className="insignias">
                <span className={`insignia${m.status === "comprado" ? " comprado" : ""}`}>
                  {m.status === "comprado" ? "Comprado" : "Solo foto"}
                </span>
                <span className="insignia">{m.dept}</span>
                {m.key_item_nombre && <span className="insignia key">{m.key_item_nombre}</span>}
              </div>
              {detalles.length > 0 && <p className="datos">{detalles.join(" · ")}</p>}
              {m.notas && <p className="datos" style={{ marginTop: -4 }}>{m.notas}</p>}
              <button className="boton peligro chico" onClick={() => eliminar(m)} disabled={borrando === m.id}>
                <IconoBasura tam={15} /> {borrando === m.id ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </article>
        );
      })}

      {visor && (
        <div
          role="dialog"
          aria-label="Fotos de la muestra"
          onClick={() => setVisor(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgb(0 0 0 / 0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "calc(env(safe-area-inset-top) + 16px) 12px calc(env(safe-area-inset-bottom) + 16px)",
            gap: 14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visor.fotos[visor.i]}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "78dvh", borderRadius: 14, objectFit: "contain" }}
            onClick={(e) => {
              e.stopPropagation();
              setVisor({ ...visor, i: (visor.i + 1) % visor.fotos.length });
            }}
          />
          <div style={{ color: "#fff", fontSize: "0.85rem", opacity: 0.8, textAlign: "center" }}>
            {visor.fotos.length > 1 && `${visor.i + 1} de ${visor.fotos.length} · toca la foto para la siguiente · `}
            toca fuera para cerrar
          </div>
          <a
            href={visor.fotos[visor.i]}
            target="_blank"
            rel="noreferrer"
            className="boton chico"
            onClick={(e) => e.stopPropagation()}
          >
            Abrir original para guardar
          </a>
        </div>
      )}
    </>
  );
}
