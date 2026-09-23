"use client";

import { useEffect, useState } from "react";
import { DEPARTAMENTOS, type KeyItem, type Muestra } from "@/lib/tipos";

const TC_INICIAL = 18.5;

const usd = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" });
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function Resumen({ muestras, keyItems }: { muestras: Muestra[]; keyItems: KeyItem[] }) {
  // Tipo de cambio editable; se recuerda en este dispositivo.
  const [tipoCambio, setTipoCambio] = useState(String(TC_INICIAL));

  useEffect(() => {
    try {
      const guardado = localStorage.getItem("tipoCambio");
      if (guardado) setTipoCambio(guardado);
    } catch {
      /* sin almacenamiento local */
    }
  }, []);

  function cambiarTipoCambio(valor: string) {
    setTipoCambio(valor);
    try {
      localStorage.setItem("tipoCambio", valor);
    } catch {
      /* sin almacenamiento local */
    }
  }

  const tc = Number(tipoCambio) > 0 ? Number(tipoCambio) : 0;
  const gasto = (lista: Muestra[]) =>
    lista.filter((m) => m.status === "comprado").reduce((suma, m) => suma + (m.precio_usd ?? 0), 0);

  const porDept = DEPARTAMENTOS.map((d) => {
    const lista = muestras.filter((m) => m.dept === d);
    const kis = keyItems.filter((k) => k.dept === d);
    return {
      dept: d,
      total: lista.length,
      comprados: lista.filter((m) => m.status === "comprado").length,
      gasto: gasto(lista),
      keyItems: kis.length,
      cubiertos: kis.filter((k) => k.muestras > 0).length,
    };
  });

  const comprados = muestras.filter((m) => m.status === "comprado").length;
  const gastoTotal = gasto(muestras);
  const cubiertos = keyItems.filter((k) => k.muestras > 0).length;

  return (
    <>
      <div className="cifras">
        <div className="cifra">
          <div className="valor">{muestras.length}</div>
          <div className="rotulo">Muestras</div>
        </div>
        <div className="cifra">
          <div className="valor">{comprados}</div>
          <div className="rotulo">Compradas · {muestras.length - comprados} solo foto</div>
        </div>
        <div className="cifra">
          <div className="valor">{usd.format(gastoTotal)}</div>
          <div className="rotulo">Gasto USD</div>
        </div>
        <div className="cifra">
          <div className="valor">{mxn.format(gastoTotal * tc)}</div>
          <div className="rotulo">Gasto MXN</div>
        </div>
      </div>

      <section className="tarjeta">
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="tipo-cambio">Tipo de cambio (MXN por USD)</label>
          <input
            id="tipo-cambio"
            inputMode="decimal"
            value={tipoCambio}
            onChange={(e) => cambiarTipoCambio(e.target.value)}
          />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Por departamento</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Depto.</th>
              <th>Muestras</th>
              <th>Compradas</th>
              <th>Key items</th>
              <th>Gasto USD</th>
            </tr>
          </thead>
          <tbody>
            {porDept.map((f) => (
              <tr key={f.dept}>
                <td>{f.dept}</td>
                <td>{f.total}</td>
                <td>{f.comprados}</td>
                <td>{f.cubiertos}/{f.keyItems}</td>
                <td>{usd.format(f.gasto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pequeno" style={{ marginBottom: 0 }}>
          Key items cubiertos: {cubiertos} de {keyItems.length}. El gasto solo cuenta muestras compradas.
        </p>
      </section>

      <a className="boton primario ancho" href="/api/export" download>
        ⬇ Descargar CSV
      </a>
    </>
  );
}
