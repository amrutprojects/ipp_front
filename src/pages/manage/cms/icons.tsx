/*
 * The icons the landing page can draw (the same names and shapes as its own SVG sprite), for the icon pickers of the CMS.
 * The markup is constant, from this file only.
 */
const ICON_SVG: Record<string, readonly [label: string, markup: string]> = {
  cap: ['Graduation cap', '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3.5 2.5 8.5 2.5 12 0v-5"/><path d="M22 10v6"/>'],
  check: ['Tick', '<path d="M20 6 9 17l-5-5"/>'],
  clock: ['Clock', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'],
  calendar: ['Calendar', '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'],
  'user-check': ['Person with tick', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'],
  briefcase: ['Briefcase', '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'],
  code: ['Code', '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'],
  cpu: ['Chip (AI)', '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>'],
  bar: ['Bar chart', '<path d="M3 3v18h18"/><path d="M8 17v-4M13 17V8M18 17v-7"/>'],
  trend: ['Line chart', '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>'],
  pie: ['Pie chart', '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'],
  db: ['Database', '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'],
  layers: ['Layers', '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'],
  coffee: ['Coffee cup (Java)', '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M7 2v3M11 2v3M15 2v3"/>'],
  network: ['Network', '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'],
  monitor: ['Monitor', '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  server: ['Server', '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>'],
  globe: ['Globe', '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>'],
  tool: ['Wrench', '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'],
  users: ['People', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
  user: ['Person', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'],
  clipboard: ['Clipboard', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>'],
  box: ['Box (project)', '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>'],
  target: ['Target', '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'],
  star: ['Star', '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'],
  message: ['Speech bubble', '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'],
  grid: ['Grid', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'],
  book: ['Book', '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'],
  gift: ['Gift', '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'],
  pin: ['Map pin', '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'],
  id: ['ID card', '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 14h4"/>'],
  file: ['Document', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'],
  home: ['House', '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'],
  photo: ['Photograph', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 21v-1a5 5 0 0 1 10 0v1"/>'],
  shield: ['Shield', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'],
  wallet: ['Wallet', '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>'],
  ban: ['Not allowed', '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>'],
  edit: ['Pen', '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
  send: ['Paper plane', '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>'],
  search: ['Magnifier', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'],
  flag: ['Flag', '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'],
  info: ['Information', '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'],
  zap: ['Lightning', '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'],
  mic: ['Microphone', '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>'],
  folder: ['Folder', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'],
  compass: ['Compass', '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>'],
  lock: ['Padlock', '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'],
  bug: ['Bug (testing)', '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2M5 7l3 2M19 19l-3-2M5 19l3-2M20 13h-4M4 13h4M10 4l1 2M14 4l-1 2"/>'],
};

export const ICON_CHOICES: readonly (readonly [name: string, label: string])[] = Object.entries(ICON_SVG).map(
  ([name, [label]]) => [name, label] as const,
);

/* An icon of the landing page, drawn as it will be there. */
export function CmsIcon({ name, size = 20 }: { name: string; size?: number }) {
  const markup = ICON_SVG[name]?.[1] ?? ICON_SVG.check![1];
  return (
    <svg
      className="cms-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
