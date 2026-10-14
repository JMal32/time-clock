// The pop-up forms: add/edit an entry, add/edit a project, and "are you sure?".
// Their markup is in index.html; this file fills them in and saves them.

import { api, ApiError } from "./api.js";
import { COLORS } from "./colors.js";
import { state } from "./state.js";
import { HOUR, formatDay, formatDuration, formatTime, formatTimeRange, fromInputValue, toInputValue } from "./time.js";

const byId = (id) => document.getElementById(id);

// The inputs of a form, by their name attribute: fieldsOf("entry-form").note
const fieldsOf = (formId) => byId(formId).elements;

// Turns an error into a sentence for the form. When the server says an entry
// overlaps another one, it also says which, so the message can name it.
function describeError(error) {
  if (!(error instanceof ApiError)) return "Something went wrong.";
  const conflict = error.data?.conflict;
  if (!conflict) return error.message;

  const start = new Date(conflict.startedAt);
  const when =
    conflict.endedAt === null
      ? `running since ${formatTime(start)}`
      : formatTimeRange(start, new Date(conflict.endedAt));
  return `That overlaps your ${conflict.projectName} entry on ${formatDay(start)} (${when}).`;
}

// Shows a <dialog> that holds a form, and waits for it to close. `save` runs
// when the form is submitted; if it throws, the dialog stays open and shows
// the reason. Resolves to true if the form was saved, false if it was cancelled.
function runDialog(dialog, save) {
  const form = dialog.querySelector("form");
  const errorBox = dialog.querySelector(".form-error");
  errorBox.hidden = true;
  let saving = false;

  return new Promise((resolve) => {
    async function onSubmit(event) {
      event.preventDefault();
      if (saving) return; // ignore a second Enter while the first save is in flight
      saving = true;
      try {
        await save();
        dialog.close("saved");
      } catch (error) {
        if (!(error instanceof ApiError)) console.error(error);
        errorBox.textContent = describeError(error);
        errorBox.hidden = false;
      } finally {
        saving = false;
      }
    }

    function onClose() {
      form.removeEventListener("submit", onSubmit);
      resolve(dialog.returnValue === "saved");
    }

    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("close", onClose, { once: true });
    dialog.returnValue = "";
    dialog.showModal();
  });
}

// ---------- Entry ----------

// Shows the length of the entry being typed, or what is wrong with it.
function updateEntryPreview() {
  const fields = fieldsOf("entry-form");
  const start = fromInputValue(fields.start.value);
  const end = fields.end.value === "" ? null : fromInputValue(fields.end.value);

  let text = "";
  if (start !== null && end !== null) {
    text = end > start ? `Length: ${formatDuration(end - start)}` : "The end time has to be after the start time.";
  } else if (end === null && !fields.end.required) {
    text = "The clock is still running. Fill in an end time to clock out at that time.";
  }
  byId("entry-preview").textContent = text;
}

// With no argument this adds a new entry; with an entry it edits that one.
export function openEntryDialog(entry = null) {
  const fields = fieldsOf("entry-form");
  const isRunning = entry !== null && entry.endedAt === null;
  const now = Date.now();

  byId("entry-title").textContent = entry ? "Edit entry" : "Add entry";

  // Archived projects aren't offered, except the one this entry already belongs to.
  const choices = state.projects.filter((project) => !project.archived || project.id === entry?.projectId);
  fields.projectId.replaceChildren(...choices.map((project) => new Option(project.name, project.id)));

  const initial = {
    projectId: String(entry?.projectId ?? choices[0]?.id ?? ""),
    start: toInputValue(entry?.startedAt ?? now - HOUR),
    end: isRunning ? "" : toInputValue(entry?.endedAt ?? now),
    note: entry?.note ?? "",
  };
  fields.projectId.value = initial.projectId;
  fields.start.value = initial.start;
  fields.end.value = initial.end;
  fields.note.value = initial.note;
  fields.end.required = !isRunning;
  fields.start.max = fields.end.max = toInputValue(now);
  updateEntryPreview();

  return runDialog(byId("entry-dialog"), async () => {
    const values = {
      projectId: Number(fields.projectId.value),
      startedAt: fromInputValue(fields.start.value),
      endedAt: fields.end.value === "" ? null : fromInputValue(fields.end.value),
      note: fields.note.value,
    };
    if (!entry) return api.createEntry(values);

    // An edit only sends the fields that were actually changed. The form works
    // in whole minutes, so resending an untouched time would chop off its seconds.
    const changes = {};
    if (fields.projectId.value !== initial.projectId) changes.projectId = values.projectId;
    if (fields.start.value !== initial.start) changes.startedAt = values.startedAt;
    if (fields.end.value !== initial.end) changes.endedAt = values.endedAt;
    if (fields.note.value !== initial.note) changes.note = values.note;
    if (Object.keys(changes).length > 0) await api.updateEntry(entry.id, changes);
  });
}

// ---------- Project ----------

// A new project gets the first color no other project is using yet.
function nextFreeColor() {
  const taken = new Set(state.projects.map((project) => project.color));
  return COLORS.find((color) => !taken.has(color)) ?? COLORS[state.projects.length % COLORS.length];
}

export function openProjectDialog(project = null) {
  const fields = fieldsOf("project-form");

  byId("project-title").textContent = project ? "Edit project" : "New project";
  fields.name.value = project?.name ?? "";
  fields.color.value = project?.color ?? nextFreeColor();
  fields.rate.value = project?.hourlyRateCents != null ? (project.hourlyRateCents / 100).toFixed(2) : "";

  return runDialog(byId("project-dialog"), async () => {
    const values = {
      name: fields.name.value,
      color: fields.color.value,
      hourlyRateCents: fields.rate.value === "" ? null : Math.round(Number(fields.rate.value) * 100),
    };
    if (project) await api.updateProject(project.id, values);
    else await api.createProject(values);
  });
}

// ---------- Are you sure? ----------

export function confirmDialog({ title, message, confirmLabel }) {
  byId("confirm-title").textContent = title;
  byId("confirm-message").textContent = message;
  byId("confirm-button").textContent = confirmLabel;
  return runDialog(byId("confirm-dialog"), async () => {});
}

// ---------- Setup, run once when the page loads ----------

export function initDialogs() {
  // The color choices in the project form: one round swatch per color.
  byId("project-swatches").replaceChildren(
    ...COLORS.map((color) => {
      const label = document.createElement("label");
      label.className = "swatch";
      label.dataset.color = color;
      label.title = color;

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "color";
      input.value = color;
      input.setAttribute("aria-label", color);

      label.append(input, document.createElement("span"));
      return label;
    }),
  );

  byId("entry-form").addEventListener("input", updateEntryPreview);

  // Any button marked data-close cancels the dialog it is in.
  document.addEventListener("click", (event) => {
    event.target.closest("[data-close]")?.closest("dialog").close("cancelled");
  });
}
