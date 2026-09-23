"use client";

import { useEffect, useState } from "react";
import { guardarLocal, leerLocal, TIPO_CAMBIO_INICIAL } from "@/lib/local";
import { parsePrecio } from "@/lib/precio";
import { DEPARTAMENTOS, type KeyItem, type Muestra } from "@/lib/tipos";
import { IconoDescarga } from "./Iconos";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const suma = (lista: Muestra[]) => lista.reduce((t, m) => t + (m.precio_usd ?? 0), 0);

export default function Resumen({ muestras, keyItems }: { muestras: Muestra[]; keyItems: KeyItem[] }) {
  // Tipo de cambio editable; se recuerda en este dispositivo. Acepta "18.5" o "18,5".
  const [tipoCambio, setTipoCambio] = useState(String(TIPO_CAMBIO_INICIAL));

  useEffect(() => {
    const guardado = leerLocal("tipoCambio");
    if (guardado) setTipoCambio(guardado);
  }, []);

  function cambiarTipoCambio(valor: string) {
    setTipoCambio(valor);
    guardarLocal("tipoCambio", valor);
  }

  const tc = parsePrecio(tipoCambio) ?? 0;
  const compradas = muestras.filter((m) => m.status === "comprado");
  const gasto = suma(compradas);
  const valorTodas = suma(muestras);
  const sinPrecio = muestras.filter((m) => m.precio_usd === null).length;
  const cubiertos = keyItems.filter((k) => k.muestras > 0).length;

  const porDept = DEPARTAMENTOS.map((d) => {
    const lista = muestras.filter((m) => m.dept === d);
    const compradasDept = lista.filter((m) => m.status === "comprado");
    const kis = keyItems.filter((k) => k.dept === d);
    return {
      dept: d,
      total: lista.length,
      compradas: compradasDept.length,
      gasto: suma(compradasDept),
      keyItems: kis.length,
      cubiertos: kis.filter((k) => k.muestras > 0).length,
    };
  });
  const gastoMaximo = Math.max(1, ...porDept.map((f) => f.gasto));

  return (
    <>
      <div className="cifras">
        <div className="cifra destacada">
          <div className="rotulo">Gasto en muestras compradas</div>
          <div className="valor">{usd.format(gasto)}</div>
          <div className="secundario">{tc ? `${mxn.format(gasto * tc)} MXN` : "Escribe el tipo de cambio"}</div>
        </div>
        <div className="cifra">
          <div className="valor">{muestras.length}</div>
          <div className="rotulo">Muestras</div>
        </div>
        <div className="cifra">
          <div className="valor">{compradas.length}</div>
          <div className="rotulo">Compradas · {muestras.length - compradas.length} solo foto</div>
        </div>
        <div className="cifra">
          <div className="valor" style={{ fontSize: "1.25rem" }}>{usd.format(valorTodas)}</div>
          <div className="rotulo">Valor de todas (incluye solo foto)</div>
        </div>
        <div className="cifra">
          <div className="valor">{cubiertos}/{keyItems.length}</div>
          <div className="rotulo">Key items cubiertos</div>
        </div>
      </div>

      {sinPrecio > 0 && (
        <div className="estado" style={{ marginTop: 0, marginBottom: 14 }}>
          {sinPrecio === 1
            ? "1 muestra no tiene precio y no suma al gasto."
            : `${sinPrecio} muestras no tienen precio y no suman al gasto.`}
        </div>
      )}

      <section className="tarjeta">
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="tipo-cambio">Tipo de cambio (pesos por dólar)</label>
          <div className="dinero">
            <span className="prefijo">$</span>
            <input
              id="tipo-cambio"
              inputMode="decimal"
              value={tipoCambio}
              onChange={(e) => cambiarTipoCambio(e.target.value)}
              style={!tc ? { borderColor: "var(--peligro)" } : undefined}
            />
            <span className="sufijo">MXN</span>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Por departamento</h2>
        {porDept.map((f) => (
          <div key={f.dept} className="depto">
            <div className="linea">
              <span className="nombre-depto">{f.dept}</span>
              <span className="monto">{usd.format(f.gasto)}</span>
            </div>
            <div className="progreso"><span style={{ width: `${(f.gasto / gastoMaximo) * 100}%`, background: "var(--primario)" }} /></div>
            <div className="detalle">
              <span>{f.total} muestras · {f.compradas} compradas</span>
              <span>Key items {f.cubiertos}/{f.keyItems}</span>
            </div>
          </div>
        ))}
      </section>

      <a className="boton primario ancho" href="/api/export" download>
        <IconoDescarga /> Descargar CSV
      </a>
    </>
  );
}
