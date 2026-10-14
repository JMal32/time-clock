// Small pieces of interface that more than one view uses.

import { html } from "./html.js";
import { icon } from "./icons.js";
import { projectById } from "./state.js";
import { durationOf, earningsCents, totalDuration } from "./summary.js";
import { formatDay, formatDuration, formatTime, formatTimeRange } from "./time.js";

const moneyFormat = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
export const formatMoney = (cents) => moneyFormat.format(cents / 100);

// A project's colored dot followed by its name.
export function projectLabel(project) {
  return html`<span class="project-label"
    ><span class="dot" data-color="${project.color}"></span
    ><span class="project-name">${project.name}</span></span
  >`;
}

// The total time of some entries. If one of them is the running clock, the
// number is wrapped in a [data-live] element: `data-base` holds the finished
// time, and app.js adds the running time to it every second.
export function liveDuration(entries, now) {
  const running = entries.find((entry) => entry.endedAt === null);
  if (!running) return html`${formatDuration(totalDuration(entries, now))}`;

  const finished = totalDuration(entries, now) - durationOf(running, now);
  return html`<span data-live="duration" data-base="${finished}"
    >${formatDuration(finished + durationOf(running, now))}</span
  >`;
}

// One line in a list of entries.
export function entryRow(entry, now, { showDate = false } = {}) {
  const project = projectById(entry.projectId);
  const start = new Date(entry.startedAt);
  const when =
    entry.endedAt === null ? `${formatTime(start)} – now` : formatTimeRange(start, new Date(entry.endedAt));

  return html`
    <li class="entry">
      <div class="entry-project">${projectLabel(project)}</div>
      <div class="entry-note">${entry.note}</div>
      <div class="entry-when">
        ${showDate && html`<span class="entry-date">${formatDay(start)}</span>`}
        <span>${when}</span>
      </div>
      <div class="entry-duration">${liveDuration([entry], now)}</div>
      <div class="entry-actions">
        <button class="icon-btn" data-action="edit-entry" data-id="${entry.id}" aria-label="Edit entry" title="Edit">
          ${icon("edit")}
        </button>
        <button
          class="icon-btn"
          data-action="delete-entry"
          data-id="${entry.id}"
          aria-label="Delete entry"
          title="Delete"
        >
          ${icon("trash")}
        </button>
      </div>
    </li>
  `;
}

// What a set of per-project totals (a Map of project id to milliseconds) is
// worth, counting only the projects that have an hourly rate.
export function earningsFor(totals) {
  let cents = 0;
  for (const [projectId, ms] of totals) {
    const rate = projectById(projectId)?.hourlyRateCents;
    if (rate) cents += earningsCents(ms, rate);
  }
  return cents;
}

// A short message that slides in at the bottom of the screen and goes away.
export function toast(message, kind = "info") {
  const container = document.getElementById("toasts");
  // If the same message is already showing, replace it instead of stacking a copy.
  for (const existing of [...container.children]) {
    if (existing.textContent === message) existing.remove();
  }

  const element = document.createElement("div");
  element.className = `toast toast-${kind}`;
  element.textContent = message;
  container.append(element);
  setTimeout(() => element.remove(), 5000);
}

// Makes the browser save `text` as a file.
export function downloadFile(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
