import { ImageResponse } from "next/og";

// Icons are generated rather than committed as binaries: no build step, no
// image dependency, and the palette stays in sync with globals.css.
//
//   /icons/192   /icons/512   /icons/512m  (maskable, padded)

export const dynamic = "force-static";

const VARIANTS: Record<string, { size: number; maskable: boolean }> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "512m": { size: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((size) => ({ size }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: key } = await params;
  const variant = VARIANTS[key];
  if (!variant) return new Response("Not found", { status: 404 });

  const { size, maskable } = variant;
  // A maskable icon may be cropped to a circle inscribed in the safe zone,
  // so the glyph has to sit well inside the canvas.
  const pad = maskable ? size * 0.18 : size * 0.1;
  const inner = size - pad * 2;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#040a18",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: inner * 0.11,
            borderRadius: maskable ? inner * 0.18 : inner * 0.26,
            background: "#212733",
            padding: inner * 0.18,
          }}
        >
          {/* three stacked bars: the proyecto list, at a glance */}
          <div style={{ height: inner * 0.1, borderRadius: 99, background: "#79e99d" }} />
          <div style={{ height: inner * 0.1, borderRadius: 99, background: "#a8adb8", width: "78%" }} />
          <div style={{ height: inner * 0.1, borderRadius: 99, background: "#7a8194", width: "52%" }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
