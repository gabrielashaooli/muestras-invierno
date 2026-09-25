"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { textoNormal } from "@/lib/codigos";
import { gruposDuplicados } from "@/lib/duplicados";
import { comprimirImagen } from "@/lib/imagen";
import type { Departamento, KeyItem, Muestra } from "@/lib/tipos";
import DetalleMuestra from "./DetalleMuestra";
import EditarMuestra from "./EditarMuestra";
import FiltroDept from "./FiltroDept";
import { IconoPrenda } from "./Iconos";
import SubirTicket from "./SubirTicket";
import VisorFotos, { type EstadoVisor } from "./VisorFotos";
import type { ConSesion } from "./tipos";

interface Props {
  muestras: Muestra[];
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ListaMuestras({ muestras, keyItems, conSesion, alCambiar }: Props) {
  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Departamento | "">("");
  const [filtroTienda, setFiltroTienda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<"" | "comprado" | "solo_foto">("");

  // Pantallas encima de la lista
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Muestra | null>(null);
  const [visor, setVisor] = useState<EstadoVisor | null>(null);
  const [ticket, setTicket] = useState(false);

  const [ocupado, setOcupado] = useState<Record<number, string>>({}); // id → "Analizando…", etc.
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [uniendo, setUniendo] = useState(false);

  const marcarOcupado = (id: number, texto: string) =>
    setOcupado((o) => {
      const n = { ...o };
      if (texto) n[id] = texto;
      else delete n[id];
      return n;
    });

  // ── Foto de prenda desde la lista o el detalle ──
  const entradaFoto = useRef<HTMLInputElement>(null);
  const destino = useRef<number | null>(null);
  function elegirFoto(id: number) {
    destino.current = id;
    entradaFoto.current?.click();
  }
  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    const id = destino.current;
    if (!archivo || id === null) return;
    const m = muestras.find((x) => x.id === id);
    marcarOcupado(id, "Subiendo foto…");
    setError("");
    try {
      const form = new FormData();
      form.append("foto", await comprimirImagen(archivo), "foto.jpg");
      const r = await conSesion(() => api<{ url: string }>("/api/upload", { method: "POST", body: form }));
      if (!r) return;
      // Si ya tiene foto de prenda, se agrega otra (ej. otro color); si no, queda como portada.
      const cuerpo = m?.fotos_prenda?.length ? { agregar_prenda: r.url } : { foto_prenda: r.url };
      await conSesion(() => api(`/api/samples/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) }));
      await alCambiar();
    } catch (err) {
      setError(`No se pudo subir la foto: ${(err as Error).message}`);
    } finally {
      marcarOcupado(id, "");
    }
  }

  // ── Estatus rápido desde la tarjeta ──
  async function alternarEstatus(m: Muestra) {
    const nuevo = m.status === "comprado" ? "solo_foto" : "comprado";
    marcarOcupado(m.id, "Guardando…");
    try {
      await conSesion(() => api(`/api/samples/${m.id}`, { method: "PATCH", body: JSON.stringify({ status: nuevo }) }));
      await alCambiar();
    } catch (err) {
      setError(`No se pudo cambiar: ${(err as Error).message}`);
    } finally {
      marcarOcupado(m.id, "");
    }
  }

  // ── Repetidas ──
  const repetidas = useMemo(() => gruposDuplicados(muestras), [muestras]);
  async function unirRepetidas() {
    const piezas = repetidas.reduce((t, g) => t + g.length, 0);
    if (!confirm(`Se juntarán ${piezas} muestras repetidas en ${repetidas.length}. Fotos, colores y datos se conservan. ¿Continuar?`)) return;
    setUniendo(true);
    setError("");
    try {
      await conSesion(() => api("/api/samples/unir", { method: "POST", body: JSON.stringify({ todas: true }) }));
      await alCambiar();
      setAviso(`Listo: se juntaron ${repetidas.length} prendas repetidas.`);
    } catch (err) {
      setError(`No se pudieron juntar: ${(err as Error).message}`);
    } finally {
      setUniendo(false);
    }
  }

  // ── Filtros y agrupación por tienda ──
  const claveTienda = (t: string) => (t ?? "").trim().toLowerCase();
  const tiendas = [...new Map(muestras.filter((m) => m.tienda?.trim()).map((m) => [claveTienda(m.tienda), m.tienda.trim()])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const q = textoNormal(busqueda);
  const visibles = muestras.filter(
    (m) =>
      (!filtro || m.dept === filtro) &&
      (!filtroTienda || (filtroTienda === "__sin" ? !m.tienda?.trim() : claveTienda(m.tienda) === filtroTienda)) &&
      (!filtroEstatus || m.status === filtroEstatus) &&
      (!q || textoNormal([m.descripcion, m.marca, m.color, m.codigo, m.estilo, m.tienda, m.key_item_nombre].join(" ")).includes(q)),
  );
  const secciones = [...visibles.reduce((mapa, m) => {
    const clave = claveTienda(m.tienda) || "~";
    const s = mapa.get(clave) ?? { nombre: m.tienda?.trim() || "Sin tienda", lista: [] as Muestra[] };
    s.lista.push(m);
    return mapa.set(clave, s);
  }, new Map<string, { nombre: string; lista: Muestra[] }>()).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, s]) => s);
  const hayFiltros = Boolean(filtro || filtroTienda || filtroEstatus || q);
  const detalle = detalleId !== null ? muestras.find((m) => m.id === detalleId) ?? null : null;

  return (
    <>
      <input ref={entradaFoto} className="oculto" type="file" accept="image/*" onChange={alElegirFoto} />

      <div className="barra-lista">
        <input
          type="search"
          className="buscador"
          placeholder="Buscar prenda, marca, color…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button className="boton" onClick={() => setTicket(true)}>🧾 Ticket</button>
      </div>

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
          <option value="">Todas</option>
          <option value="comprado">Compradas</option>
          <option value="solo_foto">Solo foto</option>
        </select>
      </div>

      {repetidas.length > 0 && (
        <div className="aviso-repetidas">
          <span>
            Hay <strong>{repetidas.length}</strong> {repetidas.length === 1 ? "prenda repetida" : "prendas repetidas"}
          </span>
          <button className="boton chico primario" onClick={unirRepetidas} disabled={uniendo}>
            {uniendo ? "Juntando…" : "Juntar"}
          </button>
        </div>
      )}
      {aviso && <div className="estado ok" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => setAviso("")}>{aviso}</div>}
      {error && <div className="estado error" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => setError("")}>{error}</div>}

      {hayFiltros && (
        <p className="pequeno" style={{ margin: "0 2px 10px" }}>
          {visibles.length} {visibles.length === 1 ? "muestra" : "muestras"}
        </p>
      )}

      {visibles.length === 0 && (
        <div className="vacio">
          <span className="icono-vacio"><IconoPrenda /></span>
          <p>{hayFiltros ? "No hay muestras con estos filtros." : "Aún no hay muestras."}</p>
        </div>
      )}

      {secciones.map((s) => (
        <section key={s.nombre} className="seccion-tienda">
          <h3 className="titulo-tienda">
            {s.nombre} <span>{s.lista.length}</span>
          </h3>
          <div className="lista-compacta">
            {s.lista.map((m) => {
              const portada = m.fotos_prenda?.[0] ?? m.fotos[0];
              const meta = [m.talla && `T. ${m.talla}`, m.color].filter(Boolean).join(" · ");
              return (
                <article key={m.id} className="fila-muestra" onClick={() => setDetalleId(m.id)}>
                  <div className="fila-foto">
                    {portada ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portada} alt="" loading="lazy" />
                    ) : (
                      <IconoPrenda tam={24} />
                    )}
                    {(m.fotos_prenda?.length ?? 0) > 1 && <span className="fila-num">{m.fotos_prenda.length}</span>}
                  </div>
                  <div className="fila-texto">
                    {m.marca && <div className="fila-marca">{m.marca}</div>}
                    <div className="fila-titulo">{m.descripcion || "Sin descripción"}</div>
                    {(meta || ocupado[m.id]) && (
                      <div className="fila-meta">{ocupado[m.id] ? <em>{ocupado[m.id]}</em> : meta}</div>
                    )}
                  </div>
                  <div className="fila-derecha">
                    <div className="fila-precio">
                      {m.precio_usd !== null ? usd.format(m.precio_usd) : "—"}
                      {(m.cantidad ?? 1) > 1 && <small> ×{m.cantidad}</small>}
                    </div>
                    <button
                      className={`pildora${m.status === "comprado" ? " comprado" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        alternarEstatus(m);
                      }}
                      aria-label={m.status === "comprado" ? "Comprado (tocar para cambiar)" : "Solo foto (tocar para marcar comprado)"}
                    >
                      {m.status === "comprado" ? "✓ Comprado" : "Solo foto"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {detalle && (
        <DetalleMuestra
          key={detalle.id}
          m={detalle}
          conSesion={conSesion}
          alCambiar={alCambiar}
          alCerrar={() => setDetalleId(null)}
          alEditar={() => setEditando(detalle)}
          alAgregarFoto={() => elegirFoto(detalle.id)}
          alVerFotos={setVisor}
          ocupado={ocupado[detalle.id] ?? ""}
          setOcupado={(t) => marcarOcupado(detalle.id, t)}
          alError={setError}
        />
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

      {ticket && (
        <SubirTicket muestras={muestras} conSesion={conSesion} alCerrar={() => setTicket(false)} alCambiar={alCambiar} />
      )}

      {visor && <VisorFotos visor={visor} setVisor={setVisor} conSesion={conSesion} alCambiar={alCambiar} alError={setError} />}
    </>
  );
}
