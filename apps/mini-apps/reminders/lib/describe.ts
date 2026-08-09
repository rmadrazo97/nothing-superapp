/**
 * describe — human-readable schedule chips.
 * Given a reminder, return the short label rendered under the title.
 */
import type { Reminder } from '@nothing/shared';

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(r: Reminder): string {
  switch (r.schedule_kind) {
    case 'once': {
      if (!r.schedule_at) return 'Once (unset)';
      const d = new Date(r.schedule_at);
      return `⏰ Once · ${d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    case 'daily':
      return `⏰ Daily ${r.schedule_time ?? ''}`.trim();
    case 'weekly': {
      const dow = (r.schedule_dow ?? []).map((d) => DOW_LABEL[d] ?? '?').join(',');
      return `◔ ${dow || '?'} ${r.schedule_time ?? ''}`.trim();
    }
    case 'monthly':
      return `◔ Day ${r.schedule_dom ?? '?'} ${r.schedule_time ?? ''}`.trim();
    case 'cron':
      return `⧗ cron · ${r.schedule_cron ?? ''}`;
    default:
      return '—';
  }
}

export function describeNextFire(r: Reminder): string | null {
  if (!r.next_fire_at) return null;
  const d = new Date(r.next_fire_at);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff < 0) return 'Due now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
}
