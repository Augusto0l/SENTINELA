"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
import type { ManualMapPoint } from "@/lib/db/manual-map";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";

// This screen imports browser-generated mocks at module scope.
const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false, loading: () => <PageSkeleton /> });

export default function CrimeMapEntry(props: {
  initialRaCode?: string; initialFilters?: AnalyticSelection; persistent?: boolean;
  focusedPoint?: ManualMapPoint | null;
}) {
  const { initialRaCode, initialFilters, persistent, focusedPoint } = props;
  return <CrimeMap key={JSON.stringify([initialRaCode, initialFilters, persistent, focusedPoint?.id])} {...props} />;
}
