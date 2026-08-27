'use client';

/**
 * ExerciseIllustration — animated 3-frame line-drawing of an exercise.
 *
 * Backed by the open-source `@bryllim/workout-guide` catalogue (CC BY-SA 4.0,
 * 302 exercises × 3 frames each). Assets are ~30 MB and MUST NOT bundle;
 * we serve the PNGs from jsDelivr and only import the JS shim (which carries
 * an inlined manifest, ~540 KB) at runtime via `await import(...)`. That way
 * the launcher and other mini-apps pay zero cost for this catalogue.
 *
 * Animation model: cycle frame 1 → 2 → 3 → 1 at ~2 fps by default (500 ms
 * per frame). Consumers pass `fps={1}` on grids where 12+ tiles animating
 * simultaneously would flicker the viewport.
 *
 * Accessibility: honours `prefers-reduced-motion` by holding on frame 1.
 *
 * Fallback ladder:
 *   1. `slug` resolves in the catalogue → animated illustration.
 *   2. `slug` missing or unknown, `fallbackGifUrl` set → static/animated gif.
 *   3. Neither → dark tile with a small "NO PREVIEW" caption.
 */

import { useEffect, useState } from 'react';

const CDN = 'https://cdn.jsdelivr.net/npm/@bryllim/workout-guide@1.0.0/';

type FrameIndex = 1 | 2 | 3;

type WorkoutGuideModule = {
  getExercise: (slug: string) => unknown;
  getAssetUrl: (
    slug: string,
    frameIndex: FrameIndex,
    options?: { baseUrl?: string; version?: string },
  ) => string | null;
};

type Props = {
  slug: string | null;
  fallbackGifUrl?: string | null;
  size?: number;
  alt: string;
  /** Frames per second. Default 2 (500 ms/frame). */
  fps?: number;
};

export function ExerciseIllustration({
  slug,
  fallbackGifUrl,
  size = 320,
  alt,
  fps = 2,
}: Props) {
  // Three URLs (or null while we resolve them). We keep them in one piece of
  // state so the render logic only has to check one thing.
  const [urls, setUrls] = useState<[string, string, string] | null>(null);
  const [resolved, setResolved] = useState<boolean>(false);
  const [frame, setFrame] = useState<FrameIndex>(1);

  // Dynamic import — pays the ~540 KB JS cost only when the first
  // <ExerciseIllustration> mounts (i.e. the user opens the gym mini-app).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!slug) {
        setResolved(true);
        return;
      }
      try {
        const mod = (await import('@bryllim/workout-guide')) as unknown as WorkoutGuideModule;
        if (cancelled) return;
        const entry = mod.getExercise(slug);
        if (!entry) {
          setResolved(true);
          return;
        }
        const opts = { baseUrl: CDN };
        const u1 = mod.getAssetUrl(slug, 1, opts);
        const u2 = mod.getAssetUrl(slug, 2, opts);
        const u3 = mod.getAssetUrl(slug, 3, opts);
        if (u1 && u2 && u3) setUrls([u1, u2, u3]);
        setResolved(true);
      } catch {
        // Network / bundle failure — fall through to gif or empty state.
        if (!cancelled) setResolved(true);
      }
    }

    setUrls(null);
    setResolved(false);
    setFrame(1);
    void load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Frame cycling. Bails if reduced-motion is preferred.
  useEffect(() => {
    if (!urls) return;
    if (typeof window === 'undefined') return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const intervalMs = Math.max(60, Math.round(1000 / Math.max(0.1, fps)));
    const id = window.setInterval(() => {
      setFrame((prev) => ((prev % 3) + 1) as FrameIndex);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [urls, fps]);

  const wrapperStyle: React.CSSProperties = {
    width: size,
    height: size,
    maxWidth: '100%',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 'var(--space-2)',
    boxSizing: 'border-box',
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  };

  // 1. Animated illustration
  if (urls) {
    const currentUrl = urls[frame - 1];
    return (
      <div style={wrapperStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          style={imgStyle}
        />
        {/* Preload the other two frames so the first cycle doesn't stutter.
            Kept in-flow with 1×1 size + opacity 0 (not display:none — some
            browsers won't fetch display:none images). */}
        {[urls[1], urls[2]].map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
            alt=""
            aria-hidden="true"
            decoding="async"
            width={1}
            height={1}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
    );
  }

  // While resolving with a slug, avoid flashing the fallback: render the
  // wrapper empty. On failure (`resolved && !urls`) we fall through.
  if (slug && !resolved) {
    return <div style={wrapperStyle} aria-hidden="true" />;
  }

  // 2. Fallback gif
  if (fallbackGifUrl) {
    return (
      <div style={wrapperStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallbackGifUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          style={imgStyle}
        />
      </div>
    );
  }

  // 3. Empty state
  return (
    <div style={wrapperStyle} role="img" aria-label={alt}>
      <span
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.08em',
          color: 'var(--color-text-disabled)',
          textTransform: 'uppercase',
        }}
      >
        No preview
      </span>
    </div>
  );
}
