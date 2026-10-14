// The Reports tab: a chart of hours per day or per week, and a breakdown of
// where the time went by project.

import { api } from "../api.js";
import { chartTable, legend, stackedBarChart } from "../chart.js";
import { html } from "../html.js";
import { icon } from "../icons.js";
import { projectById, settings, state } from "../state.js";
import { earningsCents, totalByProject, totalDuration } from "../summary.js";
import { addDays, formatDateRange, formatDay, formatDuration, formatShortDay, formatWeekday, startOfWeek } from "../time.js";
import { formatMoney, projectLabel } from "../ui.js";

const WEEKS_SHOWN = 12;
const MAX_SERIES = 8; // the chart has eight colors; beyond that, the smallest projects share "Other"

let unit = "day"; // "day": one week with a bar per day. "week": twelve weeks with a bar per week.
let weekShown = null; // start of the newest week on screen; null means "follow the current week"
let figure = "chart"; // show the numbers as a "chart" or as a "table"
let entries = [];
let buckets = []; // the days or weeks on screen, oldest first: [{ start, end }]

const thisWeek = () => startOfWeek(new Date(), settings.weekStartsOn);

// The newest week on screen. It can never be later than the current week.
function newestWeek() {
  if (weekShown === null) return thisWeek();
  const week = startOfWeek(weekShown, settings.weekStartsOn);
  return week > thisWeek() ? thisWeek() : week;
}

// How many weeks the earlier/later arrows move.
const stepWeeks = () => (unit === "day" ? 1 : WEEKS_SHOWN);

export async function load() {
  const week = newestWeek();
  if (unit === "day") {
    buckets = Array.from({ length: 7 }, (_, day) => ({ start: addDays(week, day), end: addDays(week, day + 1) }));
  } else {
    buckets = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
      const start = addDays(week, -7 * (WEEKS_SHOWN - 1 - index));
      return { start, end: addDays(start, 7) };
    });
  }
  const from = buckets[0].start.getTime();
  const to = buckets.at(-1).end.getTime();
  ({ entries } = await api.listEntries({ from, to }));
}

// The projects that get their own color in the chart, in a fixed order so a
// project keeps its place in every bar. With more projects than colors, the
// smallest ones are combined into "Other".
function chartSeries(totals) {
  const used = state.projects.filter((project) => totals.get(project.id) > 0);
  const single = (project) => ({ name: project.name, color: project.color, projectIds: [project.id] });
  if (used.length <= MAX_SERIES) return used.map(single);

  const biggest = [...used].sort((a, b) => totals.get(b.id) - totals.get(a.id)).slice(0, MAX_SERIES - 1);
  const rest = used.filter((project) => !biggest.includes(project));
  return [
    ...used.filter((project) => biggest.includes(project)).map(single),
    { name: "Other", color: "other", projectIds: rest.map((project) => project.id) },
  ];
}

// One bar of the chart: the entries that started inside `bucket`, per series.
function toColumn(bucket, series, now) {
  const inBucket = entries.filter(
    (entry) => entry.startedAt >= bucket.start.getTime() && entry.startedAt < bucket.end.getTime(),
  );
  const totals = totalByProject(inBucket, now);
  const parts = series.map((item) => ({
    name: item.name,
    color: item.color,
    ms: item.projectIds.reduce((sum, id) => sum + (totals.get(id) ?? 0), 0),
  }));
  const byDay = unit === "day";
  return {
    label: byDay ? formatWeekday(bucket.start) : formatShortDay(bucket.start),
    sublabel: byDay ? String(bucket.start.getDate()) : "",
    title: byDay ? formatDay(bucket.start) : `Week of ${formatDateRange(bucket.start, bucket.end)}`,
    rowLabel: byDay ? formatDay(bucket.start) : formatDateRange(bucket.start, bucket.end),
    totalMs: parts.reduce((sum, part) => sum + part.ms, 0),
    parts,
  };
}

function periodLabel(isCurrent) {
  const dates = formatDateRange(buckets[0].start, buckets.at(-1).end);
  if (unit === "week") return { title: isCurrent ? `Last ${WEEKS_SHOWN} weeks` : `${WEEKS_SHOWN} weeks`, dates };
  if (isCurrent) return { title: "This week", dates };
  const isLastWeek = addDays(newestWeek(), 7).getTime() === thisWeek().getTime();
  return { title: isLastWeek ? "Last week" : "Week of", dates };
}

