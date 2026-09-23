import { ImageResponse } from "next/og";

// Ícono para la pantalla de inicio del iPhone.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function IconoApple() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f4e79",
          color: "#ffffff",
          fontSize: 110,
          fontWeight: 700,
        }}
      >
        M
      </div>
    ),
    size,
  );
}
