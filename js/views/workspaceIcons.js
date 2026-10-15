import { referenceIconPaths } from "./referenceIconPaths.js";

const icons = {
  cover: `<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 8h18"/>`,
  expand: `<path d="M14 3h7v7M21 3l-8 8M10 21H3v-7M3 21l8-8"/>`,
  arrowLeft: `<path d="M20 12H4m6-6-6 6 6 6"/>`,
  menu: `<path d="M4 6h16M4 12h16M4 18h16"/>`,
  home: `
    <path d="M3 11.5 12 4l9 7.5"/>
    <path d="M5.5 10.5V20h13v-9.5"/>
    <path d="M9.5 20v-6h5v6"/>
  `,

  inbox: `
    <rect x="4" y="5" width="16" height="14" rx="1.5"/>
    <path d="M4 14h4l2 2h4l2-2h4"/>
  `,

  bell: `
    <path d="M7 9a5 5 0 0 1 10 0v5l2 3H5l2-3z"/>
    <path d="M10 20h4"/>
  `,

  user: `
    <circle cx="12" cy="8" r="3"/>
    <path d="M5.5 20c.4-4 2.6-6 6.5-6s6.1 2 6.5 6"/>
  `,

  support: `
    <path d="M4 12a8 8 0 0 1 16 0"/>
    <path d="M4 12v4a2 2 0 0 0 2 2h2v-7H6a2 2 0 0 0-2 2"/>
    <path d="M20 12v4a2 2 0 0 1-2 2h-2v-7h2a2 2 0 0 1 2 2"/>
    <path d="M16 20h-3"/>
  `,

  demo: `
    <rect x="3" y="4" width="18" height="13" rx="1.5"/>
    <path d="M8 21h8M12 17v4"/>
  `,

  logout: `
    <path d="M10 5H5v14h5"/>
    <path d="m13 8 4 4-4 4M17 12H8"/>
  `,

  proposal: `
    <rect x="6" y="3" width="12" height="17" rx="1"/>
    <path d="M9 7h6M9 11h6M9 15h4"/>
    <path d="M3.5 7v13h10"/>
  `,

  clients: `
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 19c.4-3.2 2.3-5 5.5-5s5.1 1.8 5.5 5"/>
    <circle cx="17" cy="9" r="2.3"/>
    <path d="M15.5 14.8c3-.4 5 1.2 5.3 4.2"/>
  `,

  tasks: `
    <rect x="5" y="4" width="14" height="6" rx="1"/>
    <rect x="5" y="14" width="14" height="6" rx="1"/>
  `,

  settings: `
    <circle cx="12" cy="12" r="3"/>
    <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1A8 8 0 0 0 15 6l-.4-2.5h-4L10 6a8 8 0 0 0-1.6 1.1l-2.3-1-2 3.4L6 11a7 7 0 0 0 0 2l-1.9 1.5 2 3.4 2.3-1A8 8 0 0 0 10 18l.6 2.5h4L15 18a8 8 0 0 0 1.6-1.1l2.3 1 2-3.4L19 13a7 7 0 0 0 0-1Z"/>
  `,

  more: `
    <circle cx="5" cy="12" r="1"/>
    <circle cx="12" cy="12" r="1"/>
    <circle cx="19" cy="12" r="1"/>
  `,

  star: `
    <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>
  `,

  circle: `<circle cx="12" cy="12" r="8"/>`,

  copy: `<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M16 8V4H5v13h3"/>`,

  palette: `
    <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6z"/>
    <circle cx="7.5" cy="9" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="17" cy="9" r="1"/>
  `,

  layers: `
    <path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>
  `,

  chevronLeft: `
    <path d="m14.5 6-6 6 6 6"/>
  `,

  chevronRight: `
    <path d="m9.5 6 6 6-6 6"/>
  `,

  share: `
    <circle cx="18" cy="5" r="2"/>
    <circle cx="6" cy="12" r="2"/>
    <circle cx="18" cy="19" r="2"/>
    <path d="m8 11 8-5M8 13l8 5"/>
  `,

  paperclip: `
    <path d="M8 12.5 14.5 6a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7.1-7.1l8-8"/>
  `,

  image: `
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <circle cx="8" cy="9" r="1.5"/>
    <path d="m4 17 5-5 4 4 2-2 5 5"/>
  `,

  repeat: `
    <path d="M17 2l4 4-4 4"/>
    <path d="M3 11V9a3 3 0 0 1 3-3h15"/>
    <path d="M7 22l-4-4 4-4"/>
    <path d="M21 13v2a3 3 0 0 1-3 3H3"/>
  `,

  subtasks: `
    <path d="m4 6 2 2 4-4M12 6h8M4 13l2 2 4-4M12 13h8M4 20h6M12 20h8"/>
  `,

  tag: `
    <path d="M3 12V5h7l11 11-7 7z"/>
    <circle cx="7.5" cy="8.5" r="1"/>
  `,

  calendar: `
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <path d="M7 3v4M17 3v4M3 10h18"/>
  `,

  flag: `
    <path d="M5 21V4M5 5h11l-2 4 2 4H5"/>
  `,

  smile: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>
  `,

  lock: `
    <rect x="5" y="10" width="14" height="11" rx="2"/>
    <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
  `,

  apps: `
    <rect x="4" y="4" width="5" height="5" rx=".5"/>
    <rect x="15" y="4" width="5" height="5" rx=".5"/>
    <rect x="4" y="15" width="5" height="5" rx=".5"/>
    <rect x="15" y="15" width="5" height="5" rx=".5"/>
  `,

  library: `
    <rect x="5" y="4" width="14" height="16" rx="1"/>
    <path d="M10 4v16"/>
  `,

  everything: `
    <path d="M12 3 8.5 9h7z"/>
    <rect x="4" y="14" width="6" height="6" rx="1"/>
    <circle cx="17" cy="17" r="3"/>
  `,

  cube: `
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/>
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>
  `,

  imageFile: `
    <path d="M4 7h7l2-2h7v13H4z"/>
    <path d="M4 7v12h16"/>
    <path d="m7 16 3-3 2 2 2-3 3 4"/>
  `,

  invoice: `
    <path d="M6 3h12v18H6z"/>
    <path d="M9 7h6"/>
    <path d="M9 11h6"/>
    <path d="M9 15h4"/>
  `,

  folder: `
    <path d="M3.5 7.5h6l2-2h4.5l2 2h2.5v11H3.5z"/>
  `,

  folderFilled: `
    <path d="M3.5 7.5h6l2-2h4.5l2 2h2.5v11H3.5z"/>
  `,

  board: `
    <rect x="4" y="4" width="6" height="16" rx="1"/>
    <rect x="14" y="4" width="6" height="11" rx="1"/>
  `,

  conversation: `
    <path d="M4 5h16v11H9l-5 4z"/>
  `,

  chat: `
    <path d="M4 5h16v11H9l-5 4z"/>
  `,

  embed: `
    <path d="M9.5 8H8a4 4 0 0 0 0 8h3"/>
    <path d="M14.5 8H16a4 4 0 0 1 0 8h-3"/>
    <path d="M8.5 12h7"/>
  `,

  link: `
    <rect x="4" y="5" width="14" height="15" rx="1"/>
    <path d="M13 4h7v7"/>
    <path d="m20 4-9 9"/>
  `,

  upload: `<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v5h16v-5"/>`,
  cloud: `<path d="M7 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 7 8.5 4.8 4.8 0 0 0 7 18Z"/>`,
  drive: `<path d="m9 3-6 11 3 5h12l3-5-6-11z"/><path d="m9 3 6 11H3M6 19l6-10 6 10"/>`,
  dropbox: `<path d="m7 4 5 3-5 3-5-3zM17 4l5 3-5 3-5-3zM7 11l5 3-5 3-5-3zM17 11l5 3-5 3-5-3zM7 18l5 3 5-3"/>`,

  doc: `
    <path d="M6 3h8l4 4v14H6z"/>
    <path d="M14 3v5h5"/>
  `,

  document: `
    <path d="M6 3h8l4 4v14H6z"/>
    <path d="M14 3v5h5"/>
  `,

  file: `
    <path d="M6 3h8l4 4v14H6z"/>
    <path d="M14 3v5h5"/>
  `,

  client: `
    <circle cx="12" cy="8" r="3"/>
    <path d="M5.5 20c.3-4 2.6-6 6.5-6s6.2 2 6.5 6"/>
  `,

  milestone: `
    <path d="m12 3 8 6-3 10H7L4 9z"/>
  `,

  search: `
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="m15.5 15.5 5 5"/>
  `,

  filter: `
    <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5z"/>
  `,

  sort: `
    <path d="M8 4v16"/>
    <path d="m5 7 3-3 3 3"/>
    <path d="M16 20V4"/>
    <path d="m13 17 3 3 3-3"/>
  `,

  list: `
    <path d="M9 6h11M9 12h11M9 18h11"/>
    <circle cx="4.5" cy="6" r=".8"/>
    <circle cx="4.5" cy="12" r=".8"/>
    <circle cx="4.5" cy="18" r=".8"/>
  `,

  archive: `
    <rect x="5" y="7" width="14" height="13" rx="1"/>
    <path d="M4 4h16v4H4z"/>
    <path d="M9 12h6"/>
  `,

  template: `
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <path d="M8 8h8M8 12h8M8 16h5"/>
  `,

  trash: `
    <path d="M5 7h14"/>
    <path d="M9 7V4h6v3"/>
    <path d="m7 7 1 13h8l1-13"/>
    <path d="M10 11v5M14 11v5"/>
  `,

  check: `
    <path d="m5 12 4 4 10-10"/>
  `,

  checkCircle: `
    <circle cx="12" cy="12" r="9"/>
    <path d="m8 12 2.5 2.5L16 9"/>
  `,

  notification: `
    <path d="M7 9a5 5 0 0 1 10 0v5l2 3H5l2-3z"/>
    <path d="M10 20h4"/>
  `,

  chevronDown: `
    <path d="m6 9 6 6 6-6"/>
  `,

  plus: `
    <path d="M12 5v14M5 12h14"/>
  `,

  edit: `
    <path d="m5 15 10-10 4 4L9 19H5z"/>
    <path d="m13 7 4 4"/>
  `,

  arrowRight: `
    <path d="M5 12h14"/>
    <path d="m15 8 4 4-4 4"/>
  `
};

export function workspaceIcon(name, className = 'v-svg-icon') {
  const span = document.createElement('span');

  const referencePath = ['board','conversation','checkCircle','invoice','inbox','doc','file'].includes(name) ? null : referenceIconPaths[name];

  span.className = [...new Set(['v-svg-icon',...className.split(/\s+/)])].join(' ');
  span.setAttribute('aria-hidden', 'true');

  span.innerHTML = referencePath ? `
    <svg
      class="is-reference-icon"
      viewBox="0 -960 960 960"
      fill="currentColor"
      focusable="false"
    >
      <path d="${referencePath}"></path>
    </svg>
  ` : `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      ${icons[name] || icons.file}
    </svg>
  `;

  return span;
}
