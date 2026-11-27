"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import NavigationIcon from "@/components/NavigationIcon";
import styles from "@/components/Navigation.module.css";
import { NAVIGATION_ROUTES } from "@/lib/auth/policy";

const routes = NAVIGATION_ROUTES;

export default function SystemSidebar({ pcdf = false }: { pcdf?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const currentPage = Object.keys(routes).find((key) => routes[key] === pathname) ?? "dashboard";
  const dashboard = pathname === routes.dashboard;
  const navigate = (page: string) => {
    if (routes[page]) router.push(routes[page]);
  };

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeDrawer = () => { if (desktop.matches) setDrawerOpen(false); };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);

  return (
    <>
      <Sidebar
        currentPage={currentPage}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        navigationId="system-navigation"
        pcdf={pcdf}
        dashboard={dashboard}
      />
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Trigger className={`${styles.iconButton} ${styles.mobileToggle}`} aria-label="Abrir navegação">
          <NavigationIcon name="menu" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.drawerOverlay} />
          <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Menu principal</Dialog.Title>
            <Sidebar
              currentPage={currentPage}
              onNavigate={(page) => { setDrawerOpen(false); navigate(page); }}
              collapsed={false}
              onClose={() => setDrawerOpen(false)}
              navigationId="mobile-system-navigation"
              pcdf={pcdf}
              dashboard={dashboard}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
