// Tests for the small calculation helpers the browser uses. They are plain
// functions with no page attached, so they can be run here in Node as well.

import assert from "node:assert/strict";
import test from "node:test";
import { niceScale } from "../public/js/chart.js";
import { entriesToCsv, toCsv } from "../public/js/csv.js";
import { html, raw } from "../public/js/html.js";
import { durationOf, earningsCents, groupEntries, totalByProject, totalDuration } from "../public/js/summary.js";
import {
  HOUR,
  MINUTE,
  SECOND,
  addDays,
  formatClock,
  formatDuration,
  formatHoursShort,
  fromInputValue,
  startOfDay,
  startOfWeek,
  toInputValue,
} from "../public/js/time.js";

// Tuesday, October 13, 2026 at 2:30 PM, in whatever time zone the tests run in.
const TUESDAY = new Date(2026, 9, 13, 14, 30);
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test("durations are written the way a person would say them", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45 * SECOND), "45s");
  assert.equal(formatDuration(59 * MINUTE + 59 * SECOND), "59m");
  assert.equal(formatDuration(2 * HOUR + 5 * MINUTE), "2h 05m");
  assert.equal(formatDuration(26 * HOUR), "26h 00m");

  assert.equal(formatClock(0), "0:00:00");
  assert.equal(formatClock(HOUR + 23 * MINUTE + 45 * SECOND + 999), "1:23:45");
  assert.equal(formatClock(100 * HOUR), "100:00:00");

  assert.equal(formatHoursShort(45 * MINUTE), "45m");
  assert.equal(formatHoursShort(5.5 * HOUR), "5.5h");
  assert.equal(formatHoursShort(12 * HOUR), "12h");
});

test("weeks can start on Monday or on Sunday", () => {
  assert.deepEqual(startOfDay(TUESDAY), new Date(2026, 9, 13));
  assert.deepEqual(startOfWeek(TUESDAY, 1), new Date(2026, 9, 12)); // Monday
  assert.deepEqual(startOfWeek(TUESDAY, 0), new Date(2026, 9, 11)); // Sunday

  // A day that is itself the first day of the week stays put.
  assert.deepEqual(startOfWeek(new Date(2026, 9, 12, 23, 59), 1), new Date(2026, 9, 12));
  assert.deepEqual(startOfWeek(new Date(2026, 9, 11, 8), 1), new Date(2026, 9, 5)); // Sunday, Monday weeks

  assert.deepEqual(addDays(TUESDAY, -14), new Date(2026, 8, 29)); // crosses into September
});

test("date-time form fields convert to and from timestamps", () => {
  assert.equal(toInputValue(at(3, 9, 5)), "2026-10-03T09:05");
  assert.equal(fromInputValue("2026-10-03T09:05"), at(3, 9, 5));
  assert.equal(fromInputValue(""), null);
});

test("an entry's length runs up to now while its clock is still running", () => {
  const finished = { projectId: 1, startedAt: at(13, 9), endedAt: at(13, 11) };
  const running = { projectId: 1, startedAt: at(13, 14), endedAt: null };

  assert.equal(durationOf(finished, TUESDAY.getTime()), 2 * HOUR);
  assert.equal(durationOf(running, TUESDAY.getTime()), 30 * MINUTE);
  assert.equal(totalDuration([finished, running], TUESDAY.getTime()), 2 * HOUR + 30 * MINUTE);
});

test("totals are added up per project", () => {
  const entries = [
    { projectId: 1, startedAt: at(13, 9), endedAt: at(13, 11) },
    { projectId: 2, startedAt: at(13, 12), endedAt: at(13, 12, 45) },
    { projectId: 1, startedAt: at(12, 9), endedAt: at(12, 10) },
  ];
  assert.deepEqual([...totalByProject(entries, 0)], [
    [1, 3 * HOUR],
    [2, 45 * MINUTE],
  ]);
});

