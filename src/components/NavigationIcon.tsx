export type NavigationIconName =
  | "dashboard" | "map" | "records" | "plus" | "upload" | "users"
  | "settings" | "logout" | "chevron" | "panel" | "menu" | "close" | "bell" | "sun" | "moon" | "shield"
  | "alert" | "calendar" | "hash" | "layers"
  | "pin" | "locate" | "search" | "trash" | "record-plus" | "eye" | "pencil" | "ellipsis"

const paths: Record<NavigationIconName, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15",
  records: "M8 3h8l4 4v14H4V3z M14 3v6h6 M8 13h8 M8 17h5",
  plus: "M12 5v14 M5 12h14",
  upload: "M12 16V3 m-5 5 5-5 5 5 M4 16v5h16v-5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  settings: "m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  logout: "M9 4H4v16h5 M9 12h12 m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  panel: "M3 4h18v16H3z M9 4v16 m7-12-3 4 3 4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M18 6 6 18",
  alert: "m10.3 4.5-8 14a1.5 1.5 0 0 0 1.3 2.2h16.8a1.5 1.5 0 0 0 1.3-2.2l-8-14a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16",
  hash: "m10 3-4 18 M18 3l-4 18 M4 9h17 M3 15h17",
  layers: "m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  pin: "M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 1 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  locate: "M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M12 2v3m0 14v3M2 12h3m14 0h3M12 12h.01",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M15 15l6 6",
  trash: "M4 6h16m-13 0 1 14h8l1-14m-7 4v6m4-6v6m-4-10V3h4v3",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  pencil: "m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-4-4L5 15z",
  ellipsis: "M5 12h.01M12 12h.01M19 12h.01",
  "record-plus": "M12 21H5V3h9l4 4v5M14 3v5h4M8 11h5m-5 4h3m7 0v6m-3-3h6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5",
  moon: "M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6",
}

export default function NavigationIcon({ name, size = 20 }: { name: NavigationIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  )
}
