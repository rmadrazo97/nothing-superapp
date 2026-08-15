'use client';

/**
 * FoodSearch — the SEARCH FOOD tab in the Add Meal flow.
 *
 * Flow:
 *   1. On mount: fetch `/favorites` + `/recent-foods` in parallel. When the
 *      search box is empty, render both as horizontal chip rows ABOVE the
 *      category chips so a returning user's most-used foods are one tap away
 *      (MFP-parity — this is why people log 12 weeks in a row instead of 3).
 *   2. User types → debounced fetch to `/api/mini-apps/calorie-lite/foods`
 *      (with `include_custom=1` so their own customs surface alongside the
 *      shared catalog).
 *   3. Results list renders name + brand + macro preview + kcal badge + a
 *      star toggle. Star cadmium when favorited, muted outline otherwise.
 *   4. Tapping a row (search result, favorite chip, or recent chip) opens
 *      the same quantity picker (default 1 serving).
 *   5. "Add" computes scaled nutrition via `computeEntryNutrition` and POSTs
 *      to `/api/mini-apps/calorie-lite/entries` with `food_id` (or
 *      `custom_food_id`) + full nutrition snapshot + `serving_qty` +
 *      `serving_unit`.
 *
 * Design constraints (v3 MFP-tier):
 *   - Dark card: rgba(0,0,0,0.5), --color-border-visible, --radius-card,
 *     --space-4 padding.
 *   - Search input: Space Mono, placeholder "Search 150+ foods".
 *   - Category chips: pill shape, accent border when active.
 *   - Food row: name + serving_label; kcal badge right; macros below in
 *     Space Mono caption.
 *   - Favorites / Recent section headers: uppercase Space Mono "★ FAVORITES",
 *     "↺ RECENT". Chips: rounded (--radius-compact), 1px --color-border-visible
 *     border, rgba(0,0,0,0.5) background, --space-2 / --space-3 padding.
 *   - Star toggle: ★ (filled, --color-accent) when favorited, ☆ (outline,
 *     --color-text-disabled) when not. No SVG.
 *   - No hex codes anywhere — tokens only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Food, FoodCategory, Meal } from '@nothing/shared';
import {
  computeEntryNutrition,
  macroPreview,
  type ServingUnit,
} from '../lib/nutrition.ts';

// A search result row — either a public `foods` row or a `custom_foods` row,
// discriminated by the server-added `_source` field. We keep the two shapes
// interchangeable at the UI layer because the fields we render are the same.
export type FoodResult =
  | (Food & { _source: 'public' })
  | (Food & { _source: 'custom'; user_id: string; created_at: string });

// Server-returned favorite row hydrated with its food. `id` is the
// favorite_id (used for DELETE). `kind` mirrors `food._source`.
type FavoriteRecord = {
  id: string;
  kind: 'public' | 'custom';
  food: FoodResult;
  created_at: string;
};

// Server-returned recent row hydrated with its food. `id` is the source
// entry_id (used only as a React key — recent rows aren't directly mutable).
type RecentRecord = {
  id: string;
  kind: 'public' | 'custom';
  food: FoodResult;
  created_at: string;
};

const CATEGORIES: { id: FoodCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'protein', label: 'Protein' },
  { id: 'grain', label: 'Grain' },
  { id: 'veg', label: 'Veg' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'fat', label: 'Fat' },
  { id: 'sweet', label: 'Sweet' },
  { id: 'drink', label: 'Drink' },
];

// 250ms debounce feels responsive without hammering the API on every keystroke.
const SEARCH_DEBOUNCE_MS = 250;

interface FoodSearchProps {
  meal: Meal;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}

/**
 * Build the dedupe key for a food across the favorites / recent / results
 * lists. Public and custom foods share id-namespaces separately, so prefix.
 */
function foodKey(food: Pick<FoodResult, 'id' | '_source'>): string {
  return `${food._source}:${food.id}`;
}

/**
 * v0.5.3 (#97) — every top-level flex/list wrapper now carries
 * `min-width: 0` + `max-width: 100%` so a wide food name (e.g.
 * "Babyfood, cereal, oatmeal, with fruit, dry instant") can't push the
 * card past the shell's 480px column. Food-name text uses
 * `overflow-wrap: anywhere` so it wraps mid-string on very narrow
 * viewports rather than triggering horizontal scroll.
 */