function pressable(action, value, label, current) {
  return html`<button data-action="${action}" data-value="${value}" aria-pressed="${current === value ? "true" : "false"}">
    ${label}
  </button>`;
}

export function render() {
  const now = Date.now();
  const totals = totalByProject(entries, now);
  const totalMs = totalDuration(entries, now);
  const series = chartSeries(totals);
  const columns = buckets.map((bucket) => toColumn(bucket, series, now));
  const isCurrent = newestWeek().getTime() === thisWeek().getTime();
  const period = periodLabel(isCurrent);

  // One row per project for the breakdown, biggest first.
  const rows = [...totals]
    .map(([projectId, ms]) => {
      const project = projectById(projectId);
      const rate = project.hourlyRateCents;
      return { project, ms, earned: rate === null ? null : earningsCents(ms, rate) };
    })
    .sort((a, b) => b.ms - a.ms);
  const hasRates = rows.some((row) => row.earned !== null);
  const earned = rows.reduce((sum, row) => sum + (row.earned ?? 0), 0);
  const worked = columns.filter((column) => column.totalMs > 0).length;

  return html`
    <div class="page-head">
      <h1>Reports</h1>
    </div>

    <div class="toolbar">
      <div class="segmented" role="group" aria-label="One bar per">
        ${pressable("report-unit", "day", "By day", unit)} ${pressable("report-unit", "week", "By week", unit)}
      </div>
      <div class="period">
        <button class="icon-btn" data-action="report-earlier" aria-label="Earlier" title="Earlier">
          ${icon("left")}
        </button>
        <div class="period-label"><strong>${period.title}</strong> <span>${period.dates}</span></div>
        <button
          class="icon-btn"
          data-action="report-later"
          aria-label="Later"
          title="Later"
          ${isCurrent ? "disabled" : ""}
        >
          ${icon("right")}
        </button>
      </div>
      ${!isCurrent && html`<button class="btn" data-action="report-now">Back to this week</button>`}
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total time</div>
        <div class="stat-value">${formatDuration(totalMs)}</div>
      </div>
      ${hasRates &&
      html`
        <div class="stat">
          <div class="stat-label">Earnings</div>
          <div class="stat-value">${formatMoney(earned)}</div>
        </div>
      `}
      <div class="stat">
        <div class="stat-label">${unit === "day" ? "Average per day worked" : "Average per week worked"}</div>
        <div class="stat-value">${worked === 0 ? "–" : formatDuration(totalMs / worked)}</div>
      </div>
    </div>

    <figure class="figure">
      <div class="figure-head">
        <figcaption>
          <h2>${unit === "day" ? "Hours per day" : "Hours per week"}</h2>
          ${series.length === 1 && html`<p class="hint">All of it on ${series[0].name}</p>`}
        </figcaption>
        <div class="segmented" role="group" aria-label="Show as">
          ${pressable("report-figure", "chart", "Chart", figure)} ${pressable("report-figure", "table", "Table", figure)}
        </div>
      </div>
      ${totalMs === 0
        ? html`<p class="empty">No time tracked in this period.</p>`
        : figure === "chart"
          ? html`${series.length > 1 && legend(series)} ${stackedBarChart(columns)}`
          : chartTable(columns, series, unit === "day" ? "Day" : "Week")}
    </figure>

    ${rows.length > 0 &&
    html`
      <section class="section">
        <div class="section-head"><h2>By project</h2></div>
        <ul class="breakdown">
          ${rows.map(
            (row) => html`
              <li>
                <div class="breakdown-name">${projectLabel(row.project)}</div>
                <div class="meter" data-color="${row.project.color}">
                  <span style="width: ${((row.ms / totalMs) * 100).toFixed(1)}%"></span>
                </div>
                <div class="breakdown-share">${Math.round((row.ms / totalMs) * 100)}%</div>
                <div class="breakdown-time">${formatDuration(row.ms)}</div>
                ${hasRates &&
                html`<div class="breakdown-earned">${row.earned === null ? "" : formatMoney(row.earned)}</div>`}
              </li>
            `,
          )}
        </ul>
      </section>
    `}
  `;
}

export const actions = {
  "report-unit": (button) => {
    unit = button.dataset.value;
  },
  "report-figure": (button) => {
    figure = button.dataset.value;
  },
  "report-earlier": () => {
    weekShown = addDays(newestWeek(), -7 * stepWeeks());
  },
  "report-later": () => {
    weekShown = addDays(newestWeek(), 7 * stepWeeks());
  },
  "report-now": () => {
    weekShown = null;
  },
};
