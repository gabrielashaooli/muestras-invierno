import { mismoCodigo, textoNormal } from "./codigos";

// Detecta muestras repetidas: mismo código/UPC, mismo estilo, o misma marca + descripción en la misma tienda.
// Funciona con cualquier objeto que tenga esos campos (cliente o servidor).

export interface ParaDuplicados {
  id: number;
  codigo: string;
  estilo: string;
  marca: string;
  descripcion: string;
  tienda: string;
}

export function sonLaMisma(a: ParaDuplicados, b: ParaDuplicados): boolean {
  if (a.codigo && b.codigo && mismoCodigo(a.codigo, b.codigo)) return true;
  const ea = textoNormal(a.estilo).replace(/\s/g, "");
  const eb = textoNormal(b.estilo).replace(/\s/g, "");
  if (ea.length >= 5 && ea === eb) return true;
  if (a.codigo && b.estilo && mismoCodigo(a.codigo, b.estilo)) return true;
  if (a.estilo && b.codigo && mismoCodigo(a.estilo, b.codigo)) return true;
  const da = textoNormal(a.descripcion);
  const ma = textoNormal(a.marca);
  return (
    da.length >= 6 &&
    ma.length >= 2 &&
    da === textoNormal(b.descripcion) &&
    ma === textoNormal(b.marca) &&
    textoNormal(a.tienda) === textoNormal(b.tienda)
  );
}

// Grupos de 2 o más muestras que son la misma prenda.
export function gruposDuplicados<T extends ParaDuplicados>(lista: T[]): T[][] {
  const padre = new Map<number, number>(lista.map((m) => [m.id, m.id]));
  const raiz = (id: number): number => {
    const p = padre.get(id)!;
    if (p === id) return id;
    const r = raiz(p);
    padre.set(id, r);
    return r;
  };
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (sonLaMisma(lista[i], lista[j])) padre.set(raiz(lista[j].id), raiz(lista[i].id));
    }
  }
  const grupos = new Map<number, T[]>();
  for (const m of lista) grupos.set(raiz(m.id), [...(grupos.get(raiz(m.id)) ?? []), m]);
  return [...grupos.values()].filter((g) => g.length > 1);
}
