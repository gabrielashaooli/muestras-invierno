# Muestras Invierno

App web (Next.js 15) para capturar muestras de ropa durante un *market sample shopping*.
Se toma foto de la prenda y sus etiquetas; Claude lee las etiquetas, busca en internet por
marca + número de estilo o código de barras y llena el formulario. Pensada para usarse
desde el iPhone como app instalada.

## Funciones

- **Capturar**: departamento (Damas, Caballeros, Infantiles, Bebés), botón *Tomar foto y llenar*.
  Las fotos se comprimen a 1400 px / calidad 0.78, se suben a Vercel Blob y se analizan con
  Claude (visión + búsqueda web). Solo se llenan los campos vacíos (quedan resaltados) y se
  muestran las fuentes consultadas.
- **Muestras**: lista con foto, filtro por departamento y eliminar.
- **Key items**: pega varios a la vez (uno por renglón); se marcan en verde cuando ya tienen muestras.
- **Resumen**: conteos, gasto en USD y MXN con tipo de cambio editable, descarga de CSV.

## Variables de entorno

Copia `.env.example` a `.env.local` y llena:

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Llave de la API de Anthropic |
| `CLAUDE_MODEL` | Modelo a usar (opcional, por defecto `claude-sonnet-5`) |
| `DATABASE_URL` | Cadena de conexión de Neon Postgres |
| `BLOB_READ_WRITE_TOKEN` | Token de Vercel Blob |
| `TEAM_CODE` | Código compartido para entrar (si se deja vacío la app queda abierta) |

Las tablas `samples` y `key_items` se crean solas la primera vez que se usa la API.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y llena los valores
npm run dev
```

Abre http://localhost:3000. Para revisar tipos: `npm run typecheck`.

## Despliegue en Vercel

1. En [vercel.com/new](https://vercel.com/new) importa este repositorio de GitHub. Vercel detecta Next.js solo.
2. **Base de datos**: en el proyecto ve a *Storage → Create Database → Neon* (o crea una base en
   [neon.tech](https://neon.tech)) y conéctala al proyecto. Esto agrega `DATABASE_URL`.
3. **Fotos**: en *Storage → Create → Blob* crea un store público y conéctalo al proyecto.
   Esto agrega `BLOB_READ_WRITE_TOKEN`.
4. En *Settings → Environment Variables* agrega `ANTHROPIC_API_KEY`, `TEAM_CODE` y,
   si quieres otro modelo, `CLAUDE_MODEL`.
5. Haz *Redeploy* para que tome las variables.
6. Abre la URL, captura el código del equipo y listo.

> El análisis con búsqueda web puede tardar 20–60 s. La ruta `/api/analyze` pide hasta
> 120 s (`maxDuration`), permitido en el plan Hobby con Fluid Compute.
> La búsqueda web debe estar habilitada para tu organización en la
> [Consola de Anthropic](https://console.anthropic.com).

## Instalar en iPhone

1. Abre la URL en **Safari**.
2. Toca *Compartir* → *Agregar a pantalla de inicio*.
3. Se abre a pantalla completa como app (usa `public/manifest.json` y el ícono generado).

## Estructura

```
app/
  page.tsx               UI de una sola página con 4 pestañas
  api/analyze            Claude con visión + web_search (maneja pause_turn)
  api/samples            GET/POST muestras; DELETE /api/samples/[id]
  api/keyitems           GET/POST key items; DELETE /api/keyitems/[id]
  api/upload             subida de fotos a Vercel Blob
  api/export             CSV con BOM (abre bien en Excel)
  api/auth               acceso con TEAM_CODE (cookie)
components/              pestañas de la UI
lib/                     base de datos, auth, compresión de imágenes, tipos
middleware.ts            protege /api/* con la cookie del equipo
```
