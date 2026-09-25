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
  muestraId: number | null;
  coincidencia: "codigo" | "claude" | null;
}

type Accion = "ignorar" | "crear" | `m${number}`; // m123 = ligar con la muestra 123

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Hoja para subir el ticket: Claude lee los artículos, se ligan con las muestras,
// se marcan como compradas y se busca foto en internet a las que no tengan.
export default function SubirTicket({
  muestras,
  conSesion,
  alCerrar,
  alCambiar,
}: {
  muestras: Muestra[];
  conSesion: ConSesion;
  alCerrar: () => void;
  alCambiar: () => Promise<void>;
}) {
  const [paso, setPaso] = useState<"elegir" | "leyendo" | "revisar" | "aplicando" | "listo">("elegir");
  const [tienda, setTienda] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [deptNuevas, setDeptNuevas] = useState<Departamento>("Mujer");
  const [buscarFotos, setBuscarFotos] = useState(true);
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
        api<{ tienda: string; renglones: Renglon[] }>("/api/ticket", { method: "POST", body: JSON.stringify({ imagenes }) }),
      );
      if (!r) return;
      if (r.renglones.length === 0) {
        setError("No se encontraron artículos en el ticket. Intenta con otra foto más clara.");
        setPaso("elegir");
        return;
      }
      setTienda(r.tienda);
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
            renglones: renglones.map((x, i) => {
              const a = acciones[i];
              return {
                ...x,
                accion: a.startsWith("m") ? "ligar" : a,
                muestraId: a.startsWith("m") ? Number(a.slice(1)) : null,
                dept: deptNuevas,
              };
            }),
          }),
        }),
      );
      if (!r) return;

      // Nuevas: descripción clara + datos + foto (con búsqueda en internet).
      // Existentes sin foto de prenda: solo se busca la foto.
      let conFoto = 0;
      let sinFoto = 0;
      for (let i = 0; i < r.creadas.length; i++) {
        setAvance(`Completando datos y fotos ${i + 1} de ${r.creadas.length}…`);
        try {
          const m = await api<Muestra>(`/api/samples/${r.creadas[i]}/completar`, { method: "POST" });
          if (m.fotos_prenda?.length) conFoto++;
          else sinFoto++;
        } catch {
          sinFoto++;
        }
      }
      if (buscarFotos) {
        const sinPrenda = r.actualizadas.filter((id) => !(muestras.find((m) => m.id === id)?.fotos_prenda ?? []).length);
        for (let i = 0; i < sinPrenda.length; i++) {
          setAvance(`Buscando fotos en internet ${i + 1} de ${sinPrenda.length}…`);
          try {
            await api(`/api/samples/${sinPrenda[i]}/buscar-foto`, { method: "POST" });
            conFoto++;
          } catch {
            sinFoto++;
          }
        }
      }

      await alCambiar();
      setResumen(
        [
          r.actualizadas.length && `${r.actualizadas.length} muestra(s) marcadas como compradas`,
          r.creadas.length && `${r.creadas.length} muestra(s) nuevas creadas`,
          conFoto && `${conFoto} foto(s) encontradas en internet`,
          sinFoto && `${sinFoto} sin foto (puedes tomarla tú desde ⋯)`,
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
                {r.codigo && <div className="pequeno">Código {r.codigo}</div>}
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

            <label className="casilla-check">
              <input type="checkbox" checked={buscarFotos} onChange={(e) => setBuscarFotos(e.target.checked)} />
              Buscar foto en internet para las que no tengan
            </label>

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
