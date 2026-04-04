"use client";

import { CopyButton } from "./ui";
import type { ApproveResult } from "@/lib/types";

type ExecuteStepProps = {
  approveResult: ApproveResult;
  executeLoading: boolean;
  executed: boolean;
  onExecute: () => void;
  onBack: () => void;
};

export function ExecuteStep({
  approveResult, executeLoading, executed, onExecute, onBack,
}: ExecuteStepProps) {
  return (
    <section className="card card-green p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]">
          4
        </div>
        <h2 className="text-lg font-semibold text-[var(--green)]">Execute Transaction</h2>
      </div>

      <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-[var(--sub)]">Approval TX</span>
          <CopyButton text={approveResult.txHash} />
        </div>
        <code className="text-xs text-[var(--green)] break-all font-mono">
          {approveResult.txHash}
        </code>
      </div>

      <div className="flex items-center justify-between bg-black/30 rounded-lg px-4 py-3 border border-white/5">
        <span className="text-sm text-[var(--sub)]">Block</span>
        <code className="text-lg text-[var(--accent)] font-mono">#{approveResult.blockNumber}</code>
      </div>

      <p className="text-sm text-[var(--sub)]">
        {executed
          ? "Swap executed successfully through the Safe."
          : "Mr. Inference approved this swap. Sign the transaction with MetaMask to execute through the Safe."}
      </p>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-accent px-6 py-3 text-base">
          &larr; Back
        </button>
        <button
          onClick={onExecute}
          disabled={executeLoading || executed}
          className="btn btn-green flex-1 py-3 text-base"
        >
          {executed ? "Executed \u2713" : executeLoading ? "Awaiting signature..." : "Execute Swap via Safe"}
        </button>
      </div>
    </section>
  );
}
