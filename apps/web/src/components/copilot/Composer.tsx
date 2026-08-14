'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useToast } from '@/lib/toast/context';

/**
 * Bottom-anchored composer.
 *
 * v0.5 — multimodal:
 *   - IMAGE button (cadmium) opens a hidden file input for up to 3 images.
 *     jpeg/png/webp only, 5 MB each. Selected files render as tiny thumbs
 *     above the textarea with a × to remove.
 *   - VOICE button starts webkitSpeechRecognition, streams interim +
 *     final transcript into the textarea. Hidden entirely if the browser
 *     lacks Web Speech API (Firefox desktop, some Androids).
 *
 * Behaviour:
 *   - Enter sends (with text or attachments). Shift+Enter inserts a newline.
 *   - Send is disabled while `busy`, or when both textarea and attachments
 *     are empty.
 *   - Textarea auto-grows up to a cap (~6 lines) then scrolls internally.
 *   - Attachments cleared on successful send by parent (via `onSend`
 *     receiving them, then rendering the next frame without them).
 *
 * TODO: whisper-fallback — if the user is on a browser without Web Speech
 * API (e.g. desktop Firefox), route audio to a server-side transcription
 * endpoint. Web Speech API is client-side + free so v1 skips it.
 */

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

export type ComposerAttachment = {
  /** Client-generated id so React keys survive between renders. */
  id: string;
  file: File;
  /** Data URL for preview + eventual send as FileUIPart.url. */
  dataUrl: string;
};

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  placeholder = 'Ask about your day…',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Parent handles sending text + attachments. Composer clears local state after. */
  onSend: (attachments: ComposerAttachment[]) => void;
  busy: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  // Snapshot of textarea value at recognition start — we append transcripts
  // onto this so multiple recognition sessions don't clobber user typing.
  const voiceBaseRef = useRef<string>('');
  const { toast } = useToast();

  // Feature-detect Web Speech API on mount. iOS Safari (16.4+) exposes
  // webkitSpeechRecognition in the PWA context; desktop Firefox does not.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setVoiceSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  // Auto-resize: reset then match scrollHeight, clamp to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const MAX = 140; // ~6 lines at 14px body-sm / 1.5 line-height
    el.style.height = Math.min(el.scrollHeight, MAX) + 'px';
  }, [value]);

  const canSend = !busy && (value.trim().length > 0 || attachments.length > 0);

  const clearAll = useCallback(() => {
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const doSend = useCallback(() => {
    if (!canSend) return;
    // Snapshot attachments and hand them to parent — parent calls sendMessage
    // then resets `value`. We clear local attachment state here.
    const snapshot = attachments;
    onSend(snapshot);
    clearAll();
  }, [attachments, canSend, onSend, clearAll]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  // ─── Image attachments ──────────────────────────────────────────

  const openFilePicker = useCallback(() => {
    if (busy) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.info(`Max ${MAX_ATTACHMENTS} images per message.`);
      return;
    }
    fileInputRef.current?.click();
  }, [busy, attachments.length, toast]);

  const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
      reader.readAsDataURL(file);
    });

  const onFilesPicked = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const remaining = MAX_ATTACHMENTS - attachments.length;
      const incoming = Array.from(list).slice(0, remaining);
      const accepted: ComposerAttachment[] = [];
      for (const file of incoming) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          // Privacy: log filename + size only, never contents.
          console.warn('[composer] rejected non-image', file.name, file.size);
          toast.error(`${file.name || 'file'} isn't a supported image type.`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          console.warn('[composer] rejected too-large image', file.name, file.size);
          toast.error(`${file.name || 'file'} is larger than 5 MB.`);
          continue;
        }
        try {
          const dataUrl = await readAsDataURL(file);
          accepted.push({
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            dataUrl,
          });
        } catch {
          toast.error(`Couldn't read ${file.name || 'file'}.`);
        }
      }
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted].slice(0, MAX_ATTACHMENTS));
      }
      // Reset the input so picking the same file again fires change.
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [attachments.length, toast],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ─── Voice input (Web Speech API) ────────────────────────────────

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current as { stop?: () => void } | null;
    try {
      rec?.stop?.();
    } catch {
      // Some browsers throw if stop() called before onstart fires.
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (busy || listening || !voiceSupported) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    let rec: {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (e: unknown) => void;
      onerror: (e: unknown) => void;
      onend: () => void;
      onspeechend: () => void;
      start: () => void;
      stop: () => void;
    };
    try {
      rec = new Ctor() as typeof rec;
    } catch {
      toast.error("Couldn't start voice input.");
      return;
    }
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
    voiceBaseRef.current = value;
    rec.onresult = (event: unknown) => {
      // Concatenate every result (interim + final) into a single transcript
      // snippet, then append to the textarea's snapshot.
      const results = (event as { results: ArrayLike<ArrayLike<{ transcript: string }>> }).results;
      let transcript = '';
      for (let i = 0; i < results.length; i++) {
        transcript += results[i][0]?.transcript ?? '';
      }
      const base = voiceBaseRef.current;
      const joiner = base.length > 0 && !base.endsWith(' ') ? ' ' : '';
      onChange(`${base}${joiner}${transcript}`.trimStart());
    };
    rec.onerror = (event: unknown) => {
      const err = (event as { error?: string }).error ?? 'unknown';
      // `no-speech` and `aborted` are common + benign — skip the toast.
      if (err !== 'no-speech' && err !== 'aborted') {
        toast.error(`Voice input error: ${err}`);
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onspeechend = () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      toast.error("Couldn't start voice input.");
    }
  }, [busy, listening, voiceSupported, value, onChange, toast]);

  const toggleVoice = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  // Ensure any in-flight recognition is stopped on unmount.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current as { stop?: () => void } | null;
      try {
        rec?.stop?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Icon-only chip button (image + mic). Tap target ≥44×44 for iOS.
  const iconBtnStyle = useMemo(
    () => ({
      minHeight: 44,
      minWidth: 44,
      width: 44,
      height: 44,
      display: 'inline-flex',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 0,
      background: 'transparent',
      border: '1px solid var(--color-border-visible)',
      borderRadius: '50%',
      color: 'var(--color-text-secondary)',
      fontFamily: 'var(--font-label)',
      fontSize: 18,
      lineHeight: 1,
      cursor: 'pointer',
      transition:
        'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                position: 'relative',
                width: 56,
                height: 56,
                borderRadius: 'var(--radius-compact)',
                overflow: 'hidden',
                border: '1px solid var(--color-border-visible)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.dataUrl}
                alt={att.file.name}
                width={56}
                height={56}
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                aria-label={`Remove ${att.file.name}`}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border-visible)',
                  borderRadius: '50%',
                  fontFamily: 'var(--font-label)',
                  fontSize: 10,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSend();
        }}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-2)',
          padding: 'var(--space-2)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          onChange={(e) => void onFilesPicked(e)}
          style={{ display: 'none' }}
          aria-hidden
          tabIndex={-1}
        />

        <button
          type="button"
          onClick={openFilePicker}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS}
          aria-label="Attach image"
          title={
            attachments.length >= MAX_ATTACHMENTS
              ? `Max ${MAX_ATTACHMENTS} images`
              : 'Attach up to 3 images'
          }
          style={iconBtnStyle}
        >
          <CameraIcon />
        </button>

        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={busy && !listening}
            aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={listening}
            title={listening ? 'Listening…' : 'Dictate a message'}
            style={{
              ...iconBtnStyle,
              color: listening ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              background: listening ? 'var(--color-accent-subtle)' : 'transparent',
              borderColor: listening ? 'var(--color-accent)' : 'var(--color-border-visible)',
              animation: listening ? 'nsa-voice-pulse 1.2s ease-in-out infinite' : undefined,
            }}
          >
            <MicIcon />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening…' : placeholder}
          disabled={busy}
          rows={1}
          enterKeyHint="send"
          aria-label="Message"
          style={{
            flex: 1,
            resize: 'none',
            minHeight: 44,
            maxHeight: 140,
            padding: '12px 8px',
            background: 'transparent',
            border: 0,
            borderRadius: 8,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            lineHeight: 1.5,
            caretColor: 'var(--color-accent)',
            outline: 'none',
          }}
        />

        {/* Send: cadmium circular icon button. Disabled → muted grey. */}
        <button
          type="submit"
          disabled={!canSend}
          aria-label={busy ? 'Sending' : 'Send message'}
          style={{
            minHeight: 44,
            minWidth: 44,
            width: 44,
            height: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            background: canSend ? 'var(--color-accent)' : 'transparent',
            color: canSend ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            border: `1px solid ${canSend ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
            borderRadius: '50%',
            fontFamily: 'var(--font-label)',
            fontSize: 18,
            lineHeight: 1,
            cursor: canSend ? 'pointer' : 'not-allowed',
            transition:
              'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
          }}
        >
          {busy ? (
            <span aria-hidden className="nsa-send-spin">◐</span>
          ) : (
            <span aria-hidden>→</span>
          )}
        </button>
      </form>
    </div>
  );
}

/**
 * Camera + mic SVGs — 16×16, `stroke="currentColor"`, 1.5 px stroke to match
 * the nav bar's spark icon weight. Deliberately plain: no fills, no drop
 * shadows — the composer already communicates state via the button chrome
 * (border colour + pulse), so the icon must stay silent.
 */
function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {/* Body */}
      <path d="M2 5.5 A1.5 1.5 0 0 1 3.5 4 h1.9 l1-1.4 h3.2 l1 1.4 h1.9 A1.5 1.5 0 0 1 14 5.5 v6 A1.5 1.5 0 0 1 12.5 13 h-9 A1.5 1.5 0 0 1 2 11.5 z" />
      {/* Lens */}
      <circle cx="8" cy="8.5" r="2.5" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {/* Capsule */}
      <rect x="6" y="2" width="4" height="7.5" rx="2" />
      {/* Yoke */}
      <path d="M4 8.5 v0.5 a4 4 0 0 0 8 0 v-0.5" />
      {/* Stand */}
      <line x1="8" y1="13" x2="8" y2="14.25" />
      <line x1="5.75" y1="14.25" x2="10.25" y2="14.25" />
    </svg>
  );
}
