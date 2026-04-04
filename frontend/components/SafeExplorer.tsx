"use client";

import { TOKENS } from "@/lib/contracts";
import { abbreviate, CopyButton } from "./ui";

type SafeExplorerProps = {
  safeInput: string;
  onSafeInputChange: (v: string) => void;
  safeAddress: string;
  safeLoaded: boolean;
  loadingSafe: boolean;
  onLoadSafe: () => void;
  safeBalances: { eth: string; usdc: string; dai: string } | null;
  safeOwners: string[];
  guardAddress: string;
  guardInput: string;
  onGuardInputChange: (v: string) => void;
  onSetGuard: () => void;
  guardLoading: boolean;
  wallet: string | null;
};

export function SafeExplorer({
  safeInput, onSafeInputChange, safeAddress, safeLoaded, loadingSafe, onLoadSafe,
  safeBalances, safeOwners, guardAddress, guardInput, onGuardInputChange, onSetGuard,
  guardLoading, wallet,
}: SafeExplorerProps) {
  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--purple)] flex items-center justify-center text-black font-bold text-lg">
              S
            </div>
            {safeLoaded && (
              <div
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--green)] border-2 border-[var(--background)]"
                style={{ animation: "pulse-soft 2s infinite" }}
              />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--accent)]">Safe Explorer</h2>
            <p className="text-xs text-[var(--sub)]">Enter a Safe address to inspect</p>
          </div>
        </div>
        {safeLoaded && (
          <span className={`px-2.5 py-1 text-xs font-medium border rounded-md ${guardAddress ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]" : "border-[var(--yellow)] text-[var(--yellow)] bg-[var(--orange-dim)]"}`}>
            {guardAddress ? "Guarded" : "No Guard"}
          </span>
        )}
      </div>

      <div>
        <label className="text-xs text-[var(--sub)] block mb-1.5">Safe Address</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="0x..."
            value={safeInput}
            onChange={(e) => onSafeInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onLoadSafe(); }}
            className="input flex-1 px-4 py-2.5 text-sm font-mono"
          />
          <button
            onClick={onLoadSafe}
            disabled={loadingSafe || !safeInput.trim()}
            className="btn btn-accent px-5 py-2.5 text-sm"
          >
            {loadingSafe ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      {safeLoaded && (
        <>
          <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--sub)]">Vault Address</span>
              <CopyButton text={safeAddress} />
            </div>
            <code className="text-base text-[var(--accent)] break-all font-mono">
              {safeAddress}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5">
              <span className="text-xs text-[var(--sub)] block mb-1">Guard Contract</span>
              <code className="text-sm text-[var(--purple)] font-mono">
                {guardAddress ? abbreviate(guardAddress) : "None"}
              </code>
            </div>
            <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5">
              <span className="text-xs text-[var(--sub)] block mb-1">Owners ({safeOwners.length})</span>
              <div className="space-y-0.5">
                {safeOwners.length > 0
                  ? safeOwners.map((o) => (
                      <code key={o} className="text-sm text-[var(--purple)] font-mono block">{abbreviate(o)}</code>
                    ))
                  : <code className="text-sm text-[var(--purple)] font-mono">---</code>}
              </div>
            </div>
          </div>

          {!guardAddress && (
            <div className="bg-black/20 rounded-lg px-4 py-3 border border-[var(--yellow)]/30 space-y-2">
              <span className="text-xs text-[var(--yellow)] block">No guard detected. Set one to enable AI protection:</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Guard contract address (0x...)"
                  value={guardInput}
                  onChange={(e) => onGuardInputChange(e.target.value)}
                  className="input flex-1 px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={onSetGuard}
                  disabled={guardLoading || !wallet || !guardInput.trim()}
                  className="btn btn-orange px-4 py-2 text-sm"
                >
                  {guardLoading ? "Setting..." : "Set Guard"}
                </button>
              </div>
              {!wallet && <span className="text-xs text-[var(--sub)]">Connect wallet first to set guard</span>}
            </div>
          )}

          <div>
            <span className="text-xs text-[var(--sub)] block mb-2">Safe Balances</span>
            {safeBalances ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                  <span className="text-lg font-mono font-semibold text-[var(--accent)]">{safeBalances.eth}</span>
                  <span className="text-xs text-[var(--sub)] block mt-0.5">ETH</span>
                </div>
                <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                  <span className="text-lg font-mono font-semibold text-[var(--green)]">{safeBalances.usdc}</span>
                  <span className="text-xs text-[var(--sub)] block mt-0.5">USDC</span>
                </div>
                <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                  <span className="text-lg font-mono font-semibold text-[var(--yellow)]">{safeBalances.dai}</span>
                  <span className="text-xs text-[var(--sub)] block mt-0.5">DAI</span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                {Object.entries(TOKENS).map(([symbol]) => (
                  <div key={symbol} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-black/20">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                    <span className="text-sm font-medium">{symbol}</span>
                    <span className="text-xs text-[var(--sub)]">--</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
