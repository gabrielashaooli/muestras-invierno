"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { blobABase64, comprimirImagen } from "@/lib/imagen";
import { guardarLocal, leerLocal, TIPO_CAMBIO_INICIAL } from "@/lib/local";
import { parsePrecio } from "@/lib/precio";
import { IconoCamara, IconoChispa, IconoEnlace, IconoGaleria } from "./Iconos";
import {
  DEPARTAMENTOS,
  esDepartamento,
  type Analisis,
  type Departamento,
  type Estatus,
  type Fuente,
  type KeyItem,
} from "@/lib/tipos";
import type { ConSesion } from "./tipos";

interface Campos {
  descripcion: string;
  key_item_id: string;
  tienda: string;
  marca: string;
  precio_usd: string;
  talla: string;
  color: string;
  tela: string;
  codigo: string;
  estilo: string;
  notas: string;
}

type CampoTexto = Exclude<keyof Campos, "key_item_id" | "notas">;

interface Foto {
  id: string;
  previa: string; // object URL local para la miniatura
  base64: string; // data URL para /api/analyze
  url: string | null; // URL en Vercel Blob
  error: boolean;
}

const VACIO: Campos = {
  descripcion: "",
  key_item_id: "",
  tienda: "",
  marca: "",
  precio_usd: "",
  talla: "",
  color: "",
  tela: "",
  codigo: "",
  estilo: "",
  notas: "",
};

// Relación entre los campos del análisis y los del formulario.
const MAPEO_ANALISIS: [keyof Analisis, CampoTexto][] = [
  ["desc", "descripcion"],
  ["marca", "marca"],
  ["precio", "precio_usd"],
  ["talla", "talla"],
  ["color", "color"],
  ["tela", "tela"],
  ["codigo", "codigo"],
  ["estilo", "estilo"],
];

const MAX_FOTOS_ANALISIS = 6;

interface Props {
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alGuardar: () => Promise<void>;
}

