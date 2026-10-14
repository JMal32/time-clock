// Turns entries into CSV text that opens in Excel, Numbers or Google Sheets.

import { earningsCents } from "./summary.js";
import { HOUR } from "./time.js";

const pad = (number) => String(number).padStart(2, "0");

// "2026-10-13 09:05", a form every spreadsheet reads as a date and time.
function stamp(ms) {
  const date = new Date(ms);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// A value containing a comma, quote or line break has to be wrapped in quotes,
// with any quotes inside it doubled.
function cell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

const dollars = (cents) => (cents / 100).toFixed(2);

// `entries` must all be finished. `projectById` looks a project up from its id.
export function entriesToCsv(entries, projectById) {
  const rows = [["Project", "Start", "End", "Hours", "Hourly rate", "Earnings", "Note"]];
  for (const entry of entries) {
    const project = projectById(entry.projectId);
    const ms = entry.endedAt - entry.startedAt;
    const rate = project.hourlyRateCents;
    rows.push([
      project.name,
      stamp(entry.startedAt),
      stamp(entry.endedAt),
      (ms / HOUR).toFixed(2),
      rate === null ? "" : dollars(rate),
      rate === null ? "" : dollars(earningsCents(ms, rate)),
      entry.note,
    ]);
  }
  return toCsv(rows);
}
