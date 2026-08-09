/**
 * markdown-lite.tsx
 *
 * Tiny markdown renderer for assistant messages. Handles the 90% of what a
 * chat AI actually emits, no new deps.
 *
 * Supported:
 *   - Paragraphs (blank-line separated)
 *   - # / ## / ### headings
 *   - Fenced code blocks ``` ```
 *   - Inline `code`
 *   - **bold**, *italic* / _italic_
 *   - - / * bulleted lists (single level)
 *   - 1. / 1) numbered lists (single level)
 *   - > blockquotes (single-line)
 *   - [text](url) links (opened in new tab)
 *   - Autolinks for bare URLs
 *
 * Intentionally NOT supported: tables, images (chat is chat), HTML (unsafe),
 * task lists, nested lists. If we hit an unsupported thing the text falls
 * through as plain text — the model's message is still readable.
 *
 * Safety: no `dangerouslySetInnerHTML`. All output is JSX; user/model text
 * only reaches the DOM through React text nodes, so XSS is off the table.
 */
import type { ReactNode, JSX } from 'react';

const CODE_FENCE_RE = /^```(\w+)?\s*$/;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
const URL_RE = /\bhttps?:\/\/[^\s<>()]+/;
const INLINE_CODE_RE = /`([^`\n]+)`/;
const BOLD_RE = /\*\*([^*\n]+)\*\*/;
const ITALIC_STAR_RE = /(^|[^*])\*([^*\n]+)\*(?!\*)/;
const ITALIC_UNDER_RE = /(^|[^_])_([^_\n]+)_(?!_)/;

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string | null; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'hr' };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'p', text: paragraph.join('\n') });
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(CODE_FENCE_RE);
    if (fence) {
      flushParagraph();
      const lang = fence[1] ?? null;
      const code: string[] = [];
      i++;
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      // Skip the closing fence if present.
      if (i < lines.length) i++;
      blocks.push({ kind: 'code', lang, text: code.join('\n') });
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'h', level, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      const items: string[] = [ulMatch[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    const olMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      const items: string[] = [olMatch[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return blocks;
}

/**
 * Inline parser — walks the string, greedily peeling the earliest match of
 * any inline pattern. Returns a list of JSX nodes.
 *
 * Order matters. Inline code first (it hides everything else inside it), then
 * bold, italic, links, autolinks.
 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let counter = 0;

  const push = (node: ReactNode) => {
    nodes.push(node);
    counter++;
  };

  // Iteratively peel matches. Each iteration finds the earliest match across
  // all patterns; if none match, the remaining text is pushed and we stop.
  while (remaining.length > 0) {
    const candidates: Array<{
      idx: number;
      length: number;
      render: () => ReactNode;
      leading?: string;
    }> = [];

    const codeMatch = remaining.match(INLINE_CODE_RE);
    if (codeMatch && codeMatch.index != null) {
      candidates.push({
        idx: codeMatch.index,
        length: codeMatch[0].length,
        render: () => (
          <code key={`${keyBase}-c${counter}`} className="nsa-md-code-inline">
            {codeMatch[1]}
          </code>
        ),
      });
    }

    const boldMatch = remaining.match(BOLD_RE);
    if (boldMatch && boldMatch.index != null) {
      candidates.push({
        idx: boldMatch.index,
        length: boldMatch[0].length,
        render: () => <strong key={`${keyBase}-b${counter}`}>{boldMatch[1]}</strong>,
      });
    }

    const italicStar = remaining.match(ITALIC_STAR_RE);
    if (italicStar && italicStar.index != null) {
      // The regex captures a leading non-* char so we don't collide with
      // **bold**. Offset the match index past that leader.
      const leading = italicStar[1] ?? '';
      const start = italicStar.index + leading.length;
      candidates.push({
        idx: start,
        length: italicStar[0].length - leading.length,
        render: () => <em key={`${keyBase}-i${counter}`}>{italicStar[2]}</em>,
      });
    }

    const italicUnder = remaining.match(ITALIC_UNDER_RE);
    if (italicUnder && italicUnder.index != null) {
      const leading = italicUnder[1] ?? '';
      const start = italicUnder.index + leading.length;
      candidates.push({
        idx: start,
        length: italicUnder[0].length - leading.length,
        render: () => <em key={`${keyBase}-iu${counter}`}>{italicUnder[2]}</em>,
      });
    }

    const linkMatch = remaining.match(LINK_RE);
    if (linkMatch && linkMatch.index != null) {
      candidates.push({
        idx: linkMatch.index,
        length: linkMatch[0].length,
        render: () => (
          <a
            key={`${keyBase}-l${counter}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="nsa-md-link"
          >
            {linkMatch[1]}
          </a>
        ),
      });
    }

    const urlMatch = remaining.match(URL_RE);
    if (urlMatch && urlMatch.index != null) {
      candidates.push({
        idx: urlMatch.index,
        length: urlMatch[0].length,
        render: () => (
          <a
            key={`${keyBase}-u${counter}`}
            href={urlMatch[0]}
            target="_blank"
            rel="noreferrer noopener"
            className="nsa-md-link"
          >
            {urlMatch[0]}
          </a>
        ),
      });
    }

    if (candidates.length === 0) {
      push(remaining);
      break;
    }

    // Choose the earliest match (ties broken by longest, so ** wins over *).
    candidates.sort((a, b) => a.idx - b.idx || b.length - a.length);
    const winner = candidates[0];
    if (winner.idx > 0) {
      push(remaining.slice(0, winner.idx));
    }
    push(winner.render());
    remaining = remaining.slice(winner.idx + winner.length);
  }

  return nodes;
}

/**
 * Public entry point — render a markdown-lite string as JSX.
 * Empty string returns null so callers can inline it safely.
 */
export function renderMarkdownLite(src: string): ReactNode {
  if (!src) return null;
  const blocks = parseBlocks(src);
  const rendered: ReactNode[] = [];
  blocks.forEach((b, idx) => {
    const key = `md-${idx}`;
    switch (b.kind) {
      case 'p':
        rendered.push(
          <p key={key} className="nsa-md-p">
            {renderInline(b.text, key)}
          </p>,
        );
        break;
      case 'h': {
        const Tag = (`h${b.level}` as keyof JSX.IntrinsicElements);
        rendered.push(
          <Tag key={key} className={`nsa-md-h nsa-md-h${b.level}`}>
            {renderInline(b.text, key)}
          </Tag>,
        );
        break;
      }
      case 'code':
        rendered.push(
          <pre key={key} className="nsa-md-code" data-lang={b.lang ?? undefined}>
            <code>{b.text}</code>
          </pre>,
        );
        break;
      case 'ul':
        rendered.push(
          <ul key={key} className="nsa-md-ul">
            {b.items.map((item, i) => (
              <li key={`${key}-li${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ul>,
        );
        break;
      case 'ol':
        rendered.push(
          <ol key={key} className="nsa-md-ol">
            {b.items.map((item, i) => (
              <li key={`${key}-li${i}`}>{renderInline(item, `${key}-${i}`)}</li>
            ))}
          </ol>,
        );
        break;
      case 'quote':
        rendered.push(
          <blockquote key={key} className="nsa-md-quote">
            {renderInline(b.text, key)}
          </blockquote>,
        );
        break;
      case 'hr':
        rendered.push(<hr key={key} className="nsa-md-hr" />);
        break;
    }
  });
  return <>{rendered}</>;
}
