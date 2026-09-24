import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Cliente SQL de Neon (HTTP). Se crea una sola vez por instancia.
let cliente: NeonQueryFunction<false, false> | null = null;
let tablasListas: Promise<void> | null = null;

function obtenerCliente() {
  if (!cliente) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable DATABASE_URL");
    cliente = neon(url);
  }
  return cliente;
}

// Crea las tablas si no existen (on-demand, solo la primera vez por instancia).
async function crearTablas() {
  const sql = obtenerCliente();
  await sql`
    CREATE TABLE IF NOT EXISTS key_items (
      id SERIAL PRIMARY KEY,
      dept TEXT NOT NULL,
      nombre TEXT NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS samples (
      id SERIAL PRIMARY KEY,
      dept TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'solo_foto',
      descripcion TEXT NOT NULL DEFAULT '',
      key_item_id INTEGER REFERENCES key_items(id) ON DELETE SET NULL,
      tienda TEXT NOT NULL DEFAULT '',
      marca TEXT NOT NULL DEFAULT '',
      precio_usd NUMERIC(10, 2),
      talla TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      tela TEXT NOT NULL DEFAULT '',
      codigo TEXT NOT NULL DEFAULT '',
      estilo TEXT NOT NULL DEFAULT '',
      notas TEXT NOT NULL DEFAULT '',
      fuentes JSONB NOT NULL DEFAULT '[]'::jsonb,
      fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Columna agregada después: fotos de la prenda (puesta / en modelo), aparte de las etiquetas.
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS fotos_prenda JSONB NOT NULL DEFAULT '[]'::jsonb`;
  // Fotos guardadas en la base cuando no hay Vercel Blob configurado.
  await sql`
    CREATE TABLE IF NOT EXISTS fotos (
      id UUID PRIMARY KEY,
      tipo TEXT NOT NULL,
      datos BYTEA NOT NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // Departamentos renombrados: Damas → Mujer, Caballeros → Caballero, Bebés → Infantiles.
  await sql`UPDATE samples SET dept = CASE dept WHEN 'Damas' THEN 'Mujer' WHEN 'Caballeros' THEN 'Caballero' ELSE 'Infantiles' END
            WHERE dept IN ('Damas', 'Caballeros', 'Bebés')`;
  await sql`UPDATE key_items SET dept = CASE dept WHEN 'Damas' THEN 'Mujer' WHEN 'Caballeros' THEN 'Caballero' ELSE 'Infantiles' END
            WHERE dept IN ('Damas', 'Caballeros', 'Bebés')`;
  // Borrado suave: "Eliminar" solo oculta; nada se borra de verdad y se puede recuperar.
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ`;
  await sql`ALTER TABLE key_items ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ`;
  // Cantidad de piezas de cada muestra (las existentes quedan en 1).
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1`;
  await sql`CREATE INDEX IF NOT EXISTS samples_dept_idx ON samples (dept)`;
  await sql`CREATE INDEX IF NOT EXISTS key_items_dept_idx ON key_items (dept)`;
}

// Devuelve el cliente SQL garantizando que las tablas ya existen.
export async function db() {
  const sql = obtenerCliente();
  if (!tablasListas) {
    tablasListas = crearTablas().catch((error) => {
      tablasListas = null; // reintentar en la siguiente petición
      throw error;
    });
  }
  await tablasListas;
  return sql;
}

// Convierte la fila de samples a tipos de JS (NUMERIC llega como texto).
export function normalizarMuestra(fila: Record<string, unknown>) {
  return {
    ...fila,
    precio_usd: fila.precio_usd === null || fila.precio_usd === undefined ? null : Number(fila.precio_usd),
    cantidad: Number(fila.cantidad ?? 1) || 1,
  };
}
