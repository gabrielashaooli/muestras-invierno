"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { comprimirImagen } from "@/lib/imagen";
import type { Departamento, Muestra } from "@/lib/tipos";
import FiltroDept from "./FiltroDept";
import { IconoBasura, IconoCamara, IconoPrenda } from "./Iconos";
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
  const [subiendoEn, setSubiendoEn] = useState<number | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const destino = useRef<number | null>(null); // muestra a la que se agregará la foto

  function elegirFoto(id: number) {
    destino.current = id;
    entradaFoto.current?.click();
  }

  // Comprime, sube a Blob y liga las fotos de la prenda a la muestra elegida.
  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    const id = destino.current;
    if (!archivos.length || id === null) return;
    setSubiendoEn(id);
    setError("");
    try {
      const urls: string[] = [];
      for (const archivo of archivos) {
        const form = new FormData();
        form.append("foto", await comprimirImagen(archivo), "foto.jpg");
        const r = await conSesion(() => api<{ url: string }>("/api/upload", { method: "POST", body: form }));
        if (!r) return;
        urls.push(r.url);
      }
      await conSesion(() =>
        api(`/api/samples/${id}`, { method: "PATCH", body: JSON.stringify({ agregar_fotos_prenda: urls }) }),
      );
      await alCambiar();
    } catch (err) {
      setError(`No se pudo subir la foto: ${(err as Error).message}`);
    } finally {
      setSubiendoEn(null);
    }
  }

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
      {/* Sin "capture": en iPhone ofrece tomar foto o elegir de la galería */}
      <input ref={entradaFoto} className="oculto" type="file" accept="image/*" multiple onChange={alElegirFoto} />
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
        const prenda = m.fotos_prenda?.[0];
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
            <div className="fotos-muestra">
              {prenda ? (
                <button className="foto-boton" onClick={() => setVisor({ fotos: todas, i: 0 })} aria-label="Ver foto de la prenda">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="foto" src={prenda} alt={m.descripcion} loading="lazy" />
                </button>
              ) : (
                <button
                  className="foto foto-agregar"
                  onClick={() => elegirFoto(m.id)}
                  disabled={subiendoEn === m.id}
                >
                  {subiendoEn === m.id ? <span className="girando" /> : <IconoCamara tam={26} />}
                  {subiendoEn === m.id ? "Subiendo…" : "Foto de la prenda"}
                </button>
              )}
              {m.fotos[0] && (
                <button
                  className="foto-boton etiqueta-mini"
                  onClick={() => setVisor({ fotos: todas, i: todas.indexOf(m.fotos[0]) })}
                  aria-label="Ver etiqueta"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.fotos[0]} alt="Etiqueta" loading="lazy" />
                  <span>Etiqueta</span>
                </button>
              )}
            </div>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="boton chico" onClick={() => eliminar(m)} disabled={borrando === m.id}>
                  <IconoBasura tam={15} /> {borrando === m.id ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
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
