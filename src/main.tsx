import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

// Fix leaflet default icon paths broken by bundlers
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
