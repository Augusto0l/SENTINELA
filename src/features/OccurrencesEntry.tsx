"use client";
import dynamic from "next/dynamic";

// Keep the existing Canvas-based mock generation exclusively in the browser.
const Occurrences = dynamic(() => import("./Occurrences"), { ssr: false });

export default function OccurrencesEntry() { return <Occurrences />; }