test("entries are grouped by the day or week they started in, newest first", () => {
  const overnight = { id: 1, projectId: 1, startedAt: at(12, 23), endedAt: at(13, 1) }; // Monday into Tuesday
  const tuesday = { id: 2, projectId: 1, startedAt: at(13, 9), endedAt: at(13, 10) };
  const sunday = { id: 3, projectId: 1, startedAt: at(11, 9), endedAt: at(11, 10) };
  const entries = [tuesday, overnight, sunday]; // newest first, as the server sends them

  const byDay = groupEntries(entries, "day", 1);
  assert.deepEqual(
    byDay.map((group) => [group.start, group.entries.map((entry) => entry.id)]),
    [
      [new Date(2026, 9, 13), [2]],
      [new Date(2026, 9, 12), [1]], // the overnight entry counts for the day it started
      [new Date(2026, 9, 11), [3]],
    ],
  );

  // With weeks starting Monday, Sunday the 11th belongs to the week before.
  const mondayWeeks = groupEntries(entries, "week", 1);
  assert.deepEqual(
    mondayWeeks.map((group) => [group.start, group.entries.map((entry) => entry.id)]),
    [
      [new Date(2026, 9, 12), [2, 1]],
      [new Date(2026, 9, 5), [3]],
    ],
  );

  // With weeks starting Sunday, all three fall in the same week.
  const sundayWeeks = groupEntries(entries, "week", 0);
  assert.equal(sundayWeeks.length, 1);
  assert.deepEqual(sundayWeeks[0].start, new Date(2026, 9, 11));
});

test("earnings are hours times the hourly rate, rounded to the cent", () => {
  assert.equal(earningsCents(2 * HOUR, 2000), 4000);
  assert.equal(earningsCents(90 * MINUTE, 2250), 3375);
  assert.equal(earningsCents(20 * MINUTE, 2000), 667); // $6.666... rounds to $6.67
});

test("CSV values with commas, quotes or line breaks are quoted", () => {
  assert.equal(toCsv([["a", "b,c", 'say "hi"', "two\nlines", null]]), 'a,"b,c","say ""hi""","two\nlines",\r\n');
});

test("entries export to CSV with hours and earnings", () => {
  const projects = {
    1: { name: "eBay store", hourlyRateCents: 2000 },
    2: { name: "Coursework", hourlyRateCents: null },
  };
  const csv = entriesToCsv(
    [
      { projectId: 1, startedAt: at(13, 9), endedAt: at(13, 10, 30), note: "Listed 12 items, shipped 3" },
      { projectId: 2, startedAt: at(13, 23), endedAt: at(14, 0, 15), note: "" },
    ],
    (id) => projects[id],
  );

  assert.deepEqual(csv.split("\r\n"), [
    "Project,Start,End,Hours,Hourly rate,Earnings,Note",
    'eBay store,2026-10-13 09:00,2026-10-13 10:30,1.50,20.00,30.00,"Listed 12 items, shipped 3"',
    "Coursework,2026-10-13 23:00,2026-10-14 00:15,1.25,,,",
    "",
  ]);
});

test("the html helper escapes everything it is given", () => {
  const note = `<img src=x onerror="alert('hi')">`;
  assert.equal(
    String(html`<p title="${note}">${note}</p>`),
    '<p title="&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;">' +
      "&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;</p>",
  );

  // Nested templates, lists and trusted markup pass through; false and null print nothing.
  const items = ["a & b", "c"];
  assert.equal(
    String(html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>${false}${null}${raw("<hr>")}${0}`),
    "<ul><li>a &amp; b</li><li>c</li></ul><hr>0",
  );
});

test("the chart axis uses round numbers that reach past the tallest bar", () => {
  const hours = (scale) => scale.ticks.map((tick) => tick / HOUR);

  assert.deepEqual(hours(niceScale(0)), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(hours(niceScale(3.2 * HOUR)), [0, 1, 2, 3, 4]);
  assert.deepEqual(hours(niceScale(7.5 * HOUR)), [0, 2, 4, 6, 8]);
  assert.deepEqual(hours(niceScale(31 * HOUR)), [0, 10, 20, 30, 40]);
  assert.equal(niceScale(31 * HOUR).max, 40 * HOUR);
});
