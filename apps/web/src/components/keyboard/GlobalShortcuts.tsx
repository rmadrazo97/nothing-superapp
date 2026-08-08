'use client';

/**
 * GlobalShortcuts — mounted once in the /app layout. Wires ⌘/Ctrl-K,
 * `?` (open hint overlay), and Escape (close hint overlay) via
 * `useGlobalShortcuts`, and mounts the overlay itself so it renders on
 * every /app/* route without callers needing to know.
 *
 * Rendering nothing except the (usually-hidden) overlay keeps this
 * component pure side-effect from the layout's point of view.
 */
import { useGlobalShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { HintOverlay } from './HintOverlay';

export function GlobalShortcuts() {
  const { hintOpen, setHintOpen } = useGlobalShortcuts();
  return <HintOverlay open={hintOpen} onClose={() => setHintOpen(false)} />;
}
