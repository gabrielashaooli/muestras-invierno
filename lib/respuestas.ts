import { NextResponse } from "next/server";

// Respuesta de error uniforme para las rutas de la API.
export function errorJson(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

export function texto(valor: unknown, max = 500): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}
