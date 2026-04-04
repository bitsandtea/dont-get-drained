"use client";

import { TOKENS } from "@/lib/contracts";
import type { QuotePreview } from "@/lib/types";

type SwapConfiguratorProps = {
  amountIn: string;
  onAmountChange: (v: string) => void;
  tokenOut: string;
  onTokenChange: (v: string) => void;
  swapIntent: string;
  onIntentChange: (v: string) => void;
  quotePreview: QuotePreview | null;
  quoteLoading: boolean;
  quoteError: string;
  onBack: () => void;
  onNext: () => void;
};

export function SwapConfigurator({
  amountIn, onAmountChange, tokenOut, onTokenChange,
  swapIntent, onIntentChange, quotePreview, quoteLoading, quoteError,
  onBack, onNext,
}: SwapConfiguratorProps) {
  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]">
          2
        </div>
        <h2 className="text-lg font-semibold">Configure Swap</h2>
      </div>

      <div>
        <label className="text-sm text-[var(--sub)] block mb-1.5">Amount (ETH)</label>
        <input
          type="number"
          step="0.01"
          value={amountIn}
          onChange={(e) => onAmountChange(e.target.value)}
          className="input w-full px-4 py-3 text-xl font-mono"
        />
      </div>

      <div>
        <label className="text-sm text-[var(--sub)] block mb-1.5">Receive Token</label>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(TOKENS).map(([key, token]) => (
            <button
              key={key}
              onClick={() => onTokenChange(key)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-colors ${
                tokenOut === key
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-white/5 bg-black/20 hover:border-white/20"
              }`}
            >
              <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full" />
              <span className={`text-xs font-semibold ${tokenOut === key ? "text-[var(--accent)]" : "text-[var(--sub)]"}`}>
                {token.symbol}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-[var(--sub)] block mb-1.5">Swap Intent</label>
        <textarea
          value={swapIntent}
          onChange={(e) => onIntentChange(e.target.value)}
          placeholder="Describe why you're making this swap (e.g. 'converting ETH to USDC to cover upcoming vendor payment')"
          rows={2}
          className="input w-full px-4 py-3 text-sm resize-none"
        />
        {swapIntent.length > 0 && swapIntent.trim().length < 10 && (
          <p className="text-[10px] text-[var(--yellow)] mt-1">Minimum 10 characters</p>
        )}
      </div>

      {quoteLoading && (
        <div className="bg-black/20 rounded-lg px-4 py-4 border border-white/5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" style={{ animation: "pulse-soft 0.8s infinite" }} />
            <span className="text-sm text-[var(--sub)]">Fetching Uniswap quote...</span>
          </div>
          <div className="h-1 rounded-full bg-black/30 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
                backgroundSize: "200% 100%",
                animation: "progress-sweep 1.5s linear infinite",
              }}
            />
          </div>
        </div>
      )}

      {quoteError && !quoteLoading && (
        <div className="bg-black/20 rounded-lg px-4 py-3 border border-[var(--orange)]/30 text-sm text-[var(--orange)]">
          Quote unavailable: {quoteError}
        </div>
      )}

      {quotePreview && !quoteLoading && (
        <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-xs text-[var(--sub)] block mb-1">You receive (estimated)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-semibold text-[var(--green)]">
                {parseFloat(quotePreview.outputAmount).toFixed(
                  TOKENS[tokenOut]?.decimals <= 6 ? 2 : 6
                )}
              </span>
              <span className="text-sm text-[var(--accent)]">{tokenOut}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/5">
            <div className="bg-[var(--panel-bg)] px-4 py-2.5">
              <span className="text-[10px] text-[var(--sub)] block">Rate</span>
              <span className="text-sm font-mono text-[var(--foreground)]">
                1 ETH = {parseFloat(quotePreview.executionPrice).toFixed(
                  TOKENS[tokenOut]?.decimals <= 6 ? 2 : 4
                )} {tokenOut}
              </span>
            </div>
            <div className="bg-[var(--panel-bg)] px-4 py-2.5">
              <span className="text-[10px] text-[var(--sub)] block">Gas Fee</span>
              <span className="text-sm font-mono text-[var(--foreground)]">
                ${quotePreview.gasFeeUSD !== "unknown" ? parseFloat(quotePreview.gasFeeUSD).toFixed(2) : "--"}
              </span>
            </div>
            <div className="bg-[var(--panel-bg)] px-4 py-2.5">
              <span className="text-[10px] text-[var(--sub)] block">Price Impact</span>
              <span className={`text-sm font-mono ${
                quotePreview.priceImpact !== "unknown" && parseFloat(quotePreview.priceImpact) > 1
                  ? "text-[var(--orange)]"
                  : "text-[var(--foreground)]"
              }`}>
                {quotePreview.priceImpact !== "unknown" ? `${quotePreview.priceImpact}%` : "--"}
              </span>
            </div>
            <div className="bg-[var(--panel-bg)] px-4 py-2.5">
              <span className="text-[10px] text-[var(--sub)] block">Routing</span>
              <span className="text-sm font-mono text-[var(--foreground)]">
                {quotePreview.routing}
              </span>
            </div>
          </div>

          <div className="px-4 py-2 text-[10px] text-[var(--sub)] border-t border-white/5">
            Max slippage: 0.5% &middot; via Uniswap Trading API
          </div>
        </div>
      )}

      {!quotePreview && !quoteLoading && !quoteError && (
        <div className="bg-black/20 rounded-lg px-4 py-2.5 border border-white/5 text-sm text-[var(--sub)]">
          Route: <span className="text-[var(--foreground)]">{amountIn} ETH</span>
          <span className="mx-1.5">&rarr;</span>
          <span className="text-[var(--accent)]">{tokenOut}</span>
          <span className="ml-1">via Uniswap Trading API</span>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-accent px-6 py-3 text-base">
          &larr; Back
        </button>
        <button
          onClick={onNext}
          disabled={!amountIn || swapIntent.trim().length < 10}
          className="btn btn-accent flex-1 py-3 text-base"
        >
          Next &rarr;
        </button>
      </div>
    </section>
  );
}
