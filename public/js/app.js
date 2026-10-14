// The starting point in the browser. It decides which tab is showing, runs
// the action behind every button, redraws the page after each change, and
// keeps the running clock ticking.

import { actions as sharedActions } from "./actions.js";
import { ApiError } from "./api.js";
import { initChartTooltips } from "./chart.js";
import { initDialogs } from "./dialogs.js";
import { html } from "./html.js";
import { loadShared, projectById, settings, state } from "./state.js";
import { dayKey, formatClock, formatDuration } from "./time.js";
import { toast } from "./ui.js";
import * as clock from "./views/clock.js";
import * as log from "./views/log.js";
import * as projects from "./views/projects.js";
import * as reports from "./views/reports.js";

// Each tab is a "view": a file with load() to fetch what it needs, render() to
// produce its HTML, and the actions its buttons can trigger.
const views = { clock, log, reports, projects };

const actions = {
  ...sharedActions,
  ...clock.actions,
  ...log.actions,
  ...reports.actions,
  ...projects.actions,
  "week-start": (select) => {
    settings.weekStartsOn = Number(select.value);
  },
  retry: () => {},
};

const root = document.getElementById("view");

// The tab comes from the end of the address: /#log shows the Log tab.
function currentTab() {
  const name = location.hash.slice(1);
  return Object.hasOwn(views, name) ? name : "clock";
}

// ---------- Drawing the page ----------

let latestRefresh = 0;

// Fetches fresh data from the server and redraws the current tab. This runs
// after every action, so what you see always matches the database.
async function refresh({ quiet = false } = {}) {
  const ticket = ++latestRefresh;
  const tab = currentTab();
  const view = views[tab];

  try {
    await loadShared();
    await view.load();
  } catch (error) {
    if (ticket === latestRefresh) showLoadError(error, quiet);
    return;
  }
  if (ticket !== latestRefresh) return; // a newer refresh started meanwhile; let that one draw

  const focused = focusedControl();
  root.innerHTML = view.render();
  if (focused) root.querySelector(focused)?.focus();

  updateHeader(tab);
  tick();
}

function showLoadError(error, quiet) {
  const message = error instanceof ApiError ? error.message : "Something went wrong while loading.";
  if (!(error instanceof ApiError)) console.error(error);

  if (root.childElementCount === 0) {
    // Nothing has been drawn yet, so say what's wrong where the page would be.
    root.innerHTML = html`
      <div class="empty">
        <p>${message}</p>
        <button class="btn" data-action="retry">Try again</button>
      </div>
    `;
  } else if (!quiet) {
    toast(message, "error"); // keep showing the last good page
  }
}

// Redrawing replaces every element, which would drop keyboard focus. This
// works out how to find the focused button again in the new page.
function focusedControl() {
  const element = document.activeElement;
  if (!root.contains(element) || !element.dataset.action) return null;
  let selector = `[data-action="${CSS.escape(element.dataset.action)}"]`;
  if (element.dataset.id) selector += `[data-id="${CSS.escape(element.dataset.id)}"]`;
  if (element.dataset.value) selector += `[data-value="${CSS.escape(element.dataset.value)}"]`;
  return selector;
}

// Highlights the current tab and, away from the Clock tab, shows a small
// reminder in the header that the clock is running.
function updateHeader(tab) {
  for (const link of document.querySelectorAll(".tabs a")) {
    if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  const pill = document.getElementById("running-pill");
  const project = state.running && projectById(state.running.projectId);
  pill.hidden = !project || tab === "clock";
  if (project) {
    pill.dataset.color = project.color;
    document.getElementById("running-pill-name").textContent = project.name;
  }
}

// ---------- The ticking clock ----------

let lastDay = dayKey(new Date());

// Runs every second. Elements marked [data-live] hold a finished amount of
// time in data-base; the time on the running clock is added on top.
function tick() {
  const elapsed = state.running ? Date.now() - state.running.startedAt : 0;
  for (const element of document.querySelectorAll("[data-live]")) {
    const ms = Number(element.dataset.base) + elapsed;
    element.textContent = element.dataset.live === "clock" ? formatClock(ms) : formatDuration(ms);
  }

  const project = state.running && projectById(state.running.projectId);
  document.title = project ? `${formatClock(elapsed)} · ${project.name}` : "Time Clock";

  // At midnight "today" becomes a different day, so redraw.
  const today = dayKey(new Date());
  if (today !== lastDay) {
    lastDay = today;
    if (!isEditing()) refresh({ quiet: true });
  }
}

// True while a dialog is open or a field has focus; redrawing then would
// throw away what is being typed.
function isEditing() {
  const focused = document.activeElement;
  return document.querySelector("dialog[open]") !== null || Boolean(focused?.matches("input, select, textarea"));
}

// ---------- Running actions ----------

// Runs the action named by an element's data-action, then refreshes the page.
// An action returns false to say "nothing changed, no need to refresh".
async function run(element) {
  const action = actions[element.dataset.action];
  if (!action || element.dataset.busy) return;

  element.dataset.busy = "true"; // ignore double clicks while this one is in progress
  let result;
  try {
    result = await action(element);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    toast(error instanceof ApiError ? error.message : "Something went wrong.", "error");
  } finally {
    delete element.dataset.busy;
  }
  if (result !== false) await refresh();
}

// One listener for every button on the page, including ones drawn later.
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) run(button);
});

// Dropdowns and text boxes run their action when their value changes.
document.addEventListener("change", (event) => {
  if (event.target.matches("select[data-action], input[data-action]")) run(event.target);
});

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  refresh();
});

// Coming back to this browser tab: catch up with anything that changed elsewhere.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !isEditing()) refresh({ quiet: true });
});

// ---------- Start ----------

initDialogs();
initChartTooltips();
document.getElementById("week-start").value = String(settings.weekStartsOn);
setInterval(tick, 1000);
refresh();
