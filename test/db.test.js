import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../server/db.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// A fixed "now" so these tests never depend on the real clock.
const NOW = Date.UTC(2026, 9, 13, 18, 0);

// Every test gets its own empty database that lives only in memory.
function setup() {
  const store = openDatabase(":memory:");
  const ebay = store.createProject({ name: "eBay store", color: "blue", hourlyRateCents: 2000 });
  const app = store.createProject({ name: "Time Clock app", color: "orange" });
  return { store, ebay, app };
}

const hasStatus = (status) => (error) => error.status === status;

test("clocking in starts a running entry", () => {
  const { store, ebay } = setup();
  assert.equal(store.getRunning(), null);

  const entry = store.clockIn(ebay.id, NOW);

  assert.deepEqual(entry, { id: 1, projectId: ebay.id, startedAt: NOW, endedAt: null, note: "" });
  assert.deepEqual(store.getRunning(), entry);
});

test("clocking out finishes the running entry and can save a note", () => {
  const { store, ebay } = setup();
  store.clockIn(ebay.id, NOW - 2 * HOUR);

  const entry = store.clockOut(NOW, "Listed 12 items");

  assert.equal(entry.endedAt, NOW);
  assert.equal(entry.note, "Listed 12 items");
  assert.equal(store.getRunning(), null);
});

test("clocking in to another project clocks out of the first at the same moment", () => {
  const { store, ebay, app } = setup();
  const first = store.clockIn(ebay.id, NOW - HOUR);

  const second = store.clockIn(app.id, NOW);

  const [newest, oldest] = store.listEntries();
  assert.equal(oldest.id, first.id);
  assert.equal(oldest.endedAt, NOW);
  assert.equal(newest.id, second.id);
  assert.equal(newest.startedAt, NOW);
  assert.equal(store.getRunning().projectId, app.id);
});

test("clocking in again to the project that is already running changes nothing", () => {
  const { store, ebay } = setup();
  const first = store.clockIn(ebay.id, NOW - HOUR);

  const again = store.clockIn(ebay.id, NOW);

  assert.deepEqual(again, first);
  assert.equal(store.listEntries().length, 1);
});

test("clocking out when nothing is running is an error", () => {
  const { store } = setup();
  assert.throws(() => store.clockOut(NOW), hasStatus(409));
});

test("you can't clock in to an archived project", () => {
  const { store, ebay } = setup();
  store.updateProject(ebay.id, { archived: true });
  assert.throws(() => store.clockIn(ebay.id, NOW), hasStatus(400));
});

test("a project can't be archived while its clock is running", () => {
  const { store, ebay } = setup();
  store.clockIn(ebay.id, NOW);
  assert.throws(() => store.updateProject(ebay.id, { archived: true }), hasStatus(409));
});

test("an entry added by hand can't overlap an existing one", () => {
  const { store, ebay, app } = setup();
  store.createEntry({ projectId: ebay.id, startedAt: NOW - 4 * HOUR, endedAt: NOW - 2 * HOUR }, NOW);

  assert.throws(
    () => store.createEntry({ projectId: app.id, startedAt: NOW - 3 * HOUR, endedAt: NOW - HOUR }, NOW),
    (error) => error.status === 409 && error.details.conflict.projectName === "eBay store",
  );
  assert.equal(store.listEntries().length, 1);
});

test("an entry added by hand can't overlap the running clock", () => {
  const { store, ebay, app } = setup();
  store.clockIn(ebay.id, NOW - 3 * HOUR);

  assert.throws(
    () => store.createEntry({ projectId: app.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR }, NOW),
    hasStatus(409),
  );
});

test("entries may sit back to back, or overlap by under a minute", () => {
  const { store, ebay, app } = setup();
  store.createEntry({ projectId: ebay.id, startedAt: NOW - 4 * HOUR, endedAt: NOW - 2 * HOUR + 45_000 }, NOW);

  // Starts 45 seconds before the first one ends, as happens after editing in whole minutes.
  store.createEntry({ projectId: app.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR }, NOW);

  assert.equal(store.listEntries().length, 2);
});

