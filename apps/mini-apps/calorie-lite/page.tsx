'use client';

/**
 * Calorie Lite — reference mini-app page (v2).
 *
 * v2 changes over v1:
 *   - TODAY: streak chip in the header, macro breakdown card under the kcal
 *     card, per-entry macro line beneath each entry.
 *   - ADD:   optional Protein / Carbs / Fat inputs beneath kcal. The API
 *     schema already accepts these; v1 just didn't send them.
 *   - HISTORY: 7-day sparkline at the top, streak line (best + current),
 *     per-day macro totals in each row.
 *
 * No schema changes, no new API endpoints. All calculation is pure and lives
 * in `./lib/aggregate.ts` so it stays testable and reusable.
 *
 * Design constraints (unchanged from v1):
 *   - Card: rgba(0,0,0,0.5) background, --color-border-visible outline,
 *     --radius-card, --space-4 inner padding.
 *   - Doto (`.display-xl`) for the daily total number.
 *   - Space Mono (`.data`) for entry times + kcal counts.
 *   - Space Grotesk (default body) for everything else.
 *   - Cadmium red (--color-accent) only for CTAs, accent bars, streak dot.
 *   - No hex colors — tokens only.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  EmptyState,
  useEvents,
  usePreferences,
  useUser,
} from '@nothing/mini-apps-runtime';
// Relative reach into the host app — Next resolves this to the same module
// instance used by <ToastProvider> in /app/layout.tsx, so mini-apps toast
// straight into the shell without duplicating state.
import { useToast } from '../../web/src/lib/toast/context';
import { MiniAppSettingsButton } from '../../web/src/components/mini-apps/MiniAppSettingsButton';
import { CopilotDrawerTrigger } from '../../web/src/components/copilot/CopilotDrawerTrigger';
import { REOPEN_ONBOARDING_EVENT } from './settings.tsx';
import type { CalorieEntry, Meal } from '@nothing/shared';
import { EVENT_KINDS } from '@nothing/shared';
import { MacroCard } from './components/MacroCard.tsx';
import { StreakChip } from './components/StreakChip.tsx';
import { Sparkline, type SparklineDay } from './components/Sparkline.tsx';
import { FoodSearch } from './components/FoodSearch.tsx';
import { CustomFoodList } from './components/CustomFoodList.tsx';
import { WaterView } from './components/WaterView.tsx';
import { WeightView } from './components/WeightView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { CustomMealsPanel } from './components/CustomMealsPanel.tsx';
import { TodayInsights } from './components/TodayInsights.tsx';
import { OnboardingWizard } from './components/OnboardingWizard.tsx';
import { MealPlanView } from './components/MealPlanView.tsx';
import { FromPlanDropdown } from './components/FromPlanDropdown.tsx';
import {
  computeStreak,
  dailyTotals,
  toLocalDateKey,
} from './lib/aggregate.ts';

// Alphabetical-after-locked-first ordering: today → add → water → weight →
// reports → history. Wave C owns `reports`; workers A/B own `add`, `water`,
// `weight` respectively.
type View = 'today' | 'add' | 'water' | 'weight' | 'plan' | 'reports' | 'history';

const MEAL_OPTIONS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

// Fallback goal when the user hasn't set one in Settings yet. Kept low + round
// so the progress bar communicates "you have no target set" rather than
// "you're doing great" — 2000 kcal is a neutral default, not a prescription.
const DEFAULT_DAILY_GOAL_KCAL = 2000;

// Chips shown inside the copilot drawer's empty state — scoped to the three
// smart-tool superpowers the copilot has here (fit-to-macros, swap, log from
// plan). Kept short + verby so users can tap-and-send.
const CALORIE_LITE_COPILOT_PROMPTS = [
  'Suggest a lunch that fits my remaining macros',
  'I have chicken but no rice — what can I swap?',
  'Log breakfast option 4 from my plan today',
] as const;

/** HH:MM for a timestamp — matches the Space Mono `.data` style. */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

