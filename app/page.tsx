"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, NoAutorizado } from "@/lib/api";
import { guardarLocal, leerLocal } from "@/lib/local";
import type { Coleccion, KeyItem, Muestra } from "@/lib/tipos";
import Acceso from "@/components/Acceso";
import Capturar from "@/components/Capturar";
import Colecciones from "@/components/Colecciones";
import KeyItems from "@/components/KeyItems";
import ListaMuestras from "@/components/ListaMuestras";
import Resumen from "@/components/Resumen";
import SubirTicket from "@/components/SubirTicket";

// Navegación simple: Inicio (colecciones) → Colección (tiendas y muestras) → Agregar / Resumen / Key items.
type Vista = "inicio" | "coleccion" | "agregar" | "resumen" | "keyitems";

export default function Inicio() {
  const [sesion, setSesion] = useState<"cargando" | "ok" | "pendiente">("cargando");
  const [vista, setVista] = useState<Vista>("inicio");
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [keyItems, setKeyItems] = useState<KeyItem[]>([]);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [activa, setActiva] = useState<number | null>(null);
  const [ticket, setTicket] = useState(false);
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

  // Al abrir: si ya había una colección abierta en este teléfono, se regresa a ella.
  const restaurada = useRef(false);
  useEffect(() => {
    if (restaurada.current || !colecciones.length) return;
    restaurada.current = true;
    const guardada = Number(leerLocal("coleccion"));
    if (colecciones.some((c) => c.id === guardada)) {
      setActiva(guardada);
      setVista("coleccion");
    }
  }, [colecciones]);

  function abrirColeccion(id: number) {
    setActiva(id);
    guardarLocal("coleccion", String(id));
    setVista("coleccion");
  }

  function irAInicio() {
    guardarLocal("coleccion", "");
    setVista("inicio");
  }

  // Completa sola, en segundo plano, lo que falta (una vez por muestra y por sesión; nunca toca fotos):
  // 1) creadas desde ticket: descripción clara, datos y foto; 2) con fotos pero sin descripción o código.
  const [completando, setCompletando] = useState("");
  const enProceso = useRef(false);
  const intentadas = useRef(new Set<number>());
  useEffect(() => {
    const pendientes = muestras.filter(
      (m) =>
        !m.auto_revisado &&
        !intentadas.current.has(m.id) &&
        (m.origen === "ticket" ||
          (m.fotos.length + (m.fotos_prenda?.length ?? 0) > 0 && (!m.descripcion?.trim() || !m.codigo?.trim()))),
    );
    if (enProceso.current || pendientes.length === 0) return;
    enProceso.current = true;
    (async () => {
      for (let i = 0; i < pendientes.length; i++) {
        setCompletando(`Completando datos ${i + 1} de ${pendientes.length}…`);
        const m = pendientes[i];
        intentadas.current.add(m.id);
        try {
          if (m.origen === "ticket") await api(`/api/samples/${m.id}/completar`, { method: "POST" });
          else await api(`/api/samples/${m.id}/analizar`, { method: "POST", body: JSON.stringify({ modo: "llenar" }) });
        } catch (e) {
          if (e instanceof NoAutorizado || /créditos/.test((e as Error).message)) break;
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

  // Barra superior de cada pantalla.
  const barra = (titulo: string, atras?: { texto: string; ir: () => void }) => (
    <header className="barra">
      {atras ? (
        <button className="barra-atras" onClick={atras.ir}>‹ {atras.texto}</button>
      ) : (
        <span />
      )}
      <h1>{titulo}</h1>
    </header>
  );

  return (
    <main className="app">
      {vista === "inicio" && (
        <>
          {barra("Muestras")}
          <Colecciones colecciones={colecciones} alElegir={abrirColeccion} conSesion={conSesion} alCambiar={recargar} />
        </>
      )}

      {vista === "coleccion" && coleccion && (
        <>
          {barra(coleccion.nombre, { texto: "Colecciones", ir: irAInicio })}
          <div className="acciones-coleccion">
            <button className="boton primario ancho" onClick={() => setVista("agregar")}>+ Agregar muestra</button>
            <div className="acciones-secundarias">
              <button className="boton" onClick={() => setTicket(true)}>Ticket</button>
              <button className="boton" onClick={() => setVista("resumen")}>Resumen</button>
              <button className="boton" onClick={() => setVista("keyitems")}>Key items</button>
            </div>
          </div>
        </>
      )}

      {vista === "agregar" && barra("Nueva muestra", { texto: coleccion?.nombre ?? "Atrás", ir: () => setVista("coleccion") })}
      {vista === "resumen" && barra("Resumen", { texto: coleccion?.nombre ?? "Atrás", ir: () => setVista("coleccion") })}
      {vista === "keyitems" && barra("Key items", { texto: coleccion?.nombre ?? "Atrás", ir: () => setVista("coleccion") })}

      {error && <div className="aviso error">{error}</div>}
      {completando && (
        <div className="aviso">
          <span className="girando" /> {completando}
        </div>
      )}

      {vista === "coleccion" && coleccion && (
        <ListaMuestras muestras={deLaColeccion} keyItems={keyItems} conSesion={conSesion} alCambiar={recargar} />
      )}
      {vista === "agregar" && (
        <Capturar keyItems={keyItems} coleccionId={activa} conSesion={conSesion} alGuardar={recargar} />
      )}
      {vista === "resumen" && <Resumen muestras={deLaColeccion} keyItems={keyItems} titulo={coleccion?.nombre} />}
      {vista === "keyitems" && <KeyItems keyItems={keyItems} conSesion={conSesion} alCambiar={recargar} />}

      {ticket && (
        <SubirTicket
          muestras={deLaColeccion}
          coleccionId={activa}
          conSesion={conSesion}
          alCerrar={() => setTicket(false)}
          alCambiar={recargar}
        />
      )}
    </main>
  );
}
