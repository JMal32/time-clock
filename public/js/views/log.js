// The Log tab: every entry, newest first, grouped by day or by week, with
// totals per group and per project.

import { api } from "../api.js";
import { entriesToCsv } from "../csv.js";
import { html } from "../html.js";
import { icon } from "../icons.js";
import { projectById, rememberEntries, settings, state } from "../state.js";
import { groupEntries, totalByProject } from "../summary.js";
import { DAY, addDays, dayKey, formatDateRange, formatDay, formatRelativeDay, startOfWeek } from "../time.js";
import { downloadFile, earningsFor, entryRow, formatMoney, liveDuration, projectLabel, toast } from "../ui.js";

const WEEKS_PER_PAGE = 4;

let unit = "day"; // group the list by "day" or by "week"
let projectFilter = null; // a project id, or null to show every project
let from = null; // the list shows entries from this moment on; always the start of a week
let entries = [];
let previousStart = null; // when the newest entry older than `from` started, or null if none

export async function load() {
  const { weekStartsOn } = settings;
  if (projectFilter !== null && !projectById(projectFilter)) projectFilter = null; // that project was deleted

  // Start with the last few weeks. Snapping to the start of a week means a
  // week is never shown half loaded, which would make its total wrong.
  const thisWeek = startOfWeek(new Date(), weekStartsOn);
  const earliest = from === null ? addDays(thisWeek, -7 * (WEEKS_PER_PAGE - 1)) : new Date(from);
  from = startOfWeek(earliest, weekStartsOn).getTime();

  ({ entries, previousStart } = await api.listEntries({ from, projectId: projectFilter }));
  rememberEntries(entries);
}

export function render() {
  const now = Date.now();
  const groups = groupEntries(entries, unit, settings.weekStartsOn);

  return html`
    <div class="page-head">
      <h1>Log</h1>
      <div class="page-actions">
        <button class="btn" data-action="export-csv">${icon("download")} Export CSV</button>
        <button class="btn btn-primary" data-action="add-entry">${icon("plus")} Add entry</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Group entries by">
        ${unitButton("day", "Days")} ${unitButton("week", "Weeks")}
      </div>
      <label class="inline-field">
        <span>Project</span>
        <select data-action="log-filter">
          <option value="">All projects</option>
          ${state.projects.map(
            (project) =>
              html`<option value="${project.id}" ${project.id === projectFilter ? "selected" : ""}>
                ${project.name}
              </option>`,
          )}
        </select>
      </label>
    </div>

    ${groups.length === 0
      ? html`<p class="empty">
          ${previousStart === null
            ? "No entries yet. Clock in from the Clock tab, or add one by hand."
            : "Nothing in these weeks."}
        </p>`
      : groups.map((group) => groupSection(group, now))}

    <div class="log-more">
      ${previousStart !== null && html`<button class="btn" data-action="log-older">Show older entries</button>`}
      ${previousStart === null && groups.length > 0 && html`<p class="hint">That's everything.</p>`}
    </div>
  `;
}

function unitButton(value, label) {
  return html`<button data-action="log-unit" data-value="${value}" aria-pressed="${unit === value ? "true" : "false"}">
    ${label}
  </button>`;
}

// The words above a group: "Today" + its date, "This week" + its dates, and so on.
function heading(start) {
  const today = new Date();
  if (unit === "day") {
    const title = formatRelativeDay(start, today);
    const date = formatDay(start);
    return { title, detail: title === date ? "" : date };
  }
  const dates = formatDateRange(start, addDays(start, 7));
  const weeksAgo = Math.round((startOfWeek(today, settings.weekStartsOn) - start) / (7 * DAY));
  if (weeksAgo === 0) return { title: "This week", detail: dates };
  if (weeksAgo === 1) return { title: "Last week", detail: dates };
  return { title: dates, detail: "" };
}

function groupSection(group, now) {
  const { title, detail } = heading(group.start);
  const totals = totalByProject(group.entries, now);
  const earned = earningsFor(totals);
  const biggestFirst = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));

  return html`
    <section class="group">
      <header class="group-head">
        <h2>${title}</h2>
        ${detail && html`<span class="group-detail">${detail}</span>`}
        <span class="group-total">
          ${earned > 0 && html`<span class="group-earned">${formatMoney(earned)}</span>`}
          <strong>${liveDuration(group.entries, now)}</strong>
        </span>
      </header>

      ${totals.size > 1 &&
      html`
        <ul class="chips">
          ${biggestFirst.map((projectId) => {
            const mine = group.entries.filter((entry) => entry.projectId === projectId);
            return html`<li>${projectLabel(projectById(projectId))} <span>${liveDuration(mine, now)}</span></li>`;
          })}
        </ul>
      `}

      <ul class="entries">
        ${group.entries.map((entry) => entryRow(entry, now, { showDate: unit === "week" }))}
      </ul>
    </section>
  `;
}

export const actions = {
  "log-unit": (button) => {
    unit = button.dataset.value;
  },

  "log-filter": (select) => {
    projectFilter = select.value === "" ? null : Number(select.value);
  },

  // Goes back another few weeks, or straight to the next older entry if
  // there's a long gap with nothing in it.
  "log-older": () => {
    const page = addDays(new Date(from), -7 * WEEKS_PER_PAGE).getTime();
    from = Math.min(page, previousStart);
  },

  // Exports every finished entry (for the chosen project, if one is selected).
  "export-csv": async () => {
    const all = await api.listEntries({ projectId: projectFilter });
    const finished = all.entries.filter((entry) => entry.endedAt !== null).reverse(); // oldest first
    if (finished.length === 0) {
      toast("There's nothing to export yet.");
      return false;
    }
    // The first character tells Excel the file is UTF-8, so accents and emoji survive.
    const csv = "﻿" + entriesToCsv(finished, projectById);
    downloadFile(`time-clock-${dayKey(new Date())}.csv`, csv, "text/csv");
    toast(`Exported ${finished.length} ${finished.length === 1 ? "entry" : "entries"}.`);
    return false;
  },
};
