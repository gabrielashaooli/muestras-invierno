import { db } from "@/lib/db";
import { errorJson } from "@/lib/respuestas";

// GET /api/foto/:id — sirve una foto guardada en la base de datos.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return errorJson("Id inválido");

  const sql = await db();
  const filas = (await sql`SELECT tipo, encode(datos, 'base64') AS b64 FROM fotos WHERE id = ${id}`) as {
    tipo: string;
    b64: string;
  }[];
  if (filas.length === 0) return errorJson("No existe la foto", 404);

  return new Response(Buffer.from(filas[0].b64, "base64"), {
    headers: {
      "Content-Type": filas[0].tipo,
      // Las fotos nunca cambian: se pueden guardar en caché en el teléfono.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
