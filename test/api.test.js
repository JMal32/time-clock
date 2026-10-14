import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const HOUR = 3_600_000;

// Starts a real server on a spare port with an empty in-memory database, and a
// clock the test controls.
async function startServer(t) {
  const clock = { now: Date.UTC(2026, 9, 13, 18, 0) };
  const store = openDatabase(":memory:");
  const server = createApp(store, { now: () => clock.now }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  return { call, clock, base };
}

test("a full day: create a project, clock in, clock out, read the log", async (t) => {
  const { call, clock } = await startServer(t);

  const created = await call("POST", "/api/projects", { name: "  eBay store ", color: "blue", hourlyRateCents: 2000 });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, "eBay store"); // extra spaces are trimmed

  assert.equal((await call("GET", "/api/timer")).body, null);

  const started = await call("POST", "/api/timer/start", { projectId: created.body.id });
  assert.equal(started.status, 200);
  assert.equal(started.body.endedAt, null);
  assert.deepEqual((await call("GET", "/api/timer")).body, started.body);

  clock.now += 2 * HOUR;
  const stopped = await call("POST", "/api/timer/stop", { note: "Packed orders" });
  assert.equal(stopped.body.endedAt - stopped.body.startedAt, 2 * HOUR);
  assert.equal(stopped.body.note, "Packed orders");

  const log = await call("GET", "/api/entries");
  assert.deepEqual(log.body, { entries: [stopped.body], previousStart: null });

  const projects = await call("GET", "/api/projects");
  assert.equal(projects.body[0].totalMs, 2 * HOUR);
  assert.equal(projects.body[0].entryCount, 1);
});

test("entries can be added, edited and deleted by hand", async (t) => {
  const { call, clock } = await startServer(t);
  const project = (await call("POST", "/api/projects", { name: "Coursework", color: "aqua" })).body;

  const added = await call("POST", "/api/entries", {
    projectId: project.id,
    startedAt: clock.now - 3 * HOUR,
    endedAt: clock.now - 2 * HOUR,
    note: "Reading",
  });
  assert.equal(added.status, 201);

  const edited = await call("PATCH", `/api/entries/${added.body.id}`, { endedAt: clock.now - HOUR });
  assert.equal(edited.body.endedAt, clock.now - HOUR);
  assert.equal(edited.body.note, "Reading"); // untouched fields stay as they were

  const filtered = await call("GET", `/api/entries?from=${clock.now - 4 * HOUR}&projectId=${project.id}`);
  assert.equal(filtered.body.entries.length, 1);

  assert.equal((await call("DELETE", `/api/entries/${added.body.id}`)).status, 204);
  assert.equal((await call("GET", "/api/entries")).body.entries.length, 0);
  assert.equal((await call("DELETE", `/api/entries/${added.body.id}`)).status, 404);
});

test("bad input is rejected with a readable message", async (t) => {
  const { call, clock, base } = await startServer(t);
  const project = (await call("POST", "/api/projects", { name: "App", color: "orange" })).body;

  const cases = [
    ["POST", "/api/projects", { name: "   ", color: "blue" }],
    ["POST", "/api/projects", { name: "Side gig", color: "#ff0000" }],
    ["POST", "/api/projects", { name: "Side gig", color: "blue", hourlyRateCents: -5 }],
    ["POST", "/api/projects", { name: "x".repeat(61), color: "blue" }],
    ["POST", "/api/timer/start", {}],
    ["POST", "/api/entries", { projectId: project.id, startedAt: "yesterday", endedAt: clock.now }],
    ["POST", "/api/entries", { projectId: project.id, startedAt: clock.now - HOUR, endedAt: null }],
    ["GET", "/api/entries?from=soon", undefined],
    ["PATCH", "/api/projects/abc", { name: "Renamed" }],
  ];
  for (const [method, path, body] of cases) {
    const response = await call(method, path, body);
    assert.equal(response.status, 400, `${method} ${path} ${JSON.stringify(body)}`);
    assert.equal(typeof response.body.error, "string");
  }

  const duplicate = await call("POST", "/api/projects", { name: "app", color: "blue" });
  assert.equal(duplicate.status, 409);

  const brokenJson = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(brokenJson.status, 400);

  assert.equal((await call("GET", "/api/nope")).status, 404);
  assert.equal((await call("POST", "/api/timer/start", { projectId: 999 })).status, 404);
});

test("requests coming from another website are refused", async (t) => {
  const { call, base } = await startServer(t);

  const crossSite = await call("POST", "/api/timer/stop", undefined, { "Sec-Fetch-Site": "cross-site" });
  assert.equal(crossSite.status, 403);

  // fetch() won't send a made-up Host header, so this request is built by hand.
  const otherHost = http.get(`${base}/api/projects`, { headers: { Host: "evil.example" } });
  const [response] = await once(otherHost, "response");
  response.resume();
  assert.equal(response.statusCode, 403);

  const ownPage = await call("GET", "/api/projects", undefined, { "Sec-Fetch-Site": "same-origin" });
  assert.equal(ownPage.status, 200);
});

test("the page itself is served", async (t) => {
  const { base } = await startServer(t);
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Time Clock<\/title>/);
});
