"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { comprimirImagen } from "@/lib/imagen";
import type { Departamento, KeyItem, Muestra } from "@/lib/tipos";
import EditarMuestra from "./EditarMuestra";
import SubirTicket from "./SubirTicket";
import FiltroDept from "./FiltroDept";
import { IconoBasura, IconoCamara, IconoPrenda } from "./Iconos";
import Cantidad from "./Cantidad";
import type { ConSesion } from "./tipos";

interface Props {
  muestras: Muestra[];
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ListaMuestras({ muestras, keyItems, conSesion, alCambiar }: Props) {
  const [filtro, setFiltro] = useState<Departamento | "">("");
  const [filtroTienda, setFiltroTienda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<"" | "comprado" | "solo_foto">("");
  const [borrando, setBorrando] = useState<number | null>(null);
  const [menu, setMenu] = useState<Muestra | null>(null); // menú ⋯ abierto
  const [analizandoEn, setAnalizandoEn] = useState<number | null>(null);
  // Estatus cambiado en esta pantalla (se ve al instante mientras se guarda).
  const [estatus, setEstatus] = useState<Record<number, Muestra["status"]>>({});

  // Cantidad cambiada en esta pantalla (se ve al instante; se guarda poco después).
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const temporizadores = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function cambiarCantidad(m: Muestra, n: number) {
    setCantidades((c) => ({ ...c, [m.id]: n }));
    // Espera a que dejen de tocar +/− para guardar una sola vez.
    clearTimeout(temporizadores.current[m.id]);
    temporizadores.current[m.id] = setTimeout(async () => {
      try {
        await conSesion(() => api(`/api/samples/${m.id}`, { method: "PATCH", body: JSON.stringify({ cantidad: n }) }));
        await alCambiar();
      } catch (err) {
        setError(`No se pudo guardar la cantidad: ${(err as Error).message}`);
      }
    }, 700);
  }

  async function cambiarEstatus(m: Muestra, nuevo: Muestra["status"]) {
    const anterior = estatus[m.id] ?? m.status;
    if (anterior === nuevo) return;
    setEstatus((e) => ({ ...e, [m.id]: nuevo }));
    try {
      await conSesion(() => api(`/api/samples/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: nuevo }) }));
      await alCambiar();
    } catch (err) {
      setEstatus((e) => ({ ...e, [m.id]: anterior }));
      setError(`No se pudo cambiar: ${(err as Error).message}`);
    }
  }

  const [editando, setEditando] = useState<Muestra | null>(null);
  const [ticket, setTicket] = useState(false);
  const [buscandoFotoEn, setBuscandoFotoEn] = useState<number | null>(null);

  // Busca en internet la foto de la prenda (para las que no tienen).
  async function buscarFoto(m: Muestra) {
    setBuscandoFotoEn(m.id);
    setError("");
    try {
      await conSesion(() => api(`/api/samples/${m.id}/buscar-foto`, { method: "POST" }));
      await alCambiar();
    } catch (e) {
      setError(`${(e as Error).message}. Puedes tomarla tú desde ⋯ → Agregar foto de prenda.`);
    } finally {
      setBuscandoFotoEn(null);
    }
  }

  // Vuelve a analizar con Claude las fotos guardadas.
  // "llenar": solo lo vacío. "reemplazar": revisa desde cero (lo anterior queda respaldado).
  async function analizarMuestra(m: Muestra, modo: "llenar" | "reemplazar" = "llenar") {
    setAnalizandoEn(m.id);
    setError("");
    try {
      await conSesion(() =>
        api(`/api/samples/${m.id}/analizar`, { method: "POST", body: JSON.stringify({ modo }) }),
      );
      await alCambiar();
    } catch (e) {
      setError(`No se pudo analizar: ${(e as Error).message}`);
    } finally {
      setAnalizandoEn(null);
    }
  }
  // Visor de fotos: id de la muestra, todas sus fotos y cuál es la portada (prenda).
  const [visor, setVisor] = useState<{ id: number; fotos: string[]; i: number; prenda?: string } | null>(null);
  const [cambiandoPortada, setCambiandoPortada] = useState(false);

  // Marca la foto que se está viendo como foto de la prenda. No borra ninguna foto.
  async function usarComoPrenda() {
    if (!visor) return;
    setCambiandoPortada(true);
    try {
      await conSesion(() =>
        api(`/api/samples/${visor.id}`, { method: "PATCH", body: JSON.stringify({ portada: visor.fotos[visor.i] }) }),
      );
      setVisor(null);
      await alCambiar();
    } catch (e) {
      setError(`No se pudo cambiar: ${(e as Error).message}`);
    } finally {
      setCambiandoPortada(false);
    }
  }
  // Quita la foto que se está viendo (queda guardada aparte, no se borra).
  async function quitarFotoVisor() {
    if (!visor || !confirm("¿Quitar esta foto de la muestra?")) return;
    const url = visor.fotos[visor.i];
    setCambiandoPortada(true);
    try {
      await conSesion(() => api(`/api/samples/${visor.id}`, { method: "PATCH", body: JSON.stringify({ quitar_foto: url }) }));
      const restantes = visor.fotos.filter((f) => f !== url);
      setVisor(restantes.length ? { ...visor, fotos: restantes, i: 0, prenda: visor.prenda === url ? undefined : visor.prenda } : null);
      await alCambiar();
    } catch (e) {
      setError(`No se pudo quitar la foto: ${(e as Error).message}`);
    } finally {
      setCambiandoPortada(false);
    }
  }
  const [error, setError] = useState("");
  const [subiendoEn, setSubiendoEn] = useState<number | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const destino = useRef<number | null>(null); // muestra a la que se agregará la foto

  function elegirFoto(id: number) {
    destino.current = id;
    entradaFoto.current?.click();
  }

  // Comprime, sube y pone la foto como portada (prenda) de la muestra elegida.
  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []).slice(0, 1);
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
        api(`/api/samples/${id}`, { method: "PATCH", body: JSON.stringify({ foto_prenda: urls[0] }) }),
      );
      await alCambiar();
    } catch (err) {
      setError(`No se pudo subir la foto: ${(err as Error).message}`);
    } finally {
      setSubiendoEn(null);
    }
  }

  // Tiendas registradas (sin distinguir mayúsculas ni espacios).
  const claveTienda = (t: string) => t.trim().toLowerCase();
  const tiendas = [...new Map(muestras.filter((m) => m.tienda?.trim()).map((m) => [claveTienda(m.tienda), m.tienda.trim()])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const visibles = muestras.filter(
    (m) =>
      (!filtro || m.dept === filtro) &&
      (!filtroTienda || (filtroTienda === "__sin" ? !m.tienda?.trim() : claveTienda(m.tienda ?? "") === filtroTienda)) &&
      (!filtroEstatus || m.status === filtroEstatus),
  );

  async function eliminar(m: Muestra) {
    if (!confirm(`¿Quitar "${m.descripcion || "muestra sin nombre"}" de la lista? No se borra: queda guardada y se puede recuperar.`)) return;
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
      <input ref={entradaFoto} className="oculto" type="file" accept="image/*" onChange={alElegirFoto} />
      <button className="boton ancho" style={{ marginBottom: 14 }} onClick={() => setTicket(true)}>
        🧾 Subir ticket de compra
      </button>
      <FiltroDept valor={filtro} alCambiar={setFiltro} />
      <div className="filtros">
        <select value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)} aria-label="Filtrar por tienda">
          <option value="">Todas las tiendas</option>
          {tiendas.map(([clave, nombre]) => (
            <option key={clave} value={clave}>{nombre}</option>
          ))}
          <option value="__sin">Sin tienda</option>
        </select>
        <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as typeof filtroEstatus)} aria-label="Filtrar por estatus">
          <option value="">Compradas y solo foto</option>
          <option value="comprado">Solo compradas</option>
          <option value="solo_foto">Solo foto (no compradas)</option>
        </select>
      </div>
      {(filtro || filtroTienda || filtroEstatus) && (
        <p className="pequeno" style={{ margin: "-4px 2px 12px" }}>
          {visibles.length} {visibles.length === 1 ? "muestra" : "muestras"} con estos filtros
        </p>
      )}
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
                <button className="foto-boton con-rotulo" onClick={() => setVisor({ id: m.id, fotos: todas, i: 0, prenda })} aria-label="Ver foto de la prenda">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="foto" src={prenda} alt={m.descripcion} loading="lazy" />
                  <span className="rotulo-foto">Prenda</span>
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
                  onClick={() => setVisor({ id: m.id, fotos: todas, i: todas.indexOf(m.fotos[0]), prenda })}
                  aria-label="Ver etiqueta"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.fotos[0]} alt="Etiqueta" loading="lazy" />
                  <span>Etiqueta{m.fotos.length > 1 ? ` (${m.fotos.length})` : ""}</span>
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
                  <span className="precio">
                    {usd.format(m.precio_usd)}
                    {(cantidades[m.id] ?? m.cantidad ?? 1) > 1 && (
                      <small className="precio-total">
                        Total {usd.format(m.precio_usd * (cantidades[m.id] ?? m.cantidad ?? 1))}
                      </small>
                    )}
                  </span>
                ) : (
                  <span className="precio vacio-precio">Sin precio</span>
                )}
              </div>
              <div className="mini-estatus" role="group" aria-label="Estatus">
                <button aria-pressed={(estatus[m.id] ?? m.status) === "solo_foto"} onClick={() => cambiarEstatus(m, "solo_foto")}>
                  Solo foto
                </button>
                <button
                  className="comprado"
                  aria-pressed={(estatus[m.id] ?? m.status) === "comprado"}
                  onClick={() => cambiarEstatus(m, "comprado")}
                >
                  ✓ Comprado
                </button>
              </div>
              <Cantidad chico valor={cantidades[m.id] ?? m.cantidad ?? 1} alCambiar={(n) => cambiarCantidad(m, n)} />
              <div className="insignias">
                <span className="insignia">{m.dept}</span>
                {m.key_item_nombre && <span className="insignia key">{m.key_item_nombre}</span>}
              </div>
              {detalles.length > 0 && <p className="datos">{detalles.join(" · ")}</p>}
              {m.notas && <p className="datos notas-cortas" style={{ marginTop: -4 }}>{m.notas}</p>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="pequeno">
                  {analizandoEn === m.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="girando" /> Analizando…</span>
                  ) : buscandoFotoEn === m.id ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="girando" /> Buscando foto…</span>
                  ) : subiendoEn === m.id ? (
                    "Subiendo foto…"
                  ) : borrando === m.id ? (
                    "Quitando…"
                  ) : !m.descripcion && !m.marca ? (
                    "Sin analizar"
                  ) : null}
                </span>
                <button className="boton chico boton-menu" onClick={() => setMenu(m)} aria-label="Más opciones">⋯</button>
              </div>
            </div>
          </article>
        );
      })}

      {menu && (
        <div className="hoja-fondo" onClick={() => setMenu(null)}>
          <div className="hoja" role="menu" onClick={(e) => e.stopPropagation()}>
            <p className="hoja-titulo">{menu.descripcion || "Muestra sin nombre"}</p>
            <button
              role="menuitem"
              disabled={analizandoEn !== null || [...menu.fotos, ...(menu.fotos_prenda ?? [])].length === 0}
              onClick={() => {
                const m = menu;
                setMenu(null);
                analizarMuestra(m);
              }}
            >
              Analizar con Claude
              <small>Llena lo que falte, no cambia lo que ya tiene</small>
            </button>
            <button
              role="menuitem"
              disabled={analizandoEn !== null || [...menu.fotos, ...(menu.fotos_prenda ?? [])].length === 0}
              onClick={() => {
                const m = menu;
                setMenu(null);
                if (confirm("¿Volver a revisar esta prenda desde cero? Claude reemplaza los datos; los anteriores quedan respaldados.")) {
                  analizarMuestra(m, "reemplazar");
                }
              }}
            >
              Volver a revisar desde cero
              <small>Si los datos se confundieron con otra prenda</small>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setEditando(menu);
                setMenu(null);
              }}
            >
              Editar datos
              <small>Corregir a mano</small>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const m = menu;
                setMenu(null);
                elegirFoto(m.id);
              }}
            >
              {menu.fotos_prenda?.[0] ? "Cambiar foto de prenda" : "Agregar foto de prenda"}
            </button>
            {!menu.fotos_prenda?.[0] && (
              <button
                role="menuitem"
                disabled={buscandoFotoEn !== null}
                onClick={() => {
                  const m = menu;
                  setMenu(null);
                  buscarFoto(m);
                }}
              >
                Buscar foto en internet
                <small>Con la marca, descripción y código</small>
              </button>
            )}
            {[...(menu.fotos_prenda ?? []), ...menu.fotos].length > 0 && (
              <button
                role="menuitem"
                onClick={() => {
                  const todas = [...(menu.fotos_prenda ?? []), ...menu.fotos];
                  setVisor({ id: menu.id, fotos: todas, i: 0, prenda: menu.fotos_prenda?.[0] });
                  setMenu(null);
                }}
              >
                Ver fotos
              </button>
            )}
            <button
              role="menuitem"
              className="peligro"
              onClick={() => {
                const m = menu;
                setMenu(null);
                eliminar(m);
              }}
            >
              <IconoBasura tam={16} /> Quitar de la lista
            </button>
            <button className="cancelar" onClick={() => setMenu(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {ticket && (
        <SubirTicket muestras={muestras} conSesion={conSesion} alCerrar={() => setTicket(false)} alCambiar={alCambiar} />
      )}

      {editando && (
        <EditarMuestra
          muestra={editando}
          keyItems={keyItems}
          conSesion={conSesion}
          alCerrar={() => setEditando(null)}
          alGuardar={alCambiar}
        />
      )}

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
            {visor.fotos[visor.i] === visor.prenda ? "Foto de la prenda" : "Etiqueta / otra foto"}
            {visor.fotos.length > 1 && ` · ${visor.i + 1} de ${visor.fotos.length} · toca la foto para ver la siguiente`}
          </div>
          {visor.fotos[visor.i] !== visor.prenda && (
            <button
              className="boton chico"
              disabled={cambiandoPortada}
              onClick={(e) => {
                e.stopPropagation();
                usarComoPrenda();
              }}
            >
              {cambiandoPortada ? "Cambiando…" : "Usar como foto de prenda"}
            </button>
          )}
          <a
            href={visor.fotos[visor.i]}
            target="_blank"
            rel="noreferrer"
            className="boton chico"
            onClick={(e) => e.stopPropagation()}
          >
            Abrir original para guardar
          </a>
          <button
            className="boton chico"
            style={{ color: "var(--peligro)" }}
            disabled={cambiandoPortada}
            onClick={(e) => {
              e.stopPropagation();
              quitarFotoVisor();
            }}
          >
            Quitar esta foto
          </button>
          <span style={{ color: "#fff", fontSize: "0.8rem", opacity: 0.7 }}>Toca fuera para cerrar</span>
        </div>
      )}
    </>
  );
}
