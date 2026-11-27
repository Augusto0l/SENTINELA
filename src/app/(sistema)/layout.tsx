import type { ReactNode } from "react";
import SystemSidebar from "@/components/SystemSidebar";
import OperationalProvider from "@/components/OperationalProvider";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import { persistentPcdfEnabled } from "@/lib/db/config";
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode";
import styles from "@/components/Navigation.module.css";

export default async function SystemLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  return (
    <OperationalProvider principal={principal}>
      <div className={`system-shell ${styles.shell}`}>
        <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
        <SystemSidebar pcdf={principal.source === "supabase" && !!hostedOperationalMode()
          || principal.source === "local" && (Boolean(isolatedPcdfMode()) || persistentPcdfEnabled())} />
        <main id="main-content" tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </OperationalProvider>
  );
}
