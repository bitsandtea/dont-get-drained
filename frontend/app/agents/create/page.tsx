"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const AVAILABLE_VARS = [
  { name: "signer", desc: "Address that initiated the transaction" },
  { name: "recipient", desc: "Wallet address of the swapper" },
  { name: "safeAddress", desc: "Safe multisig address" },
  { name: "txTarget", desc: "Transaction target contract address" },
  { name: "txData", desc: "Raw transaction calldata" },
  { name: "txValue", desc: "ETH value attached to the transaction" },
  { name: "amountIn", desc: "Amount of ETH being swapped" },
  { name: "outputAmount", desc: "Expected output token amount" },
  { name: "tokenSymbol", desc: "Output token symbol (e.g. USDC)" },
  { name: "tokenOut", desc: "Output token contract address" },
  { name: "routing", desc: "Uniswap routing path" },
  { name: "gasFeeUSD", desc: "Estimated gas fee in USD" },
  { name: "intent", desc: "User-described intent for the transaction" },
  { name: "simulationResults", desc: "Results from transaction simulation" },
  { name: "USDC", desc: "USDC contract address" },
  { name: "DAI", desc: "DAI contract address" },
  { name: "WETH", desc: "WETH contract address" },
];

type Status = "idle" | "publishing" | "success" | "error";

interface PublishResult {
  agentId: string;
  promptCid: string;
}

