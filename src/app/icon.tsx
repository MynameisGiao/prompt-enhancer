import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const runtime = "edge";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background:
            "linear-gradient(135deg, #4f46e5 0%, #d946ef 55%, #f43f5e 100%)",
          color: "white",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: -1,
          textShadow: "0 2px 10px rgba(0,0,0,0.25)",
        }}
      >
        PE
      </div>
    ),
    { ...size }
  );
}
