// Íconos SVG simples (trazo) usados en la interfaz.
type P = { tam?: number };

const base = (tam: number) => ({
  width: tam,
  height: tam,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconoCamara = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
);

export const IconoPrenda = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M9 3l3 2 3-2 5 3-2 5-2-1v11H8V10l-2 1-2-5z" />
  </svg>
);

export const IconoLista = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  </svg>
);

export const IconoGrafica = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const IconoDescarga = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

export const IconoBasura = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const IconoChispa = ({ tam = 16 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </svg>
);

export const IconoEnlace = ({ tam = 14 }: P) => (
  <svg {...base(tam)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);

export const IconoGaleria = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </svg>
);
