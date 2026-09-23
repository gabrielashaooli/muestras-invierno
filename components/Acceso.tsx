"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { IconoPrenda } from "./Iconos";

// Pantalla para capturar el código compartido del equipo.
export default function Acceso({ alEntrar }: { alEntrar: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ codigo }) });
      alEntrar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="acceso">
      <form className="tarjeta" onSubmit={entrar}>
        <div className="logo"><IconoPrenda tam={28} /></div>
        <h2 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Muestras Invierno</h2>
        <p className="pequeno" style={{ margin: "0 0 18px" }}>Escribe el código de tu equipo para entrar.</p>
        <div className="campo">
          <label htmlFor="codigo">Código del equipo</label>
          <input
            id="codigo"
            type="password"
            autoComplete="current-password"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoFocus
          />
        </div>
        <button className="boton primario ancho" disabled={!codigo || enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        {error && <div className="estado error">{error}</div>}
      </form>
    </div>
  );
}
