// What the app knows right now. Views read from here; refresh() in app.js
// refills it from the server after every change.

import { api } from "./api.js";

export const state = {
  projects: [], // every project, archived ones included
  running: null, // the entry you're clocked in to, or null
};

export async function loadShared() {
  [state.projects, state.running] = await Promise.all([api.listProjects(), api.getRunning()]);
}

export const projectById = (id) => state.projects.find((project) => project.id === id);
export const activeProjects = () => state.projects.filter((project) => !project.archived);

// The entries currently on screen, so a click on an entry's edit button can
// find the entry from the id on the button.
const shownEntries = new Map();

export function rememberEntries(entries) {
  shownEntries.clear();
  for (const entry of entries) shownEntries.set(entry.id, entry);
}

export function findEntry(id) {
  if (state.running?.id === id) return state.running;
  return shownEntries.get(id);
}

// Preferences are kept in the browser. They only change how things are
// displayed, so they don't need to be in the database.
function readPreference(key) {
  try {
    return localStorage.getItem(`timeclock.${key}`);
  } catch {
    return null; // storage can be blocked, e.g. in a private window
  }
}

function writePreference(key, value) {
  try {
    localStorage.setItem(`timeclock.${key}`, value);
  } catch {
    // Not being able to save a preference is harmless.
  }
}

export const settings = {
  // 0 = Sunday, 1 = Monday
  get weekStartsOn() {
    return readPreference("weekStartsOn") === "0" ? 0 : 1;
  },
  set weekStartsOn(day) {
    writePreference("weekStartsOn", String(day));
  },
};
