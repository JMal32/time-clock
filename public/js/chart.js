// The stacked bar chart on the Reports tab, built from plain HTML and CSS: each
// bar is a column of colored blocks, one per project. Also its legend, its
// table twin, and the tooltip that appears over a bar.
//
// The chart is drawn from "columns", one per bar:
//   { label, sublabel, title, rowLabel, totalMs, parts: [{ name, color, ms }] }
// `label` and `sublabel` go under the bar, `title` heads its tooltip, and
// `rowLabel` names its row in the table. Every column lists the same projects
// in the same order, so a project always sits at the same place in the stack.

import { html } from "./html.js";
import { HOUR, formatDuration, formatHoursShort } from "./time.js";

const TICK_STEPS_HOURS = [0.25, 0.5, 1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 500];

// Picks round numbers for the vertical axis: at most five gridlines, with the
// top one at or above the tallest bar. Works in milliseconds.
export function niceScale(maxMs) {
  const maxHours = Math.max(maxMs / HOUR, 1); // an empty chart still gets a 1h axis
  const step = TICK_STEPS_HOURS.find((size) => maxHours / size <= 4) ?? TICK_STEPS_HOURS.at(-1);
  const top = Math.ceil(maxHours / step) * step;
  const ticks = [];
  for (let hours = 0; hours <= top + step / 2; hours += step) ticks.push(hours * HOUR);
  return { max: top * HOUR, ticks };
}

const percent = (fraction) => `${(fraction * 100).toFixed(2)}%`;

// What the tooltip and screen readers say about one bar.
function describe(column) {
  const rows = column.parts.filter((part) => part.ms > 0);
  return {
    title: column.title,
    total: formatDuration(column.totalMs),
    rows: rows.map((part) => ({ name: part.name, color: part.color, value: formatDuration(part.ms) })),
  };
}

function spokenLabel(column) {
  const { title, total, rows } = describe(column);
  if (rows.length === 0) return `${title}: no time tracked`;
  return `${title}: ${total}. ${rows.map((row) => `${row.name} ${row.value}`).join(", ")}`;
}

export function stackedBarChart(columns) {
  const scale = niceScale(Math.max(...columns.map((column) => column.totalMs)));

  return html`
    <div class="chart" data-bars="${columns.length}">
      <div class="chart-yaxis" aria-hidden="true">
        ${scale.ticks.map(
          (tick) =>
            html`<span style="bottom: ${percent(tick / scale.max)}">${tick === 0 ? "0" : formatHoursShort(tick)}</span>`,
        )}
      </div>

      <div class="chart-plot">
        ${scale.ticks
          .slice(1)
          .map((tick) => html`<i class="chart-gridline" style="bottom: ${percent(tick / scale.max)}"></i>`)}
        <div class="chart-bars">
          ${columns.map(
            (column) => html`
              <button
                type="button"
                class="chart-bar"
                aria-label="${spokenLabel(column)}"
                data-tooltip="${JSON.stringify(describe(column))}"
              >
                <span class="chart-stack" style="height: ${percent(column.totalMs / scale.max)}">
                  ${column.totalMs > 0 && html`<span class="chart-cap">${formatHoursShort(column.totalMs)}</span>`}
                  ${column.parts
                    .filter((part) => part.ms > 0)
                    .map(
                      (part) =>
                        html`<span class="chart-segment" data-color="${part.color}" style="flex-grow: ${part.ms}"></span>`,
                    )}
                </span>
              </button>
            `,
          )}
        </div>
      </div>

      <div class="chart-xaxis" aria-hidden="true">
        ${columns.map(
          (column) => html`<span>${column.label}${column.sublabel && html`<small>${column.sublabel}</small>`}</span>`,
        )}
      </div>
    </div>
  `;
}

// Which color is which project. `series` is [{ name, color }].
export function legend(series) {
  return html`
    <ul class="legend">
      ${series.map((item) => html`<li><span class="legend-key" data-color="${item.color}"></span>${item.name}</li>`)}
    </ul>
  `;
}

// The same numbers as the chart, as a table: a row per bar (a day or a week)
// and a column per project. `rowHeading` names the first column: "Day" or "Week".
export function chartTable(columns, series, rowHeading) {
  const cell = (ms) => (ms > 0 ? formatDuration(ms) : "–");
  const seriesTotal = (index) => columns.reduce((total, column) => total + column.parts[index].ms, 0);
  const grandTotal = columns.reduce((total, column) => total + column.totalMs, 0);

  return html`
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">${rowHeading}</th>
            ${series.map(
              (item) =>
                html`<th scope="col"><span class="legend-key" data-color="${item.color}"></span>${item.name}</th>`,
            )}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          ${columns.map(
            (column) => html`
              <tr>
                <th scope="row">${column.rowLabel}</th>
                ${column.parts.map((part) => html`<td>${cell(part.ms)}</td>`)}
                <td>${cell(column.totalMs)}</td>
              </tr>
            `,
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            ${series.map((item, index) => html`<td>${cell(seriesTotal(index))}</td>`)}
            <td>${cell(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// ---------- Tooltip ----------

// One floating box is shared by every bar. It is built with textContent, so
// project names are always treated as text.
function fillTooltip(tooltip, { title, total, rows }) {
  const element = (tag, className, text = "") => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  const lines = rows.map((row) => {
    const line = element("div", "tooltip-row");
    const key = element("span", "tooltip-key");
    key.dataset.color = row.color;
    line.append(key, element("span", "tooltip-name", row.name), element("strong", "tooltip-value", row.value));
    return line;
  });

  const summary = element("div", "tooltip-row tooltip-total");
  summary.append(
    element("span", "tooltip-name", rows.length === 0 ? "No time tracked" : "Total"),
    element("strong", "tooltip-value", rows.length === 0 ? "" : total),
  );

  tooltip.replaceChildren(element("div", "tooltip-title", title), ...lines, summary);
}

// Places the tooltip above the bar, kept inside the edges of the window.
function placeTooltip(tooltip, bar) {
  const MARGIN = 8;
  const barBox = bar.getBoundingClientRect();
  const stackBox = bar.querySelector(".chart-stack").getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();

  const centered = barBox.left + barBox.width / 2 - box.width / 2;
  const left = Math.max(MARGIN, Math.min(centered, window.innerWidth - box.width - MARGIN));
  const above = stackBox.top - box.height - 24;
  const top = above >= MARGIN ? above : stackBox.top + 12;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Run once when the page loads. Listens on the whole document, so it keeps
// working when the chart is redrawn.
export function initChartTooltips() {
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  document.body.append(tooltip);

  let shownFor = null; // the bar the tooltip is currently describing

  const barAt = (event) => (event.target instanceof Element ? event.target.closest(".chart-bar") : null);
  const hide = () => {
    tooltip.hidden = true;
    shownFor = null;
  };
  const show = (bar) => {
    if (bar === shownFor) return; // already showing this bar; nothing to rebuild
    shownFor = bar;
    fillTooltip(tooltip, JSON.parse(bar.dataset.tooltip));
    tooltip.hidden = false;
    placeTooltip(tooltip, bar);
  };
  const follow = (event) => {
    const bar = barAt(event);
    if (bar) show(bar);
    else hide();
  };

  // The same details appear on hover, on a tap, and on keyboard focus.
  document.addEventListener("pointermove", follow);
  document.addEventListener("pointerdown", follow);
  document.addEventListener("focusin", (event) => {
    const bar = barAt(event);
    if (bar) show(bar);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, { passive: true, capture: true });
}
