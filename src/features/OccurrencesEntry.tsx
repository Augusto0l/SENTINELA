"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";

// Keep the existing Canvas-based mock generation exclusively in the browser.
const Occurrences = dynamic(() => import("./Occurrences"), { ssr: false, loading: () => <PageSkeleton /> });

export default function OccurrencesEntry() { return <Occurrences />; }
