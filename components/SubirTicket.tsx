"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { blobABase64, comprimirImagen } from "@/lib/imagen";
import { DEPARTAMENTOS, type Departamento, type Muestra } from "@/lib/tipos";
import { IconoCamara, IconoGaleria } from "./Iconos";
import type { ConSesion } from "./tipos";

interface Renglon {
  descripcion: string;
  codigo: string;
  precio: number | null;
  cantidad: number;
  estilo: string;
  color: string;
  grupo: string;
  muestraId: number | null;
  coincidencia: "codigo" | "claude" | "grupo" | null;
}

type Accion = "ignorar" | "crear" | `m${number}`; // m123 = ligar con la muestra 123

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Hoja para subir el ticket: Claude lee los artículos, se ligan con las muestras,
// se marcan como compradas y se busca foto en internet a las que no tengan.
export default function SubirTicket({
  muestras,
  coleccionId,
  conSesion,
  alCerrar,
  alCambiar,
}: {
  muestras: Muestra[];
  coleccionId: number | null;
  conSesion: ConSesion;
  alCerrar: () => void;
  alCambiar: () => Promise<void>;
}) {
  const [paso, setPaso] = useState<"elegir" | "leyendo" | "revisar" | "aplicando" | "listo">("elegir");
  const [tienda, setTienda] = useState("");
  const [fecha, setFecha] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [deptNuevas, setDeptNuevas] = useState<Departamento>("Mujer");
  const [avance, setAvance] = useState("");
  const [resumen, setResumen] = useState("");
  const [error, setError] = useState("");
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []).slice(0, 4);
    e.target.value = "";
    if (!archivos.length) return;
    setError("");
    setPaso("leyendo");
    try {
      // Más resolución que las fotos normales para que se lean los renglones.
      const imagenes = await Promise.all(archivos.map(async (a) => blobABase64(await comprimirImagen(a, 2400))));
      const r = await conSesion(() =>
        api<{ tienda: string; fecha: string; renglones: Renglon[] }>("/api/ticket", { method: "POST", body: JSON.stringify({ imagenes, coleccion_id: coleccionId }) }),
      );
      if (!r) return;
      if (r.renglones.length === 0) {
        setError("No se encontraron artículos en el ticket. Intenta con otra foto más clara.");
        setPaso("elegir");
        return;
      }
      setTienda(r.tienda);
      setFecha(r.fecha ?? "");
      setRenglones(r.renglones);
      setAcciones(r.renglones.map((x) => (x.muestraId ? (`m${x.muestraId}` as Accion) : "crear")));
      setPaso("revisar");
    } catch (err) {
      setError(`No se pudo leer el ticket: ${(err as Error).message}`);
      setPaso("elegir");
    }
  }

  async function aplicar() {
    setPaso("aplicando");
    setError("");
    try {
      setAvance("Guardando…");
      const r = await conSesion(() =>
        api<{ actualizadas: number[]; creadas: number[] }>("/api/ticket/aplicar", {
          method: "POST",
          body: JSON.stringify({
            tienda,
            fecha,
            coleccion_id: coleccionId,
            renglones: renglones.map((x, i) => {
              const a = acciones[i];
              return {
                ...x,
                indice: i,
                accion: a.startsWith("m") ? "ligar" : a,
                muestraId: a.startsWith("m") ? Number(a.slice(1)) : null,
                dept: deptNuevas,
              };
            }),
          }),
        }),
      );
      if (!r) return;

      // Nuevas y existentes: descripción clara, marca y datos (con búsqueda en internet).
      // Las fotos que ya tienes NUNCA se tocan: solo se busca foto para las que no tienen ninguna.
      const textoDe = new Map<number, string>();
      renglones.forEach((x, i) => {
        const a = acciones[i];
        if (a.startsWith("m")) textoDe.set(Number(a.slice(1)), x.descripcion);
      });
      const porCompletar = [...r.creadas, ...r.actualizadas];
      let conFoto = 0;
      for (let i = 0; i < porCompletar.length; i++) {
        setAvance(`Actualizando descripciones ${i + 1} de ${porCompletar.length}…`);
        const id = porCompletar[i];
        try {
          const antes = muestras.find((m) => m.id === id)?.fotos_prenda?.length ?? 0;
          const m = await api<Muestra>(`/api/samples/${id}/completar`, {
            method: "POST",
            body: JSON.stringify({ texto_ticket: textoDe.get(id) ?? "" }),
          });
          if (!antes && m.fotos_prenda?.length) conFoto++;
        } catch {
          /* se sigue con las demás */
        }
      }

      await alCambiar();
      const faltaban = renglones.filter((_, i) => acciones[i] === "crear").map((x) => x.descripcion || x.codigo);
      setResumen(
        [
          `${acciones.filter((a) => a !== "ignorar").length} artículos del ticket`,
          r.actualizadas.length && `${r.actualizadas.length} ya estaban: se actualizaron precio y descripción (sus fotos no se tocaron)`,
          faltaban.length && `Faltaban en la app ${faltaban.length}: ${faltaban.join(", ")} (ya se agregaron)`,
          conFoto && `${conFoto} foto(s) nuevas desde internet para las que no tenían`,
        ]
          .filter(Boolean)
          .join(". ") + ".",
      );
      setPaso("listo");
    } catch (err) {
      setError(`No se pudo aplicar: ${(err as Error).message}`);
      setPaso("revisar");
    } finally {
      setAvance("");
    }
  }

  const etiquetaMuestra = (m: Muestra) =>
    [m.marca, m.descripcion || "Sin descripción", m.talla && `T. ${m.talla}`, m.precio_usd !== null && usd.format(m.precio_usd)]
      .filter(Boolean)
      .join(" · ");

  const hayNuevas = acciones.some((a) => a === "crear");

  return (
    <div className="hoja-fondo" onClick={paso === "aplicando" || paso === "leyendo" ? undefined : alCerrar}>
      <div className="hoja hoja-editar" onClick={(e) => e.stopPropagation()}>
        <p className="hoja-titulo">Subir ticket</p>

        <input ref={camara} className="oculto" type="file" accept="image/*" capture="environment" onChange={alElegir} />
        <input ref={galeria} className="oculto" type="file" accept="image/*" multiple onChange={alElegir} />

        {paso === "elegir" && (
          <>
            <p style={{ margin: "0 4px 14px" }}>
              Toma foto del ticket completo. Claude lee los artículos, los liga con tus muestras y los marca como comprados.
              Si el ticket es muy largo, puedes elegir varias fotos de la galería.
            </p>
            <div className="fila" style={{ gap: 10 }}>
              <button className="boton primario" onClick={() => camara.current?.click()}>
                <IconoCamara tam={20} /> Cámara
              </button>
              <button className="boton" onClick={() => galeria.current?.click()}>
                <IconoGaleria /> Galería
              </button>
            </div>
          </>
        )}

        {paso === "leyendo" && (
          <div className="estado"><span className="girando" /> Leyendo ticket…</div>
        )}

        {paso === "revisar" && (
          <>
            <p style={{ margin: "0 4px 12px" }}>
              {tienda && <strong>{tienda}. </strong>}
              Revisa a qué muestra va cada artículo:
            </p>
            {renglones.map((r, i) => (
              <div key={i} className="renglon-ticket">
                <div className="renglon-cabeza">
                  <strong>{r.descripcion || r.codigo}</strong>
                  <span>
                    {r.precio !== null ? usd.format(r.precio) : "—"}
                    {r.cantidad > 1 ? ` × ${r.cantidad}` : ""}
                  </span>
                </div>
                {acciones[i] === "crear" && <span className="etiqueta-falta">Falta en la app</span>}
                {(r.codigo || r.color) && (
                  <div className="pequeno">{[r.color && `Color ${r.color}`, r.codigo && `Código ${r.codigo}`].filter(Boolean).join(" · ")}</div>
                )}
                <select
                  value={acciones[i]}
                  onChange={(e) => setAcciones((a) => a.map((x, j) => (j === i ? (e.target.value as Accion) : x)))}
                >
                  <option value="crear">➕ Crear muestra nueva</option>
                  <option value="ignorar">No es muestra (ignorar)</option>
                  <optgroup label="Ligar con muestra">
                    {muestras.map((m) => (
                      <option key={m.id} value={`m${m.id}`}>
                        {etiquetaMuestra(m)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {(acciones[i].startsWith("m")
                  ? acciones.filter((x) => x === acciones[i]).length > 1
                  : acciones[i] === "crear" &&
                    renglones.filter((x, j) => x.grupo === r.grupo && acciones[j] === "crear").length > 1) && (
                  <div className="pequeno" style={{ color: "var(--primario)" }}>
                    Se junta con otro renglón en una sola muestra (otro color): se suman piezas y colores.
                  </div>
                )}
                {r.coincidencia === "codigo" && acciones[i] === `m${r.muestraId}` && (
                  <div className="pequeno" style={{ color: "var(--exito)" }}>✓ Mismo código</div>
                )}
              </div>
            ))}

            {hayNuevas && (
              <div className="campo" style={{ marginTop: 6 }}>
                <label>Departamento de las nuevas</label>
                <div className="segmentos" role="group" aria-label="Departamento de las nuevas">
                  {DEPARTAMENTOS.map((d) => (
                    <button key={d} aria-pressed={deptNuevas === d} onClick={() => setDeptNuevas(d)}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            <p className="nota-segura">
              🔒 Tus fotos no se tocan. Se actualizan precio y descripción, y solo se busca foto para las que no tienen.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="boton" onClick={alCerrar}>Cancelar</button>
              <button className="boton primario" style={{ flex: 1 }} onClick={aplicar}>
                Aplicar ({acciones.filter((a) => a !== "ignorar").length})
              </button>
            </div>
          </>
        )}

        {paso === "aplicando" && (
          <div className="estado"><span className="girando" /> {avance}</div>
        )}

        {paso === "listo" && (
          <>
            <div className="estado ok" style={{ marginTop: 0 }}>{resumen}</div>
            <button className="boton primario ancho" style={{ marginTop: 12 }} onClick={alCerrar}>Listo</button>
          </>
        )}

        {error && <div className="estado error">{error}</div>}
      </div>
    </div>
  );
}
