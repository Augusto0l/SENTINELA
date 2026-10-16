import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../index.css";
import ThemeProvider from "@/components/ThemeProvider";
import { themeInitializationScript } from "@/data/theme";
import DemoProvider from "@/components/DemoProvider";

export const metadata: Metadata = {
  title: "SENTINELA",
  icons: { icon: "/icons/sentinela.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head><body><ThemeProvider><DemoProvider>{children}</DemoProvider></ThemeProvider></body></html>;
}
