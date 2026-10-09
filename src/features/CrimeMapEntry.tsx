"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

// This screen imports browser-generated mocks at module scope.
const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false, loading: () => <PageSkeleton /> });

export default function CrimeMapEntry({ initialRaCode }: { initialRaCode?: string }) {
  return <CrimeMap key={initialRaCode ?? "all"} initialRaCode={initialRaCode} />;
}
