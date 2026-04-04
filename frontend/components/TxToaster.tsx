"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";

// --- Types ---

interface TxToast {
  id: number;
  label: string; // e.g. "Agent Registered", "Prompt Stored on 0G"
  hash: string; // tx hash or root hash
  kind: "tx" | "storage"; // chain tx vs 0G storage
  ts: number;
}

interface TxToasterCtx {
  push: (label: string, hash: string, kind?: "tx" | "storage") => void;
}

const Ctx = createContext<TxToasterCtx>({ push: () => {} });

export const useTxToast = () => useContext(Ctx);

// --- Explorer URLs ---

const CHAIN_EXPLORER = "https://chainscan-galileo.0g.ai/tx/";
const STORAGE_EXPLORER = "https://storagescan-galileo.0g.ai/tx/";

function explorerUrl(hash: string, kind: "tx" | "storage") {
  return kind === "storage"
    ? `${STORAGE_EXPLORER}${hash}`
    : `${CHAIN_EXPLORER}${hash}`;
}

// --- Provider + Toast UI ---

const TOAST_TTL = 8000; // auto-dismiss after 8s

export function TxToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<TxToast[]>([]);
  const nextId = useRef(0);

  const push = useCallback(
    (label: string, hash: string, kind: "tx" | "storage" = "tx") => {
      const id = nextId.current++;
      const toast: TxToast = { id, label, hash, kind, ts: Date.now() };
      setToasts((prev) => [...prev, toast]);

      // Auto-dismiss
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_TTL);
    },
    []
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxWidth: 420,
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                pointerEvents: "auto",
                background: "var(--panel-bg)",
                border: "1px solid var(--panel-border)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                animation: "toast-in 0.25s ease-out",
              }}
            >
              {/* Icon */}
              <span
                style={{
                  color: t.kind === "storage" ? "var(--purple)" : "var(--accent)",
                  fontSize: 14,
                  lineHeight: "20px",
                  flexShrink: 0,
                }}
              >
                {t.kind === "storage" ? "\u25c8" : "\u25ce"}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    marginBottom: 2,
                  }}
                >
                  {t.label}
                </div>
                <a
                  href={explorerUrl(t.hash, t.kind)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono), monospace",
                    color: "var(--accent)",
                    textDecoration: "none",
                    wordBreak: "break-all",
                  }}
                >
                  {t.hash.slice(0, 10)}...{t.hash.slice(-8)} ↗
                </a>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--sub)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: "20px",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
