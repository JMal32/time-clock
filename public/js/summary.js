// Adds entries up: how long each one lasted, totals per project, and which day
// or week each one belongs to. Nothing in here touches the page or the server.
//
// One rule runs through all of it: an entry belongs to the day (and week) it
// STARTED in, even if it ran past midnight.

import { HOUR, startOfDay, startOfWeek } from "./time.js";

// How long an entry lasted. A running entry (no end yet) is measured up to `now`.
export function durationOf(entry, now) {
  return (entry.endedAt ?? now) - entry.startedAt;
}

export function totalDuration(entries, now) {
  return entries.reduce((total, entry) => total + durationOf(entry, now), 0);
}

// A Map from project id to the total time spent on that project.
export function totalByProject(entries, now) {
  const totals = new Map();
  for (const entry of entries) {
    totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + durationOf(entry, now));
  }
  return totals;
}

// Splits entries into days or weeks, newest group first. Entries keep the
// order they arrived in.
export function groupEntries(entries, unit, weekStartsOn) {
  const groups = new Map();
  for (const entry of entries) {
    const started = new Date(entry.startedAt);
    const start = unit === "week" ? startOfWeek(started, weekStartsOn) : startOfDay(started);
    const key = start.getTime();
    if (!groups.has(key)) groups.set(key, { start, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => b.start - a.start);
}

// What a stretch of time is worth at an hourly rate, in cents.
export function earningsCents(ms, hourlyRateCents) {
  return Math.round((ms / HOUR) * hourlyRateCents);
}
