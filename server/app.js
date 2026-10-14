// The web server: it hands the browser the page (everything in public/) and
// answers the page's requests under /api by calling into the database layer.

import path from "node:path";
import express from "express";
import { AppError } from "./errors.js";
import * as parse from "./validate.js";

const PUBLIC_DIR = path.join(import.meta.dirname, "..", "public");
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// The API has no login, so it only answers this app's own page on this
// computer. Without this, any website open in your browser could quietly send
// requests to it.
function onlyThisApp(req, res, next) {
  const site = req.get("Sec-Fetch-Site"); // browsers attach this to every request
  const fromAnotherSite = site !== undefined && site !== "same-origin" && site !== "none";
  if (fromAnotherSite || !LOCAL_HOSTS.includes(req.hostname)) {
    return res.status(403).json({ error: "This API only answers its own page." });
  }
  next();
}

// `now` can be swapped out so tests can control what time it is.
export function createApp(store, { now = Date.now } = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use("/api", onlyThisApp);
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(PUBLIC_DIR));

  // ---------- Projects ----------

  app.get("/api/projects", (req, res) => {
    res.json(store.listProjects(now()));
  });

  app.post("/api/projects", (req, res) => {
    res.status(201).json(store.createProject(parse.project(req.body)));
  });

  app.patch("/api/projects/:id", (req, res) => {
    const changes = parse.project(req.body, { partial: true });
    res.json(store.updateProject(parse.id(req.params.id), changes));
  });

  app.delete("/api/projects/:id", (req, res) => {
    store.deleteProject(parse.id(req.params.id));
    res.status(204).end();
  });

  // ---------- The clock ----------

  app.get("/api/timer", (req, res) => {
    res.json(store.getRunning());
  });

  app.post("/api/timer/start", (req, res) => {
    res.json(store.clockIn(parse.id(req.body?.projectId), now()));
  });

  app.post("/api/timer/stop", (req, res) => {
    res.json(store.clockOut(now(), parse.note(req.body?.note)));
  });

  // ---------- Entries ----------

  app.get("/api/entries", (req, res) => {
    const filters = parse.entryFilters(req.query);
    res.json({
      entries: store.listEntries(filters),
      previousStart: store.previousStart(filters),
    });
  });

  app.post("/api/entries", (req, res) => {
    res.status(201).json(store.createEntry(parse.entry(req.body), now()));
  });

  app.patch("/api/entries/:id", (req, res) => {
    const changes = parse.entry(req.body, { partial: true });
    res.json(store.updateEntry(parse.id(req.params.id), changes, now()));
  });

  app.delete("/api/entries/:id", (req, res) => {
    store.deleteEntry(parse.id(req.params.id));
    res.status(204).end();
  });

  // ---------- When something goes wrong ----------

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "There's nothing at that address." });
  });

  // Any error thrown in a route above lands here.
  app.use((error, req, res, next) => {
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, ...error.details });
    }
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "That request wasn't valid JSON." });
    }
    console.error(error);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}
