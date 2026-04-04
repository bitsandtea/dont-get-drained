"use client";

import { useWallet } from "@/components/WalletProvider";
import { CONTRACTS, GUARD_STORAGE_SLOT } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function abbreviate(addr: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function TopNav() {
  const pathname = usePathname();
  const { wallet, connectWallet } = useWallet();
  const [agentCount, setAgentCount] = useState<number>(0);
  const [hasGuard, setHasGuard] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Fetch agent panel count when wallet is connected
  const fetchPanelInfo = useCallback(async () => {
    if (!CONTRACTS.SAFE || !CONTRACTS.INFERENCE_GUARD) return;
    try {
      const res = await fetch(
        `/api/guard/panel?guardAddress=${CONTRACTS.INFERENCE_GUARD}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setAgentCount(data.panel?.length || 0);
    } catch {
      // silently ignore
    }
  }, []);

  // Check if guard is set on the Safe
  const checkGuard = useCallback(async () => {
    if (!CONTRACTS.SAFE) return;
    try {
      const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const slot = await provider.getStorage(CONTRACTS.SAFE, GUARD_STORAGE_SLOT);
      const guard = ethers.getAddress("0x" + slot.slice(26));
      setHasGuard(guard !== ethers.ZeroAddress);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchPanelInfo();
    checkGuard();
  }, [wallet, fetchPanelInfo, checkGuard]);

  const navLinks = [
    { href: "/", label: "My Safe", always: true },
    { href: "/marketplace", label: "Marketplace", always: true },
    { href: "/guard", label: "Guard", always: true },
    { href: "/agents/create", label: "Create Agent", always: true },
    { href: "/og-storage", label: "Storage", always: true },
    { href: "/admin", label: "Admin", always: true },
  ];

  const visibleLinks = navLinks;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--panel-border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        {/* Logo / brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <svg
            width="28"
            height="28"
            viewBox="0 0 40 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="6"
              y="12"
              width="28"
              height="24"
              rx="6"
              fill="var(--panel-bg)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <circle cx="14" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
            <circle cx="14" cy="22" r="1.5" fill="var(--background)" />
            <circle cx="26" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
            <circle cx="26" cy="22" r="1.5" fill="var(--background)" />
            <circle
              cx="26"
              cy="22"
              r="5"
              fill="none"
              stroke="var(--yellow)"
              strokeWidth="0.8"
            />
          </svg>
          <span className="text-sm font-bold text-[var(--accent)] hidden sm:inline">
            Mr. Inference
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1">
          {visibleLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "text-[var(--sub)] hover:text-[var(--foreground)] hover:bg-white/5"
                }`}
              >
                {link.label}
                {link.href === "/guard" && agentCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-bold">
                    {agentCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Wallet + mobile menu */}
        <div className="flex items-center gap-2">
          {wallet ? (
            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-1.5 border border-white/5">
              <div
                className="w-2 h-2 rounded-full bg-[var(--green)]"
                style={{ animation: "pulse-soft 2s infinite" }}
              />
              <code className="text-xs text-[var(--orange)] font-mono">
                {abbreviate(wallet)}
              </code>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="btn btn-orange px-4 py-1.5 text-sm"
            >
              Connect Wallet
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex flex-col gap-1 p-2"
            aria-label="Toggle menu"
          >
            <span
              className={`block w-5 h-0.5 bg-[var(--foreground)] transition-transform ${
                menuOpen ? "rotate-45 translate-y-[3px]" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-[var(--foreground)] transition-opacity ${
                menuOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-[var(--foreground)] transition-transform ${
                menuOpen ? "-rotate-45 -translate-y-[3px]" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-[var(--panel-border)] bg-[var(--background)] px-4 py-3 space-y-1">
          {visibleLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "text-[var(--sub)] hover:text-[var(--foreground)] hover:bg-white/5"
                }`}
              >
                {link.label}
                {link.href === "/guard" && agentCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-bold">
                    {agentCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
