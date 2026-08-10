'use client';

import type { DataTableData } from './schemas';

/**
 * PixelDataTable — mono type, hairline row separators, no zebra stripes,
 * right-aligned numerics, cadmium accent on the header row (a single 1px
 * cadmium underline beneath the header, matching the "one instrument
 * accent" rule).
 *
 * Columns are auto-sized; the first column is treated as the row label
 * (left-aligned), all subsequent columns are right-aligned numerics.
 * Non-numeric values in numeric columns are printed as-is.
 */

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.length === 0) return false;
    // "1,240", "3.4g", "620 kcal" — treat any starts-with-digit as numeric
    return /^-?\d/.test(trimmed);
  }
  return false;
}

function fmtCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 10000) {
      return new Intl.NumberFormat('en-US').format(Math.round(v));
    }
    return Number.isInteger(v) ? v.toString() : v.toFixed(1);
  }
  return String(v);
}

export function PixelDataTable({ title, columns, rows, compact }: DataTableData) {
  const padY = compact ? 4 : 6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {title && (
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          {title}
        </span>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-text-primary)',
          }}
        >
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: `${padY}px 8px`,
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--color-accent)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {columns.map((_, cIdx) => {
                  const raw = row[cIdx];
                  const numeric = cIdx > 0 || isNumericLike(raw);
                  return (
                    <td
                      key={cIdx}
                      style={{
                        textAlign: cIdx === 0 ? 'left' : 'right',
                        padding: `${padY}px 8px`,
                        color:
                          cIdx === 0
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-display)',
                        borderBottom:
                          rIdx === rows.length - 1
                            ? 'none'
                            : '1px solid var(--color-border)',
                        fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 220,
                      }}
                    >
                      {fmtCell(raw)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