export default function AgentCreatePage() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [price, setPrice] = useState("0");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [loading, setLoading] = useState(!!editId);

  // Edit mode: load existing agent
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/agents/${editId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json();
      })
      .then((agent) => {
        setName(agent.name);
        setDescription(agent.description);
        setPromptTemplate(agent.promptTemplate || "");
        setCapabilities(
          Array.isArray(agent.capabilities)
            ? agent.capabilities.join(", ")
            : agent.capabilities || ""
        );
        setPrice(agent.pricePerInference || "0");
      })
      .catch(() => setError("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [editId]);

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (!description.trim()) return "Description is required";
    if (!promptTemplate.trim()) return "Prompt template is required";
    if (!/\{\{.+?\}\}/.test(promptTemplate))
      return "Prompt must contain at least one {{variable}}";
    return null;
  }

  async function publish() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus("publishing");
    setError("");

    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/agents/${editId}` : "/api/agents";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          promptTemplate: promptTemplate.trim(),
          pricePerInference: price || "0",
          capabilities: capabilities.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult({ agentId: data.agentId, promptCid: data.promptCid });
      setStatus("success");
    } catch (e: any) {
      setError(e.message || "Failed to publish agent");
      setStatus("error");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span style={{ color: "var(--sub)" }}>Loading agent...</span>
      </div>
    );
  }

  // Success screen
  if (status === "success" && result) {
    return (
      <div className="min-h-screen p-6 md:p-10 max-w-2xl mx-auto relative z-10">
        <div className="card card-green p-8 text-center">
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ color: "var(--green)" }}
          >
            Agent {editId ? "Updated" : "Published"}!
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--sub)" }}>
            Your agent is now registered on the AgentDirectory.
          </p>

          <div className="space-y-4 text-left">
            <div
              className="p-3 rounded-lg text-sm"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <span
                className="text-xs uppercase tracking-wider block mb-1"
                style={{ color: "var(--sub)" }}
              >
                Agent ID
              </span>
              <code
                className="font-mono text-xs break-all"
                style={{ color: "var(--accent)" }}
              >
                {result.agentId}
              </code>
            </div>

            <div
              className="p-3 rounded-lg text-sm"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <span
                className="text-xs uppercase tracking-wider block mb-1"
                style={{ color: "var(--sub)" }}
              >
                0G Storage Hash (promptCid)
              </span>
              <code
                className="font-mono text-xs break-all"
                style={{ color: "var(--accent)" }}
              >
                {result.promptCid}
              </code>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            <a
              href="/agents"
              className="btn btn-accent px-5 py-2 text-sm no-underline"
            >
              View Marketplace
            </a>
            <button
              className="btn btn-green px-5 py-2 text-sm"
              onClick={() => {
                setStatus("idle");
                setResult(null);
                setName("");
                setDescription("");
                setPromptTemplate("");
                setCapabilities("");
                setPrice("0");
              }}
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-4xl mx-auto relative z-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <a
          href="/"
          className="btn btn-accent px-3 py-1.5 text-sm no-underline"
        >
          &larr; Back
        </a>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {editId ? "Edit Agent" : "Create Agent"}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form — 2 cols */}
        <div className="lg:col-span-2 space-y-5">
          {/* Name */}
          <div className="card p-5">
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--sub)" }}
            >
              Name
            </label>
            <input
              className="input w-full px-3 py-2 text-sm"
              type="text"
              placeholder="e.g. RektNewsChecker"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="card p-5">
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--sub)" }}
            >
              Description
            </label>
            <textarea
              className="input w-full px-3 py-2 text-sm"
              style={{ minHeight: 80, resize: "vertical" }}
              placeholder="What does this agent do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Prompt Template */}
          <div className="card p-5">
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--sub)" }}
            >
              Prompt Template
            </label>
            <textarea
              className="input w-full px-3 py-2 font-mono text-sm leading-relaxed"
              style={{ minHeight: 280, resize: "vertical" }}
              placeholder="Write your agent's prompt template here. Use {{variables}} for dynamic values."
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              spellCheck={false}
            />
          </div>

          {/* Capabilities */}
          <div className="card p-5">
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--sub)" }}
            >
              Capabilities
            </label>
            <input
              className="input w-full px-3 py-2 text-sm"
              type="text"
              placeholder="e.g. exploit-detection, simulation-analysis"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
            />
            <p className="text-xs mt-1" style={{ color: "var(--sub)" }}>
              Comma-separated tags describing what this agent can do
            </p>
          </div>

          {/* Price */}
          <div className="card p-5">
            <label
              className="text-xs font-semibold uppercase tracking-wider block mb-2"
              style={{ color: "var(--sub)" }}
            >
              Price per Inference (ETH)
            </label>
            <input
              className="input w-full px-3 py-2 text-sm"
              type="number"
              min="0"
              step="0.001"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <p className="text-xs mt-1" style={{ color: "var(--sub)" }}>
              Set to 0 for free agents
            </p>
          </div>

          {/* Publish button */}
          <div className="flex items-center gap-3">
            <button
              className="btn btn-green px-6 py-2.5 text-sm"
              onClick={publish}
              disabled={status === "publishing"}
            >
              {status === "publishing"
                ? "Publishing..."
                : editId
                  ? "Update Agent"
                  : "Publish Agent"}
            </button>
            {error && (
              <span className="text-sm" style={{ color: "var(--orange)" }}>
                {error}
              </span>
            )}
          </div>
        </div>

        {/* Variables sidebar — 1 col */}
        <div className="lg:col-span-1">
          <div className="card p-5 lg:sticky lg:top-6">
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--sub)" }}
            >
              Available Variables
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--sub)" }}>
              Use{" "}
              <code style={{ color: "var(--accent)" }}>
                {"{{variableName}}"}
              </code>{" "}
              in your template. These are replaced at runtime with actual
              transaction data.
            </p>
            <div className="space-y-1.5">
              {AVAILABLE_VARS.map((v) => (
                <div
                  key={v.name}
                  className="text-sm py-1.5 px-2 rounded"
                  style={{ background: "rgba(0,0,0,0.3)" }}
                >
                  <code
                    className="font-mono text-xs"
                    style={{ color: "var(--accent)" }}
                  >
                    {`{{${v.name}}}`}
                  </code>
                  <span
                    className="text-xs block mt-0.5"
                    style={{ color: "var(--sub)" }}
                  >
                    {v.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
