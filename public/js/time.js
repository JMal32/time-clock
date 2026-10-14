// Date and duration helpers. Times are stored as milliseconds since 1970 (what
// Date.now() returns) and only turned into days, weeks and text here, in the
// browser, so everything is shown in your own time zone.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (number) => String(number).padStart(2, "0");

// ---------- Calendar math ----------

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Midnight at the start of the day `days` away from the given date.
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// weekStartsOn: 0 for Sunday, 1 for Monday.
export function startOfWeek(date, weekStartsOn) {
  const daysIntoWeek = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -daysIntoWeek);
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// ---------- Durations ----------

// "2h 05m", "45m", or "30s" for anything under a minute.
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND));
  if (totalSeconds === 0) return "0m";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${pad(minutes)}m`;
}

// "1:23:45", for the running clock.
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}`;
}

// A compact form for chart labels: "45m", "5.5h", "12h".
export function formatHoursShort(ms) {
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  return `${Number((ms / HOUR).toFixed(1))}h`;
}

// ---------- Dates and times as text ----------

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const shortDayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const shortDayYearFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const dayYearFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const isThisYear = (date) => date.getFullYear() === new Date().getFullYear();

export const formatTime = (date) => timeFormat.format(date); // "9:00 AM"
export const formatWeekday = (date) => weekdayFormat.format(date); // "Tue"
export const formatShortDay = (date) => shortDayFormat.format(date); // "Oct 13"

// "Tue, Oct 13", with the year added when it isn't this year.
export function formatDay(date) {
  return (isThisYear(date) ? dayFormat : dayYearFormat).format(date);
}

// "Today", "Yesterday", or the date.
export function formatRelativeDay(date, today = new Date()) {
  const daysAgo = Math.round((startOfDay(today) - startOfDay(date)) / DAY);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return formatDay(date);
}

// "9:00 – 11:30 AM". If the end falls on a later day, its date is spelled out.
export function formatTimeRange(start, end) {
  if (isSameDay(start, end)) return timeFormat.formatRange(start, end);
  return `${formatTime(start)} – ${formatShortDay(end)}, ${formatTime(end)}`;
}

// "Oct 12 – 18" for the days from `start` up to, but not including, `end`.
export function formatDateRange(start, end) {
  const lastDay = addDays(end, -1);
  const format = isThisYear(start) && isThisYear(lastDay) ? shortDayFormat : shortDayYearFormat;
  return format.formatRange(start, lastDay);
}

// ---------- Form fields ----------

// The text format <input type="datetime-local"> uses: "2026-10-13T09:05".
export function toInputValue(ms) {
  const date = new Date(ms);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromInputValue(value) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// "2026-10-13", used in file names.
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
