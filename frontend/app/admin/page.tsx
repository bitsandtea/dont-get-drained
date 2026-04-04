"use client";

import { useState, useEffect } from "react";

const AVAILABLE_VARS = [
  { name: "amountIn", desc: "Amount of ETH being swapped" },
  { name: "outputAmount", desc: "Expected output token amount" },
  { name: "tokenSymbol", desc: "Output token symbol (e.g. USDC)" },
  { name: "tokenOut", desc: "Output token contract address" },
  { name: "recipient", desc: "Wallet address of the swapper" },
  { name: "routing", desc: "Uniswap routing path" },
  { name: "gasFeeUSD", desc: "Estimated gas fee in USD" },
  { name: "txTarget", desc: "Transaction target contract address" },
  { name: "USDC", desc: "USDC contract address" },
  { name: "DAI", desc: "DAI contract address" },
  { name: "WETH", desc: "WETH contract address" },
];

export default function AdminPage() {
  const [template, setTemplate] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/prompt")
      .then((r) => r.json())
      .then((data) => {
        setTemplate(data.template);
        setDefaultTemplate(data.default);
      })
      .catch(() => setStatus("error"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  function resetToDefault() {
    setTemplate(defaultTemplate);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span style={{ color: "var(--sub)" }}>Loading…</span>
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
        <h1 className="text-xl font-semibold" style={{ color: "var(--accent)" }}>
          Admin — AI Prompt Configuration
        </h1>
      </div>

      {/* Editor card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--sub)" }}>
            Prompt Template
          </h2>
          <button
            className="btn btn-orange px-3 py-1 text-xs"
            onClick={resetToDefault}
          >
            Reset to Default
          </button>
        </div>
        <textarea
          className="input w-full font-mono text-sm leading-relaxed"
          style={{ minHeight: 320, resize: "vertical" }}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          spellCheck={false}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            className="btn btn-green px-5 py-2 text-sm"
            onClick={save}
            disabled={status === "saving"}
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          {status === "saved" && (
            <span className="text-sm" style={{ color: "var(--green)" }}>
              Saved
            </span>
          )}
          {status === "error" && (
            <span className="text-sm" style={{ color: "var(--orange)" }}>
              Failed to save
            </span>
          )}
        </div>
      </div>

      {/* Variables reference */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--sub)" }}>
          Available Variables
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--sub)" }}>
          Use <code style={{ color: "var(--accent)" }}>{"{{variableName}}"}</code> in
          your template. These are replaced at runtime with actual swap data.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AVAILABLE_VARS.map((v) => (
            <div
              key={v.name}
              className="flex items-baseline gap-2 text-sm py-1 px-2 rounded"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <code className="font-mono text-xs" style={{ color: "var(--accent)" }}>
                {`{{${v.name}}}`}
              </code>
              <span style={{ color: "var(--sub)" }} className="text-xs">
                {v.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
