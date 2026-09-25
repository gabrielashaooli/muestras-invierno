"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, NoAutorizado } from "@/lib/api";
import type { KeyItem, Muestra } from "@/lib/tipos";
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
      const [m, k] = (await conSesion(() =>
        Promise.all([api<Muestra[]>("/api/samples"), api<KeyItem[]>("/api/keyitems")]),
      )) ?? [null, null];
      if (m) setMuestras(m);
      if (k) setKeyItems(k);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [conSesion]);

  // Muestras creadas desde un ticket que aún no se completan: la app las arregla sola
  // (descripción clara, datos y foto), una por una, sin que la persona tenga que tocar nada.
  const [completando, setCompletando] = useState("");
  const enProceso = useRef(false);
  useEffect(() => {
    const pendientes = muestras.filter((m) => m.origen === "ticket" && !m.auto_revisado);
    if (enProceso.current || pendientes.length === 0) return;
    enProceso.current = true;
    (async () => {
      for (let i = 0; i < pendientes.length; i++) {
        setCompletando(`Completando datos del ticket ${i + 1} de ${pendientes.length}…`);
        try {
          await api(`/api/samples/${pendientes[i].id}/completar`, { method: "POST" });
        } catch (e) {
          console.error("No se pudo completar", pendientes[i].id, e);
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

  return (
    <>
      <main className="app">
        <header className="encabezado">
          <div>
            <p className="sobretitulo">Muestras · Invierno</p>
            <h1>{PESTANAS.find((p) => p.id === pestana)?.titulo}</h1>
          </div>
          <span className="pastilla">
            {muestras.length} {muestras.length === 1 ? "muestra" : "muestras"}
          </span>
        </header>

        {error && <div className="estado error" style={{ marginBottom: 12 }}>{error}</div>}
        {completando && (
          <div className="estado" style={{ marginTop: 0, marginBottom: 12 }}>
            <span className="girando" /> {completando}
          </div>
        )}

        {pestana === "capturar" && (
          <Capturar keyItems={keyItems} conSesion={conSesion} alGuardar={recargar} />
        )}
        {pestana === "muestras" && (
          <ListaMuestras muestras={muestras} keyItems={keyItems} conSesion={conSesion} alCambiar={recargar} />
        )}
        {pestana === "keyitems" && (
          <KeyItems keyItems={keyItems} conSesion={conSesion} alCambiar={recargar} />
        )}
        {pestana === "resumen" && <Resumen muestras={muestras} keyItems={keyItems} />}
      </main>

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