test("an entry has to end after it starts, and not in the future", () => {
  const { store, ebay } = setup();
  const add = (startedAt, endedAt) => store.createEntry({ projectId: ebay.id, startedAt, endedAt }, NOW);

  assert.throws(() => add(NOW - HOUR, NOW - 2 * HOUR), hasStatus(400));
  assert.throws(() => add(NOW - HOUR, NOW - HOUR), hasStatus(400));
  assert.throws(() => add(NOW - HOUR, NOW + HOUR), hasStatus(400));
  assert.throws(() => add(NOW + HOUR, NOW + 2 * HOUR), hasStatus(400));
});

test("giving a running entry an end time clocks it out at that time", () => {
  const { store, ebay } = setup();
  const running = store.clockIn(ebay.id, NOW - 10 * HOUR); // forgot to clock out

  store.updateEntry(running.id, { endedAt: NOW - 8 * HOUR }, NOW);

  assert.equal(store.getRunning(), null);
  assert.equal(store.listEntries()[0].endedAt, NOW - 8 * HOUR);
});

test("a finished entry can't have its end time removed", () => {
  const { store, ebay } = setup();
  const entry = store.createEntry({ projectId: ebay.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR }, NOW);
  assert.throws(() => store.updateEntry(entry.id, { endedAt: null }, NOW), hasStatus(400));
});

test("editing an entry only changes the fields that were sent", () => {
  const { store, ebay, app } = setup();
  const entry = store.createEntry(
    { projectId: ebay.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR, note: "Shipping" },
    NOW,
  );

  const edited = store.updateEntry(entry.id, { projectId: app.id }, NOW);

  assert.deepEqual(edited, { ...entry, projectId: app.id });
});

test("project names are unique, ignoring upper and lower case", () => {
  const { store, app } = setup();
  assert.throws(() => store.createProject({ name: "EBAY STORE", color: "green" }), hasStatus(409));
  assert.throws(() => store.updateProject(app.id, { name: "ebay store" }), hasStatus(409));
});

test("deleting a project deletes its entries too", () => {
  const { store, ebay, app } = setup();
  store.createEntry({ projectId: ebay.id, startedAt: NOW - 4 * HOUR, endedAt: NOW - 3 * HOUR }, NOW);
  store.createEntry({ projectId: app.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR }, NOW);

  store.deleteProject(ebay.id);

  const left = store.listEntries();
  assert.equal(left.length, 1);
  assert.equal(left[0].projectId, app.id);
});

test("the project list adds up each project's time, including a running clock", () => {
  const { store, ebay, app } = setup();
  store.createEntry({ projectId: ebay.id, startedAt: NOW - 6 * HOUR, endedAt: NOW - 4 * HOUR }, NOW);
  store.clockIn(ebay.id, NOW - 30 * MINUTE);

  const [first, second] = store.listProjects(NOW);

  assert.equal(first.id, ebay.id);
  assert.equal(first.entryCount, 2);
  assert.equal(first.totalMs, 2 * HOUR + 30 * MINUTE);
  assert.equal(first.archived, false);
  assert.equal(second.id, app.id);
  assert.equal(second.entryCount, 0);
  assert.equal(second.totalMs, 0);
});

test("entries can be listed by time range and by project", () => {
  const { store, ebay, app } = setup();
  const old = store.createEntry({ projectId: ebay.id, startedAt: NOW - 50 * HOUR, endedAt: NOW - 49 * HOUR }, NOW);
  const mid = store.createEntry({ projectId: app.id, startedAt: NOW - 5 * HOUR, endedAt: NOW - 4 * HOUR }, NOW);
  const recent = store.createEntry({ projectId: ebay.id, startedAt: NOW - 2 * HOUR, endedAt: NOW - HOUR }, NOW);

  const ids = (filters) => store.listEntries(filters).map((entry) => entry.id);

  assert.deepEqual(ids(), [recent.id, mid.id, old.id]); // newest first
  assert.deepEqual(ids({ from: NOW - 24 * HOUR }), [recent.id, mid.id]);
  assert.deepEqual(ids({ from: NOW - 24 * HOUR, to: NOW - 3 * HOUR }), [mid.id]);
  assert.deepEqual(ids({ projectId: ebay.id }), [recent.id, old.id]);

  // previousStart tells the log whether anything older is left to show.
  assert.equal(store.previousStart({ from: NOW - 24 * HOUR }), old.startedAt);
  assert.equal(store.previousStart({ from: NOW - 24 * HOUR, projectId: app.id }), null);
  assert.equal(store.previousStart({ from: NOW - 100 * HOUR }), null);
});
