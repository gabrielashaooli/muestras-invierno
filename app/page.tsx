"use client";

import { useCallback, useEffect, useState } from "react";
import { api, NoAutorizado } from "@/lib/api";
import type { KeyItem, Muestra } from "@/lib/tipos";
import Capturar from "@/components/Capturar";
import ListaMuestras from "@/components/ListaMuestras";
import KeyItems from "@/components/KeyItems";
import Resumen from "@/components/Resumen";
import Acceso from "@/components/Acceso";

type Pestana = "capturar" | "muestras" | "keyitems" | "resumen";

const PESTANAS: { id: Pestana; titulo: string; icono: string }[] = [
  { id: "capturar", titulo: "Capturar", icono: "📷" },
  { id: "muestras", titulo: "Muestras", icono: "🧥" },
  { id: "keyitems", titulo: "Key items", icono: "✅" },
  { id: "resumen", titulo: "Resumen", icono: "📊" },
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
          <h1>{PESTANAS.find((p) => p.id === pestana)?.titulo}</h1>
          <span className="pequeno">{muestras.length} muestras</span>
        </header>

        {error && <div className="estado error" style={{ marginBottom: 12 }}>{error}</div>}

        {pestana === "capturar" && (
          <Capturar keyItems={keyItems} conSesion={conSesion} alGuardar={recargar} />
        )}
        {pestana === "muestras" && (
          <ListaMuestras muestras={muestras} conSesion={conSesion} alCambiar={recargar} />
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
            <span className="icono" aria-hidden>{p.icono}</span>
            {p.titulo}
          </button>
        ))}
      </nav>
    </>
  );
}
