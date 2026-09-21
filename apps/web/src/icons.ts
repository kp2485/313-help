// A small set of line icons drawn for this app: no icon font, no download, no license to track.
// Always decorative (aria-hidden); the text next to an icon carries the meaning.

const PATHS: Record<string, string> = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  help: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
  rec: 'M12 3l5 7h-3l4 6H6l4-6H7z M12 16v5',
  transit: 'M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2z M4 11h16 M8 16v3 M16 16v3 M8 13.5h.01 M16 13.5h.01',
  events: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M4 10h16 M8 3v4 M16 3v4',
  phone: 'M6 3h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  food: 'M4 11h16a8 8 0 0 1-16 0z M9 8c0-2 2-2 2-4 M14 8c0-2 2-2 2-4',
  bed: 'M3 19v-9 M3 15h18v4 M21 15v-2a3 3 0 0 0-3-3h-7v5 M7 12h.01',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  health: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v8 M8 12h8',
  chat: 'M4 5h16v11H9l-5 4z',
  shield: 'M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  people: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20a6 6 0 0 1 12 0 M16.5 11a3 3 0 1 0-.8-5.9 M22 20a6 6 0 0 0-4.5-5.8',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  pin: 'M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z M12 11h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  out: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  path: 'M6 20c0-5 12-4 12-9s-12-3-12-7 M6 20h.01 M18 4h.01',
  bike: 'M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15l4-7h5l3 7 M10 8l2 7 M9 5h3',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4.5 4.5',
  ticket: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z M14 6v12',
  work: 'M4 8h16v11H4z M9 8V5h6v3 M4 13h16',
  book: 'M4 5h5a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z M20 5h-5a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h6z',
  sprout: 'M12 21v-8 M12 13c0-4-3-7-8-7 0 4 3 7 8 7z M12 13c0-3 2.5-6 7-6 0 3.5-2.5 6-7 6z',
  key: 'M8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12h9 M18 12v3 M21 12v2',
  scale: 'M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6a3 3 0 0 0 6 0z M19 7l-3 6a3 3 0 0 0 6 0z',
  card: 'M3 6h18v12H3z M8 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5.5 16c.6-1.2 1.5-1.8 2.5-1.8s1.9.6 2.5 1.8 M14 10h4 M14 13.5h3',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M14.5 9.5c-.4-.9-1.3-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.2 0-2.1-.6-2.5-1.5 M12 6.5V8 M12 16v1.5',
  shirt: 'M8 4L3 7l2 4 3-1v10h8V10l3 1 2-4-5-3c-.6 1.5-2.1 2.5-4 2.5S8.6 5.5 8 4z',
  wifi: 'M2.5 9a14 14 0 0 1 19 0 M5.5 12.5a9.5 9.5 0 0 1 13 0 M8.8 16a5 5 0 0 1 6.4 0 M12 19.5h.01',
  paw: 'M12 13c-3 0-5 3-5 5a2 2 0 0 0 2 2c1.2 0 2-.5 3-.5s1.8.5 3 .5a2 2 0 0 0 2-2c0-2-2-5-5-5z M5.5 11a1.5 2 0 1 0 3 0 1.5 2 0 1 0-3 0z M9.5 7a1.5 2 0 1 0 3 0 1.5 2 0 1 0-3 0z M13.5 7a1.5 2 0 1 0 3 0 1.5 2 0 1 0-3 0z M17.5 11a1.5 2 0 1 0 3 0 1.5 2 0 1 0-3 0z',
  // A globe, for the language control in the top bar. Round in every direction, so it never needs mirroring.
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 2.5 15.4 0 18 M12 3c-2.5 2.6-2.5 15.4 0 18',
};

export function icon(name: string, cls = ''): string {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${PATHS[name] ?? PATHS.info}"/></svg>`;
}
