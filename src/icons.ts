const paths = {
  listen: '<path d="M3 9v6h4l5 4V5L7 9H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  book: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2v15"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4 4"/>',
  stories: '<path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2ZM20 17v5m-2.5-2.5h5"/>',
  animal_facts: '<path d="M18 19c-2 1-3-1-6-1s-4 2-6 1c-4-2 1-8 6-8s10 6 6 8Z"/><path d="M6 9 5 7m5 0V4m4 3 1-3m3 5 2-2"/>',
  around_the_world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>',
  amazing_science: '<path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M7 16h10"/>',
  nature_seasons: '<path d="M20 3c-10-1-16 4-16 10a6 6 0 0 0 6 6c6 0 11-6 10-16ZM3 21 14 10"/>',
  highlight: '<path d="m5 14 9-9 5 5-9 9H5v-5Zm0 5-2 2h9m0-14 5 5"/>',
  guide: '<path d="M7 4h13M7 12h13M7 20h13M3 8v8"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
} as const;

export function icon(name: keyof typeof paths) {
  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
