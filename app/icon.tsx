import { ImageResponse } from "next/og";

// Ícono de la app (PNG generado) usado por el manifest.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icono() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d4ed8",
          color: "#ffffff",
          fontSize: 300,
          fontWeight: 700,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
