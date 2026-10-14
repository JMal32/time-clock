// The Projects tab: rename projects, change their color or hourly rate, and
// archive or delete the ones you're done with.

import { api } from "../api.js";
import { confirmDialog } from "../dialogs.js";
import { html } from "../html.js";
import { icon } from "../icons.js";
import { activeProjects, projectById, state } from "../state.js";
import { formatDuration } from "../time.js";
import { formatMoney, projectLabel } from "../ui.js";

// The project list is already loaded for every tab, so there is nothing extra to fetch.
export async function load() {}

const countEntries = (count) => (count === 1 ? "1 entry" : `${count} entries`);

export function render() {
  const active = activeProjects();
  const archived = state.projects.filter((project) => project.archived);

  return html`
    <div class="page-head">
      <h1>Projects</h1>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="new-project">${icon("plus")} New project</button>
      </div>
    </div>

    ${active.length === 0
      ? html`<p class="empty">
          ${archived.length === 0
            ? 'No projects yet. Add one for each thing you want to track time on, like "eBay store".'
            : "Every project is archived. Restore one below, or add a new one."}
        </p>`
      : html`<ul class="project-list">
          ${active.map(projectRow)}
        </ul>`}
    ${archived.length > 0 &&
    html`
      <section class="section">
        <div class="section-head"><h2>Archived</h2></div>
        <p class="hint">Archived projects keep all their hours, but you can't clock in to them.</p>
        <ul class="project-list">
          ${archived.map(projectRow)}
        </ul>
      </section>
    `}
  `;
}

function projectRow(project) {
  const rate =
    project.hourlyRateCents === null ? "No hourly rate" : `${formatMoney(project.hourlyRateCents)} an hour`;

  return html`
    <li class="project-row">
      <div class="project-row-main">
        <div class="project-row-name">${projectLabel(project)}</div>
        <div class="project-row-detail">
          ${rate} · ${formatDuration(project.totalMs)} tracked · ${countEntries(project.entryCount)}
        </div>
      </div>
      <div class="project-row-actions">
        <button class="btn" data-action="edit-project" data-id="${project.id}">${icon("edit")} Edit</button>
        ${project.archived
          ? html`<button class="btn" data-action="restore-project" data-id="${project.id}">
              ${icon("restore")} Restore
            </button>`
          : html`<button class="btn" data-action="archive-project" data-id="${project.id}">
              ${icon("archive")} Archive
            </button>`}
        <button
          class="icon-btn"
          data-action="delete-project"
          data-id="${project.id}"
          aria-label="Delete ${project.name}"
          title="Delete"
        >
          ${icon("trash")}
        </button>
      </div>
    </li>
  `;
}

export const actions = {
  "archive-project": (button) => api.updateProject(Number(button.dataset.id), { archived: true }),

  "restore-project": (button) => api.updateProject(Number(button.dataset.id), { archived: false }),

  "delete-project": async (button) => {
    const project = projectById(Number(button.dataset.id));
    const message =
      project.entryCount === 0
        ? "It has no entries, so no hours are lost."
        : `This also deletes its ${countEntries(project.entryCount)} (${formatDuration(project.totalMs)}) for good. ` +
          "To keep those hours, archive the project instead.";

    const confirmed = await confirmDialog({
      title: `Delete "${project.name}"?`,
      message,
      confirmLabel: "Delete project",
    });
    if (!confirmed) return false;
    await api.deleteProject(project.id);
  },
};
