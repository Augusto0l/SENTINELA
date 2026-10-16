"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "./ui/button";

const DemoContext = createContext<(message: string) => void>(() => {});
export function useDemoToast() { return useContext(DemoContext); }

export default function DemoProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 6500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <DemoContext.Provider value={notify}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {message && <div className="demo-toast"><span>{message}</span><Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setMessage("")}>×</Button></div>}
      </div>
    </DemoContext.Provider>
  );
}
