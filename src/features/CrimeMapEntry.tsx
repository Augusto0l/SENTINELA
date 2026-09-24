"use client";
import dynamic from "next/dynamic";

// This screen imports browser-generated mocks at module scope.
const CrimeMap = dynamic(() => import("./CrimeMap"), { ssr: false });

export default function CrimeMapEntry({ initialRaCode }: { initialRaCode?: string }) {
  return <CrimeMap key={initialRaCode ?? "all"} initialRaCode={initialRaCode} />;
}
