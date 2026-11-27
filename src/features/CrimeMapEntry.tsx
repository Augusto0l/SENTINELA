"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";

// This screen imports browser-generated mocks at module scope.
const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false, loading: () => <PageSkeleton /> });

export default function CrimeMapEntry({ initialRaCode, initialFilters, persistent }: { initialRaCode?: string; initialFilters?: AnalyticSelection; persistent?: boolean }) {
  return <CrimeMap key={JSON.stringify([initialRaCode, initialFilters, persistent])} initialRaCode={initialRaCode} initialFilters={initialFilters} persistent={persistent} />;
}
