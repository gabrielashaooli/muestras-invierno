import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EQUIPO, cookieValida, firmaEquipo } from "@/lib/auth";
import { errorJson } from "@/lib/respuestas";

// GET: indica si la sesión actual es válida.
export async function GET(req: NextRequest) {
  const ok = await cookieValida(req.cookies.get(COOKIE_EQUIPO)?.value);
  return NextResponse.json({ ok, requiereCodigo: Boolean(process.env.TEAM_CODE) });
}

// POST { codigo }: valida el código del equipo y deja la cookie.
export async function POST(req: NextRequest) {
  const codigoEquipo = process.env.TEAM_CODE;
  if (!codigoEquipo) return NextResponse.json({ ok: true });

  const cuerpo = await req.json().catch(() => ({}));
  const codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo.trim() : "";
  if (codigo !== codigoEquipo) return errorJson("Código incorrecto", 401);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_EQUIPO, await firmaEquipo(codigoEquipo), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120, // 120 días
  });
  return res;
}

// DELETE: cierra la sesión.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_EQUIPO);
  return res;
}
