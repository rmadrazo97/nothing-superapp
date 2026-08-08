'use client';

/**
 * useBeep — WebAudio synthesised phase-transition chime.
 *
 * No audio file ships with the mini-app; every browser we care about
 * (Chromium, Firefox, WebKit >= iOS 14.5) has WebAudio. On Safari a user
 * gesture is required to create/resume the AudioContext, so we lazily
 * instantiate it inside the returned `play()` callback — which is only
 * called from click / phase-transition handlers, both downstream of a
 * user gesture (the initial Start button).
 *
 * The sound is deliberately quiet + short — two short sine chirps at
 * 880Hz then 1320Hz, ~180ms total, exponentially ramped to silence to
 * avoid a click at the tail. Suitable to play behind a `respectSound`
 * gate that defaults ON in settings.
 */
import { useCallback, useEffect, useRef } from 'react';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  // Older Safari exposes webkitAudioContext.
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function useBeep(): { play: () => void } {
  const ctxRef = useRef<AudioContext | null>(null);

  // Tear down on unmount — leaked AudioContexts show up in Chrome DevTools
  // as "unused" and warn on the console.
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => {
          // ignore — context might already be closing
        });
      }
      ctxRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return; // No WebAudio — silently no-op.
    try {
      if (!ctxRef.current) ctxRef.current = new Ctor();
      const ctx = ctxRef.current;
      // Safari suspends the context between gestures; resume as needed.
      if (ctx.state === 'suspended') void ctx.resume();

      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);

      // Two chirps: 880Hz -> 1320Hz, each ~90ms. Envelope: quick attack,
      // exponential decay for a musical (not clicky) tail.
      const tones: Array<{ freq: number; at: number }> = [
        { freq: 880, at: 0 },
        { freq: 1320, at: 0.09 },
      ];

      for (const t of tones) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = t.freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, now + t.at);
        env.gain.exponentialRampToValueAtTime(0.25, now + t.at + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, now + t.at + 0.09);
        osc.connect(env);
        env.connect(master);
        osc.start(now + t.at);
        osc.stop(now + t.at + 0.1);
      }

      // Master fade so the very end is silent even if the envelopes overlap.
      master.gain.setValueAtTime(1, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    } catch {
      // WebAudio can throw if the context was closed mid-play — safe to ignore.
    }
  }, []);

  return { play };
}
