"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; title: string; description?: string }

const ToastCtx = React.createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-brand border bg-white p-3 shadow-lg",
              t.kind === "success" && "border-l-4 border-l-forest",
              t.kind === "error" && "border-l-4 border-l-danger",
              t.kind === "info" && "border-l-4 border-l-bayfront",
            )}
            role="status"
          >
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 size-5 text-forest" /> : t.kind === "error" ? <AlertTriangle className="mt-0.5 size-5 text-danger" /> : <Info className="mt-0.5 size-5 text-bayfront" />}
            <div className="flex-1 text-sm">
              <p className="font-heading font-semibold text-ink">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-grey-700">{t.description}</p> : null}
            </div>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="text-grey-500 hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