export function FoodSearch({
  meal,
  onSaved,
  onError,
  onSubscriptionRequired,
}: FoodSearchProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [results, setResults] = useState<FoodResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<FoodResult | null>(null);

  // Favorites + recent state. `favorites` maps foodKey → favorite_id so
  // toggling a star can DELETE by the row id without a second lookup.
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  // Foods being toggled RIGHT NOW — used to disable the star button so a
  // rapid double-tap doesn't fire two POSTs.
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());

  // Debounced fetch. AbortController keeps in-flight requests from racing
  // when the user types fast.
  const abortRef = useRef<AbortController | null>(null);
  const doFetch = useCallback(
    async (q: string, cat: FoodCategory | 'all') => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          include_custom: '1',
          limit: '30',
        });
        if (q.trim()) params.set('q', q.trim());
        if (cat !== 'all') params.set('category', cat);
        const res = await fetch(
          `/api/mini-apps/calorie-lite/foods?${params.toString()}`,
          { credentials: 'same-origin', signal: ac.signal },
        );
        if (!res.ok) {
          if (res.status === 402) onSubscriptionRequired();
          else if (res.status !== 401)
            onError('Could not load foods.');
          setResults([]);
          return;
        }
        const body = (await res.json()) as { foods: FoodResult[] };
        setResults(body.foods);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        onError('Network error.');
        setResults([]);
      } finally {
        // Only clear loading if this request wasn't superseded.
        if (abortRef.current === ac) setLoading(false);
      }
    },
    [onError, onSubscriptionRequired],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void doFetch(query, category);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, category, doFetch]);

  // Fetch favorites + recent in parallel on mount. Failure is silent (the
  // sections just don't render) — a missing "★ Favorites" strip should not
  // block a user from searching, so we don't hoist errors to the toast layer.
  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/favorites', {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const body = (await res.json()) as { favorites: FavoriteRecord[] };
      setFavorites(body.favorites ?? []);
    } catch {
      // Non-fatal.
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/recent-foods', {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const body = (await res.json()) as { recent: RecentRecord[] };
      setRecent(body.recent ?? []);
    } catch {
      // Non-fatal.
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
    void loadRecent();
  }, [loadFavorites, loadRecent]);

  // Fast lookup for "is this food favorited?" — indexed by foodKey so both
  // the row-level star and the chip-level presence check hit the same map.
  const favByKey = useMemo(() => {
    const m = new Map<string, FavoriteRecord>();
    for (const f of favorites) m.set(foodKey(f.food), f);
    return m;
  }, [favorites]);

  // Recent list, minus anything already in favorites — favorites row wins so
  // a favorited food never appears twice on the empty-query screen.
  const recentDeduped = useMemo(
    () => recent.filter((r) => !favByKey.has(foodKey(r.food))),
    [recent, favByKey],
  );

  const toggleFavorite = useCallback(
    async (food: FoodResult) => {
      const key = foodKey(food);
      if (togglingKeys.has(key)) return;
      setTogglingKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        const existing = favByKey.get(key);
        if (existing) {
          // Optimistic remove — snap the star back if the request fails.
          const snapshot = favorites;
          setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
          const res = await fetch(
            `/api/mini-apps/calorie-lite/favorites/${existing.id}`,
            { method: 'DELETE', credentials: 'same-origin' },
          );
          if (!res.ok) {
            setFavorites(snapshot);
            if (res.status === 402) onSubscriptionRequired();
            else if (res.status !== 401) onError('Could not unfavorite.');
          }
        } else {
          const body =
            food._source === 'custom'
              ? { custom_food_id: food.id }
              : { food_id: food.id };
          const res = await fetch('/api/mini-apps/calorie-lite/favorites', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            if (res.status === 402) onSubscriptionRequired();
            else if (res.status !== 401) onError('Could not favorite.');
            return;
          }
          const parsed = (await res.json()) as {
            favorite: { id: string; food_id: string | null; custom_food_id: string | null; created_at: string };
          };
          const newFav: FavoriteRecord = {
            id: parsed.favorite.id,
            kind: food._source,
            food,
            created_at: parsed.favorite.created_at,
          };
          // Prepend so the newest favorite appears first, matching the GET
          // ordering the next reload will produce.
          setFavorites((prev) => [newFav, ...prev.filter((f) => f.id !== newFav.id)]);
        }
      } catch {
        onError('Network error.');
      } finally {
        setTogglingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [favByKey, favorites, togglingKeys, onError, onSubscriptionRequired],
  );

  // When the picker is open we don't want the underlying results list to
  // shift around under it — freeze it in a portal-like conditional render.
  if (picked) {
    return (
      <QuantityPicker
        food={picked}
        meal={meal}
        onCancel={() => setPicked(null)}
        onSaved={async () => {
          // A save creates an entry — refresh recent so the just-logged food
          // pops to the front the next time the user opens Search.
          void loadRecent();
          await onSaved();
        }}
        onError={onError}
        onSubscriptionRequired={onSubscriptionRequired}
      />
    );
  }

  const showEmptyStateChips = query.trim() === '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search 500+ foods"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-body-sm)',
          letterSpacing: '0.04em',
        }}
        aria-label="Search foods"
      />

      {showEmptyStateChips && favorites.length > 0 && (
        <ChipStrip
          label="★ FAVORITES"
          items={favorites}
          onPick={setPicked}
        />
      )}

      {showEmptyStateChips && recentDeduped.length > 0 && (
        <ChipStrip
          label="↺ RECENT"
          items={recentDeduped}
          onPick={setPicked}
        />
      )}

      <div
        role="tablist"
        aria-label="Food categories"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          paddingBottom: 'var(--space-2)',
          maxWidth: '100%',
          scrollbarWidth: 'none',
        }}
      >
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(c.id)}
              style={{
                flex: '0 0 auto',
                background: active
                  ? 'var(--color-accent-subtle)'
                  : 'transparent',
                color: active
                  ? 'var(--color-text-display)'
                  : 'var(--color-text-secondary)',
                border: `1px solid ${
                  active
                    ? 'var(--color-accent)'
                    : 'var(--color-border-visible)'
                }`,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {loading && results === null ? (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          Loading…
        </p>
      ) : results && results.length === 0 ? (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          No foods match. Try a different search or create a custom food.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          {(results ?? []).map((f) => {
            const key = foodKey(f);
            return (
              <FoodRow
                key={key}
                food={f}
                onPick={setPicked}
                favorited={favByKey.has(key)}
                onToggleFavorite={toggleFavorite}
                toggling={togglingKeys.has(key)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Chip strip (favorites / recent) ────────────────────────────────────────
//
// A horizontal, scrollable row of tap-to-pick chips. We deliberately do NOT
// put a star toggle inside the chip — chips are already small and a
// secondary tap target would fight the primary "log this food" action.
// The star for a favorite lives on the full-width row (search results) where
// there is room to breathe. Removing a favorite is a one-swipe operation
// from Search: type its name → tap the ★. That parallels MFP.

function ChipStrip({
  label,
  items,
  onPick,
}: {
  label: string;
  items: Array<{ id: string; food: FoodResult }>;
  onPick: (f: FoodResult) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span
        className="label"
        style={{
          fontFamily: 'var(--font-label)',
          letterSpacing: '0.08em',
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
      </span>
      <div
        role="list"
        aria-label={label}
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          paddingBottom: 'var(--space-2)',
          // Bound the strip so it can scroll horizontally without pushing the
          // parent card past the shell's 480px column.
          maxWidth: '100%',
          scrollbarWidth: 'none',
        }}
      >
        {items.map((item) => {
          const f = item.food;
          const kcal = Math.round(Number(f.kcal));
          return (
            <button
              key={item.id}
              type="button"
              role="listitem"
              onClick={() => onPick(f)}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-2)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--color-border-visible)',
                borderRadius: 'var(--radius-compact)',
                padding: 'var(--space-2) var(--space-3)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                maxWidth: '18em',
              }}
              title={f.name}
            >
              <span
                style={{
                  fontSize: 'var(--text-body-sm)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '14em',
                }}
              >
                {f.name}
              </span>
              <span
                className="data"
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.04em',
                }}
              >
                {kcal.toLocaleString()} kcal
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Food row (with star toggle) ────────────────────────────────────────────

function FoodRow({
  food,
  onPick,
  favorited,
  onToggleFavorite,
  toggling,
}: {
  food: FoodResult;
  onPick: (f: FoodResult) => void;
  favorited: boolean;
  onToggleFavorite: (f: FoodResult) => void;
  toggling: boolean;
}) {
  const kcalPerServing = Math.round(Number(food.kcal));
  return (
    <li
      style={{
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'baseline',
        // Bound the row to the card — long food names wrap rather than
        // pushing the row past the shell's 480px column.
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() => onPick(food)}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 0,
          padding: 'var(--space-3) 0',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
          <span
            style={{
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-body)',
              // v0.5.3 (#97) — allow mid-string wrap for long USDA names.
              // Ellipsis stayed a footgun once we jumped from ~150 to ~500+
              // foods with names like "Babyfood, cereal, oatmeal, w/fruit".
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              lineHeight: 1.25,
            }}
          >
            {food.name}
            {food._source === 'custom' && (
              <span
                className="label"
                style={{
                  color: 'var(--color-accent)',
                  marginLeft: 'var(--space-2)',
                }}
              >
                MINE
              </span>
            )}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.04em',
            }}
          >
            {food.serving_label} · {macroPreview(food)}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite(food)}
        disabled={toggling}
        aria-label={favorited ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
        aria-pressed={favorited}
        title={favorited ? 'Unfavorite' : 'Favorite'}
        style={{
          background: 'transparent',
          border: 0,
          padding: 'var(--space-3) var(--space-2)',
          color: favorited ? 'var(--color-accent)' : 'var(--color-text-disabled)',
          fontSize: 'var(--text-body)',
          lineHeight: 1,
          cursor: toggling ? 'wait' : 'pointer',
          opacity: toggling ? 0.6 : 1,
        }}
      >
        {favorited ? '★' : '☆'}
      </button>
      <span
        className="data"
        style={{
          color: 'var(--color-text-display)',
          fontSize: 'var(--text-body)',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          paddingLeft: 'var(--space-2)',
        }}
      >
        {kcalPerServing.toLocaleString()}
        <span
          className="label"
          style={{
            color: 'var(--color-text-secondary)',
            marginLeft: 2,
          }}
        >
          kcal
        </span>
      </span>
    </li>
  );
}

// ─── Quantity picker ────────────────────────────────────────────────────────

function QuantityPicker({
  food,
  meal,
  onCancel,
  onSaved,
  onError,
  onSubscriptionRequired,
}: {
  food: FoodResult;
  meal: Meal;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<ServingUnit>('serving');
  const [saving, setSaving] = useState(false);

  const qtyN = Number(qty);
  const validQty = Number.isFinite(qtyN) && qtyN > 0;

  const preview = useMemo(
    () => computeEntryNutrition(food, validQty ? qtyN : 0, unit),
    [food, qtyN, unit, validQty],
  );

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!validQty || saving) return;
    setSaving(true);
    try {
      const nutrition = computeEntryNutrition(food, qtyN, unit);
      // Pick which FK column to populate based on the food source.
      const foodLink =
        food._source === 'custom'
          ? { custom_food_id: food.id }
          : { food_id: food.id };
      // raw_input carries the human-readable label for the today feed —
      // "Chicken breast · 1.5 serving" reads well and stays useful even if
      // the food row is later renamed or deleted.
      const rawInput = `${food.name} · ${qtyN} ${unit}`;
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meal,
          kcal: nutrition.kcal,
          raw_input: rawInput,
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g,
          fiber_g: nutrition.fiber_g,
          sugar_g: nutrition.sugar_g,
          sodium_mg: nutrition.sodium_mg,
          cholesterol_mg: nutrition.cholesterol_mg,
          ...foodLink,
          serving_qty: qtyN,
          serving_unit: unit,
        }),
      });
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status !== 401) {
          const body = await res.json().catch(() => null);
          const detail =
            body?.message || body?.hint || body?.details || body?.error;
          onError(detail ? `Could not save: ${detail}` : 'Could not save.');
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          {food._source === 'custom' ? 'MY FOOD' : 'FOOD'}
        </span>
        <span
          style={{
            color: 'var(--color-text-display)',
            fontSize: 'var(--text-subheading)',
          }}
        >
          {food.name}
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
          }}
        >
          1 {food.serving_label} · {macroPreview(food)} · {Math.round(Number(food.kcal))} kcal
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-3)',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            QUANTITY
          </span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            UNIT
          </span>
          <select
            className="input"
            value={unit}
            onChange={(e) => setUnit(e.target.value as ServingUnit)}
          >
            <option value="serving">serving</option>
            <option value="g">grams</option>
          </select>
        </label>
      </div>

      <div
        aria-label="Computed nutrition preview"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          TOTAL
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-display)',
            fontSize: 'var(--text-heading)',
            fontWeight: 700,
          }}
        >
          {preview.kcal.toLocaleString()}
          <span
            className="label"
            style={{
              color: 'var(--color-text-secondary)',
              marginLeft: 'var(--space-2)',
            }}
          >
            kcal
          </span>
        </span>
      </div>
      <span
        className="data"
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.04em',
          marginTop: 'calc(-1 * var(--space-2))',
        }}
      >
        P {Math.round(preview.protein_g)}g · C {Math.round(preview.carbs_g)}g · F {Math.round(preview.fat_g)}g
      </span>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="submit"
          disabled={!validQty || saving}
          style={{
            background: validQty && !saving ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: validQty && !saving ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: validQty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary"
          style={{
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </form>
  );
}
