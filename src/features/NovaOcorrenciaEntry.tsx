"use client";
import { useRouter } from "next/navigation";
import NovaOcorrencia from "./NovaOcorrencia";

export default function NovaOcorrenciaEntry() {
  const router = useRouter();
  return <NovaOcorrencia onBack={() => router.push("/dashboard")} />;
}
