import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EQUIPO, cookieValida } from "@/lib/auth";

// Protege toda la API con la cookie del equipo, excepto /api/auth.
// La página principal se sirve siempre y muestra el formulario de acceso
// cuando /api/auth indica que no hay sesión.
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();

  const valida = await cookieValida(req.cookies.get(COOKIE_EQUIPO)?.value);
  if (!valida) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
