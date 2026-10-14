// A tiny templating helper. Views build their markup with the html`...` tag,
// and every value dropped into a template is escaped first. Text you typed
// (project names, notes) can therefore never be mistaken for markup, which is
// what keeps a note like "<b>hi</b>" from breaking the page.

class SafeHtml {
  constructor(markup) {
    this.markup = markup;
  }
  toString() {
    return this.markup;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function toMarkup(value) {
  if (value instanceof SafeHtml) return value.markup; // made by html`` or raw(), already safe
  if (Array.isArray(value)) return value.map(toMarkup).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

// Usage: html`<p>${note}</p>`. Templates can be nested and lists can be dropped
// in directly: html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>`.
// `false`, `null` and `undefined` print nothing, so `${condition && html`...`}` works.
export function html(strings, ...values) {
  let markup = strings[0];
  values.forEach((value, index) => {
    markup += toMarkup(value) + strings[index + 1];
  });
  return new SafeHtml(markup);
}

// Marks a string as trusted markup. Only used for the built-in icons.
export const raw = (markup) => new SafeHtml(markup);
