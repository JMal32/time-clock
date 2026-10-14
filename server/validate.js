// Checks the data the browser sends before any of it reaches the database.
// Each function returns a clean object, or throws a 400 error with a message
// that explains what was wrong.

import { COLORS } from "../public/js/colors.js";
import { AppError } from "./errors.js";

const MAX_NAME_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;
const MAX_RATE_CENTS = 1_000_000_00;

const invalid = (message) => new AppError(400, message);

export function id(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw invalid("That id isn't valid.");
  return number;
}

function text(value, label, maxLength) {
  if (typeof value !== "string") throw invalid(`${label} has to be text.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw invalid(`${label} can be at most ${maxLength} characters.`);
  return trimmed;
}

function timestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid(`${label} isn't a valid time.`);
  return value;
}

export function note(value) {
  return value === undefined ? undefined : text(value, "The note", MAX_NOTE_LENGTH);
}

// With `partial`, fields that were left out are skipped. That is what an edit
// sends: only the fields that changed.
export function project(body = {}, { partial = false } = {}) {
  const clean = {};
  if (!partial || "name" in body) {
    clean.name = text(body.name, "The project name", MAX_NAME_LENGTH);
    if (clean.name === "") throw invalid("Give the project a name.");
  }
  if (!partial || "color" in body) {
    if (!COLORS.includes(body.color)) throw invalid("Pick one of the available colors.");
    clean.color = body.color;
  }
  if ("hourlyRateCents" in body) {
    const rate = body.hourlyRateCents;
    if (rate !== null && (!Number.isInteger(rate) || rate < 0 || rate > MAX_RATE_CENTS)) {
      throw invalid("That hourly rate isn't valid.");
    }
    clean.hourlyRateCents = rate;
  }
  if ("archived" in body) {
    if (typeof body.archived !== "boolean") throw invalid("Archived has to be true or false.");
    clean.archived = body.archived;
  }
  return clean;
}

export function entry(body = {}, { partial = false } = {}) {
  const clean = {};
  if (!partial || "projectId" in body) clean.projectId = id(body.projectId);
  if (!partial || "startedAt" in body) clean.startedAt = timestamp(body.startedAt, "The start time");
  if (!partial || "endedAt" in body) {
    // Only an edit may leave the end empty, to keep a running clock running.
    const stillRunning = partial && body.endedAt === null;
    clean.endedAt = stillRunning ? null : timestamp(body.endedAt, "The end time");
  }
  if ("note" in body) clean.note = note(body.note);
  return clean;
}

// The filters on GET /api/entries arrive as text in the URL (?from=...&to=...).
export function entryFilters(query) {
  const clean = {};
  if (query.from !== undefined) clean.from = timestamp(Number(query.from), "The 'from' time");
  if (query.to !== undefined) clean.to = timestamp(Number(query.to), "The 'to' time");
  if (query.projectId !== undefined) clean.projectId = id(query.projectId);
  return clean;
}