/** e.g. "MON · MAR 03" — kept UPPER + short so it holds Space Mono well. */
function toDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const month = dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${weekday} · ${month} ${String(d).padStart(2, '0')}`;
}

/** Shift a local YYYY-MM-DD key by `deltaDays`, using local Date math. */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** 3-letter uppercase weekday for a YYYY-MM-DD (local). */
function toWeekdayShort(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3);
}

/** Small helper so the per-entry macro line stays consistent everywhere. */
function macroLine(p: number, c: number, f: number): string | null {
  if (p === 0 && c === 0 && f === 0) return null;
  return `${p}p / ${c}c / ${f}f`;
}

export default function CalorieLitePage() {
  const user = useUser();
  const preferences = usePreferences();
  const events = useEvents();

  const goalKcal = preferences.daily_calorie_goal ?? DEFAULT_DAILY_GOAL_KCAL;
  const goalIsExplicit = preferences.daily_calorie_goal != null;

  const [view, setView] = useState<View>('today');
  const [entries, setEntries] = useState<CalorieEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Wave 2-A — first-run onboarding wizard. Auto-opens when the user has
  // never completed onboarding (no `onboarded_at`) AND has no body profile
  // (`age_years == null`). The dual check means an existing MFP user who
  // filled in age via some other flow doesn't get re-prompted.
  const needsOnboarding =
    preferences.onboarded_at == null && preferences.age_years == null;
  const [wizardOpen, setWizardOpen] = useState<boolean>(needsOnboarding);
  // Keep the auto-open trigger in sync if preferences hydrate after mount
  // (e.g. re-hydrate after `preferences_updated` from another tab).
  useEffect(() => {
    if (needsOnboarding) setWizardOpen(true);
  }, [needsOnboarding]);

  // Listen for the settings sheet's "redo onboarding" button. The settings
  // panel closes itself first, then dispatches a window CustomEvent so this
  // page can re-open the wizard without any prop-drilling across the sheet
  // boundary. Only wire on the client.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setWizardOpen(true);
    window.addEventListener(REOPEN_ONBOARDING_EVENT, handler);
    return () => window.removeEventListener(REOPEN_ONBOARDING_EVENT, handler);
  }, []);
  // When the wizard emits `preferences_updated`, force a full page refresh
  // via router-less soft reload: the shell's server layout re-fetches
  // preferences on nav so the simplest reliable path is `location.reload()`.
  // We only do this when the wizard closes cleanly (saved OR skipped).
  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    // Nudge the server-rendered layout to re-hydrate preferences without a
    // hard reload — Next 15 refreshes on router.refresh() but mini-apps live
    // under a client boundary, so a same-URL nav is the pragmatic choice.
    // Fire-and-forget; a stale goal for one paint is fine.
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const todayKey = useMemo(() => toLocalDateKey(new Date().toISOString()), []);

  const { toast } = useToast();

  const loadEntries = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        // 402 shouldn't happen in normal flow — Proxy redirects unentitled
        // users at /app/calorie-lite before this component mounts. But if it
        // does (e.g. subscription lapsed while the tab was open), surface it.
        if (res.status === 402) {
          setLoadError('Subscription required. Refresh to renew.');
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status === 401) {
          // Proxy will bounce on next nav — no toast, just the inline banner.
          setLoadError('Session expired. Sign in again.');
        } else if (res.status >= 500) {
          setLoadError('Could not load entries.');
          toast.error("Something broke on our end. We're logging it.");
        } else {
          setLoadError('Could not load entries.');
          toast.error('Could not load entries.');
        }
        setEntries([]);
        return;
      }
      const body = (await res.json()) as { entries: CalorieEntry[] };
      setEntries(body.entries);
    } catch {
      setLoadError('Network error.');
      toast.error("Can't reach the server. Check your connection.");
      setEntries([]);
    }
  }, [toast]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Re-load when another tab or component in the same session adds an entry.
  useEffect(() => {
    const off = events.subscribe(EVENT_KINDS.calorie_entry_added, () => {
      void loadEntries();
    });
    return off;
  }, [events, loadEntries]);

  const todayEntries = useMemo(
    () => (entries ?? []).filter((e) => toLocalDateKey(e.entered_at) === todayKey),
    [entries, todayKey],
  );

  // One pass over all entries — reused by today totals, history, and streak.
  const daily = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const todayBucket = daily[todayKey];
  const todayTotal = todayBucket?.kcal ?? 0;
  const todayProtein = todayBucket?.protein ?? 0;
  const todayCarbs = todayBucket?.carbs ?? 0;
  const todayFat = todayBucket?.fat ?? 0;

  const streak = useMemo(
    () => computeStreak(entries ?? [], todayKey),
    [entries, todayKey],
  );

  const progressPct = Math.min(1, goalKcal > 0 ? todayTotal / goalKcal : 0);
  const over = goalIsExplicit && todayTotal > goalKcal;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <Header
        view={view}
        onChangeView={setView}
        streak={streak.current}
        showProfileChip={
          view === 'today' && preferences.age_years == null && !wizardOpen
        }
        onOpenWizard={() => setWizardOpen(true)}
      />

      {loadError && (
        <div
          role="alert"
          className="caption"
          style={{
            color: 'var(--color-accent)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {loadError}
        </div>
      )}

      {view === 'today' && (
        <TodayView
          total={todayTotal}
          goal={goalKcal}
          goalIsExplicit={goalIsExplicit}
          progress={progressPct}
          over={over}
          entries={todayEntries}
          protein={todayProtein}
          carbs={todayCarbs}
          fat={todayFat}
          loading={entries === null}
          activeMealPlanId={preferences.active_meal_plan_id}
          onAdd={() => setView('add')}
          onEntriesChanged={loadEntries}
        />
      )}

      {view === 'add' && (
        <AddView
          userId={user.id}
          onCancel={() => setView('today')}
          onSaved={async () => {
            events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
            await loadEntries();
            setView('today');
          }}
        />
      )}

      {view === 'water' && <WaterView />}

      {view === 'weight' && <WeightView />}

      {view === 'plan' && (
        <MealPlanView activeMealPlanId={preferences.active_meal_plan_id} />
      )}

      {view === 'reports' && (
        <ReportsView dailyCalorieGoal={goalIsExplicit ? goalKcal : null} />
      )}

      {view === 'history' && (
        <HistoryView
          entries={entries ?? []}
          daily={daily}
          todayKey={todayKey}
          goal={goalKcal}
          goalIsExplicit={goalIsExplicit}
          streakCurrent={streak.current}
          streakBest={streak.best}
          loading={entries === null}
        />
      )}

      {wizardOpen && <OnboardingWizard onClose={closeWizard} />}
    </div>
  );
}

// ─── Header + tabs ──────────────────────────────────────────────────────────

function Header({
  view,
  onChangeView,
  streak,
  showProfileChip = false,
  onOpenWizard,
}: {
  view: View;
  onChangeView: (v: View) => void;
  streak: number;
  /** True when the user hasn't filled in their body profile yet. */
  showProfileChip?: boolean;
  /** Called when the user taps the profile chip. */
  onOpenWizard?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label">CALORIE LITE</span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {showProfileChip && onOpenWizard && (
            <button
              type="button"
              onClick={onOpenWizard}
              aria-label="Set up your profile"
              style={{
                background: 'transparent',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
                borderRadius: 'var(--radius-compact)',
                padding: 'var(--space-1) var(--space-3)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              ◐ Set up profile
            </button>
          )}
          <CopilotDrawerTrigger
            context="calorie-lite"
            scopeLabel="Calorie Lite"
            suggestedPrompts={CALORIE_LITE_COPILOT_PROMPTS}
          />
          <StreakChip current={streak} />
          <MiniAppSettingsButton slug="calorie-lite" title="Calorie Lite" />
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Calorie views"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TabButton active={view === 'today'} onClick={() => onChangeView('today')}>
          Today
        </TabButton>
        <TabButton active={view === 'water'} onClick={() => onChangeView('water')}>
          Water
        </TabButton>
        <TabButton active={view === 'weight'} onClick={() => onChangeView('weight')}>
          Weight
        </TabButton>
        <TabButton active={view === 'plan'} onClick={() => onChangeView('plan')}>
          Plan
        </TabButton>
        <TabButton active={view === 'reports'} onClick={() => onChangeView('reports')}>
          Reports
        </TabButton>
        <TabButton active={view === 'history'} onClick={() => onChangeView('history')}>
          History
        </TabButton>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        borderBottom: active
          ? '2px solid var(--color-text-display)'
          : '2px solid transparent',
        color: active ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─── Today view ─────────────────────────────────────────────────────────────

function TodayView({
  total,
  goal,
  goalIsExplicit,
  progress,
  over,
  entries,
  protein,
  carbs,
  fat,
  loading,
  activeMealPlanId,
  onAdd,
  onEntriesChanged,
}: {
  total: number;
  goal: number;
  goalIsExplicit: boolean;
  progress: number;
  over: boolean;
  entries: CalorieEntry[];
  protein: number;
  carbs: number;
  fat: number;
  loading: boolean;
  activeMealPlanId: string | null;
  onAdd: () => void;
  onEntriesChanged: () => void | Promise<void>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <TotalCard
        total={total}
        goal={goal}
        goalIsExplicit={goalIsExplicit}
        progress={progress}
        over={over}
      />

      <MacroCard protein={protein} carbs={carbs} fat={fat} />

      {/* Server-computed weekly nudges. Sits above the day's entries so it
          reads as guidance, not history. */}
      <TodayInsights />

      {loading ? (
        <p className="caption">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyToday onAdd={onAdd} />
      ) : (
        <EntryList entries={entries} onChanged={onEntriesChanged} />
      )}

      {/* MY MEALS panel — reusable custom meal templates. Sits below the day's
          entries so it doesn't crowd the TotalCard, and above the ADD MEAL CTA
          so users see saved options before jumping to the ADD form. */}
      <CustomMealsPanel todayEntries={entries} defaultMealSlot="lunch" />

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onAdd}
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-text-display)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          + Add meal
        </button>
        <FromPlanDropdown activeMealPlanId={activeMealPlanId} />
      </div>
    </div>
  );
}

function TotalCard({
  total,
  goal,
  goalIsExplicit,
  progress,
  over,
}: {
  total: number;
  goal: number;
  goalIsExplicit: boolean;
  progress: number;
  over: boolean;
}) {
  const remaining = Math.max(0, goal - total);
  const remainingLabel = over
    ? `${(total - goal).toLocaleString()} OVER`
    : goalIsExplicit
      ? `${remaining.toLocaleString()} LEFT`
      : `${goal.toLocaleString()} DEFAULT`;

  return (
    <section
      aria-label="Today's total"
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
      <span className="label">TODAY · KCAL</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span className="display-xl">{total.toLocaleString()}</span>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          / {goal.toLocaleString()}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward daily goal"
        style={{
          position: 'relative',
          height: 4,
          background: 'var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.round(progress * 100)}%`,
            background: 'var(--color-accent)',
            transition: 'width var(--dur-medium) var(--ease-out)',
          }}
        />
      </div>

      <span className="data" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}>
        {remainingLabel}
      </span>
    </section>
  );
}

