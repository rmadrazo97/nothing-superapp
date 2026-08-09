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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nothing',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
  themeColor: '#000000',
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
