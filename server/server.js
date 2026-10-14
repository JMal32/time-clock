// Start here: `npm start` runs this file. It opens the database file and
// starts the web server on this computer only.

import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const PORT = Number(process.env.PORT) || 4747;
const DB_FILE = process.env.TIMECLOCK_DB || path.join(import.meta.dirname, "..", "data", "timeclock.db");

if (DB_FILE !== ":memory:") fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const app = createApp(openDatabase(DB_FILE));

// 127.0.0.1 means "this computer only": nothing else on your network can reach it.
// Express calls this function once the server is up, or with an error if it couldn't start.
app.listen(PORT, "127.0.0.1", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Time Clock may already be running.`);
    console.error(`To use another port: PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  if (error) throw error;

  console.log(`Time Clock is running at http://localhost:${PORT}`);
  console.log(`Your hours are saved in ${DB_FILE}`);
  console.log("Press Ctrl+C to stop.");
});
