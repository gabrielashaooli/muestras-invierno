import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { errorJson } from "@/lib/respuestas";

const TAMANO_MAXIMO = 4 * 1024 * 1024; // 4 MB (límite de cuerpo en Vercel ≈ 4.5 MB)

// POST /api/upload (multipart, campo "foto") — sube una foto ya comprimida a Vercel Blob.
export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return errorJson("Falta BLOB_READ_WRITE_TOKEN", 500);

  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof File)) return errorJson("Falta la foto");
  if (!foto.type.startsWith("image/")) return errorJson("El archivo no es una imagen");
  if (foto.size > TAMANO_MAXIMO) return errorJson("La foto pesa demasiado");

  const extension = foto.type === "image/png" ? "png" : "jpg";
  const blob = await put(`muestras/foto.${extension}`, foto, {
    access: "public",
    addRandomSuffix: true,
    contentType: foto.type,
  });
  return NextResponse.json({ url: blob.url });
}
