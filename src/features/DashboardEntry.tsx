"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

// Mocks initialize with Canvas/Path2D; preserve browser results without SSR.
// This also keeps the existing render-time timestamp out of hydration.
const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false });

export default function DashboardEntry() {
  const router = useRouter();
  return <Dashboard onNavigateToCrimeMap={(ra) => router.push(ra ? `/mapa-criminal?ra=${encodeURIComponent(ra)}` : "/mapa-criminal")} />;
}
