/**
 * gym-routine API client — thin fetch wrappers over the auth+entitlement-gated
 * server routes under `/api/mini-apps/gym-routine/*`.
 *
 * All requests use `credentials: 'same-origin'` so the Supabase session
 * cookie rides along. Non-2xx responses throw an ApiError whose `.status`
 * lets callers branch on 401 (re-auth) vs 402 (paywall) vs everything else.
 */
import type {
  Exercise,
  BodyPart,
  WorkoutRoutine,
  WorkoutRoutineInsert,
  WorkoutRoutineUpdate,
  WorkoutSession,
  WorkoutSessionInsert,
  WorkoutSessionUpdate,
} from '@nothing/shared';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const opts: RequestInit = {
    credentials: 'same-origin',
    ...init,
  };
  if (init?.json !== undefined) {
    opts.method = opts.method ?? 'POST';
    opts.headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
    opts.body = JSON.stringify(init.json);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // response was not JSON — leave the statusText message
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

// ─── Exercises ─────────────────────────────────────────────────────────────

export type ExerciseListParams = {
  body_part?: BodyPart;
  target?: string;
  equipment?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function listExercises(
  params: ExerciseListParams = {},
): Promise<{ exercises: Exercise[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.body_part) qs.set('body_part', params.body_part);
  if (params.target) qs.set('target', params.target);
  if (params.equipment) qs.set('equipment', params.equipment);
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/api/mini-apps/gym-routine/exercises${suffix}`);
}

export async function getExercise(id: string): Promise<{ exercise: Exercise }> {
  return req(`/api/mini-apps/gym-routine/exercises/${encodeURIComponent(id)}`);
}

// ─── Routines ──────────────────────────────────────────────────────────────

export async function listRoutines(): Promise<{ routines: WorkoutRoutine[] }> {
  return req(`/api/mini-apps/gym-routine/routines`);
}

export async function createRoutine(
  body: WorkoutRoutineInsert,
): Promise<{ routine: WorkoutRoutine }> {
  return req(`/api/mini-apps/gym-routine/routines`, { method: 'POST', json: body });
}

export async function getRoutine(id: string): Promise<{ routine: WorkoutRoutine }> {
  return req(`/api/mini-apps/gym-routine/routines/${id}`);
}

export async function updateRoutine(
  id: string,
  body: WorkoutRoutineUpdate,
): Promise<{ routine: WorkoutRoutine }> {
  return req(`/api/mini-apps/gym-routine/routines/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export async function deleteRoutine(id: string): Promise<{ ok: true }> {
  return req(`/api/mini-apps/gym-routine/routines/${id}`, { method: 'DELETE' });
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export async function listSessions(
  limit = 30,
): Promise<{ sessions: WorkoutSession[] }> {
  return req(`/api/mini-apps/gym-routine/sessions?limit=${limit}`);
}

export async function createSession(
  body: WorkoutSessionInsert,
): Promise<{ session: WorkoutSession }> {
  return req(`/api/mini-apps/gym-routine/sessions`, { method: 'POST', json: body });
}

export async function getSession(id: string): Promise<{ session: WorkoutSession }> {
  return req(`/api/mini-apps/gym-routine/sessions/${id}`);
}

export async function updateSession(
  id: string,
  body: WorkoutSessionUpdate,
): Promise<{ session: WorkoutSession }> {
  return req(`/api/mini-apps/gym-routine/sessions/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export async function deleteSession(id: string): Promise<{ ok: true }> {
  return req(`/api/mini-apps/gym-routine/sessions/${id}`, { method: 'DELETE' });
}

export async function getLiveSession(): Promise<{ session: WorkoutSession | null }> {
  return req(`/api/mini-apps/gym-routine/sessions/live`);
}
