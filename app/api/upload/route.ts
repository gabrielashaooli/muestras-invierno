import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { PREFIJO_FOTO_BD, tokenBlob } from "@/lib/blob";
import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

const TAMANO_MAXIMO = 4 * 1024 * 1024; // 4 MB (límite de cuerpo en Vercel ≈ 4.5 MB)

// POST /api/upload (multipart, campo "foto") — guarda una foto ya comprimida.
// Usa Vercel Blob si está conectado; si no, la guarda en la base de datos (Neon).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof File)) return errorJson("Falta la foto");
  if (!foto.type.startsWith("image/")) return errorJson("El archivo no es una imagen");
  if (foto.size > TAMANO_MAXIMO) return errorJson("La foto pesa demasiado");

  const token = tokenBlob();
  if (!token) {
    const id = crypto.randomUUID();
    const base64 = Buffer.from(await foto.arrayBuffer()).toString("base64");
    const sql = await db();
    await sql`INSERT INTO fotos (id, tipo, datos) VALUES (${id}, ${foto.type}, decode(${base64}, 'base64'))`;
    return NextResponse.json({ url: `${PREFIJO_FOTO_BD}${id}` });
  }

  const extension = foto.type === "image/png" ? "png" : "jpg";
  const blob = await put(`muestras/foto.${extension}`, foto, {
    access: "public",
    addRandomSuffix: true,
    contentType: foto.type,
    token,
  });
  return NextResponse.json({ url: blob.url });
}
