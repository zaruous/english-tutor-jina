// icons.jsx — Custom SVG icons (stroke-based, 24x24)

const Icon = ({ d, size = 20, stroke = 1.6, fill = 'none', children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  // Tab bar
  Home: (p) => <Icon {...p}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/></Icon>,
  Chat: (p) => <Icon {...p}><path d="M21 12c0 4.4-4 8-9 8-1.2 0-2.4-.2-3.5-.6L3 21l1.6-4.5C3.6 15.2 3 13.7 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></Icon>,
  Library: (p) => <Icon {...p}><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 6l4 1.2-3 14L13 20"/></Icon>,
  Mic: (p) => <Icon {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 19v3"/></Icon>,
  Profile: (p) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></Icon>,
  // UI
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Settings: (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>,
  Bell: (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></Icon>,
  Plus: (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Send: (p) => <Icon {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></Icon>,
  Sparkle: (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></Icon>,
  Sparkles: (p) => <Icon {...p}><path d="M12 2 13.5 8.5 20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5zM19 3v3M20.5 4.5h-3M5 18v2M6 19H4"/></Icon>,
  Flame: (p) => <Icon {...p}><path d="M8 14c0-3 4-4 4-9 0 0 7 5 7 11a7 7 0 1 1-14 0c0-2 1-3.5 2-4.5 0 1.5 1 2.5 1 2.5z"/></Icon>,
  Trophy: (p) => <Icon {...p}><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0zM6 4H3v3a3 3 0 0 0 3 3M18 4h3v3a3 3 0 0 1-3 3"/></Icon>,
  Target: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></Icon>,
  Calendar: (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></Icon>,
  Clock: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Play: (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M7 5v14l12-7z"/></Icon>,
  Pause: (p) => <Icon {...p}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></Icon>,
  ArrowRight: (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>,
  ArrowLeft: (p) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></Icon>,
  Check: (p) => <Icon {...p}><path d="m5 12 5 5L20 7"/></Icon>,
  X: (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>,
  ChevronDown: (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  Volume: (p) => <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></Icon>,
  Headphones: (p) => <Icon {...p}><path d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z"/></Icon>,
  Book: (p) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></Icon>,
  Bolt: (p) => <Icon {...p}><path d="m13 2-9 11h7l-1 9 9-11h-7z"/></Icon>,
  Star: (p) => <Icon {...p}><path d="m12 2 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></Icon>,
  Heart: (p) => <Icon {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7 11 4.6a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></Icon>,
  TrendUp: (p) => <Icon {...p}><path d="M23 6 13.5 15.5l-5-5L1 18M17 6h6v6"/></Icon>,
  Filter: (p) => <Icon {...p}><path d="M3 5h18M6 12h12M10 19h4"/></Icon>,
  ChartBar: (p) => <Icon {...p}><path d="M3 21h18M7 17V9M12 17V5M17 17v-6"/></Icon>,
  Lightning: (p) => <Icon {...p} fill="currentColor" stroke="none"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></Icon>,
  Refresh: (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></Icon>,
  Pin: (p) => <Icon {...p}><path d="M12 17v5M9 10V4h6v6l3 5H6z"/></Icon>,
  Folder: (p) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></Icon>,
  Globe: (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Icon>,
  Layers: (p) => <Icon {...p}><path d="m12 2 10 6-10 6L2 8zM2 16l10 6 10-6M2 12l10 6 10-6"/></Icon>,
  Brain: (p) => <Icon {...p}><path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 10v1a3 3 0 0 0 2 2.8V15a3 3 0 0 0 3 3v2M15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 2.5v1a3 3 0 0 1-2 2.8V15a3 3 0 0 1-3 3v2M12 4v18"/></Icon>,
  Menu: (p) => <Icon {...p}><path d="M3 6h18M3 12h18M3 18h18"/></Icon>,
  Eye: (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  ThumbUp: (p) => <Icon {...p}><path d="M7 22V11M14 5l-1 5h7a2 2 0 0 1 2 2l-2.5 8a2 2 0 0 1-2 1.5H7M3 11h4v11H3z"/></Icon>,
  BookOpen: (p) => <Icon {...p}><path d="M2 4h9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H2zM22 4h-9a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h9zM12 7H8M12 11H8M12 15H8"/></Icon>,
  Chart: (p) => <Icon {...p}><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/></Icon>,
  Award: (p) => <Icon {...p}><circle cx="12" cy="9" r="6"/><path d="M8 14.5 7 21l5-3 5 3-1-6.5"/></Icon>,
  Users: (p) => <Icon {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
};

window.Icons = Icons;
window.Icon = Icon;
