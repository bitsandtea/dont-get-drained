"use client";

import { MrInference } from "./MrInference";
import { CopyButton, Collapsible } from "./ui";
import type { ReviewResult } from "@/lib/types";

type VerdictPanelProps = {
  review: ReviewResult;
  amountIn: string;
  tokenOut: string;
  approveLoading: boolean;
  onApprove: () => void;
  onBack: () => void;
};

export function VerdictPanel({
  review, amountIn, tokenOut, approveLoading, onApprove, onBack,
}: VerdictPanelProps) {
  return (
    <div className="space-y-4">
      {/* Final verdict banner */}
      <div className={`card ${review.finalVerdict ? "card-green" : "card-orange"} p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MrInference size={36} mood={review.finalVerdict ? "happy" : "neutral"} />
            <div>
              <h2 className="text-lg font-semibold">
                {review.finalVerdict ? "APPROVED" : "REJECTED"}
              </h2>
              {review.agents && review.agents.length > 1 && (
                <p className="text-xs text-[var(--sub)]">
                  {review.agents.filter((a) => a.verdict).length}/{review.agents.length} agents approved ({review.policy})
                </p>
              )}
            </div>
          </div>
          <span
            className={`px-3 py-1.5 text-sm font-bold rounded-md border ${
              review.finalVerdict
                ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                : "border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]"
            }`}
          >
            {review.finalVerdict ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>

      {/* Agent verdict cards */}
      {review.agents && review.agents.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {review.agents.map((agent) => (
            <div
              key={agent.agentId}
              className={`card p-4 space-y-2 border ${
                agent.verdict
                  ? "border-[var(--green)]/30"
                  : "border-[var(--orange)]/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--accent)] truncate">
                  {agent.name}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                    agent.verdict
                      ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                      : "border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]"
                  }`}
                >
                  {agent.verdict ? "PASS" : "FAIL"}
                </span>
              </div>
              <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed">
                {agent.notes}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-[var(--sub)] pt-1 border-t border-white/5">
                <span>TEE: {agent.verified ? "Verified" : "Pending"}</span>
                <span>Sig: {agent.teeProof ? "Yes" : "No"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Single agent analysis (backward compat) */}
      {review.agents && review.agents.length <= 1 && (
        <div className="card p-4">
          <span className="text-xs text-[var(--sub)] block mb-2">Mr. Inference&apos;s Analysis</span>
          <div className="bg-black/40 rounded-lg p-4 border border-white/5 max-h-48 overflow-y-auto">
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {review.aiAnswer}
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm mt-3">
            <div className="flex items-center gap-2">
              <span className="text-[var(--sub)]">TEE Verified:</span>
              <span className={review.verified ? "text-[var(--green)]" : "text-[var(--yellow)]"}>
                {review.verified ? "Yes" : "Pending"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--sub)]">Signature:</span>
              <span className={review.teeProof ? "text-[var(--green)]" : "text-[var(--yellow)]"}>
                {review.teeProof ? "Present" : "None"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quote + details */}
      <div className="card p-4 space-y-3">
        <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          <span className="text-xs text-[var(--sub)] block mb-1">Quote</span>
          <p className="text-lg">
            <span className="text-[var(--accent)] font-mono">{amountIn} ETH</span>
            <span className="text-[var(--sub)] mx-2">&rarr;</span>
            <span className="text-[var(--green)] font-mono">{review.quote} {tokenOut}</span>
          </p>
        </div>

        <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--sub)]">Guard TX Hash</span>
            <CopyButton text={review.txHash} />
          </div>
          <code className="text-xs text-gray-400 break-all font-mono leading-relaxed">
            {review.txHash}
          </code>
        </div>

        <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--sub)]">0G Storage Root Hash</span>
            <CopyButton text={review.rootHash} />
          </div>
          <code className="text-xs text-[var(--purple)] break-all font-mono leading-relaxed">
            {review.rootHash}
          </code>
        </div>

        <Collapsible label="Full Response Data">
          <div className="bg-black/50 rounded-lg p-4 border border-white/5 max-h-72 overflow-y-auto">
            <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(review, null, 2)}
            </pre>
          </div>
        </Collapsible>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn btn-accent px-6 py-3 text-base">
          &larr; Back
        </button>
        {review.finalVerdict && (
          <button
            onClick={onApprove}
            disabled={approveLoading}
            className="btn btn-green flex-1 py-3 text-base"
          >
            {approveLoading ? "Broadcasting..." : "Approve On-Chain & Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
