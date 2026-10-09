import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../index.css";
import DemoProvider from "@/components/DemoProvider";

export const metadata: Metadata = {
  title: "SENTINELA",
  icons: { icon: "/icons/sentinela.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body><DemoProvider>{children}</DemoProvider></body></html>;
}
