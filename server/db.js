// Everything that touches the database lives in this file. The rest of the
// server calls the functions returned by openDatabase() and never writes SQL.

import { DatabaseSync } from "node:sqlite";
import { AppError } from "./errors.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id                INTEGER PRIMARY KEY,
    name              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    color             TEXT    NOT NULL,
    hourly_rate_cents INTEGER,                    -- NULL means no rate is set
    archived          INTEGER NOT NULL DEFAULT 0  -- 0 = in use, 1 = archived
  );

  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,                  -- milliseconds since 1970 (UTC)
    ended_at   INTEGER,                           -- NULL means still clocked in
    note       TEXT    NOT NULL DEFAULT '',
    CHECK (ended_at IS NULL OR ended_at > started_at)
  );

  CREATE INDEX IF NOT EXISTS entries_by_start ON entries (started_at);

  -- Only one row may have ended_at = NULL, so the database itself guarantees
  -- you can never be clocked in twice.
  CREATE UNIQUE INDEX IF NOT EXISTS one_running_entry ON entries ((1)) WHERE ended_at IS NULL;
`;

const PROJECT_COLUMNS = "id, name, color, hourly_rate_cents AS hourlyRateCents, archived";
const ENTRY_COLUMNS = "id, project_id AS projectId, started_at AS startedAt, ended_at AS endedAt, note";

// Two entries may overlap by less than this without it counting as a clash.
// Clocked times are exact to the millisecond but the edit form works in whole
// minutes, so without some slack an edit could collide with its neighbour.
const OVERLAP_SLACK_MS = 60_000;

const UNIQUE_VIOLATION = 2067; // SQLite's code for breaking a UNIQUE rule

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

  const sql = {
    listProjects: db.prepare(`
      SELECT p.id, p.name, p.color, p.hourly_rate_cents AS hourlyRateCents, p.archived,
             COUNT(e.id) AS entryCount,
             COALESCE(SUM(COALESCE(e.ended_at, :now) - e.started_at), 0) AS totalMs
      FROM projects p
      LEFT JOIN entries e ON e.project_id = p.id
      GROUP BY p.id
      ORDER BY p.id`),
    getProject: db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`),
    insertProject: db.prepare("INSERT INTO projects (name, color, hourly_rate_cents) VALUES (?, ?, ?)"),
    updateProject: db.prepare(
      "UPDATE projects SET name = ?, color = ?, hourly_rate_cents = ?, archived = ? WHERE id = ?",
    ),
    deleteProject: db.prepare("DELETE FROM projects WHERE id = ?"),

    listEntries: db.prepare(`
      SELECT ${ENTRY_COLUMNS} FROM entries
      WHERE started_at >= :from AND started_at < :to
        AND (:projectId IS NULL OR project_id = :projectId)
      ORDER BY started_at DESC`),
    previousStart: db.prepare(`
      SELECT MAX(started_at) AS startedAt FROM entries
      WHERE started_at < :from AND (:projectId IS NULL OR project_id = :projectId)`),
    getEntry: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = ?`),
    getRunning: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE ended_at IS NULL`),
    insertEntry: db.prepare(
      "INSERT INTO entries (project_id, started_at, ended_at, note) VALUES (?, ?, ?, ?)",
    ),
    updateEntry: db.prepare(
      "UPDATE entries SET project_id = ?, started_at = ?, ended_at = ?, note = ? WHERE id = ?",
    ),
    deleteEntry: db.prepare("DELETE FROM entries WHERE id = ?"),
    findOverlap: db.prepare(`
      SELECT e.started_at AS startedAt, e.ended_at AS endedAt, p.name AS projectName
      FROM entries e
      JOIN projects p ON p.id = e.project_id
      WHERE e.id IS NOT :id
        AND MIN(COALESCE(e.ended_at, :now), :end) - MAX(e.started_at, :start) >= :slack
      LIMIT 1`),
  };

  // Runs several statements as one unit: if any of them fails, none of them count.
  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const toProject = (row) => ({ ...row, archived: Boolean(row.archived) });

  // ---------- Projects ----------

  function listProjects(now) {
    return sql.listProjects.all({ now }).map(toProject);
  }

  function getProject(id) {
    const row = sql.getProject.get(id);
    if (!row) throw new AppError(404, "That project no longer exists.");
    return toProject(row);
  }

  // Turns SQLite's "name already taken" failure into a message a person can read.
  function withUniqueName(name, write) {
    try {
      return write();
    } catch (error) {
      if (error.errcode === UNIQUE_VIOLATION) {
        throw new AppError(409, `You already have a project called "${name}".`);
      }
      throw error;
    }
  }

  function createProject({ name, color, hourlyRateCents = null }) {
    const result = withUniqueName(name, () => sql.insertProject.run(name, color, hourlyRateCents));
    return getProject(Number(result.lastInsertRowid));
  }

  function updateProject(id, changes) {
    const project = { ...getProject(id), ...changes };
    if (project.archived && getRunning()?.projectId === id) {
      throw new AppError(409, "You're clocked in to this project. Clock out before archiving it.");
    }
    withUniqueName(project.name, () =>
      sql.updateProject.run(project.name, project.color, project.hourlyRateCents, project.archived ? 1 : 0, id),
    );
    return getProject(id);
  }

  // Deleting a project also deletes its entries (ON DELETE CASCADE in the schema).
  function deleteProject(id) {
    getProject(id);
    sql.deleteProject.run(id);
  }

  // ---------- Entries ----------

  function listEntries({ from = 0, to = Number.MAX_SAFE_INTEGER, projectId = null } = {}) {
    return sql.listEntries.all({ from, to, projectId }).map((row) => ({ ...row }));
  }

  // When the newest entry before `from` started, or null if there is nothing older.
  // The log uses this to know whether "Show older" has anything left to show.
  function previousStart({ from = 0, projectId = null } = {}) {
    return sql.previousStart.get({ from, projectId }).startedAt;
  }

  function getEntry(id) {
    const row = sql.getEntry.get(id);
    if (!row) throw new AppError(404, "That entry no longer exists.");
    return { ...row };
  }

  function getRunning() {
    const row = sql.getRunning.get();
    return row ? { ...row } : null;
  }

  function checkTimes({ startedAt, endedAt }, now) {
    if (startedAt > now) throw new AppError(400, "The start time can't be in the future.");
    if (endedAt === null) return; // still running, so there is no end to check
    if (endedAt <= startedAt) throw new AppError(400, "The end time has to be after the start time.");
    if (endedAt > now) throw new AppError(400, "The end time can't be in the future.");
  }

  function checkNoOverlap({ id = null, startedAt, endedAt }, now) {
    const conflict = sql.findOverlap.get({
      id,
      now,
      start: startedAt,
      end: endedAt ?? now,
      slack: OVERLAP_SLACK_MS,
    });
    if (conflict) {
      throw new AppError(409, "That time overlaps another entry.", { conflict: { ...conflict } });
    }
  }

  // Adds a finished entry by hand (for hours you forgot to clock).
  function createEntry({ projectId, startedAt, endedAt, note = "" }, now) {
    getProject(projectId);
    checkTimes({ startedAt, endedAt }, now);
    checkNoOverlap({ startedAt, endedAt }, now);
    const result = sql.insertEntry.run(projectId, startedAt, endedAt, note);
    return getEntry(Number(result.lastInsertRowid));
  }

  function updateEntry(id, changes, now) {
    const before = getEntry(id);
    const entry = { ...before, ...changes };
    if (before.endedAt !== null && entry.endedAt === null) {
      throw new AppError(400, "A finished entry needs an end time.");
    }
    getProject(entry.projectId);
    checkTimes(entry, now);
    checkNoOverlap(entry, now);
    sql.updateEntry.run(entry.projectId, entry.startedAt, entry.endedAt, entry.note, id);
    return getEntry(id);
  }

  function deleteEntry(id) {
    getEntry(id);
    sql.deleteEntry.run(id);
  }

  // ---------- The clock ----------

  // An entry always lasts at least a millisecond, even if the computer's clock
  // was adjusted backwards while it was running.
  const endTimeFor = (entry, now) => Math.max(now, entry.startedAt + 1);

  // Starts the clock on a project. If the clock is already running on another
  // project, that one is stopped at the same moment, so time is never counted twice.
  function clockIn(projectId, now) {
    return transaction(() => {
      const project = getProject(projectId);
      if (project.archived) throw new AppError(400, "That project is archived. Restore it to clock in.");

      const running = getRunning();
      if (running?.projectId === projectId) return running; // already on the clock here

      let startedAt = now;
      if (running) {
        startedAt = endTimeFor(running, now);
        sql.updateEntry.run(running.projectId, running.startedAt, startedAt, running.note, running.id);
      }
      const result = sql.insertEntry.run(projectId, startedAt, null, "");
      return getEntry(Number(result.lastInsertRowid));
    });
  }

  function clockOut(now, note) {
    const running = getRunning();
    if (!running) throw new AppError(409, "You're not clocked in.");
    sql.updateEntry.run(
      running.projectId,
      running.startedAt,
      endTimeFor(running, now),
      note ?? running.note,
      running.id,
    );
    return getEntry(running.id);
  }

  return {
    listProjects,
    createProject,
    updateProject,
    deleteProject,
    listEntries,
    previousStart,
    createEntry,
    updateEntry,
    deleteEntry,
    getRunning,
    clockIn,
    clockOut,
    close: () => db.close(),
  };
}
