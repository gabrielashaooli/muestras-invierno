"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { blobABase64, comprimirTicket } from "@/lib/imagen";
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
  const [paso, setPaso] = useState<"elegir" | "texto" | "leyendo" | "revisar" | "aplicando" | "listo">("elegir");
  const [tienda, setTienda] = useState("");
  const [fecha, setFecha] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [deptNuevas, setDeptNuevas] = useState<Departamento>("Mujer");
  const [avance, setAvance] = useState("");
  const [resumen, setResumen] = useState<{ estaban: string[]; agregadas: string[]; conFoto: number } | null>(null);
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
      // Blanco y negro, buena resolución y sin pasar el límite de envío (~3 MB entre todas).
      const maxBytes = Math.min(1_500_000, Math.floor(2_200_000 / archivos.length));
      const imagenes = await Promise.all(archivos.map(async (a) => blobABase64(await comprimirTicket(a, maxBytes))));


      const r = await conSesion(() =>
        api<{ tienda: string; fecha: string; renglones: Renglon[] }>("/api/ticket", { method: "POST", body: JSON.stringify({ imagenes, coleccion_id: coleccionId }) }),
      );
      if (!r) return;
      if (r.renglones.length === 0) {
        setError("No se encontraron artículos en el ticket. Intenta con otra foto más clara.");
        setPaso("elegir");
        return;
      }

      // Si faltan renglones por reconocer: se leen rápido (sin internet) los códigos UPC / DPCI de las etiquetas
      // de tus muestras de esa tienda que aún no se han leído, y se vuelve a comparar. No toca fotos.
      if (r.renglones.some((x) => x.muestraId === null)) {
        const clave = (r.tienda || "").toLowerCase().split(/\s+/)[0] ?? "";
        const porLeer = muestras.filter(
          (m) =>
            !m.codigos_leidos &&
            m.status !== "comprado" &&
            m.fotos.length + (m.fotos_prenda?.length ?? 0) > 0 &&
            (!clave || !m.tienda?.trim() || m.tienda.toLowerCase().includes(clave)),
        );
        let hechas = 0;
        const cola = [...porLeer];
        const trabajador = async () => {
          while (cola.length) {
            const m = cola.shift()!;
            try {
              await api(`/api/samples/${m.id}/leer-codigos`, { method: "POST" });
            } catch {
              /* se sigue */
            }
            hechas++;
            setAvance(`Leyendo etiquetas de tus muestras ${hechas} de ${porLeer.length}…`);
          }
        };
        if (porLeer.length) {
          setAvance(`Leyendo etiquetas de tus muestras 0 de ${porLeer.length}…`);
          await Promise.all([trabajador(), trabajador(), trabajador()]); // 3 a la vez
          const e = await conSesion(() =>
            api<{ renglones: Renglon[] }>("/api/ticket/emparejar", {
              method: "POST",
              body: JSON.stringify({ renglones: r.renglones, coleccion_id: coleccionId }),
            }),
          );
          if (e) r.renglones = e.renglones;
          await alCambiar();
        }
        setAvance("");
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

  // Sin créditos de Claude: el texto del ticket se pega o escribe ("032130078 Cat & Jack 18.00") y se liga
  // con tus muestras por código. No usa Claude.
  const [texto, setTexto] = useState("");
  const [tiendaTexto, setTiendaTexto] = useState("Target");
  async function leerTexto() {
    const leidos: Renglon[] = [];
    for (const linea of texto.split(/\n+/)) {
      if (/regular price|subtotal|total|tax|payment|change/i.test(linea)) continue;
      const m = linea.trim().match(/^(\d{6,14})?\s*(.*?)\s*(?:[A-Z]\s+)?\$?\s*(\d+(?:[.,]\d{1,2})?)$/);
      if (!m || (!m[1] && !m[2])) continue;
      const i = leidos.length;
      leidos.push({
        descripcion: m[2].trim(),
        codigo: m[1] ?? "",
        precio: Number(m[3].replace(",", ".")) || null,
        cantidad: 1,
        estilo: "",
        color: "",
        grupo: `u:${m[1] || m[2]}|${i}`,
        muestraId: null,
        coincidencia: null,
      });
    }
    if (!leidos.length) {
      setError("No encontré artículos. Pon uno por renglón: código, nombre y precio.");
      return;
    }
    setError("");
    setPaso("leyendo");
    try {
      const e = await conSesion(() =>
        api<{ renglones: Renglon[] }>("/api/ticket/emparejar", {
          method: "POST",
          body: JSON.stringify({ renglones: leidos, coleccion_id: coleccionId }),
        }),
      );
      if (!e) return;
      setTienda(tiendaTexto.trim());
      setFecha("");
      setRenglones(e.renglones);
      setAcciones(e.renglones.map((x) => (x.muestraId ? (`m${x.muestraId}` as Accion) : "crear")));
      setPaso("revisar");
    } catch (err) {
      setError(`No se pudo revisar: ${(err as Error).message}`);
      setPaso("texto");
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
        } catch (e) {
          if (/créditos/.test((e as Error).message)) break; // sin créditos: lo demás ya quedó guardado
        }
      }

      await alCambiar();
      const nombre = (x: Renglon) => x.descripcion || x.codigo;
      setResumen({
        estaban: renglones.filter((_, i) => acciones[i].startsWith("m")).map(nombre),
        agregadas: renglones.filter((_, i) => acciones[i] === "crear").map(nombre),
        conFoto,
      });
      setPaso("listo");
    } catch (err) {
      setError(`No se pudo aplicar: ${(err as Error).message}`);
      setPaso("revisar");
    } finally {
      setAvance("");
    }
  }

  // Muestras sugeridas para un renglón: primero las de la misma tienda que no se han ligado ni comprado.
  const claveTienda = tienda.toLowerCase().split(/\s+/)[0] ?? "";
  function candidatas(r: Renglon, i: number) {
    const usadas = new Set(acciones.filter((a, j) => j !== i && a.startsWith("m")));
    const palabras = r.descripcion.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const puntos = (m: Muestra) =>
      (claveTienda && (m.tienda ?? "").toLowerCase().includes(claveTienda) ? 100 : 0) +
      (m.status !== "comprado" ? 20 : 0) +
      (m.precio_usd !== null && r.precio !== null && Math.abs(m.precio_usd - r.precio) < 0.01 ? 30 : 0) +
      palabras.filter((w) => `${m.descripcion} ${m.marca}`.toLowerCase().includes(w)).length * 5;
    return muestras.filter((m) => !usadas.has(`m${m.id}`)).sort((a, b) => puntos(b) - puntos(a));
  }

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
            <button className="boton ancho" style={{ marginTop: 10 }} onClick={() => setPaso("texto")}>
              Escribir o pegar el ticket (sin créditos)
            </button>
          </>
        )}

        {paso === "texto" && (
          <>
            <p className="pequeno" style={{ margin: "0 4px 8px" }}>
              Un artículo por renglón: código, nombre y precio. Ej. <strong>032130078 Cat &amp; Jack 18.00</strong>. No usa créditos.
            </p>
            <div className="campo">
              <label>Tienda</label>
              <input value={tiendaTexto} onChange={(e) => setTiendaTexto(e.target.value)} />
            </div>
            <textarea
              className="texto-ticket"
              rows={12}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"032130078 Cat & Jack 18.00\n333030489 Art Class 20.00"}
            />
            <div className="barra-aplicar">
              <button className="boton" onClick={() => setPaso("elegir")}>Atrás</button>
              <button className="boton primario" style={{ flex: 1 }} onClick={leerTexto} disabled={!texto.trim()}>
                Revisar
              </button>
            </div>
          </>
        )}

        {paso === "leyendo" && (
          <div className="estado"><span className="girando" /> {avance || "Leyendo ticket…"}</div>
        )}

        {paso === "revisar" && (() => {
          const faltan = renglones.map((_, i) => i).filter((i) => acciones[i] === "crear");
          const estan = renglones.map((_, i) => i).filter((i) => acciones[i].startsWith("m"));
          const ignorados = renglones.map((_, i) => i).filter((i) => acciones[i] === "ignorar");
          const tarjeta = (i: number) => {
            const r = renglones[i];
            return (
              <div key={i} className="renglon-ticket">
                <div className="renglon-cabeza">
                  <strong>{r.descripcion || r.codigo}</strong>
                  <span>
                    {r.precio !== null ? usd.format(r.precio) : "—"}
                    {r.cantidad > 1 ? ` × ${r.cantidad}` : ""}
                  </span>
                </div>
                {(r.codigo || r.color) && (
                  <div className="pequeno">{[r.color && `Color ${r.color}`, r.codigo && `Código ${r.codigo}`].filter(Boolean).join(" · ")}</div>
                )}
                <Elegir
                  accion={acciones[i]}
                  candidatas={candidatas(r, i)}
                  elegida={acciones[i].startsWith("m") ? muestras.find((m) => `m${m.id}` === acciones[i]) : undefined}
                  alCambiar={(nueva) => setAcciones((a) => a.map((x, j) => (j === i ? nueva : x)))}
                />
                {(acciones[i].startsWith("m")
                  ? acciones.filter((x) => x === acciones[i]).length > 1
                  : acciones[i] === "crear" &&
                    renglones.filter((x, j) => x.grupo === r.grupo && acciones[j] === "crear").length > 1) && (
                  <div className="pequeno">Se junta con otro renglón en una sola muestra (otro color).</div>
                )}
              </div>
            );
          };
          return (
            <>
              {tienda && <p className="ticket-tienda">{tienda}</p>}
              <div className="ticket-cuenta">
                <div className="cuenta-falta">
                  <strong>{faltan.length}</strong>
                  <span>Faltan en la app</span>
                </div>
                <div className="cuenta-ok">
                  <strong>{estan.length}</strong>
                  <span>Ya están</span>
                </div>
              </div>

              {faltan.length > 0 && (
                <section className="grupo-ticket falta">
                  <h3>Faltan en la app ({faltan.length})</h3>
                  <p className="pequeno">
                    Si ya la tienes, tócala en las fotos. Si no, se agrega como nueva al tocar Aplicar.
                  </p>
                  {faltan.map(tarjeta)}
                </section>
              )}

              {estan.length > 0 && (
                <section className="grupo-ticket ok">
                  <h3>✓ Ya están ({estan.length})</h3>
                  <p className="pequeno">Se marcan como compradas y se actualiza el precio.</p>
                  {estan.map(tarjeta)}
                </section>
              )}

              {ignorados.length > 0 && (
                <section className="grupo-ticket">
                  <h3>No son muestras ({ignorados.length})</h3>
                  {ignorados.map(tarjeta)}
                </section>
              )}

              {faltan.length > 0 && (
                <div className="campo" style={{ marginTop: 6 }}>
                  <label>Departamento de las nuevas</label>
                  <div className="segmentos" role="group" aria-label="Departamento de las nuevas">
                    {DEPARTAMENTOS.map((d) => (
                      <button key={d} aria-pressed={deptNuevas === d} onClick={() => setDeptNuevas(d)}>{d}</button>
                    ))}
                  </div>
                </div>
              )}

              <p className="nota-segura">🔒 Tus fotos no se tocan.</p>

              <div className="barra-aplicar">
                <button className="boton" onClick={alCerrar}>Cancelar</button>
                <button className="boton primario" style={{ flex: 1 }} onClick={aplicar}>
                  Aplicar ({acciones.filter((a) => a !== "ignorar").length})
                </button>
              </div>
            </>
          );
        })()}

        {paso === "aplicando" && (
          <div className="estado"><span className="girando" /> {avance}</div>
        )}

        {paso === "listo" && (
          <>
            {resumen && (
              <>
                <section className="grupo-ticket ok">
                  <h3>✓ Ya estaban ({resumen.estaban.length})</h3>
                  <p className="pequeno">Marcadas como compradas. Sus fotos no se tocaron.</p>
                  <ul className="lista-simple">{resumen.estaban.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </section>
                {resumen.agregadas.length > 0 && (
                  <section className="grupo-ticket falta">
                    <h3>Faltaban y se agregaron ({resumen.agregadas.length})</h3>
                    <ul className="lista-simple">{resumen.agregadas.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </section>
                )}
                {resumen.conFoto > 0 && <p className="pequeno">{resumen.conFoto} foto(s) nuevas desde internet para las que no tenían.</p>}
              </>
            )}
            <button className="boton primario ancho" style={{ marginTop: 12 }} onClick={alCerrar}>Listo</button>
          </>
        )}

        {error && <div className="estado error">{error}</div>}
      </div>
    </div>
  );
}