function EmptyToday({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon="◐"
      title="No meals logged"
      body="Log your first meal to start tracking calories and macros."
      primaryAction={{ label: '+ Add meal', onClick: onAdd, ariaLabel: 'Add first meal' }}
    />
  );
}

/**
 * Bucket entries by `meal_group_id` while preserving TODAY's newest-first
 * order. Ungrouped rows (null id) stay as solo `EntryRow`s. Grouped rows
 * collapse under one `MealGroupCard` per bucket. The bucket's sort key is
 * the newest entry inside it, so a freshly-logged meal jumps to the top.
 */
type EntryBucket =
  | { kind: 'solo'; entry: CalorieEntry }
  | { kind: 'group'; groupId: string; label: string; entries: CalorieEntry[] };

function bucketEntries(entries: CalorieEntry[]): EntryBucket[] {
  const groups = new Map<string, CalorieEntry[]>();
  const solos: CalorieEntry[] = [];
  for (const e of entries) {
    const gid = e.meal_group_id ?? null;
    if (gid) {
      const arr = groups.get(gid) ?? [];
      arr.push(e);
      groups.set(gid, arr);
    } else {
      solos.push(e);
    }
  }
  const buckets: { sortKey: string; bucket: EntryBucket }[] = [];
  for (const e of solos) {
    buckets.push({ sortKey: e.entered_at, bucket: { kind: 'solo', entry: e } });
  }
  for (const [groupId, groupEntries] of groups) {
    // Newest entry inside the group drives the group's timeline position.
    const sorted = [...groupEntries].sort((a, b) =>
      b.entered_at.localeCompare(a.entered_at),
    );
    const label =
      sorted.find((e) => e.meal_group_label)?.meal_group_label ?? 'Meal';
    buckets.push({
      sortKey: sorted[0]!.entered_at,
      bucket: { kind: 'group', groupId, label, entries: sorted },
    });
  }
  // Newest first — same rule TODAY has always used for solo entries.
  buckets.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return buckets.map((b) => b.bucket);
}

