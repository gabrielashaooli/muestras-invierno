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
  const [dept, setDept] = useState<Departamento>("Mujer");
  const [status, setStatus] = useState<Estatus>("solo_foto");
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [fotos, setFotos] = useState<Foto[]>([]); // etiquetas: se analizan con Claude
  const [portadaId, setPortadaId] = useState<string | null>(null); // foto de la prenda (referencia)
  const portadaManual = useRef(false); // true si la persona eligió la foto de la prenda a mano
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

      // Claude indica cuál foto muestra la prenda; se usa como foto de referencia.
      const enviadas = todas.slice(-MAX_FOTOS_ANALISIS);
      if (!portadaManual.current && r.fotoPrenda !== null && enviadas[r.fotoPrenda]) {
        setPortadaId(enviadas[r.fotoPrenda].id);
      }

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
      const notaIA = r.notas.trim();
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

    } catch (e) {
      setMensaje({ tipo: "error", texto: `No se pudo analizar: ${(e as Error).message}` });
    } finally {
      setAnalizando(false);
    }
  }

  // Etiquetas: se suben y Claude llena el formulario.
  async function alElegirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    setProcesando("Analizando…");
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

  function quitarFoto(id: string) {
    if (id === portadaId) {
      setPortadaId(null);
      portadaManual.current = false;
    }
    setFotos((fs) => {
      const f = fs.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.previa);
      return fs.filter((x) => x.id !== id);
    });
  }

  function limpiar() {
    fotos.forEach((f) => URL.revokeObjectURL(f.previa));
    setFotos([]);
    setPortadaId(null);
    portadaManual.current = false;
    setFuentes([]);
    setLlenosIA(new Set());
    setAnalizado(false);
    setSugerenciaDept(null);
    setStatus("solo_foto");
    setCampos((c) => ({ ...VACIO, tienda: c.tienda })); // la tienda se conserva
  }

  async function guardar() {
    if (precioInvalido) {
      setMensaje({ tipo: "error", texto: "El precio debe ser solo el número, por ejemplo 29.99" });
      return;
    }
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
            precio_usd: precio,
            // La foto de la prenda se guarda aparte como referencia; las demás son etiquetas.
            fotos: fotos.filter((f) => f.url && f.id !== portadaId).map((f) => f.url),
            fotos_prenda: fotos.filter((f) => f.url && f.id === portadaId).map((f) => f.url),
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
  const precio = parsePrecio(campos.precio_usd);
  const precioInvalido = campos.precio_usd.trim() !== "" && precio === null;

  // Lo que llenó Claude se ve con fondo azul claro; nada más.
  const claseCampo = (id: keyof Campos) => (llenosIA.has(id) ? "campo lleno-ia" : "campo");

  // Campo de texto reutilizable.
  const campo = (id: CampoTexto, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={claseCampo(id)}>
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} value={campos[id]} onChange={(ev) => cambiar(id, ev.target.value)} {...extra} />
    </div>
  );

  // Foto de la prenda (portada) y fotos de etiqueta (solo para llenar datos).
  const fotoPrenda = fotos.find((f) => f.id === portadaId) ?? null;
  const fotosEtiqueta = fotos.filter((f) => f.id !== portadaId);

  // Si Claude se equivocó, se intercambia cuál es la prenda.
  function intercambiar() {
    if (fotosEtiqueta.length === 0) return;
    portadaManual.current = true;
    setPortadaId(fotosEtiqueta[0].id);
  }

  const casilla = (titulo: string, foto: Foto | null, extra = 0) => (
    <div className="casilla">
      <span className="casilla-titulo">{titulo}</span>
      {foto ? (
        <button
          className="casilla-foto"
          onClick={() => confirm(`¿Quitar la foto de ${titulo.toLowerCase()}?`) && quitarFoto(foto.id)}
          aria-label={`Quitar foto de ${titulo.toLowerCase()}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.previa} alt="" />
          {extra > 0 && <span className="casilla-extra">+{extra}</span>}
          {foto.error && <span className="casilla-aviso">No se subió</span>}
        </button>
      ) : (
        <div className="casilla-vacia">{ocupado ? "…" : "Sin foto"}</div>
      )}
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

      <section style={{ marginBottom: 16 }}>
        <input ref={entradaFoto} className="oculto" type="file" accept="image/*" capture="environment" multiple onChange={alElegirFotos} />
        {/* Sin "capture": en iPhone deja elegir de la galería */}
        <input ref={entradaGaleria} className="oculto" type="file" accept="image/*" multiple onChange={alElegirFotos} />

        <button className="boton-foto" disabled={ocupado} onClick={() => entradaFoto.current?.click()}>
          <span className="circulo"><IconoCamara tam={28} /></span>
          {fotos.length === 0 ? "Tomar fotos" : "Agregar otra foto"}
          <small>La prenda y su etiqueta</small>
        </button>
        <button className="boton ancho" style={{ marginTop: 10 }} disabled={ocupado} onClick={() => entradaGaleria.current?.click()}>
          <IconoGaleria /> Elegir de la galería
        </button>

        {fotos.length > 0 && (
          <div className="casillas">
            {casilla("Prenda", fotoPrenda)}
            {casilla("Etiqueta", fotosEtiqueta[0] ?? null, fotosEtiqueta.length - 1)}
          </div>
        )}
        {fotos.length > 1 && !ocupado && (
          <button className="boton chico" style={{ marginTop: 10 }} onClick={intercambiar}>
            ⇄ Intercambiar prenda y etiqueta
          </button>
        )}

        {ocupado && (
          <div className="estado">
            <span className="girando" /> Analizando…
          </div>
        )}
        {mensaje.texto && !ocupado && <div className={`estado ${mensaje.tipo}`}>{mensaje.texto}</div>}

        {fuentes.length > 0 && !ocupado && (
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
        {campo("descripcion", "Prenda", { placeholder: "Ej. Suéter cuello alto" })}

        <div className={claseCampo("key_item_id")}>
          <label htmlFor="key_item_id">Key item</label>
          <select id="key_item_id" value={campos.key_item_id} onChange={(e) => cambiar("key_item_id", e.target.value)}>
            <option value="">Ninguno</option>
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

        <div className={claseCampo("precio_usd")}>
          <label htmlFor="precio_usd">Precio (USD)</label>
          <div className="dinero">
            <span className="prefijo">$</span>
            <input
              id="precio_usd"
              inputMode="decimal"
              placeholder="0.00"
              value={campos.precio_usd}
              onChange={(e) => cambiar("precio_usd", e.target.value)}
            />
            <span className="sufijo">USD</span>
          </div>
          {precio !== null && precio > 0 && (
            <span className="ayuda">
              ≈ {(precio * tipoCambio).toLocaleString("es-MX", { style: "currency", currency: "MXN" })} pesos
            </span>
          )}
        </div>

        <div className="fila">
          {campo("talla", "Talla")}
          {campo("tela", "Composición")}
        </div>

        <Colores
          valor={campos.color}
          lleno={llenosIA.has("color")}
          alCambiar={(v) => cambiar("color", v)}
        />

        <div className="fila">
          {campo("codigo", "Código de barras", { inputMode: "numeric" })}
          {campo("estilo", "Estilo")}
        </div>

        <div className="segmentos estatus" role="group" aria-label="Estatus">
          <button aria-pressed={status === "solo_foto"} onClick={() => setStatus("solo_foto")}>Solo foto</button>
          <button className="comprado" aria-pressed={status === "comprado"} onClick={() => setStatus("comprado")}>
            Comprado
          </button>
        </div>

        <div className={claseCampo("notas")} style={{ marginBottom: 0 }}>
          <label htmlFor="notas">Notas</label>
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

// Uno o varios colores; se guardan juntos separados por coma ("Negro, Blanco").
function Colores({ valor, lleno, alCambiar }: { valor: string; lleno: boolean; alCambiar: (v: string) => void }) {
  const [lista, setLista] = useState<string[]>(() => separar(valor));

  // Si el valor cambia desde fuera (Claude o Limpiar), se vuelve a separar.
  useEffect(() => {
    if (valor !== unir(lista)) setLista(separar(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function actualizar(nueva: string[]) {
    setLista(nueva);
    alCambiar(unir(nueva));
  }

  return (
    <div className={lleno ? "campo lleno-ia" : "campo"}>
      <label>{lista.length > 1 ? "Colores" : "Color"}</label>
      {lista.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8 }}>
          <input
            aria-label={`Color ${i + 1}`}
            value={c}
            placeholder={i === 0 ? "Ej. Negro" : "Otro color"}
            onChange={(e) => actualizar(lista.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {lista.length > 1 && (
            <button className="boton" style={{ minWidth: 48, padding: 0 }} onClick={() => actualizar(lista.filter((_, j) => j !== i))} aria-label="Quitar color">
              ×
            </button>
          )}
        </div>
      ))}
      <button className="boton chico" style={{ alignSelf: "flex-start" }} onClick={() => setLista([...lista, ""])}>
        + Otro color
      </button>
    </div>
  );
}

function separar(v: string): string[] {
  const partes = v.split(/\s*[,/]\s*|\s+y\s+/i).filter(Boolean);
  return partes.length ? partes : [""];
}

function unir(lista: string[]): string {
  return lista.map((c) => c.trim()).filter(Boolean).join(", ");
}
