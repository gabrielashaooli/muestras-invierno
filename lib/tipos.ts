// Tipos y constantes compartidos entre el cliente y el servidor.

export const DEPARTAMENTOS = ["Caballero", "Mujer", "Infantiles"] as const;
export type Departamento = (typeof DEPARTAMENTOS)[number];

export const ESTATUS = ["solo_foto", "comprado"] as const;
export type Estatus = (typeof ESTATUS)[number];

export function esDepartamento(valor: unknown): valor is Departamento {
  return typeof valor === "string" && (DEPARTAMENTOS as readonly string[]).includes(valor);
}

export interface Fuente {
  url: string;
  titulo: string;
}

export interface Muestra {
  id: number;
  dept: Departamento;
  status: Estatus;
  descripcion: string;
  key_item_id: number | null;
  key_item_nombre?: string | null;
  tienda: string;
  marca: string;
  precio_usd: number | null;
  cantidad: number; // piezas
  talla: string;
  color: string;
  tela: string;
  codigo: string;
  estilo: string;
  notas: string;
  fuentes: Fuente[];
  fotos: string[]; // fotos de etiquetas
  fotos_prenda: string[]; // fotos de la prenda (puesta / en modelo)
  origen?: string; // "ticket" si se creó desde un ticket
  coleccion_id?: number | null;
  auto_revisado?: boolean; // ya se completó automáticamente con Claude
  codigos_leidos?: boolean; // ya se leyeron UPC / DPCI de sus etiquetas
  creado_en: string;
}

export interface KeyItem {
  id: number;
  dept: Departamento;
  nombre: string;
  creado_en: string;
  muestras: number;
}

// Resultado que devuelve /api/analyze
export interface Analisis {
  desc: string;
  marca: string;
  precio: string;
  talla: string;
  color: string;
  tela: string;
  estilo: string;
  codigo: string;
  dept: string;
  keyItemId: number | null;
  notas: string;
  confianza: string;
  fotoPrenda: number | null; // índice de la foto que muestra la prenda
  fuentes: Fuente[];
}

// Cantidad válida de piezas (1 a 999); cualquier otra cosa se vuelve 1.
export function cantidadValida(valor: unknown): number {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 999) : 1;
}

export interface Coleccion {
  id: number;
  nombre: string;
  creado_en: string;
  muestras: number;
  compradas: number;
  gasto: number;
  tiendas: number;
  portadas: string[];
}
