"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
import type { DemoFilters } from "@/data/demoAnalytics";

// This screen imports browser-generated mocks at module scope.
const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false, loading: () => <PageSkeleton /> });

export default function CrimeMapEntry({ initialRaCode, initialFilters }: { initialRaCode?: string; initialFilters?: DemoFilters }) {
  return <CrimeMap key={JSON.stringify([initialRaCode, initialFilters])} initialRaCode={initialRaCode} initialFilters={initialFilters} />;
}
