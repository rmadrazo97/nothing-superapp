'use client';

/**
 * MacroCard — three-column breakdown of the day's macros.
 *
 * Each column shows an UPPERCASE Space Mono label, the grams in Doto, and a
 * thin bar underneath sized by the macro's *share of the day's kcal from
 * macros* (protein=4kcal/g, carbs=4kcal/g, fat=9kcal/g). We deliberately do
 * not divide by the daily calorie goal — the bars are a **composition**
 * readout, not progress. If the day has zero logged macros (v1 rows with no
 * macro data), the bars render at 0 width so the row still balances.
 */
import { KCAL_PER_G } from '../lib/aggregate.ts';

interface MacroCardProps {
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroCard({ protein, carbs, fat }: MacroCardProps) {
  const proteinKcal = protein * KCAL_PER_G.protein;
  const carbsKcal = carbs * KCAL_PER_G.carbs;
  const fatKcal = fat * KCAL_PER_G.fat;
  const totalKcal = proteinKcal + carbsKcal + fatKcal;

  const share = (kcal: number) => (totalKcal > 0 ? kcal / totalKcal : 0);

  return (
    <section
      aria-label="Today's macros"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <span className="label">MACROS · G</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
        }}
      >
        <MacroColumn label="PROTEIN" grams={protein} share={share(proteinKcal)} />
        <MacroColumn label="CARBS" grams={carbs} share={share(carbsKcal)} />
        <MacroColumn label="FAT" grams={fat} share={share(fatKcal)} />
      </div>
    </section>
  );
}

function MacroColumn({
  label,
  grams,
  share,
}: {
  label: string;
  grams: number;
  share: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        className="data"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--font-display-weight, 700)',
          color: 'var(--color-text-display)',
          fontSize: 24,
          lineHeight: 1,
        }}
      >
        {grams.toLocaleString()}
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-text-secondary)',
            marginLeft: 2,
          }}
        >
          g
        </span>
      </span>
      <div
        aria-hidden
        style={{
          position: 'relative',
          height: 3,
          background: 'var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.round(share * 100)}%`,
            background: 'var(--color-accent)',
            transition: 'width var(--dur-medium) var(--ease-out)',
          }}
        />
      </div>
    </div>
  );
}
