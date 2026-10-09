import CrimeMapEntry from "@/features/CrimeMapEntry";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ ra?: string | string[] }>;
}) {
  const { ra } = await searchParams;
  return <CrimeMapEntry initialRaCode={typeof ra === "string" ? ra : undefined} />;
}