function EntryList({
  entries,
  onChanged,
}: {
  entries: CalorieEntry[];
  onChanged?: () => void | Promise<void>;
}) {
  const buckets = useMemo(() => bucketEntries(entries), [entries]);
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {buckets.map((b) =>
        b.kind === 'solo' ? (
          <EntryRow key={b.entry.id} entry={b.entry} onChanged={onChanged} />
        ) : (
          <MealGroupCard
            key={b.groupId}
            groupId={b.groupId}
            label={b.label}
            entries={b.entries}
            onChanged={onChanged}
          />
        ),
      )}
    </ul>
  );
}

/**
 * Collapsible card grouping every `app_calorie_entries` row that shares a
 * `meal_group_id` (stamped server-side by `log_meal_from_plan`).
 *
 * Header row:
 *   - Chevron + label (`Comida · Opción 2`, Space Mono uppercase)
 *   - Total kcal + macros
 *   - `× Delete group` two-tap confirm chip (auto-disarm 3s)
 *
 * Body (when expanded): each entry rendered by the untouched `EntryRow`
 * component, so per-row ✎ EDIT + × DELETE still work.
 *
 * Collapse rules:
 *   - Groups with ≥3 rows default to collapsed
 *   - Prior user choice (sessionStorage keyed by `meal_group_id`) wins
 *
 * Delete-group loops row-by-row through the framework DELETE endpoint —
 * simple and works today; a future `delete_meal_group` batch endpoint
 * would make it a single call.
 */
