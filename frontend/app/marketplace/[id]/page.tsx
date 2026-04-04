"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

type AgentStep = {
  type: "curl" | "inference";
  url?: string;
  method?: "GET" | "POST";
  body?: string;
  prompt?: string;
  outputVar: string;
};

type AgentDetail = {
  id: string;
  name: string;
  description: string;
  promptCid: string;
  pricePerInference: string;
  capabilities: string[];
  active: boolean;
  totalInferences: number;
  creator: string;
  createdAt: number;
  promptTemplate: string | null;
  steps: AgentStep[] | null;
  dataSources: string[] | null;
};

function abbreviate(addr: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatPrice(eth: string): string {
  const n = parseFloat(eth);
  if (n === 0) return "Free";
  return `${n.toFixed(4)} ETH`;
}

function formatDate(ts: number): string {
  if (!ts) return "---";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AgentViewPage() {
  const { id } = useParams<{ id: string }>();
  const { wallet } = useWallet();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isOwner =
    wallet &&
    agent?.creator &&
    wallet.toLowerCase() === agent.creator.toLowerCase();

  useEffect(() => {
    if (!id) return;
    fetch(`/api/agents/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setAgent(data))
      .catch((e) => setError(e.message || "Failed to load agent"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--sub)]">
          <span
            className="w-2 h-2 rounded-full bg-[var(--accent)]"
            style={{ animation: "pulse-soft 0.8s infinite" }}
          />
          <span className="text-sm">Loading agent...</span>
        </div>
      </main>
    );
  }

  if (error || !agent) {
    return (
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 gap-4">
        <div className="card card-orange p-6 max-w-md text-center">
          <p className="text-sm text-[var(--orange)]">
            {error || "Agent not found"}
          </p>
        </div>
        <Link
          href="/marketplace"
          className="btn btn-accent px-4 py-2 text-sm no-underline"
        >
          Back to Marketplace
        </Link>
      </main>
    );
  }

  const isFree = parseFloat(agent.pricePerInference) === 0;
  const hasSteps = agent.steps && agent.steps.length > 0;
  const hasSinglePrompt = !hasSteps && agent.promptTemplate;

  return (
    <main className="relative z-10 min-h-screen px-4 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Nav */}
        <div className="flex items-center gap-3">
          <Link
            href="/marketplace"
            className="btn btn-accent px-3 py-1.5 text-sm no-underline"
          >
            &larr; Marketplace
          </Link>
          {isOwner && (
            <Link
              href={`/agents/create?id=${encodeURIComponent(agent.id)}`}
              className="btn btn-green px-3 py-1.5 text-sm no-underline"
            >
              Edit Agent
            </Link>
          )}
        </div>

        {/* Header card */}
        <div className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h1 className="text-2xl font-bold text-[var(--accent)] break-words">
                {agent.name}
              </h1>
              <p className="text-sm text-[var(--sub)] leading-relaxed">
                {agent.description}
              </p>
            </div>
            <span
              className={`shrink-0 px-3 py-1 text-xs font-semibold uppercase rounded-md border ${
                isFree
                  ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                  : "border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]"
              }`}
            >
              {formatPrice(agent.pricePerInference)}
            </span>
          </div>

          {/* Capabilities */}
          {agent.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--panel-border)]"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5">
            <Stat label="Total Uses" value={String(agent.totalInferences)} />
            <Stat label="Creator" value={abbreviate(agent.creator)} mono />
            <Stat label="Created" value={formatDate(agent.createdAt)} />
            <Stat
              label="Status"
              value={agent.active ? "Active" : "Inactive"}
              color={agent.active ? "var(--green)" : "var(--orange)"}
            />
          </div>

          {/* Add to panel */}
          <div className="pt-2">
            <Link
              href={`/guard?add=${encodeURIComponent(agent.id)}`}
              className="btn btn-accent px-5 py-2.5 text-sm no-underline inline-block"
            >
              Add to Guard Panel
            </Link>
          </div>
        </div>

        {/* On-chain identifiers */}
        <div className="card p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--sub)]">
            On-Chain Identifiers
          </h2>
          <div className="space-y-2">
            <IdRow label="Agent ID" value={agent.id} />
            <IdRow label="Prompt CID (0G Storage)" value={agent.promptCid} />
            <IdRow label="Creator Address" value={agent.creator} />
          </div>
        </div>

        {/* Execution flow */}
        {hasSteps && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--sub)]">
              Execution Flow ({agent.steps!.length} step
              {agent.steps!.length !== 1 && "s"})
            </h2>
            {agent.steps!.map((step, i) => {
              const isLast = i === agent.steps!.length - 1;
              const isCurl = step.type === "curl";
              const borderColor = isCurl ? "var(--accent)" : "var(--green)";
              return (
                <div
                  key={i}
                  className="card p-5 space-y-3"
                  style={{ borderColor, borderTopWidth: 2 }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                      style={{
                        background: isCurl
                          ? "var(--accent-dim)"
                          : "var(--green-dim)",
                        color: borderColor,
                      }}
                    >
                      {isCurl ? "CURL" : "INFERENCE"}
                    </span>
                    <span className="text-xs text-[var(--sub)]">
                      {isLast ? "Final Verdict" : `Step ${i + 1}`}
                    </span>
                    {!isLast && step.outputVar && (
                      <code className="text-xs font-mono text-[var(--accent)] ml-auto">
                        {`→ {{${step.outputVar}}}`}
                      </code>
                    )}
                  </div>

                  {isCurl && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            background: "rgba(0,0,0,0.3)",
                            color: "var(--sub)",
                          }}
                        >
                          {step.method || "GET"}
                        </span>
                        <code className="text-sm font-mono text-[var(--fg)] break-all">
                          {step.url}
                        </code>
                      </div>
                      {step.body && (
                        <pre
                          className="text-xs font-mono p-3 rounded-lg overflow-auto"
                          style={{
                            background: "rgba(0,0,0,0.3)",
                            color: "var(--sub)",
                            maxHeight: 160,
                          }}
                        >
                          {step.body}
                        </pre>
                      )}
                    </div>
                  )}

                  {!isCurl && step.prompt && (
                    <pre
                      className="text-xs font-mono p-3 rounded-lg overflow-auto whitespace-pre-wrap"
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        color: "var(--sub)",
                        maxHeight: 300,
                      }}
                    >
                      {step.prompt}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Single prompt template (legacy) */}
        {hasSinglePrompt && (
          <div className="card p-5 space-y-3" style={{ borderColor: "var(--green)", borderTopWidth: 2 }}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--sub)]">
              Prompt Template
            </h2>
            <pre
              className="text-xs font-mono p-3 rounded-lg overflow-auto whitespace-pre-wrap"
              style={{
                background: "rgba(0,0,0,0.3)",
                color: "var(--sub)",
                maxHeight: 400,
              }}
            >
              {agent.promptTemplate}
            </pre>
          </div>
        )}

        {/* Data sources */}
        {agent.dataSources && agent.dataSources.length > 0 && (
          <div className="card p-5 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--sub)]">
              Registered Data Sources
            </h2>
            <p className="text-xs text-[var(--sub)]">
              External origins this agent is allowed to query at runtime.
            </p>
            <div className="flex flex-wrap gap-2">
              {agent.dataSources.map((ds) => (
                <span
                  key={ds}
                  className="text-xs font-mono px-2.5 py-1 rounded-md"
                  style={{
                    background: "rgba(251, 146, 60, 0.08)",
                    color: "var(--orange)",
                    border: "1px solid rgba(251, 146, 60, 0.2)",
                  }}
                >
                  {ds}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* --- Small helper components --- */

function Stat({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.3)" }}>
      <span className="text-[10px] uppercase tracking-wider block mb-1 text-[var(--sub)]">
        {label}
      </span>
      <span
        className={`text-sm ${mono ? "font-mono" : ""}`}
        style={{ color: color || "var(--fg)" }}
      >
        {value}
      </span>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.3)" }}>
      <span className="text-[10px] uppercase tracking-wider block mb-1 text-[var(--sub)]">
        {label}
      </span>
      <code className="font-mono text-xs text-[var(--accent)] break-all">
        {value}
      </code>
    </div>
  );
}
