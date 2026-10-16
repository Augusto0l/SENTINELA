"use client";

// Radix primitives used by shadcn/ui: focus trap, Escape and focus restoration.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRef, type CSSProperties, type ReactNode } from "react";

export default function Dialog({ title, children, onClose, style, drawer = false }: {
  title: string; children: ReactNode; onClose: () => void; style?: CSSProperties; drawer?: boolean;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={drawer ? "demo-dialog demo-drawer" : "demo-dialog"}
          style={style}
          aria-describedby={undefined}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={(event) => {
            // Dialog is mounted by existing action handlers instead of a Radix Trigger.
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
