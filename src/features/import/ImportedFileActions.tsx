"use client"

import { useId, type KeyboardEvent, type MouseEvent } from "react"
import NavigationIcon from "@/components/NavigationIcon"
import files from "./ImportedFiles.module.css"


type WriteAction = (() => void) | string
export default function ImportedFileActions({ name, onDetails, edit, remove, blockDescription }: {
  name: string; onDetails: () => void; edit?: WriteAction; remove?: WriteAction; blockDescription?: string
}) {
  const reasonId = useId()
  const reasons = [...new Set([edit, remove].filter((action): action is string => typeof action === "string"))]
  const actions = [
    { label: "Ver detalhes", icon: "eye", run: onDetails },
    { label: "Editar registros", icon: "pencil", run: edit },
    { label: "Excluir arquivo", icon: "trash", run: remove },
  ] as const

  function closeMenu(menu: HTMLDetailsElement) {
    menu.open = false
    menu.querySelector("summary")?.focus({ preventScroll: true })
  }

  function handleKey(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.preventDefault()
      closeMenu(event.currentTarget)
    }
  }

  function buttons() {
    return actions.map(({ label, icon, run }) => {
      if (run === undefined) return null
      const blocked = typeof run === "string"
      function activate(event: MouseEvent<HTMLButtonElement>) {
        if (typeof run !== "function") return
        const menu = event.currentTarget.closest("details")
        if (menu) closeMenu(menu)
        else event.currentTarget.focus({ preventScroll: true })
        run()
      }
      return <button type="button" key={label} className={files.fileAction} data-danger={icon === "trash"}
        aria-disabled={blocked || undefined} aria-label={label + " de " + name}
        aria-describedby={blocked ? blockDescription ?? reasonId + "-" + reasons.indexOf(run) : undefined}
        onClick={activate}><NavigationIcon name={icon} size={16} />{label}</button>
    })
  }

  return <>
    <div className={files.desktopActions}>{buttons()}</div>
    <details className={files.mobileActions} onKeyDown={handleKey}>
      <summary aria-label={"Ações de " + name}><NavigationIcon name="ellipsis" size={19} />Ações</summary>
      <div>{buttons()}</div>
    </details>
    {!blockDescription && reasons.map((reason, index) => <small key={reason} id={reasonId + "-" + index}>{reason}</small>)}
  </>
}
