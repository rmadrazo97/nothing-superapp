import type { Metadata, Viewport } from "next";
import "./design-system.css";
import "./globals.css";

// Defensive URL parser — CI has occasionally fed us blank / mis-quoted
// values here, which would crash `next build` at static-page generation
// time. Fall back to localhost if the env is missing OR unparseable.
function safeAppUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  try {
    return new URL(raw && raw.length > 0 ? raw : 'http://localhost:3000');
  } catch {
    return new URL('http://localhost:3000');
  }
}

export const metadata: Metadata = {
  metadataBase: safeAppUrl(),
  title: {
    default: 'Nothing Superapp',
    template: '%s · Nothing',
  },
  description:
    'One app. One subscription. Everything. Nutrition, fitness, focus, and an AI copilot that reads across all of it — for $1/mo.',
  applicationName: 'Nothing Superapp',
  // native-feel recipe 05 — link the PWA manifest. Next.js Metadata API
  // emits <link rel="manifest" href="/manifest.json"> for us.
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nothing',
    // Splash-screen placeholders. Real PNGs generated per-device from a
    // dark background matching --color-bg (#000000). File names line up
    // with what pwa-asset-generator emits by default; regenerate the
    // physical assets when the launch screen artwork changes.
    // native-feel recipe 26.
    startupImage: [
      // iPhone 16 Pro Max / 15 Pro Max — 6.7" @ 3x, 430x932pt
      {
        url: '/icons/apple-splash-1290-2796.png',
        media:
          '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 15 / 14 Pro — 6.1" @ 3x, 393x852pt
      {
        url: '/icons/apple-splash-1179-2556.png',
        media:
          '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 14 Plus / 13 Pro Max — 6.7" @ 3x, 428x926pt
      {
        url: '/icons/apple-splash-1284-2778.png',
        media:
          '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 13 / 13 Pro / 12 / 12 Pro — 6.1" @ 3x, 390x844pt
      {
        url: '/icons/apple-splash-1170-2532.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 11 Pro Max / XS Max — 6.5" @ 3x, 414x896pt
      {
        url: '/icons/apple-splash-1242-2688.png',
        media:
          '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 11 / XR — 6.1" @ 2x, 414x896pt
      {
        url: '/icons/apple-splash-828-1792.png',
        media:
          '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
      // iPhone 11 Pro / X / XS — 5.8" @ 3x, 375x812pt
      {
        url: '/icons/apple-splash-1125-2436.png',
        media:
          '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone SE 3rd/2nd gen / 8 — 4.7" @ 2x, 375x667pt
      {
        url: '/icons/apple-splash-750-1334.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
    ],
  },
  // native-feel recipe 28 — also blocks iOS from auto-linking dates /
  // addresses / emails on top of telephone numbers.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // native-feel recipe 03 — 180×180 is Apple's current-gen home-screen size;
    // 167×167 covers iPad Pro; 152×152 covers older iPads. Emit all three so
    // iOS picks the sharpest available.
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/apple-touch-icon-167.png', sizes: '167x167', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152.png', sizes: '152x152', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Nothing Superapp',
    description: 'One app. One subscription. Everything.',
    url: '/',
    siteName: 'Nothing Superapp',
    locale: 'en_US',
    type: 'website',
  },
};

// Lock the viewport so the PWA feels native on mobile — no pinch-zoom, no
// double-tap zoom, no accidental "zoomed out" state after a stray gesture.
// - maximumScale + userScalable together disable the pinch (Chromium respects
//   both; iOS Safari respects them in standalone mode).
// - `interactiveWidget: 'resizes-content'` keeps the layout sane when the
//   soft keyboard opens instead of the viewport just shrinking under it.
export const viewport: Viewport = {
  // native-feel recipe 02 — emit BOTH light and dark theme-color meta tags
  // so iOS Safari / Android Chrome tint their status bar correctly no
  // matter the device's color scheme. App is dark-only per design tokens
  // (--color-bg = #000000), so both values are the same brand black — but
  // shipping both meta tags is the correct pattern the moment a light
  // theme is introduced without a follow-up commit here.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#000000' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Service worker registration — inline so it fires before hydration.
            Kept tiny + guarded so a failure here never blocks the page.

            Also blocks iOS Safari's pinch-zoom + double-tap-zoom gestures
            that the viewport meta alone doesn't stop in standalone PWA
            mode. `gesturestart` is Safari-only (Chromium ignores it).
            `touchend` double-tap detection is a belt-and-suspenders for
            older iOS versions where the viewport meta is honored but
            double-tap-zoom still triggers. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.warn('[nothing] service worker registration failed:', err);
    });
  });
}
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
document.addEventListener('gestureend', function (e) { e.preventDefault(); });
var lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
  var now = Date.now();
  if (now - lastTouchEnd <= 300) { e.preventDefault(); }
  lastTouchEnd = now;
}, { passive: false });`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" style={{ touchAction: 'pan-x pan-y' }}>{children}</body>
    </html>
  );
}
