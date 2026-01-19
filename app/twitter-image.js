import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #fbf7f1 0%, #f2e8dc 50%, #f7efe6 100%)",
          color: "#201a14",
          padding: "80px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 58,
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          BirthSymbol Index
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 22,
            color: "#5b4c3f",
            letterSpacing: "0.08em",
          }}
        >
          Birth flowers, stones, colors, and more in one view
        </div>
        <div
          style={{
            marginTop: 40,
            padding: "10px 24px",
            borderRadius: 999,
            border: "1px solid #d9cdbf",
            background: "#ffffff",
            fontSize: 16,
            letterSpacing: "0.2em",
          }}
        >
          BIRTHDAY SYMBOL FINDER
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
