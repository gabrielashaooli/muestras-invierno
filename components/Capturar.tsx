"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { blobABase64, comprimirImagen } from "@/lib/imagen";
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

// Lectura/escritura segura de localStorage (puede no existir en modo privado).
function leerLocal(llave: string): string | null {
  try {
    return localStorage.getItem(llave);
  } catch {
    return null;
  }
}
function guardarLocal(llave: string, valor: string) {
  try {
    localStorage.setItem(llave, valor);
  } catch {
    /* sin almacenamiento local */
  }
}

interface Props {
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alGuardar: () => Promise<void>;
}

export default function Capturar({ keyItems, conSesion, alGuardar }: Props) {
  const [dept, setDept] = useState<Departamento>("Damas");
  const [status, setStatus] = useState<Estatus>("solo_foto");
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [llenosIA, setLlenosIA] = useState<Set<keyof Campos>>(new Set());
  const [procesando, setProcesando] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | ""; texto: string }>({ tipo: "", texto: "" });
  const [sugerenciaDept, setSugerenciaDept] = useState<Departamento | null>(null);
  const [guardando, setGuardando] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const camposRef = useRef(campos);
  camposRef.current = campos;

  // Recordar departamento y tienda entre capturas.
  useEffect(() => {
    const d = leerLocal("dept");
    if (esDepartamento(d)) setDept(d);
    const t = leerLocal("tienda");
    if (t) setCampos((c) => ({ ...c, tienda: t }));
  }, []);

  const keyItemsDept = keyItems.filter((k) => k.dept === dept);
  const subiendo = fotos.some((f) => !f.url && !f.error);

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

  async function subirFoto(foto: Foto, blob: Blob) {
    const form = new FormData();
    form.append("foto", blob, "foto.jpg");
    try {
      const r = await conSesion(() => api<{ url: string }>("/api/upload", { method: "POST", body: form }));
      setFotos((fs) => fs.map((f) => (f.id === foto.id ? { ...f, url: r?.url ?? null, error: !r } : f)));
    } catch {
      setFotos((fs) => fs.map((f) => (f.id === foto.id ? { ...f, error: true } : f)));
    }
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
      setFuentes((prev) => {
        const mapa = new Map(prev.map((f) => [f.url, f]));
        for (const f of r.fuentes) mapa.set(f.url, f);
        return [...mapa.values()];
      });
      if (esDepartamento(r.dept) && r.dept !== dept) setSugerenciaDept(r.dept);
      setMensaje({
        tipo: "ok",
        texto: `Listo. Confianza ${r.confianza || "sin dato"}. Revisa los campos resaltados.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo analizar: ${(e as Error).message}` });
    } finally {
      setAnalizando(false);
    }
  }

  async function alElegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir la misma foto
    if (archivos.length === 0) return;

    setProcesando("Comprimiendo fotos…");
    try {
      const blobs = await Promise.all(archivos.map(comprimirImagen));
      const nuevas: { foto: Foto; blob: Blob }[] = await Promise.all(
        blobs.map(async (blob) => ({
          blob,
          foto: {
            id: crypto.randomUUID(),
            previa: URL.createObjectURL(blob),
            base64: await blobABase64(blob),
            url: null,
            error: false,
          },
        })),
      );
      const todas = [...fotos, ...nuevas.map((n) => n.foto)];
      setFotos(todas);
      setProcesando("");
      nuevas.forEach((n) => subirFoto(n.foto, n.blob));
      await analizar(todas);
    } catch (err) {
      setProcesando("");
      setMensaje({ tipo: "error", texto: (err as Error).message });
    }
  }

  function quitarFoto(id: string) {
    setFotos((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.previa);
      return fs.filter((x) => x.id !== id);
    });
  }

  function limpiar() {
    fotos.forEach((f) => URL.revokeObjectURL(f.previa));
    setFotos([]);
    setFuentes([]);
    setLlenosIA(new Set());
    setSugerenciaDept(null);
    setStatus("solo_foto");
    setCampos((c) => ({ ...VACIO, tienda: c.tienda })); // la tienda se conserva
  }

  async function guardar() {
    const fallidas = fotos.filter((f) => f.error).length;
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
            fotos: fotos.filter((f) => f.url).map((f) => f.url),
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
  const hayDatos = fotos.length > 0 || Object.entries(campos).some(([k, v]) => k !== "tienda" && v.trim());

  // Campo de texto reutilizable.
  const campo = (id: CampoTexto, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`campo${llenosIA.has(id) ? " lleno-ia" : ""}`}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} value={campos[id]} onChange={(e) => cambiar(id, e.target.value)} {...extra} />
    </div>
  );

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
        <input
          ref={entradaFoto}
          className="oculto"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={alElegirFotos}
        />
        <button className="boton primario boton-foto" disabled={ocupado} onClick={() => entradaFoto.current?.click()}>
          <span className="icono" aria-hidden>📸</span>
          {fotos.length ? "Agregar fotos y volver a llenar" : "Tomar foto y llenar"}
        </button>
        <p className="pequeno" style={{ margin: "8px 0 0" }}>
          Toma la prenda completa y las etiquetas (precio, composición, código de barras).
        </p>

        {fotos.length > 0 && (
          <div className="miniaturas">
            {fotos.map((f) => (
              <button
                key={f.id}
                onClick={() => confirm("¿Quitar esta foto?") && quitarFoto(f.id)}
                style={{ border: 0, padding: 0, background: "none", position: "relative", opacity: f.url ? 1 : 0.6 }}
                aria-label="Quitar foto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.previa} alt="" />
                {f.error && <span className="insignia" style={{ position: "absolute", left: 4, bottom: 4, color: "var(--peligro)" }}>error</span>}
              </button>
            ))}
          </div>
        )}

        {(procesando || analizando) && (
          <div className="estado">
            <span className="girando" />
            {procesando || "Leyendo etiquetas y buscando en internet…"}
          </div>
        )}
        {mensaje.texto && !ocupado && <div className={`estado ${mensaje.tipo}`}>{mensaje.texto}</div>}
        {sugerenciaDept && !ocupado && (
          <div className="estado">
            Claude sugiere el departamento <strong>{sugerenciaDept}</strong>.
            <button className="boton chico" onClick={() => cambiarDept(sugerenciaDept)}>Cambiar</button>
          </div>
        )}

        {fuentes.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="pequeno">Fuentes consultadas ({fuentes.length})</summary>
            <ul className="fuentes">
              {fuentes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noreferrer">{f.titulo || f.url}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="tarjeta">
        {campo("descripcion", "Prenda")}

        <div className={`campo${llenosIA.has("key_item_id") ? " lleno-ia" : ""}`}>
          <label htmlFor="key_item_id">Key item</label>
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
        <div className="fila">
          {campo("precio_usd", "Precio USD", { inputMode: "decimal", placeholder: "0.00" })}
          {campo("talla", "Talla")}
        </div>
        <div className="fila">
          {campo("color", "Color")}
          {campo("tela", "Composición")}
        </div>
        <div className="fila">
          {campo("codigo", "Código de barras", { inputMode: "numeric" })}
          {campo("estilo", "Número de estilo")}
        </div>

        <span className="etiqueta">Estatus</span>
        <div className="segmentos" role="group" aria-label="Estatus" style={{ marginTop: 4 }}>
          <button aria-pressed={status === "solo_foto"} onClick={() => setStatus("solo_foto")}>Solo foto</button>
          <button aria-pressed={status === "comprado"} onClick={() => setStatus("comprado")}>Comprado</button>
        </div>

        <div className={`campo${llenosIA.has("notas") ? " lleno-ia" : ""}`}>
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" value={campos.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
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
      </section>
    </>
  );
}