// Selector visual: la muestra elegida con su foto, o fotos de tus muestras para tocar la que es.
function Elegir({
  accion,
  candidatas,
  elegida,
  alCambiar,
}: {
  accion: Accion;
  candidatas: Muestra[];
  elegida?: Muestra;
  alCambiar: (a: Accion) => void;
}) {
  const [abierto, setAbierto] = useState(accion === "crear");
  const foto = (m: Muestra) => m.fotos_prenda?.[0] ?? m.fotos[0];

  if (elegida && !abierto) {
    return (
      <div className="elegida-ticket">
        {foto(elegida) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto(elegida)} alt="" />
        ) : (
          <span className="sin-foto" />
        )}
        <div className="elegida-texto">
          <strong>{elegida.descripcion || "Sin descripción"}</strong>
          <span>{[elegida.marca, elegida.talla && `T. ${elegida.talla}`].filter(Boolean).join(" · ")}</span>
        </div>
        <button className="boton chico" onClick={() => setAbierto(true)}>Cambiar</button>
      </div>
    );
  }

  return (
    <div className="elegir-ticket">
      <div className="pequeno" style={{ margin: "2px 0 6px" }}>
        {accion === "ignorar" ? "Se ignora este renglón." : "¿Es alguna de tus muestras? Tócala:"}
      </div>
      <div className="tira-ticket">
        {candidatas.slice(0, 30).map((m) => (
          <button
            key={m.id}
            className={`opcion-ticket${accion === `m${m.id}` ? " activa" : ""}`}
            onClick={() => {
              alCambiar(`m${m.id}` as Accion);
              setAbierto(false);
            }}
          >
            {foto(m) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto(m)} alt="" loading="lazy" />
            ) : (
              <span className="sin-foto" />
            )}
            <span>{m.descripcion || m.marca || "Sin nombre"}</span>
          </button>
        ))}
      </div>
      <div className="fila" style={{ gap: 8, marginTop: 8 }}>
        <button className={`boton chico${accion === "crear" ? " primario" : ""}`} onClick={() => alCambiar("crear")}>
          Es nueva
        </button>
        <button className={`boton chico${accion === "ignorar" ? " primario" : ""}`} onClick={() => alCambiar("ignorar")}>
          No es muestra
        </button>
      </div>
    </div>
  );
}
