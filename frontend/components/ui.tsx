"use client";

import { useState } from "react";

export function abbreviate(addr: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-[var(--sub)] hover:text-[var(--accent)] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--accent)] hover:underline transition-colors"
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
