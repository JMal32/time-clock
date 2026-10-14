// `npm run demo` starts the app filled with made-up sample data, so you can
// try every screen (or take screenshots) without touching your real hours.
// The sample data lives in memory only and is gone when you stop the demo.

import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db.js";

const PORT = Number(process.env.PORT) || 4748;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const store = openDatabase(":memory:");
seed(store, Date.now());

createApp(store).listen(PORT, "127.0.0.1", (error) => {
  if (error) throw error;
  console.log(`Time Clock demo is running at http://localhost:${PORT}`);
  console.log("This is sample data. Nothing here is saved.");
});

// Fills the store with about ten weeks of plausible work, ending today.
function seed(store, now) {
  // A small repeatable random number generator, so the demo looks the same every run.
  let state = 20261013;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];

  const ebay = store.createProject({ name: "eBay store", color: "blue", hourlyRateCents: 2200 });
  const app = store.createProject({ name: "Time Clock app", color: "orange" });
  const school = store.createProject({ name: "Coursework", color: "aqua" });
  const client = store.createProject({ name: "Freelance site", color: "yellow", hourlyRateCents: 3500 });

  const notes = {
    [ebay.id]: ["Listed 12 items", "Packed and shipped orders", "Photos for new listings", "Answered buyers", ""],
    [app.id]: ["Clock in and out", "Reports chart", "Fixed overlap bug", "README", ""],
    [school.id]: ["Data mining homework", "Reading", "Lab report", ""],
    [client.id]: ["Landing page", "Client call", "Contact form", ""],
  };

  // Leave the last hour free for the clock that is left running at the end.
  const cutoff = now - HOUR;
  const add = (project, dayStart, startHour, hours) => {
    const startedAt = dayStart + Math.round(startHour * HOUR);
    const endedAt = startedAt + Math.round((hours * HOUR) / MINUTE) * MINUTE;
    if (endedAt > cutoff) return;
    store.createEntry({ projectId: project.id, startedAt, endedAt, note: pick(notes[project.id]) }, now);
  };

  const today = new Date(now);
  for (let daysAgo = 70; daysAgo >= 0; daysAgo--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
    const dayStart = day.getTime();
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    // Mornings: the eBay store, most days.
    if (random() < 0.8) add(ebay, dayStart, 8 + random(), 1 + random() * 2);
    // Afternoons: coursework on weekdays, client work now and then.
    if (!isWeekend && random() < 0.7) add(school, dayStart, 13 + random() * 0.5, 1 + random() * 1.5);
    if (random() < 0.25) add(client, dayStart, 15.5 + random() * 0.5, 1 + random() * 2);
    // Evenings: this app.
    if (random() < 0.55) add(app, dayStart, 19 + random(), 0.75 + random() * 2);
  }

  // And a clock that is running right now.
  store.clockIn(ebay.id, now - 47 * MINUTE);
}
