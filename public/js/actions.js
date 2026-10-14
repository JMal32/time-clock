// Actions that work the same on every tab: adding, editing and deleting
// entries, and adding or editing a project.
//
// How actions work: a button in the page carries data-action="some-name".
// app.js listens for clicks, looks the name up, and runs the matching function
// with the button that was clicked. Afterwards the page is refreshed, unless
// the function returns false (meaning "nothing changed").

import { api } from "./api.js";
import { confirmDialog, openEntryDialog, openProjectDialog } from "./dialogs.js";
import { activeProjects, findEntry, projectById } from "./state.js";
import { formatDay, formatDuration } from "./time.js";
import { toast } from "./ui.js";

export const actions = {
  "add-entry": () => {
    if (activeProjects().length === 0) {
      toast("Add a project first, then you can log time to it.");
      return false;
    }
    return openEntryDialog();
  },

  "edit-entry": (button) => {
    const entry = findEntry(Number(button.dataset.id));
    if (entry) return openEntryDialog(entry);
  },

  "delete-entry": async (button) => {
    const entry = findEntry(Number(button.dataset.id));
    if (!entry) return;

    const project = projectById(entry.projectId);
    const length = formatDuration((entry.endedAt ?? Date.now()) - entry.startedAt);
    const confirmed = await confirmDialog({
      title: "Delete this entry?",
      message: `${project.name}, ${formatDay(new Date(entry.startedAt))}, ${length}. This can't be undone.`,
      confirmLabel: "Delete entry",
    });
    if (!confirmed) return false;
    await api.deleteEntry(entry.id);
  },

  "new-project": () => openProjectDialog(),

  "edit-project": (button) => openProjectDialog(projectById(Number(button.dataset.id))),
};
