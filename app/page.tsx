"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, NoAutorizado } from "@/lib/api";
import { guardarLocal, leerLocal } from "@/lib/local";
import type { Coleccion, KeyItem, Muestra } from "@/lib/tipos";
import Capturar from "@/components/Capturar";
import ListaMuestras from "@/components/ListaMuestras";
import KeyItems from "@/components/KeyItems";
import Resumen from "@/components/Resumen";
import Acceso from "@/components/Acceso";
import { IconoCamara, IconoGrafica, IconoLista, IconoPrenda } from "@/components/Iconos";

type Pestana = "capturar" | "muestras" | "keyitems" | "resumen";

const PESTANAS: { id: Pestana; titulo: string; icono: React.ReactNode }[] = [
  { id: "capturar", titulo: "Capturar", icono: <IconoCamara /> },
  { id: "muestras", titulo: "Muestras", icono: <IconoPrenda /> },
  { id: "keyitems", titulo: "Key items", icono: <IconoLista /> },
  { id: "resumen", titulo: "Resumen", icono: <IconoGrafica /> },
];

export default function Inicio() {
  const [sesion, setSesion] = useState<"cargando" | "ok" | "pendiente">("cargando");
  const [pestana, setPestana] = useState<Pestana>("capturar");
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [keyItems, setKeyItems] = useState<KeyItem[]>([]);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [activa, setActiva] = useState<number | null>(null);
  const [elegirColeccion, setElegirColeccion] = useState(false);
  const [error, setError] = useState("");

  // Envuelve una llamada a la API y regresa a la pantalla de acceso si expiró la sesión.
  const conSesion = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof NoAutorizado) {
        setSesion("pendiente");
        return undefined;
      }
      throw e;
    }
  }, []);

  const recargar = useCallback(async () => {
    try {
      const r = await conSesion(() =>
        Promise.all([api<Muestra[]>("/api/samples"), api<KeyItem[]>("/api/keyitems"), api<Coleccion[]>("/api/colecciones")]),
      );
      if (!r) return;
      setMuestras(r[0]);
      setKeyItems(r[1]);
      setColecciones(r[2]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [conSesion]);

  // Colección activa: la última que se usó en este teléfono, o la más reciente.
  useEffect(() => {
    if (!colecciones.length) return;
    if (activa !== null && colecciones.some((c) => c.id === activa)) return;
    const guardada = Number(leerLocal("coleccion"));
    setActiva(colecciones.some((c) => c.id === guardada) ? guardada : colecciones[0].id);
  }, [colecciones, activa]);

  function cambiarColeccion(id: number) {
    setActiva(id);
    guardarLocal("coleccion", String(id));
  }

  // Muestras creadas desde un ticket que aún no se completan: la app las arregla sola
  // (descripción clara, datos y foto), una por una, sin que la persona tenga que tocar nada.
  const [completando, setCompletando] = useState("");
  const enProceso = useRef(false);
  const intentadas = useRef(new Set<number>()); // cada muestra se intenta una sola vez por sesión
  useEffect(() => {
    // 1) Creadas desde ticket: descripción clara, datos y foto.
    // 2) Con fotos pero sin descripción o sin código: Claude lee su etiqueta (así el ticket las reconoce).
    //    Solo se llenan campos vacíos; las fotos no se tocan.
    const pendientes = muestras.filter(
      (m) =>
        !m.auto_revisado &&
        !intentadas.current.has(m.id) &&
        (m.origen === "ticket" ||
          ((m.fotos.length + (m.fotos_prenda?.length ?? 0)) > 0 && (!m.descripcion?.trim() || !m.codigo?.trim()))),
    );
    if (enProceso.current || pendientes.length === 0) return;
    enProceso.current = true;
    (async () => {
      for (let i = 0; i < pendientes.length; i++) {
        setCompletando(`Completando datos que faltan ${i + 1} de ${pendientes.length}…`);
        const m = pendientes[i];
        intentadas.current.add(m.id);
        try {
          if (m.origen === "ticket") await api(`/api/samples/${m.id}/completar`, { method: "POST" });
          else await api(`/api/samples/${m.id}/analizar`, { method: "POST", body: JSON.stringify({ modo: "llenar" }) });
        } catch (e) {
          console.error("No se pudo completar", m.id, e);
          if (e instanceof NoAutorizado) break;
        }
      }
      setCompletando("");
      enProceso.current = false;
      await recargar();
    })();
  }, [muestras, recargar]);

  useEffect(() => {
    api<{ ok: boolean }>("/api/auth")
      .then((r) => setSesion(r.ok ? "ok" : "pendiente"))
      .catch(() => setSesion("pendiente"));
  }, []);

  useEffect(() => {
    if (sesion === "ok") recargar();
  }, [sesion, recargar]);

  if (sesion === "cargando") return <div className="acceso"><div className="girando" /></div>;
  if (sesion === "pendiente") return <Acceso alEntrar={() => setSesion("ok")} />;

  const coleccion = colecciones.find((c) => c.id === activa);
  const deLaColeccion = muestras.filter((m) => m.coleccion_id === activa);

  return (
    <>
      <main className="app">
        <header className="encabezado">
          <div style={{ minWidth: 0 }}>
            <button className="selector-coleccion" onClick={() => setElegirColeccion(true)}>
              {coleccion?.nombre ?? "Muestras"} <span aria-hidden>▾</span>
            </button>
            <h1>{PESTANAS.find((p) => p.id === pestana)?.titulo}</h1>
          </div>
          <span className="pastilla">
            {deLaColeccion.length} {deLaColeccion.length === 1 ? "muestra" : "muestras"}
          </span>
        </header>

        {error && <div className="estado error" style={{ marginBottom: 12 }}>{error}</div>}
        {completando && (
          <div className="estado" style={{ marginTop: 0, marginBottom: 12 }}>
            <span className="girando" /> {completando}
          </div>
        )}

        {pestana === "capturar" && (
          <Capturar keyItems={keyItems} coleccionId={activa} conSesion={conSesion} alGuardar={recargar} />
        )}
        {pestana === "muestras" && (
          <ListaMuestras
            muestras={deLaColeccion}
            colecciones={colecciones}
            activa={activa}
            alElegirColeccion={cambiarColeccion}
            keyItems={keyItems}
            conSesion={conSesion}
            alCambiar={recargar}
          />
        )}
        {pestana === "keyitems" && (
          <KeyItems keyItems={keyItems} conSesion={conSesion} alCambiar={recargar} />
        )}
        {pestana === "resumen" && <Resumen muestras={deLaColeccion} keyItems={keyItems} titulo={coleccion?.nombre} />}
      </main>

      {elegirColeccion && (
        <div className="hoja-fondo" onClick={() => setElegirColeccion(false)}>
          <div className="hoja" role="menu" onClick={(e) => e.stopPropagation()}>
            <p className="hoja-titulo">Colección</p>
            {colecciones.map((c) => (
              <button
                key={c.id}
                role="menuitem"
                className={c.id === activa ? "elegida" : ""}
                onClick={() => {
                  cambiarColeccion(c.id);
                  setElegirColeccion(false);
                }}
              >
                {c.nombre}
                <small>{c.muestras} muestras · {c.tiendas} tiendas</small>
              </button>
            ))}
            <button
              role="menuitem"
              onClick={() => {
                setElegirColeccion(false);
                setPestana("muestras");
              }}
            >
              Ver todas / nueva colección
            </button>
          </div>
        </div>
      )}

      <nav className="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
          >
            {p.icono}
            {p.titulo}
          </button>
        ))}
      </nav>
    </>
  );
}
