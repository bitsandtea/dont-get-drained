"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { CONTRACTS } from "@/lib/contracts";

type Agent = {
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

function AgentCard({
  agent,
  onAdd,
  wallet,
}: {
  agent: Agent;
  onAdd: (id: string) => void;
  wallet: string | null;
}) {
  const isFree = parseFloat(agent.pricePerInference) === 0;
  const isOwner =
    wallet && agent.creator && wallet.toLowerCase() === agent.creator.toLowerCase();

  return (
    <div className="card p-5 space-y-3 flex flex-col justify-between">
      {/* Clickable area → agent detail page */}
      <Link
        href={`/marketplace/${encodeURIComponent(agent.id)}`}
        className="space-y-3 no-underline block"
      >
        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-[var(--accent)] truncate">
              {agent.name}
            </h3>
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md border ${
                isFree
                  ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                  : "border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]"
              }`}
            >
              {formatPrice(agent.pricePerInference)}
            </span>
          </div>
          <p className="text-sm text-[var(--sub)] line-clamp-2 leading-relaxed">
            {agent.description}
          </p>
        </div>

        {/* Capability tags */}
        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.map((cap) => (
              <span
                key={cap}
                className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--panel-border)]"
              >
                {cap}
              </span>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-[var(--sub)] pt-1 border-t border-white/5">
          <span>Used {agent.totalInferences}x</span>
          <span className="font-mono">{abbreviate(agent.creator)}</span>
        </div>
      </Link>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onAdd(agent.id)}
          className="btn btn-accent flex-1 py-2 text-sm"
        >
          Add to Panel
        </button>
        {isOwner && (
          <Link
            href={`/agents/create?id=${encodeURIComponent(agent.id)}`}
            className="btn btn-green px-4 py-2 text-sm text-center"
          >
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { wallet } = useWallet();

  function addToPanel(agentId: string) {
    router.push(`/guard?add=${encodeURIComponent(agentId)}`);
  }

  useEffect(() => {
    fetch("/api/agents")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: Agent[]) => {
        setAgents(data.filter((a) => a.active));
      })
      .catch((e) => setError(e.message || "Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  });

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <header className="text-center space-y-3 mb-2">
          <h1 className="text-3xl font-bold tracking-wide text-[var(--accent)]">
            Agent Marketplace
          </h1>
          <p className="text-sm text-[var(--sub)]">
            Browse security agents and add them to your guard panel
          </p>
        </header>

        {/* Search + nav */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search by name, description, or capability..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1 px-4 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <Link
              href="/agents/create"
              className="btn btn-green px-4 py-2.5 text-sm text-center whitespace-nowrap"
            >
              Create Agent
            </Link>
            <Link
              href="/"
              className="btn btn-accent px-4 py-2.5 text-sm text-center whitespace-nowrap"
            >
              Back to Guard
            </Link>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="flex items-center justify-center gap-3 text-[var(--sub)]">
              <span
                className="w-2 h-2 rounded-full bg-[var(--accent)]"
                style={{ animation: "pulse-soft 0.8s infinite" }}
              />
              <span className="text-sm">Loading agents from 0G network...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="card card-orange p-4">
            <p className="text-sm text-[var(--orange)]">
              Failed to load agents: {error}
            </p>
            <p className="text-xs text-[var(--sub)] mt-1">
              Make sure the AgentDirectory is deployed and NEXT_PUBLIC_DIRECTORY_ADDRESS is set.
            </p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="card p-8 text-center space-y-3">
            <p className="text-[var(--sub)]">
              {agents.length === 0
                ? "No agents registered yet."
                : "No agents match your search."}
            </p>
            {agents.length === 0 && (
              <Link
                href="/agents/create"
                className="btn btn-green px-4 py-2.5 text-sm inline-block"
              >
                Register the first agent
              </Link>
            )}
          </div>
        )}

        {/* Agent grid */}
        {!loading && filtered.length > 0 && (
          <>
            <p className="text-xs text-[var(--sub)]">
              {filtered.length} agent{filtered.length !== 1 && "s"} found
              {CONTRACTS.AGENT_DIRECTORY && (
                <span>
                  {" "}[pulled from smart contract on 0G Chain:{" "}
                  <a
                    href={`https://chainscan-galileo.0g.ai/address/${CONTRACTS.AGENT_DIRECTORY}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] underline hover:text-[var(--foreground)]"
                  >
                    AgentDirectory
                  </a>
                  ]
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onAdd={addToPanel} wallet={wallet} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
