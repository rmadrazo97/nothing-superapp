import { ImageResponse } from 'next/og';

/**
 * Default OpenGraph image for the entire site. 1200x630 — the standard
 * social-card aspect ratio. Rendered on demand by Vercel's OG image service
 * (or the Next 16 built-in ImageResponse renderer). Self-contained: no
 * external assets, uses inline SVG + system font fallback since ImageResponse
 * doesn't have access to our web-font loader.
 */
export const runtime = 'edge';
export const alt = 'Nothing Superapp — One app. One subscription. Everything.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000000',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          position: 'relative',
        }}
      >
        {/* Subtle dot-grid — plain SVG data URI so the OG renderer can rasterize it */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.25,
            backgroundImage:
              'radial-gradient(circle at center, #333 1.5px, transparent 1.5px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 28,
              letterSpacing: 2,
              color: '#999',
              fontWeight: 500,
              textTransform: 'uppercase',
            }}
          >
            Nothing Superapp
            <span style={{ color: '#D71921', fontSize: 24 }}>●</span>
          </div>
          <div
            style={{
              fontSize: 120,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -3,
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div>ONE APP.</div>
            <div>
              ONE <span style={{ color: '#D71921' }}>SUB</span>SCRIPTION.
            </div>
            <div>EVERYTHING.</div>
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 22,
            color: '#999',
          }}
        >
          <div style={{ display: 'flex', gap: 32 }}>
            <span>◐ Calorie</span>
            <span>◈ Gym</span>
            <span>◔ Focus</span>
            <span>◊ Copilot</span>
          </div>
          <div style={{ fontSize: 32, color: '#FFFFFF', fontWeight: 700 }}>
            $1/mo
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