export default function Capturar({ keyItems, conSesion, alGuardar }: Props) {
  const [dept, setDept] = useState<Departamento>("Damas");
  const [status, setStatus] = useState<Estatus>("solo_foto");
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [fotos, setFotos] = useState<Foto[]>([]); // etiquetas: se analizan con Claude
  const [fotosPrenda, setFotosPrenda] = useState<Foto[]>([]); // prenda: solo se guardan para verla
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [llenosIA, setLlenosIA] = useState<Set<keyof Campos>>(new Set());
  const [analizado, setAnalizado] = useState(false); // ya corrió el análisis al menos una vez
  const [tipoCambio, setTipoCambio] = useState(TIPO_CAMBIO_INICIAL);
  const [procesando, setProcesando] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | ""; texto: string }>({ tipo: "", texto: "" });
  const [sugerenciaDept, setSugerenciaDept] = useState<Departamento | null>(null);
  const [guardando, setGuardando] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const entradaGaleria = useRef<HTMLInputElement>(null);
  const entradaPrendaCamara = useRef<HTMLInputElement>(null);
  const entradaPrendaGaleria = useRef<HTMLInputElement>(null);
  const camposRef = useRef(campos);
  camposRef.current = campos;

  // Recordar departamento y tienda entre capturas.
  useEffect(() => {
    const d = leerLocal("dept");
    if (esDepartamento(d)) setDept(d);
    const t = leerLocal("tienda");
    if (t) setCampos((c) => ({ ...c, tienda: t }));
    const tc = parsePrecio(leerLocal("tipoCambio"));
    if (tc) setTipoCambio(tc);
  }, []);

  const keyItemsDept = keyItems.filter((k) => k.dept === dept);
  const subiendo = [...fotos, ...fotosPrenda].some((f) => !f.url && !f.error);

  function cambiarDept(d: Departamento) {
    setDept(d);
    guardarLocal("dept", d);
    setSugerenciaDept(null);
    // El key item pertenece a un departamento; se limpia si ya no aplica.
    setCampos((c) => (keyItems.some((k) => String(k.id) === c.key_item_id && k.dept === d) ? c : { ...c, key_item_id: "" }));
  }

  function cambiar(campo: keyof Campos, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    setLlenosIA((s) => {
      if (!s.has(campo)) return s;
      const n = new Set(s);
      n.delete(campo);
      return n;
    });
    if (campo === "tienda") guardarLocal("tienda", valor);
  }

  type SetFotos = React.Dispatch<React.SetStateAction<Foto[]>>;

  async function subirFoto(foto: Foto, blob: Blob, setLista: SetFotos) {
    const form = new FormData();
    form.append("foto", blob, "foto.jpg");
    try {
      const r = await conSesion(() => api<{ url: string }>("/api/upload", { method: "POST", body: form }));
      setLista((fs) => fs.map((f) => (f.id === foto.id ? { ...f, url: r?.url ?? null, error: !r } : f)));
    } catch {
      setLista((fs) => fs.map((f) => (f.id === foto.id ? { ...f, error: true } : f)));
    }
  }

  // Comprime los archivos elegidos y los convierte en fotos listas para subir.
  async function prepararFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir la misma foto
    if (archivos.length === 0) return [];
    const blobs = await Promise.all(archivos.map(comprimirImagen));
    return Promise.all(
      blobs.map(async (blob) => ({
        blob,
        foto: {
          id: crypto.randomUUID(),
          previa: URL.createObjectURL(blob),
          base64: await blobABase64(blob),
          url: null,
          error: false,
        } as Foto,
      })),
    );
  }

  // Llama a Claude y llena SOLO los campos que siguen vacíos.
  async function analizar(todas: Foto[]) {
    setAnalizando(true);
    setMensaje({ tipo: "", texto: "" });
    try {
      const r = await conSesion(() =>
        api<Analisis>("/api/analyze", {
          method: "POST",
          body: JSON.stringify({ dept, imagenes: todas.slice(-MAX_FOTOS_ANALISIS).map((f) => f.base64) }),
        }),
      );
      if (!r) return;

      // Se parte del valor más reciente del formulario (el usuario pudo editar mientras tanto).
      const n = { ...camposRef.current };
      const llenados: (keyof Campos)[] = [];
      for (const [origen, destino] of MAPEO_ANALISIS) {
        const valor = String(r[origen] ?? "").trim();
        if (valor && !n[destino].trim()) {
          n[destino] = valor;
          llenados.push(destino);
        }
      }
      if (r.keyItemId && !n.key_item_id) {
        n.key_item_id = String(r.keyItemId);
        llenados.push("key_item_id");
      }
      const notaIA = [r.notas, r.confianza && `Confianza: ${r.confianza}`].filter(Boolean).join(" · ");
      if (notaIA && !n.notas.trim()) {
        n.notas = notaIA;
        llenados.push("notas");
      }
      setCampos(n);
      setLlenosIA((s) => new Set([...s, ...llenados]));
      setAnalizado(true);
      setFuentes((prev) => {
        const mapa = new Map(prev.map((f) => [f.url, f]));
        for (const f of r.fuentes) mapa.set(f.url, f);
        return [...mapa.values()];
      });
      if (esDepartamento(r.dept) && r.dept !== dept) setSugerenciaDept(r.dept);
      setMensaje({
        tipo: "ok",
        texto: `Confianza ${r.confianza || "sin dato"}. Lo azul lo llenó Claude; lo punteado no lo supo, llénalo tú.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo analizar: ${(e as Error).message}` });
    } finally {
      setAnalizando(false);
    }
  }

  // Etiquetas: se suben y Claude llena el formulario.
  async function alElegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    setProcesando("Comprimiendo fotos…");
    try {
      const nuevas = await prepararFotos(e);
      setProcesando("");
      if (nuevas.length === 0) return;
      const todas = [...fotos, ...nuevas.map((n) => n.foto)];
      setFotos(todas);
      nuevas.forEach((n) => subirFoto(n.foto, n.blob, setFotos));
      await analizar(todas);
    } catch (err) {
      setProcesando("");
      setMensaje({ tipo: "error", texto: (err as Error).message });
    }
  }

  // Prenda: solo se sube y se guarda (no se analiza).
  async function alElegirPrenda(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const nuevas = await prepararFotos(e);
      setFotosPrenda((fs) => [...fs, ...nuevas.map((n) => n.foto)]);
      nuevas.forEach((n) => subirFoto(n.foto, n.blob, setFotosPrenda));
    } catch (err) {
      setMensaje({ tipo: "error", texto: (err as Error).message });
    }
  }

  function quitarFoto(id: string, setLista: SetFotos) {
    setLista((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.previa);
      return fs.filter((x) => x.id !== id);
    });
  }

  function limpiar() {
    [...fotos, ...fotosPrenda].forEach((f) => URL.revokeObjectURL(f.previa));
    setFotos([]);
    setFotosPrenda([]);
    setFuentes([]);
    setLlenosIA(new Set());
    setAnalizado(false);
    setSugerenciaDept(null);
    setStatus("solo_foto");
    setCampos((c) => ({ ...VACIO, tienda: c.tienda })); // la tienda se conserva
  }

  async function guardar() {
    if (precioInvalido) {
      setMensaje({ tipo: "error", texto: "Revisa el precio: escribe solo el número, ej. 29.99" });
      return;
    }
    const fallidas = [...fotos, ...fotosPrenda].filter((f) => f.error).length;
    if (fallidas && !confirm(`${fallidas} foto(s) no se subieron. ¿Guardar sin ellas?`)) return;

    setGuardando(true);
    try {
      const r = await conSesion(() =>
        api("/api/samples", {
          method: "POST",
          body: JSON.stringify({
            ...campos,
            dept,
            status,
            key_item_id: campos.key_item_id ? Number(campos.key_item_id) : null,
            precio_usd: precio,
            fotos: fotos.filter((f) => f.url).map((f) => f.url),
            fotos_prenda: fotosPrenda.filter((f) => f.url).map((f) => f.url),
            fuentes,
          }),
        }),
      );
      if (!r) return;
      limpiar();
      setMensaje({ tipo: "ok", texto: "Muestra guardada ✔" });
      await alGuardar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo guardar: ${(e as Error).message}` });
    } finally {
      setGuardando(false);
    }
  }

  const ocupado = Boolean(procesando) || analizando;
  const hayDatos = fotos.length + fotosPrenda.length > 0 || Object.entries(campos).some(([k, v]) => k !== "tienda" && v.trim());
  const precio = parsePrecio(campos.precio_usd);
  const precioInvalido = campos.precio_usd.trim() !== "" && precio === null;

  // Clase y marca visual de cada campo: azul si lo llenó Claude, punteado si quedó por llenar.
  function estadoCampo(id: keyof Campos) {
    if (llenosIA.has(id)) return { clase: " lleno-ia", marca: <span className="marca-campo ia">IA</span> };
    if (analizado && !campos[id].trim())
      return { clase: " por-llenar", marca: <span className="marca-campo pendiente">Por llenar</span> };
    return { clase: "", marca: null };
  }

  // Campo de texto reutilizable.
  const campo = (id: CampoTexto, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const e = estadoCampo(id);
    return (
      <div className={`campo${e.clase}`}>
        <label htmlFor={id}>{etiqueta} {e.marca}</label>
        <input id={id} value={campos[id]} onChange={(ev) => cambiar(id, ev.target.value)} {...extra} />
      </div>
    );
  };

  const miniaturas = (lista: Foto[], setLista: SetFotos) =>
    lista.length > 0 && (
      <div className="miniaturas">
        {lista.map((f) => (
          <button
            key={f.id}
            className="miniatura"
            onClick={() => confirm("¿Quitar esta foto?") && quitarFoto(f.id, setLista)}
            style={{ opacity: f.url || f.error ? 1 : 0.6 }}
            aria-label="Quitar foto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.previa} alt="" />
            <span className="quitar" aria-hidden>×</span>
            {f.error && <span className="aviso">No se subió</span>}
            {!f.url && !f.error && <span className="aviso">Subiendo…</span>}
          </button>
        ))}
      </div>
    );

  const ePrecio = estadoCampo("precio_usd");
  const eKey = estadoCampo("key_item_id");
  const eNotas = estadoCampo("notas");

  return (
    <>
      <div className="segmentos" role="group" aria-label="Departamento">
        {DEPARTAMENTOS.map((d) => (
          <button key={d} aria-pressed={dept === d} onClick={() => cambiarDept(d)}>
            {d}
          </button>
        ))}
      </div>

      <section className="tarjeta">
        <p className="seccion-titulo" style={{ marginTop: 0 }}>Foto de la prenda</p>
        <p className="pequeno" style={{ margin: "-6px 0 12px" }}>
          Para ver cómo se ve la prenda (puesta o en modelo). Solo se guarda, no se analiza.
        </p>
        <input ref={entradaPrendaCamara} className="oculto" type="file" accept="image/*" capture="environment" multiple onChange={alElegirPrenda} />
        <input ref={entradaPrendaGaleria} className="oculto" type="file" accept="image/*" multiple onChange={alElegirPrenda} />
        <div className="fila" style={{ gap: 10 }}>
          <button className="boton" onClick={() => entradaPrendaCamara.current?.click()}>
            <IconoCamara tam={20} /> Cámara
          </button>
          <button className="boton" onClick={() => entradaPrendaGaleria.current?.click()}>
            <IconoGaleria /> Galería
          </button>
        </div>
        {miniaturas(fotosPrenda, setFotosPrenda)}
      </section>

      <p className="seccion-titulo">Etiquetas · Claude llena los datos</p>
      <section style={{ marginBottom: 14 }}>
        <input
          ref={entradaFoto}
          className="oculto"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={alElegirFotos}
        />
        {/* Sin "capture": en iPhone deja elegir de la galería o de archivos */}
        <input
          ref={entradaGaleria}
          className="oculto"
          type="file"
          accept="image/*"
          multiple
          onChange={alElegirFotos}
        />
        <button className="boton-foto" disabled={ocupado} onClick={() => entradaFoto.current?.click()}>
          <span className="circulo"><IconoCamara tam={28} /></span>
          {fotos.length ? "Agregar fotos y volver a llenar" : "Tomar foto y llenar"}
          <small>Etiquetas de precio, composición y código de barras</small>
        </button>
        <button
          className="boton ancho"
          style={{ marginTop: 10 }}
          disabled={ocupado}
          onClick={() => entradaGaleria.current?.click()}
        >
          <IconoGaleria /> Subir etiquetas desde galería
        </button>

        {miniaturas(fotos, setFotos)}

        {(procesando || analizando) && (
          <div className="estado ia">
            <span className="girando" />
            {procesando || "Leyendo etiquetas y buscando en internet…"}
          </div>
        )}
        {mensaje.texto && !ocupado && (
          <div className={`estado ${mensaje.tipo === "ok" ? "ia" : mensaje.tipo}`}>
            {mensaje.tipo === "ok" && <IconoChispa />}
            <span style={{ flex: 1 }}>{mensaje.texto}</span>
          </div>
        )}
        {sugerenciaDept && !ocupado && (
          <div className="estado">
            <span style={{ flex: 1 }}>Claude cree que es de <strong>{sugerenciaDept}</strong>.</span>
            <button className="boton chico" onClick={() => cambiarDept(sugerenciaDept)}>Cambiar</button>
          </div>
        )}

        {fuentes.length > 0 && (
          <details className="tarjeta" style={{ marginTop: 14, padding: "12px 16px" }}>
            <summary>Fuentes consultadas ({fuentes.length})</summary>
            <ul className="fuentes">
              {fuentes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <IconoEnlace /> <span>{f.titulo || f.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="tarjeta">
        <p className="seccion-titulo">Prenda</p>
        {campo("descripcion", "Descripción", { placeholder: "Ej. Suéter cuello alto de punto" })}

        <div className={`campo${eKey.clase}`}>
          <label htmlFor="key_item_id">Key item {eKey.marca}</label>
          <select id="key_item_id" value={campos.key_item_id} onChange={(e) => cambiar("key_item_id", e.target.value)}>
            <option value="">— Sin key item —</option>
            {keyItemsDept.map((k) => (
              <option key={k.id} value={k.id}>
                {k.muestras > 0 ? "✓ " : ""}{k.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="fila">
          {campo("tienda", "Tienda")}
          {campo("marca", "Marca")}
        </div>

        <div className={`campo${precioInvalido ? "" : ePrecio.clase}`}>
          <label htmlFor="precio_usd">Precio {ePrecio.marca}</label>
          <div className="dinero">
            <span className="prefijo">$</span>
            <input
              id="precio_usd"
              inputMode="decimal"
              placeholder="0.00"
              value={campos.precio_usd}
              onChange={(e) => cambiar("precio_usd", e.target.value)}
              style={precioInvalido ? { borderColor: "var(--peligro)" } : undefined}
            />
            <span className="sufijo">USD</span>
          </div>
          {precioInvalido ? (
            <span className="ayuda error">Escribe solo el número, ej. 29.99</span>
          ) : precio !== null ? (
            <span className="ayuda">
              ≈ {precio * tipoCambio > 0 ? (precio * tipoCambio).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "$0"} MXN
              {" · "}precio de la etiqueta en tienda
            </span>
          ) : (
            <span className="ayuda">Precio de la etiqueta en tienda</span>
          )}
        </div>

        <p className="seccion-titulo" style={{ marginTop: 6 }}>Etiqueta</p>
        <div className="fila">
          {campo("talla", "Talla")}
          {campo("color", "Color")}
        </div>
        {campo("tela", "Composición", { placeholder: "Ej. 60% algodón, 40% poliéster" })}
        <div className="fila">
          {campo("codigo", "Código de barras", { inputMode: "numeric" })}
          {campo("estilo", "Número de estilo")}
        </div>

        <p className="seccion-titulo" style={{ marginTop: 6 }}>Estatus</p>
        <div className="segmentos estatus" role="group" aria-label="Estatus">
          <button aria-pressed={status === "solo_foto"} onClick={() => setStatus("solo_foto")}>Solo foto</button>
          <button className="comprado" aria-pressed={status === "comprado"} onClick={() => setStatus("comprado")}>
            Comprado
          </button>
        </div>

        <div className={`campo${eNotas.clase}`} style={{ marginBottom: 0 }}>
          <label htmlFor="notas">Notas {llenosIA.has("notas") && eNotas.marca}</label>
          <textarea id="notas" value={campos.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </div>
      </section>

      <div className="barra-guardar">
        <button className="boton" onClick={limpiar} disabled={!hayDatos || guardando}>Limpiar</button>
        <button
          className="boton primario"
          style={{ flex: 1 }}
          onClick={guardar}
          disabled={guardando || subiendo || !hayDatos}
        >
          {guardando ? "Guardando…" : subiendo ? "Subiendo fotos…" : "Guardar muestra"}
        </button>
      </div>
    </>
  );
}
