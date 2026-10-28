"use client";

import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
import { useRouter } from "next/navigation";
import { crimeMapHref, emptyDemoFilters } from "@/data/demoAnalytics";

// Mocks initialize with Canvas/Path2D; preserve browser results without SSR.
// This also keeps the existing render-time timestamp out of hydration.
const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false, loading: () => <PageSkeleton /> });

export default function DashboardEntry() {
  const router = useRouter();
  return <Dashboard onNavigateToCrimeMap={(ra, filters) => router.push(crimeMapHref({ ...(filters ?? emptyDemoFilters()), ra: ra ?? filters?.ra ?? "" }))} />;
}
