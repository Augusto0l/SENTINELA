"use client"

import { Component, type ReactNode } from "react"
import styles from "@/components/map/SatelliteMap.module.css"

export default class SatelliteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return (
      <div className={styles.fallback} role="status">
        Não foi possível carregar o mapa de satélite. Selecione Calor, Pontos ou Clusters para continuar.
      </div>
    )
    return this.props.children
  }
}
