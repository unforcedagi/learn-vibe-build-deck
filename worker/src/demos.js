// Final demo sign-up: the pure parts (slot times, labels, the running order as
// text). The handlers live in index.js; the days come from semester.json via
// DEMO_DAYS in weeks.generated.js.

export const DEMO_SLOTS = 13;         // slots per day
export const DEMO_MINUTES = 10;       // each: about 6 to show, 4 for questions
export const DEMO_TITLE_MAX = 100;    // the one-line project title
export const DEMO_NAME_MAX = 80;      // a guest's name
export const TZ = 'America/Denver';

// "17:05" -> "5:05 PM". Pure clock math on the local start time, no time zone.
export function clockLabel(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// The start of slot `position` (1-based) on a day starting at `starts`, or null
// when the start time isn't set yet.
export function slotTime(starts, position) {
  if (!starts) return null;
  const [h, m] = starts.split(':').map(Number);
  return clockLabel(h * 60 + m + (position - 1) * DEMO_MINUTES);
}

// "2026-11-30" -> "Monday, November 30" (the date itself, never shifted by a zone).
export function dayLabel(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// Today's date in Denver, YYYY-MM-DD.
export function denverToday(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now));
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Classmate';
}

// The running order as plain text, for the instructor to read from.
// `days`: [{ date, starts, slots: [{ position, name, title, guest }] }], full names.
export function runningOrderText(days) {
  const lines = ['Final demos: running order', ''];
  for (const d of days) {
    const start = d.starts ? `starts ${slotTime(d.starts, 1)}` : 'time to be confirmed';
    lines.push(`${dayLabel(d.date)} · ${start}`);
    const byPos = new Map(d.slots.filter((s) => s.taken).map((s) => [s.position, s]));
    for (let p = 1; p <= DEMO_SLOTS; p++) {
      const s = byPos.get(p);
      const when = (slotTime(d.starts, p) || `slot ${p}`).padEnd(8);
      const who = s ? `${s.name}${s.guest ? ' (guest)' : ''}: ${s.title}` : '(open)';
      lines.push(`${String(p).padStart(2)}  ${when} ${who}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
