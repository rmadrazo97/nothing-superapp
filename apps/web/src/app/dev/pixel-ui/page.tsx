/**
 * /dev/pixel-ui — visual proof-sheet for the pixel-ui component family.
 *
 * Renders every render_* tool's payload against representative sample
 * data so a designer / QA can eyeball the whole library in one page. The
 * page mirrors the width of the chat bubble (92% of a 480px shell column)
 * so what you see here is what lands inside a chat message.
 *
 * Dev-only surface. If we ever want to gate this behind an env flag, the
 * simplest fence is a `if (process.env.NEXT_PUBLIC_APP_ENV === 'prod')
 * notFound()` at the top of the component — but for now it's harmless
 * (no data reads, no writes).
 */
import {
  PixelCard,
  PixelTicker,
  PixelBarChart,
  PixelLineChart,
  PixelProgressDots,
  PixelArc,
  PixelDataTable,
  PixelMetricGrid,
} from '@/components/pixel-ui';

export const dynamic = 'force-static';

export default function PixelUiPreviewPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--color-bg)',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
            ◐ PIXEL UI · v0.5.4 · dev preview
          </div>
          <h1 className="display-md">Generative UI proof-sheet</h1>
          <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            Every render_* tool payload rendered against representative sample data. Chat-bubble width.
          </p>
        </div>

        {/* 1. Ticker with sparkline + delta */}
        <SectionLabel>1 · render_stat_ticker</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelTicker
              kind="stat_ticker"
              label="Weight"
              value={78.4}
              delta={-0.3}
              unit="kg"
              sparkline={[79.2, 79.0, 78.9, 78.7, 78.8, 78.6, 78.5, 78.4]}
            />
          </PixelCard>
        </div>

        {/* 2. Bar chart — weights lifted last session */}
        <SectionLabel>2 · render_bar_chart</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelBarChart
              kind="bar_chart"
              title="Weights lifted — last session"
              xLabels={['Squat', 'Bench', 'Dead', 'Row', 'Press']}
              series={[{ label: 'kg', values: [100, 80, 140, 70, 55] }]}
              units="kg"
            />
          </PixelCard>
        </div>

        {/* 2b. Bar chart multi-series */}
        <SectionLabel>2b · render_bar_chart — grouped</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelBarChart
              kind="bar_chart"
              title="Volume by week"
              xLabels={['W1', 'W2', 'W3', 'W4']}
              series={[
                { label: 'Push', values: [12, 14, 15, 16] },
                { label: 'Pull', values: [10, 12, 13, 14] },
                { label: 'Legs', values: [8, 10, 11, 12] },
              ]}
              units="sets"
            />
          </PixelCard>
        </div>

        {/* 3. Line chart — weight trend */}
        <SectionLabel>3 · render_line_chart</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelLineChart
              kind="line_chart"
              title="Weight trend — last 4 weeks"
              xLabels={['W1', 'W2', 'W3', 'W4', 'W5', 'W6']}
              values={[80.2, 79.8, 79.5, 79.1, 78.7, 78.4]}
              units="kg"
              showArea
            />
          </PixelCard>
        </div>

        {/* 4. Progress dots */}
        <SectionLabel>4 · render_progress_dots</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelProgressDots
              kind="progress_dots"
              filled={22}
              total={30}
              label="Kcal left · today"
              unit="of 2200"
            />
          </PixelCard>
        </div>

        {/* 5. Arc */}
        <SectionLabel>5 · render_arc_graph</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelArc
              kind="arc_graph"
              label="Pomodoro · cycle 3/4"
              arc={{ min: 0, max: 25, current: 18 }}
              unit="min"
            />
          </PixelCard>
        </div>

        {/* 6. Data table */}
        <SectionLabel>6 · render_data_table</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelDataTable
              kind="data_table"
              title="Options — lunch"
              columns={['Option', 'Kcal', 'P', 'C', 'F']}
              rows={[
                ['Chicken bowl', 620, 48, 52, 22],
                ['Salmon salad', 540, 42, 28, 30],
                ['Steak plate', 780, 62, 48, 34],
              ]}
            />
          </PixelCard>
        </div>

        {/* 7. Metric grid */}
        <SectionLabel>7 · render_metric_grid</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard>
            <PixelMetricGrid
              kind="metric_grid"
              title="This week"
              items={[
                { label: 'Kcal', value: 12480, delta: 320, unit: 'kcal' },
                { label: 'Protein', value: 620, delta: 40, unit: 'g' },
                { label: 'Carbs', value: 1240, delta: -80, unit: 'g' },
                { label: 'Fat', value: 420, delta: 12, unit: 'g' },
              ]}
            />
          </PixelCard>
        </div>

        {/* 7b. Metric grid — muted negative deltas (Gym PROGRESSION variant) */}
        <SectionLabel>7b · render_metric_grid · negativeDeltaTone=&quot;muted&quot;</SectionLabel>
        <div style={{ maxWidth: '92%' }}>
          <PixelCard title="SUMMARY" meta="LAST 4W · THIS WEEK">
            <PixelMetricGrid
              kind="metric_grid"
              negativeDeltaTone="muted"
              items={[
                { label: 'Volume', unit: 'KG', value: 18420, delta: 1240 },
                { label: 'Sets', value: 96, delta: -8 },
                { label: 'PRs', value: 3, delta: 1 },
                { label: 'Sessions', value: 4, delta: -1 },
              ]}
            />
          </PixelCard>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 'var(--space-6)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-secondary)',
      }}
    >
      {children}
    </div>
  );
}
