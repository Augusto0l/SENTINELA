export type NavigationIconName =
  | "dashboard" | "map" | "records" | "plus" | "upload" | "users"
  | "settings" | "logout" | "chevron" | "panel" | "bell" | "sun" | "moon" | "shield"

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
