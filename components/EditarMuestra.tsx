"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { DEPARTAMENTOS, type Departamento, type KeyItem, type Muestra } from "@/lib/tipos";
import type { ConSesion } from "./tipos";

// Hoja para corregir a mano los datos de una muestra. Lo anterior queda respaldado en el servidor.
export default function EditarMuestra({
  muestra,
  keyItems,
  conSesion,
  alCerrar,
  alGuardar,
}: {
  muestra: Muestra;
  keyItems: KeyItem[];
  conSesion: ConSesion;
  alCerrar: () => void;
  alGuardar: () => Promise<void>;
}) {
  const [c, setC] = useState({
    dept: muestra.dept as Departamento,
    descripcion: muestra.descripcion ?? "",
    key_item_id: muestra.key_item_id ? String(muestra.key_item_id) : "",
    tienda: muestra.tienda ?? "",
    marca: muestra.marca ?? "",
    precio_usd: muestra.precio_usd === null ? "" : String(muestra.precio_usd),
    talla: muestra.talla ?? "",
    color: muestra.color ?? "",
    tela: muestra.tela ?? "",
    codigo: muestra.codigo ?? "",
    estilo: muestra.estilo ?? "",
    notas: muestra.notas ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (campo: keyof typeof c, valor: string) => setC((x) => ({ ...x, [campo]: valor }));

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const r = await conSesion(() =>
        api(`/api/samples/${muestra.id}`, { method: "PATCH", body: JSON.stringify({ editar: c }) }),
      );
      if (!r) return;
      await alGuardar();
      alCerrar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const campo = (id: keyof typeof c, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="campo">
      <label htmlFor={`ed-${id}`}>{etiqueta}</label>
      <input id={`ed-${id}`} value={c[id]} onChange={(e) => cambiar(id, e.target.value)} {...extra} />
    </div>
  );

  return (
    <div className="hoja-fondo" onClick={alCerrar}>
      <div className="hoja hoja-editar" onClick={(e) => e.stopPropagation()}>
        <p className="hoja-titulo">Editar muestra</p>

        <div className="segmentos" role="group" aria-label="Departamento">
          {DEPARTAMENTOS.map((d) => (
            <button key={d} aria-pressed={c.dept === d} onClick={() => cambiar("dept", d)}>{d}</button>
          ))}
        </div>

        {campo("descripcion", "Prenda")}
        <div className="campo">
          <label htmlFor="ed-key">Key item</label>
          <select id="ed-key" value={c.key_item_id} onChange={(e) => cambiar("key_item_id", e.target.value)}>
            <option value="">Ninguno</option>
            {keyItems
              .filter((k) => k.dept === c.dept || String(k.id) === c.key_item_id)
              .map((k) => (
                <option key={k.id} value={k.id}>{k.nombre}</option>
              ))}
          </select>
        </div>
        <div className="fila">
          {campo("tienda", "Tienda")}
          {campo("marca", "Marca")}
        </div>
        <div className="fila">
          {campo("precio_usd", "Precio (USD)", { inputMode: "decimal", placeholder: "0.00" })}
          {campo("talla", "Talla")}
        </div>
        <div className="fila">
          {campo("color", "Color")}
          {campo("tela", "Composición")}
        </div>
        <div className="fila">
          {campo("codigo", "Código de barras", { inputMode: "numeric" })}
          {campo("estilo", "Estilo")}
        </div>
        <div className="campo">
          <label htmlFor="ed-notas">Notas</label>
          <textarea id="ed-notas" value={c.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </div>

        {error && <div className="estado error" style={{ marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="boton" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <button className="boton primario" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
