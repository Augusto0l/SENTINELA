type Icon = "mail" | "lock" | "eye" | "eye-off" | "arrow" | "chart" | "target" | "database"
export default function LoginIcon({ name, className }: { name: Icon; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "mail" && <><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="m3.5 6 8.5 7L20.5 6" /></>}
    {name === "lock" && <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" /><circle cx="12" cy="14" r=".6" /></>}
    {(name === "eye" || name === "eye-off") && <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{name === "eye-off" && <path d="m3 3 18 18" />}</>}
    {name === "arrow" && <path d="M3 12h17m-6-6 6 6-6 6" />}
    {name === "chart" && <><path d="M3 12h4v10H3zM10 3h4v19h-4zM17 8h4v14h-4z" /></>}
    {name === "target" && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><path d="M12 1v5m0 12v5M1 12h5m12 0h5" /></>}
    {name === "database" && <><ellipse cx="12" cy="4" rx="8" ry="3" /><path d="M4 4v15c0 1.7 3.6 3 8 3s8-1.3 8-3V4M4 9c0 1.7 3.6 3 8 3s8-1.3 8-3M4 14c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>}
  </svg>
}