function MealGroupCard({
  groupId,
  label,
  entries,
  onChanged,
}: {
  groupId: string;
  label: string;
  entries: CalorieEntry[];
  onChanged?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const events = useEvents();

  // Per-group collapse memory. sessionStorage (not localStorage) so a fresh
  // browser session starts from the "≥3 rows collapse by default" heuristic
  // rather than remembering forever.
  const storageKey = `calorie-lite:meal-group-collapsed:${groupId}`;
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return entries.length < 3;
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved === 'expanded') return true;
    if (saved === 'collapsed') return false;
    return entries.length < 3;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(storageKey, expanded ? 'expanded' : 'collapsed');
  }, [expanded, storageKey]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const t = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);

  // Aggregate totals across the group — computed inline so a per-row edit
  // is immediately reflected after `onChanged` refetches the list.
  const totals = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal ?? 0),
      protein: acc.protein + (e.protein_g ?? 0),
      carbs: acc.carbs + (e.carbs_g ?? 0),
      fat: acc.fat + (e.fat_g ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const macros = macroLine(totals.protein, totals.carbs, totals.fat);

  async function handleDeleteGroup(evt: React.MouseEvent) {
    evt.stopPropagation();
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    try {
      // Loop DELETE — no batch endpoint yet. Sequential rather than
      // Promise.all to keep server-side write budget honest.
      let failed = 0;
      for (const e of entries) {
        const res = await fetch(
          `/api/mini-apps/calorie-lite/resources/entries/${e.id}`,
          { method: 'DELETE' },
        );
        if (!res.ok) failed += 1;
      }
      if (failed === 0) {
        toast.success(`Deleted ${entries.length} entries.`);
      } else if (failed < entries.length) {
        toast.error(`Deleted ${entries.length - failed}/${entries.length} — retry.`);
      } else {
        toast.error('Delete failed.');
      }
      events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
      await onChanged?.();
      // Purge the collapse memory so a re-log with a new group id starts
      // from the default heuristic.
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      toast.error("Can't reach the server.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
        margin: 'var(--space-3) 0',
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse meal group' : 'Expand meal group'}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-2)',
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            className="data"
            aria-hidden
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
              width: '1ch',
              display: 'inline-block',
            }}
          >
            {expanded ? '▾' : '▸'}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              marginLeft: 'var(--space-2)',
              whiteSpace: 'nowrap',
            }}
          >
            · {entries.length} {entries.length === 1 ? 'item' : 'items'}
          </span>
        </button>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 'var(--space-1)',
          }}
        >
          <span
            className="data"
            style={{
              color: 'var(--color-text-display)',
              fontSize: 'var(--text-body)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {totals.kcal.toLocaleString()}
          </span>
          {macros && (
            <span
              className="data"
              style={{
                color: 'var(--color-text-disabled)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {macros}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleDeleteGroup}
          disabled={busy}
          className="data"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: 'var(--space-1) var(--space-3)',
            border: `1px solid ${
              confirmingDelete ? 'var(--color-accent)' : 'var(--color-border-visible)'
            }`,
            borderRadius: 'var(--radius-pill, 999px)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: confirmingDelete
              ? 'var(--color-accent)'
              : 'var(--color-text-secondary)',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {confirmingDelete ? '× Confirm delete group?' : '× Delete group'}
        </button>
      </div>

      {expanded && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            paddingLeft: 'var(--space-3)',
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * One entry row with tap-to-expand actions (EDIT · DELETE).
 *
 * Delete uses two-tap confirm to avoid accidental fat-finger deletes on
 * mobile: first tap arms the button (`× DELETE?` in cadmium), second tap
 * fires. Auto-disarms after 3s.
 *
 * Edit reveals an inline form for the mutable fields (name/kcal/macros/slot).
 * Saves via PATCH; on success collapses back to the compact row and pings
 * `onChanged` so the parent refetches totals + streak + insights refresh.
 *
 * Writes go through the framework endpoint
 *   /api/mini-apps/calorie-lite/resources/entries/[id]
 * (declared in apps/mini-apps/calorie-lite/resources.ts, ops.update + delete).
 */
function EntryRow({
  entry,
  onChanged,
}: {
  entry: CalorieEntry;
  onChanged?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const events = useEvents();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const macros = macroLine(
    entry.protein_g ?? 0,
    entry.carbs_g ?? 0,
    entry.fat_g ?? 0,
  );

  useEffect(() => {
    if (!confirmingDelete) return;
    const t = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/mini-apps/calorie-lite/resources/entries/${entry.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error(res.status === 402 ? 'Subscription required.' : 'Delete failed.');
        return;
      }
      toast.success('Entry deleted.');
      events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
      await onChanged?.();
    } catch {
      toast.error("Can't reach the server.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
      setExpanded(false);
    }
  }

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse entry actions' : 'Expand entry actions'}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
          <span
            style={{
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-body)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.raw_input || mealLabel(entry.meal)}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
            }}
          >
            {toLocalTime(entry.entered_at)} · {mealLabel(entry.meal).toUpperCase()}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 'var(--space-1)',
          }}
        >
          <span
            className="data"
            style={{
              color: 'var(--color-text-display)',
              fontSize: 'var(--text-body)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {entry.kcal.toLocaleString()}
          </span>
          {macros && (
            <span
              className="data"
              style={{
                color: 'var(--color-text-disabled)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {macros}
            </span>
          )}
        </div>
      </button>

      {expanded && !editing && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="data"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-pill, 999px)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            ✎ Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="data"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 'var(--space-2) var(--space-3)',
              border: `1px solid ${
                confirmingDelete ? 'var(--color-accent)' : 'var(--color-border-visible)'
              }`,
              borderRadius: 'var(--radius-pill, 999px)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: confirmingDelete
                ? 'var(--color-accent)'
                : 'var(--color-text-primary)',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {confirmingDelete ? '× Confirm?' : '× Delete'}
          </button>
        </div>
      )}

      {editing && (
        <EditEntryForm
          entry={entry}
          onCancel={() => {
            setEditing(false);
            setExpanded(false);
          }}
          onSaved={async () => {
            setEditing(false);
            setExpanded(false);
            events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
            await onChanged?.();
          }}
        />
      )}
    </li>
  );
}

function EditEntryForm({
  entry,
  onCancel,
  onSaved,
}: {
  entry: CalorieEntry;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(entry.raw_input ?? '');
  const [kcal, setKcal] = useState(String(entry.kcal));
  const [protein, setProtein] = useState(String(entry.protein_g ?? 0));
  const [carbs, setCarbs] = useState(String(entry.carbs_g ?? 0));
  const [fat, setFat] = useState(String(entry.fat_g ?? 0));
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        raw_input: name.trim() || null,
        kcal: Number(kcal) || 0,
        protein_g: Number(protein) || 0,
        carbs_g: Number(carbs) || 0,
        fat_g: Number(fat) || 0,
        meal_slot: meal,
      };
      const res = await fetch(
        `/api/mini-apps/calorie-lite/resources/entries/${entry.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        toast.error(res.status === 402 ? 'Subscription required.' : 'Save failed.');
        return;
      }
      toast.success('Entry updated.');
      await onSaved();
    } catch {
      toast.error("Can't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: CSSProperties = {
    background: 'var(--color-surface-elevated, rgba(0,0,0,0.4))',
    border: '1px solid var(--color-border-visible)',
    borderRadius: 'var(--radius-input, 4px)',
    padding: 'var(--space-2) var(--space-3)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-data)',
    fontSize: 'var(--text-caption)',
    width: '100%',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span className="label" style={{ fontSize: 'var(--text-caption)' }}>NAME</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
        {[
          { label: 'KCAL', v: kcal, set: setKcal },
          { label: 'P (g)', v: protein, set: setProtein },
          { label: 'C (g)', v: carbs, set: setCarbs },
          { label: 'F (g)', v: fat, set: setFat },
        ].map((f) => (
          <label key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span className="label" style={{ fontSize: 'var(--text-caption)' }}>{f.label}</span>
            <input
              type="number"
              inputMode="decimal"
              value={f.v}
              onChange={(e) => f.set(e.target.value)}
              style={inputStyle}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {MEAL_OPTIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMeal(m.id)}
            className="data"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 'var(--space-2) var(--space-3)',
              border: `1px solid ${
                meal === m.id ? 'var(--color-accent)' : 'var(--color-border-visible)'
              }`,
              borderRadius: 'var(--radius-pill, 999px)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: meal === m.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="data"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: 'var(--space-2) var(--space-4)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-pill, 999px)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="data"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-accent)',
            color: 'var(--color-text-inverse, #fff)',
            borderRadius: 'var(--radius-pill, 999px)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function mealLabel(m: Meal): string {
  return MEAL_OPTIONS.find((o) => o.id === m)?.label ?? m;
}

// ─── Add view — v3 MFP-tier tabbed flow ─────────────────────────────────────
//
// The Add view now hosts three subviews:
//   SEARCH    — search the shared foods catalog (153 seeded) + user customs
//   CUSTOM    — manage user's own custom foods, log from them
//   QUICK LOG — the v2 free-text form (kept for muscle-memory users)
//
// The meal-slot selector stays on ALL tabs so switching tabs doesn't lose
// the user's chosen meal context. Errors from any tab are hoisted here so
// the same inline banner + toast plumbing lights them up.

type AddSubView = 'search' | 'custom' | 'quicklog';

function AddView({
  userId,
  onCancel,
  onSaved,
}: {
  userId: string;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [subview, setSubview] = useState<AddSubView>('search');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [error, setError] = useState<string | null>(null);

  // userId is currently only used for optimistic-UI paths; keeping the prop
  // threaded through so future work (e.g. offline queue keyed on caller)
  // has an obvious wire.
  void userId;

  function handleError(msg: string) {
    setError(msg);
    toast.error(msg);
  }

  function handleSubscriptionRequired() {
    setError('Subscription required to save entries.');
    toast.info("This one's paid. Subscribe on the paywall.");
  }

  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <span className="label">ADD MEAL</span>

      <div
        role="tablist"
        aria-label="Add meal method"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <SubTabButton active={subview === 'search'} onClick={() => setSubview('search')}>
          Search
        </SubTabButton>
        <SubTabButton active={subview === 'custom'} onClick={() => setSubview('custom')}>
          Custom
        </SubTabButton>
        <SubTabButton active={subview === 'quicklog'} onClick={() => setSubview('quicklog')}>
          Quick log
        </SubTabButton>
      </div>

      {/* Meal slot picker persists across ALL subviews. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          MEAL SLOT
        </span>
        <div
          role="radiogroup"
          aria-label="Meal slot"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {MEAL_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={meal === m.id}
              onClick={() => setMeal(m.id)}
              style={{
                background: meal === m.id ? 'var(--color-text-display)' : 'transparent',
                color: meal === m.id ? 'var(--color-bg)' : 'var(--color-text-primary)',
                border: `1px solid ${meal === m.id ? 'var(--color-text-display)' : 'var(--color-border-visible)'}`,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {subview === 'search' && (
        <FoodSearch
          meal={meal}
          onSaved={onSaved}
          onError={handleError}
          onSubscriptionRequired={handleSubscriptionRequired}
        />
      )}
      {subview === 'custom' && (
        <CustomFoodList
          meal={meal}
          onSaved={onSaved}
          onError={handleError}
          onSubscriptionRequired={handleSubscriptionRequired}
        />
      )}
      {subview === 'quicklog' && (
        <QuickLogForm
          meal={meal}
          onSaved={onSaved}
          onError={handleError}
          onSubscriptionRequired={handleSubscriptionRequired}
        />
      )}

      <div>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          style={{
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        borderBottom: active
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        color: active ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─── Quick log (v2 form, preserved) ─────────────────────────────────────────
//
// Free-text name + kcal + optional macros. Kept in the tabbed flow as
// "QUICK LOG" so v2 muscle memory still works and users who don't want to
// search can type a number and move on.

function QuickLogForm({
  meal,
  onSaved,
  onError,
  onSubscriptionRequired,
}: {
  meal: Meal;
  onSaved: () => Promise<void> | void;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}) {
  const [mealName, setMealName] = useState('');
  const [kcal, setKcal] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = kcal.trim() !== '' && Number(kcal) >= 0 && !saving;

  /**
   * Turn a text input into an integer gram count for a macro field.
   * Empty string → omit the field (API defaults to 0). Non-numeric or
   * negative → treat as 0, matching server-side clamping.
   */
  function macroOrUndefined(raw: string): number | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const n = Math.max(0, Math.round(Number(trimmed)));
    return Number.isFinite(n) ? n : undefined;
  }

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const rawInputParts = [mealName.trim(), servingSize.trim()].filter(Boolean);
      const proteinN = macroOrUndefined(protein);
      const carbsN = macroOrUndefined(carbs);
      const fatN = macroOrUndefined(fat);
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meal,
          kcal: Number(kcal),
          raw_input: rawInputParts.length ? rawInputParts.join(' · ') : null,
          ...(proteinN !== undefined ? { protein_g: proteinN } : {}),
          ...(carbsN !== undefined ? { carbs_g: carbsN } : {}),
          ...(fatN !== undefined ? { fat_g: fatN } : {}),
        }),
      });
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status === 400) {
          const body = await res.json().catch(() => null);
          onError(
            body?.error === 'invalid_body'
              ? 'Check the fields and try again.'
              : 'Could not save.',
          );
        } else if (res.status !== 401) {
          onError('Could not save.');
        }
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      onError('Network error.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>MEAL NAME</span>
        <input
          className="input"
          type="text"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          placeholder="e.g. Chicken bowl"
          autoComplete="off"
          maxLength={120}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>KCAL</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={20000}
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="0"
          required
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          MACROS — OPTIONAL
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-3)',
          }}
        >
          <MacroInput
            label="PROTEIN (G)"
            value={protein}
            onChange={setProtein}
            id="cl-macro-protein"
          />
          <MacroInput
            label="CARBS (G)"
            value={carbs}
            onChange={setCarbs}
            id="cl-macro-carbs"
          />
          <MacroInput
            label="FAT (G)"
            value={fat}
            onChange={setFat}
            id="cl-macro-fat"
          />
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>SERVING SIZE (OPTIONAL)</span>
        <input
          className="input"
          type="text"
          value={servingSize}
          onChange={(e) => setServingSize(e.target.value)}
          placeholder="e.g. 1 bowl · 300g"
          autoComplete="off"
          maxLength={80}
        />
      </label>

      <div>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: canSubmit ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function MacroInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </label>
  );
}

// ─── History view ───────────────────────────────────────────────────────────

function HistoryView({
  entries,
  daily,
  todayKey,
  goal,
  goalIsExplicit,
  streakCurrent,
  streakBest,
  loading,
}: {
  entries: CalorieEntry[];
  daily: Record<string, { kcal: number; protein: number; carbs: number; fat: number; entries: number }>;
  todayKey: string;
  goal: number;
  goalIsExplicit: boolean;
  streakCurrent: number;
  streakBest: number;
  loading: boolean;
}) {
  // Build the 7-day window ending today (oldest first for the sparkline).
  const sparklineDays: SparklineDay[] = useMemo(() => {
    const out: SparklineDay[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = shiftDateKey(todayKey, -i);
      const kcal = daily[key]?.kcal ?? 0;
      out.push({
        key,
        kcal,
        weekday: toWeekdayShort(key),
        active: kcal > 0,
      });
    }
    return out;
  }, [daily, todayKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalorieEntry[]>();
    for (const e of entries) {
      const key = toLocalDateKey(e.entered_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    // Newest day first.
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (loading) {
    return <p className="caption">Loading…</p>;
  }

  // With zero entries anywhere, the sparkline is 7 empty dots and the day list
  // is empty — that would render as 3 useless surfaces stacked on top of each
  // other. Show a single, actionable empty state instead.
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="◐"
        title="Nothing to chart yet"
        body="Log meals for a few days to see your trend and streaks."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section
        aria-label="Last 7 days"
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
        <span className="label">LAST 7 DAYS</span>
        <Sparkline days={sparklineDays} goal={goalIsExplicit ? goal : null} />
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
          }}
        >
          BEST: {streakBest}D · CURRENT: {streakCurrent}D
        </span>
      </section>

      {byDay.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          No history yet. Log a meal to start tracking.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {byDay.map(([dateKey, dayEntries]) => {
            const bucket = daily[dateKey] ?? {
              kcal: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              entries: dayEntries.length,
            };
            const total = bucket.kcal;
            const pct = Math.min(1, goal > 0 ? total / goal : 0);
            const over = goalIsExplicit && total > goal;
            const macros = macroLine(bucket.protein, bucket.carbs, bucket.fat);
            return (
              <li
                key={dateKey}
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span className="label">{toDateLabel(dateKey)}</span>
                  <span
                    className="data"
                    style={{
                      color: 'var(--color-text-display)',
                      fontSize: 'var(--text-body)',
                      fontWeight: 700,
                    }}
                  >
                    {total.toLocaleString()}
                    <span
                      className="label"
                      style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}
                    >
                      / {goal.toLocaleString()}
                    </span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(pct * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress for ${toDateLabel(dateKey)}`}
                  style={{
                    position: 'relative',
                    height: 4,
                    background: 'var(--color-border)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${Math.round(pct * 100)}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                    {over ? ' · over goal' : ''}
                  </span>
                  {macros && (
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-disabled)',
                        fontSize: 'var(--text-caption)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {macros}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
