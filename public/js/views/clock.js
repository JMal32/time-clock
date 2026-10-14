// The Clock tab: the big running clock, a card per project to clock in or
// out, and what you've finished today.

import { api } from "../api.js";
import { html } from "../html.js";
import { icon } from "../icons.js";
import { activeProjects, projectById, rememberEntries, settings, state } from "../state.js";
import { HOUR, formatClock, formatDuration, formatRelativeDay, formatTime, startOfDay, startOfWeek } from "../time.js";
import { entryRow, liveDuration, projectLabel, toast } from "../ui.js";

// A clock that has been running this long was probably left on by accident.
const LONG_SESSION_MS = 10 * HOUR;

let entries = []; // this week's entries, newest first

export async function load() {
  const weekStart = startOfWeek(new Date(), settings.weekStartsOn);
  ({ entries } = await api.listEntries({ from: weekStart.getTime() }));
  rememberEntries(entries);
}

export function render() {
  const now = Date.now();
  const todayStart = startOfDay(new Date(now)).getTime();
  const today = entries.filter((entry) => entry.startedAt >= todayStart);
  const finishedToday = today.filter((entry) => entry.endedAt !== null);
  const projects = activeProjects();

  return html`
    <h1 class="visually-hidden">Clock</h1>
    ${state.running ? runningHero(state.running, now) : idleHero(projects)}

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Today</div>
        <div class="stat-value">${liveDuration(today, now)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">This week</div>
        <div class="stat-value">${liveDuration(entries, now)}</div>
      </div>
    </div>

    <section class="section">
      <div class="section-head">
        <h2>Projects</h2>
        <button class="btn" data-action="new-project">${icon("plus")} New project</button>
      </div>
      ${projects.length === 0
        ? html`<p class="empty">
            Projects are the things you clock in to, like "eBay store". Add your first one to get started.
          </p>`
        : html`<ul class="project-grid">
            ${projects.map((project) => projectCard(project, today, now))}
          </ul>`}
    </section>

    ${projects.length > 0 &&
    html`
      <section class="section">
        <div class="section-head">
          <h2>Finished today</h2>
          <button class="btn" data-action="add-entry">${icon("plus")} Add entry</button>
        </div>
        ${finishedToday.length === 0
          ? html`<p class="empty">When you clock out, the entry shows up here.</p>`
          : html`<ul class="entries">
              ${finishedToday.map((entry) => entryRow(entry, now))}
            </ul>`}
      </section>
    `}
  `;
}

function idleHero(projects) {
  return html`
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">Clocked out</p>
        <p class="hero-timer is-idle">0:00:00</p>
        <p class="hero-hint">
          ${projects.length === 0
            ? "Add a project below to start tracking your time."
            : "Pick a project below to clock in."}
        </p>
      </div>
    </section>
  `;
}

// "9:02 AM" if the clock started today, otherwise with the day in front.
function sinceText(started, now) {
  const time = formatTime(started);
  const day = formatRelativeDay(started, new Date(now));
  if (day === "Today") return time;
  return `${day === "Yesterday" ? "yesterday" : day}, ${time}`;
}

function runningHero(running, now) {
  const project = projectById(running.projectId);
  const isLong = now - running.startedAt > LONG_SESSION_MS;

  return html`
    <section class="hero is-running" data-color="${project.color}">
      <div class="hero-main">
        <p class="eyebrow"><span class="pulse"></span>Clocked in</p>
        <p class="hero-project">${project.name}</p>
        <p class="hero-timer" data-live="clock" data-base="0">${formatClock(now - running.startedAt)}</p>
        <p class="hero-hint">
          Since ${sinceText(new Date(running.startedAt), now)}
          <button class="link" data-action="edit-entry" data-id="${running.id}">Change</button>
        </p>
      </div>
      <button class="btn btn-stop btn-large" data-action="clock-out">Clock out</button>

      ${isLong &&
      html`
        <p class="hero-warning">
          This clock has been running for over ${LONG_SESSION_MS / HOUR} hours. If you forgot to clock out,
          <button class="link" data-action="edit-entry" data-id="${running.id}">set the time you really stopped</button
          >.
        </p>
      `}

      <label class="hero-note">
        <span class="visually-hidden">Note for this entry</span>
        <input
          id="running-note"
          type="text"
          maxlength="500"
          autocomplete="off"
          placeholder="What are you working on? (optional)"
          value="${running.note}"
          data-action="save-note"
        />
      </label>
    </section>
  `;
}

function projectCard(project, today, now) {
  const mine = today.filter((entry) => entry.projectId === project.id);
  const isRunning = state.running?.projectId === project.id;

  let button;
  if (isRunning) {
    button = html`<button class="btn btn-stop" data-action="clock-out">Clock out</button>`;
  } else if (state.running) {
    button = html`<button
      class="btn"
      data-action="clock-in"
      data-id="${project.id}"
      title="Clocks you out of the current project and in to this one"
    >
      Switch to this
    </button>`;
  } else {
    button = html`<button class="btn btn-primary" data-action="clock-in" data-id="${project.id}">Clock in</button>`;
  }

  return html`
    <li class="project-card ${isRunning && "is-running"}" data-color="${project.color}">
      <div class="project-card-name">${projectLabel(project)}</div>
      <div class="project-card-today">
        ${mine.length === 0 ? "Nothing yet today" : html`${liveDuration(mine, now)} today`}
      </div>
      ${button}
    </li>
  `;
}

export const actions = {
  // Clocking in while another project is running switches to this one; the
  // server stops the old entry and starts the new one in a single step.
  "clock-in": (button) => api.clockIn(Number(button.dataset.id)),

  "clock-out": async () => {
    // Whatever is typed in the note box is saved along with the clock-out.
    const note = document.getElementById("running-note")?.value;
    const entry = await api.clockOut(note);
    const project = projectById(entry.projectId);
    toast(`Clocked out of ${project.name} after ${formatDuration(entry.endedAt - entry.startedAt)}.`);
  },

  // Runs when you leave the note box or press Enter in it.
  "save-note": async (input) => {
    const running = state.running;
    if (running) {
      await api.updateEntry(running.id, { note: input.value });
      running.note = input.value;
    }
    return false; // nothing else on screen changed, so there's no need to redraw
  },
};
