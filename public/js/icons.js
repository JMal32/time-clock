// The handful of icons the app uses, drawn as inline SVG so nothing has to be
// downloaded. Each one is a 16x16 line drawing that takes the text color.

import { raw } from "./html.js";

const PATHS = {
  plus: '<path d="M8 3v10M3 8h10"/>',
  edit: '<path d="M11.2 2.6l2.2 2.2L5.6 12.6 3 13l.4-2.6z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5"/>',
  archive: '<path d="M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3"/>',
  restore: '<path d="M3 6.5h6.5a3 3 0 010 6H6M3 6.5l3-3M3 6.5l3 3"/>',
  download: '<path d="M8 2.5v7.5M4.5 7L8 10.5 11.5 7M3 13.5h10"/>',
  left: '<path d="M10 3L5 8l5 5"/>',
  right: '<path d="M6 3l5 5-5 5"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
};

export function icon(name) {
  return raw(
    `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" ` +
      `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`,
  );
}
