"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { textoNormal } from "@/lib/codigos";
import { gruposDuplicados } from "@/lib/duplicados";
import { comprimirImagen } from "@/lib/imagen";
import type { KeyItem, Muestra } from "@/lib/tipos";
import DetalleMuestra from "./DetalleMuestra";
import EditarMuestra from "./EditarMuestra";
import VisorFotos, { type EstadoVisor } from "./VisorFotos";
import type { ConSesion } from "./tipos";

interface Props {
  muestras: Muestra[]; // las de la colección abierta
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCambiar: () => Promise<void>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ListaMuestras({ muestras, keyItems, conSesion, alCambiar }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTienda, setFiltroTienda] = useState("");
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Muestra | null>(null);
  const [visor, setVisor] = useState<EstadoVisor | null>(null);
  const [ocupado, setOcupado] = useState<Record<number, string>>({});
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

  // ── Foto de prenda desde el detalle ──
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
      setAviso(`Se juntaron ${repetidas.length} prendas repetidas.`);
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
      (!filtroTienda || claveTienda(m.tienda) === filtroTienda) &&
      (!q || textoNormal([m.descripcion, m.marca, m.color, m.codigo, m.estilo, m.tienda, m.key_item_nombre].join(" ")).includes(q)),
  );
  const secciones = [
    ...visibles
      .reduce((mapa, m) => {
        const clave = claveTienda(m.tienda) || "~";
        const s = mapa.get(clave) ?? { nombre: m.tienda?.trim() || "Sin tienda", lista: [] as Muestra[] };
        s.lista.push(m);
        return mapa.set(clave, s);
      }, new Map<string, { nombre: string; lista: Muestra[] }>())
      .entries(),
  ]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, s]) => s);
  const detalle = detalleId !== null ? muestras.find((m) => m.id === detalleId) ?? null : null;

  return (
    <>
      <input ref={entradaFoto} className="oculto" type="file" accept="image/*" onChange={alElegirFoto} />

      <div className="buscar">
        <input type="search" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        {tiendas.length > 1 && (
          <select value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)} aria-label="Tienda">
            <option value="">Todas las tiendas</option>
            {tiendas.map(([clave, nombre]) => (
              <option key={clave} value={clave}>{nombre}</option>
            ))}
          </select>
        )}
      </div>

      {repetidas.length > 0 && (
        <div className="aviso">
          <span style={{ flex: 1 }}>
            {repetidas.length} {repetidas.length === 1 ? "prenda repetida" : "prendas repetidas"}
          </span>
          <button className="boton chico primario" onClick={unirRepetidas} disabled={uniendo}>
            {uniendo ? "Juntando…" : "Juntar"}
          </button>
        </div>
      )}
      {aviso && <div className="aviso ok" onClick={() => setAviso("")}>{aviso}</div>}
      {error && <div className="aviso error" onClick={() => setError("")}>{error}</div>}

      {visibles.length === 0 && (
        <p className="vacio">{busqueda || filtroTienda ? "Sin resultados." : "Aún no hay muestras. Toca “+ Agregar muestra”."}</p>
      )}

      {secciones.map((s) => (
        <section key={s.nombre}>
          <h2 className="titulo-seccion">
            {s.nombre} <span>{s.lista.length}</span>
          </h2>
          <ul className="lista">
            {s.lista.map((m) => {
              const portada = m.fotos_prenda?.[0] ?? m.fotos[0];
              const sub = [m.marca, m.talla && `T. ${m.talla}`, m.color].filter(Boolean).join(" · ");
              return (
                <li key={m.id} className="fila-muestra" onClick={() => setDetalleId(m.id)}>
                  <div className="miniatura">
                    {portada ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portada} alt="" loading="lazy" />
                    ) : (
                      <span />
                    )}
                  </div>
                  <div className="fila-cuerpo">
                    <div className="fila-titulo">{m.descripcion || "Sin descripción"}</div>
                    <div className="fila-sub">{ocupado[m.id] || sub}</div>
                  </div>
                  <div className="fila-fin">
                    <div className="fila-precio">
                      {m.precio_usd !== null ? usd.format(m.precio_usd) : "—"}
                      {(m.cantidad ?? 1) > 1 && <span> ×{m.cantidad}</span>}
                    </div>
                    {m.status === "comprado" && <div className="comprado-marca">✓ Comprado</div>}
                  </div>
                </li>
              );
            })}
          </ul>
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

      {visor && <VisorFotos visor={visor} setVisor={setVisor} conSesion={conSesion} alCambiar={alCambiar} alError={setError} />}
    </>
  );
}
