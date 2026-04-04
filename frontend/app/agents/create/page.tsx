"use client";

import { useTxToast } from "@/components/TxToaster";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Built-in transaction variables available to all agents
const BUILT_IN_VARS = [
  { name: "FullTransaction", desc: "Complete transaction object with all addresses and parameters" },
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
];

const MAX_STEPS = 8;

interface AgentStep {
  type: "curl" | "inference";
  url: string;
  method: "GET" | "POST";
  body: string;
  prompt: string;
  outputVar: string;
}

function emptyStep(type: "curl" | "inference"): AgentStep {
  return { type, url: "", method: "GET", body: "", prompt: "", outputVar: "" };
}

type Status = "idle" | "publishing" | "success" | "error";

interface PublishResult {
  agentId: string;
  promptCid: string;
}

interface TestResult {
  status: number;
  elapsed: number;
  size: number;
  preview: string;
  truncated: boolean;
}

export default function AgentCreatePage() {
  const txToast = useTxToast();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [price, setPrice] = useState("0");
  const [steps, setSteps] = useState<AgentStep[]>([emptyStep("inference")]);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [loading, setLoading] = useState(!!editId);
  const [deleting, setDeleting] = useState(false);
  const [testingStep, setTestingStep] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestResult | { error: string }>>({});

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
        setCapabilities(
          Array.isArray(agent.capabilities)
            ? agent.capabilities.join(", ")
            : agent.capabilities || ""
        );
        setPrice(agent.pricePerInference || "0");

        if (agent.steps && Array.isArray(agent.steps)) {
          // Multi-step flow
          setSteps(agent.steps.map((s: any) => ({
            type: s.type || "inference",
            url: s.url || "",
            method: s.method || "GET",
            body: s.body || "",
            prompt: s.prompt || "",
            outputVar: s.outputVar || "",
          })));
          setDataSources(agent.dataSources || []);
        } else if (agent.promptTemplate) {
          // Legacy single-prompt agent
          setSteps([{
            type: "inference" as const,
            url: "",
            method: "GET" as const,
            body: "",
            prompt: agent.promptTemplate,
            outputVar: "FinalVerdict",
          }]);
        }
      })
      .catch(() => setError("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [editId]);

  // Derive step output variables for the sidebar
  const stepVars = steps
    .map((s, i) => ({ name: s.outputVar, desc: `Output from Step ${i + 1} (${s.type})`, index: i }))
    .filter((v) => v.name.trim());

  function updateStep(index: number, patch: Partial<AgentStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep(type: "curl" | "inference") {
    if (steps.length >= MAX_STEPS) return;
    setSteps((prev) => [...prev, emptyStep(type)]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If the new last step is a curl, append an inference step
      if (next.length > 0 && next[next.length - 1].type === "curl") {
        next.push(emptyStep("inference"));
      }
      return next;
    });
    // Clean up test results
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  // Auto-collect data sources from curl steps
  function collectDataSources(): string[] {
    const sources = new Set<string>();
    for (const step of steps) {
      if (step.type === "curl" && step.url.trim()) {
        try {
          const u = new URL(step.url.replace(/\{\{.*?\}\}/g, "placeholder"));
          sources.add(`${u.protocol}//${u.host}`);
        } catch {
          // If URL has only template vars, add the raw value
          sources.add(step.url.split("/").slice(0, 3).join("/"));
        }
      }
    }
    return [...sources];
  }

  async function testCurlStep(index: number, testVars: Record<string, string>) {
    const step = steps[index];
    if (step.type !== "curl" || !step.url.trim()) return;

    setTestingStep(index);
    setTestResults((prev) => { const n = { ...prev }; delete n[index]; return n; });

    // Resolve {{vars}} in url and body using test values
    const resolve = (s: string) =>
      s.replace(/\{\{(\w+)\}\}/g, (m, key) => testVars[key] ?? m);

    try {
      const res = await fetch("/api/agents/test-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: resolve(step.url),
          method: step.method,
          body: step.method === "POST" ? resolve(step.body) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Test failed (${res.status})`);
      setTestResults((prev) => ({ ...prev, [index]: data }));
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [index]: { error: e.message } }));
    } finally {
      setTestingStep(null);
    }
  }

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (!description.trim()) return "Description is required";
    if (steps.length === 0) return "At least one step is required";

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const isLast = i === steps.length - 1;
      // Last inference step doesn't need an output var — it IS the final verdict
      if (!isLast && !s.outputVar.trim()) return `Step ${i + 1}: output variable name is required`;
      if (s.type === "curl" && !s.url.trim()) return `Step ${i + 1}: URL is required`;
      if (s.type === "inference" && !s.prompt.trim()) return `Step ${i + 1}: prompt is required`;
      if (isLast && s.type !== "inference") return "The last step must be an inference (it produces the final verdict)";
    }

    // Check for duplicate output variable names
    const varNames = steps.slice(0, -1).map((s) => s.outputVar.trim()).filter(Boolean);
    const dupes = varNames.filter((v, i) => varNames.indexOf(v) !== i);
    if (dupes.length > 0) return `Duplicate output variable: ${dupes[0]}`;

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

      // Determine if this is a simple single-prompt or multi-step
      const isSinglePrompt = steps.length === 1 && steps[0].type === "inference";
      const sources = collectDataSources();

      const payload: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        pricePerInference: price || "0",
        capabilities: capabilities.trim(),
      };

      if (isSinglePrompt) {
        // Backward-compatible: store as single promptTemplate
        payload.promptTemplate = steps[0].prompt.trim();
      } else {
        // Multi-step: store as steps array
        payload.steps = steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const step: Record<string, string> = {
            type: s.type,
            outputVar: isLast ? "FinalVerdict" : s.outputVar.trim(),
          };
          if (s.type === "curl") {
            step.url = s.url.trim();
            step.method = s.method;
            if (s.method === "POST" && s.body.trim()) step.body = s.body.trim();
          } else {
            step.prompt = s.prompt.trim();
          }
          return step;
        });
        payload.dataSources = sources;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult({ agentId: data.agentId, promptCid: data.promptCid });
      if (data.txHash) {
        txToast.push(editId ? "Agent updated on-chain" : "Agent registered on-chain", data.txHash);
      }
      if (data.submissionIndex != null) {
        txToast.push("Prompt stored on 0G", String(data.submissionIndex), "storage");
      }
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
              href="/marketplace"
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
                setSteps([emptyStep("inference")]);
                setDataSources([]);
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
    <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto relative z-10">
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
              placeholder="e.g. RektGuard"
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

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--sub)" }}
              >
                Steps ({steps.length}/{MAX_STEPS})
              </h2>
              <div className="flex gap-2">
                <button
                  className="btn btn-accent px-3 py-1 text-xs"
                  disabled={steps.length >= MAX_STEPS}
                  onClick={() => addStep("curl")}
                >
                  + Curl
                </button>
                <button
                  className="btn btn-green px-3 py-1 text-xs"
                  disabled={steps.length >= MAX_STEPS}
                  onClick={() => addStep("inference")}
                >
                  + Inference
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {steps.map((step, i) => (
                <StepCard
                  key={i}
                  index={i}
                  step={step}
                  total={steps.length}
                  isLast={i === steps.length - 1}
                  onChange={(patch) => updateStep(i, patch)}
                  onRemove={() => removeStep(i)}
                  onTest={(testVars) => testCurlStep(i, testVars)}
                  testing={testingStep === i}
                  testResult={testResults[i]}
                  // Variables available to this step = built-in + outputs from previous steps
                  availableVars={[
                    ...BUILT_IN_VARS.map((v) => v.name),
                    ...steps.slice(0, i).map((s) => s.outputVar).filter(Boolean),
                  ]}
                />
              ))}
            </div>
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
              step="0.0001"
              placeholder="0.0000"
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

          {/* Delete button — edit mode only */}
          {editId && (
            <div
              className="card p-5 mt-4"
              style={{ borderColor: "var(--orange)" }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--orange)" }}
              >
                Danger Zone
              </h3>
              <p className="text-xs mb-3" style={{ color: "var(--sub)" }}>
                Deactivating this agent removes it from the marketplace. This
                action is recorded on-chain and cannot be undone.
              </p>
              <button
                className="btn px-5 py-2 text-sm"
                style={{
                  background: "rgba(255, 107, 107, 0.1)",
                  border: "1px solid var(--orange)",
                  color: "var(--orange)",
                }}
                disabled={deleting || status === "publishing"}
                onClick={async () => {
                  if (
                    !confirm(
                      "Are you sure you want to delete this agent? This cannot be undone."
                    )
                  )
                    return;
                  setDeleting(true);
                  setError("");
                  try {
                    const res = await fetch(`/api/agents/${editId}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(
                        data.error || `Delete failed (${res.status})`
                      );
                    }
                    const data = await res.json();
                    if (data.txHash) {
                      txToast.push("Agent deactivated on-chain", data.txHash);
                    }
                    window.location.href = "/marketplace";
                  } catch (e: any) {
                    setError(e.message || "Failed to delete agent");
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting..." : "Delete Agent"}
              </button>
            </div>
          )}
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
              in your prompts and URLs. Built-in vars come from the transaction,
              step outputs come from previous steps.
            </p>

            {/* Built-in variables */}
            <h3
              className="text-xs font-semibold uppercase tracking-wider mb-2 mt-4"
              style={{ color: "var(--accent)" }}
            >
              Transaction Data
            </h3>
            <div className="space-y-1.5">
              {BUILT_IN_VARS.map((v) => (
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

            {/* Step output variables */}
            {stepVars.length > 0 && (
              <>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-2 mt-5"
                  style={{ color: "var(--green)" }}
                >
                  Step Outputs
                </h3>
                <div className="space-y-1.5">
                  {stepVars.map((v) => (
                    <div
                      key={v.name}
                      className="text-sm py-1.5 px-2 rounded"
                      style={{ background: "rgba(52, 211, 153, 0.08)" }}
                    >
                      <code
                        className="font-mono text-xs"
                        style={{ color: "var(--green)" }}
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
              </>
            )}

            {/* Data sources */}
            {collectDataSources().length > 0 && (
              <>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider mb-2 mt-5"
                  style={{ color: "var(--orange)" }}
                >
                  Registered Data Sources
                </h3>
                <div className="space-y-1">
                  {collectDataSources().map((ds) => (
                    <div
                      key={ds}
                      className="text-xs py-1 px-2 rounded font-mono"
                      style={{
                        background: "rgba(251, 146, 60, 0.08)",
                        color: "var(--orange)",
                      }}
                    >
                      {ds}
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--sub)" }}>
                  Curl steps can only reach these origins at runtime.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Step Card Component ----

function StepCard({
  index,
  step,
  total,
  isLast,
  onChange,
  onRemove,
  onTest,
  testing,
  testResult,
  availableVars,
}: {
  index: number;
  step: AgentStep;
  total: number;
  isLast: boolean;
  onChange: (patch: Partial<AgentStep>) => void;
  onRemove: () => void;
  onTest: (testVars: Record<string, string>) => void;
  testing: boolean;
  testResult?: TestResult | { error: string };
  availableVars: string[];
}) {
  const isCurl = step.type === "curl";
  const [testOpen, setTestOpen] = useState(false);
  const [testVars, setTestVars] = useState<Record<string, string>>({});

  // Extract {{var}} placeholders from url + body
  const placeholders = isCurl
    ? [...new Set(
        [...(step.url.matchAll(/\{\{(\w+)\}\}/g)), ...(step.body.matchAll(/\{\{(\w+)\}\}/g))]
          .map((m) => m[1])
      )]
    : [];
  const borderColor = isCurl ? "var(--accent)" : "var(--green)";
  const label = isCurl ? "CURL" : "INFERENCE";

  return (
    <div
      className="card p-5"
      style={{ borderColor, borderTopWidth: 2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold uppercase px-2 py-0.5 rounded"
            style={{
              background: isCurl ? "var(--accent-dim)" : "var(--green-dim)",
              color: borderColor,
            }}
          >
            {label}
          </span>
          <span className="text-xs" style={{ color: "var(--sub)" }}>
            {isLast ? "Final Verdict" : `Step ${index + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Type toggle — last step must stay as inference */}
          {!isLast && (
            <button
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: "rgba(0,0,0,0.3)",
                color: "var(--sub)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onClick={() =>
                onChange({ type: isCurl ? "inference" : "curl" })
              }
            >
              Switch to {isCurl ? "Inference" : "Curl"}
            </button>
          )}
          {total > 1 && (
            <button
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: "rgba(255, 107, 107, 0.1)",
                color: "var(--orange)",
                border: "1px solid rgba(251, 146, 60, 0.3)",
              }}
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Curl fields */}
      {isCurl && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select
              className="input px-2 py-1.5 text-sm"
              style={{ width: 90 }}
              value={step.method}
              onChange={(e) => onChange({ method: e.target.value as "GET" | "POST" })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            <input
              className="input flex-1 px-3 py-1.5 text-sm font-mono"
              placeholder="https://api.example.com/data/{{variable}}"
              value={step.url}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </div>
          {step.method === "POST" && (
            <textarea
              className="input w-full px-3 py-2 font-mono text-xs"
              style={{ minHeight: 60, resize: "vertical" }}
              placeholder='Request body (JSON) — e.g. {"ids": {{RelevantIDs}}}'
              value={step.body}
              onChange={(e) => onChange({ body: e.target.value })}
              spellCheck={false}
            />
          )}
          {/* Test section */}
          <div
            className="rounded-lg"
            style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(56, 189, 248, 0.08)" }}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-xs"
              style={{ color: "var(--sub)" }}
              onClick={() => setTestOpen((o) => !o)}
            >
              <span>Test {placeholders.length > 0 ? `(${placeholders.length} variable${placeholders.length > 1 ? "s" : ""})` : ""}</span>
              <span style={{ fontSize: 10 }}>{testOpen ? "\u25B2" : "\u25BC"}</span>
            </button>

            {testOpen && (
              <div className="px-3 pb-3 space-y-2">
                {/* Test variable inputs */}
                {placeholders.length > 0 && (
                  <div className="space-y-1.5">
                    {placeholders.map((name) => (
                      <div key={name}>
                        <label className="text-xs font-mono block mb-0.5" style={{ color: "var(--accent)", fontSize: 10 }}>
                          {`{{${name}}}`}
                        </label>
                        <input
                          className="input w-full px-2 py-1 text-xs font-mono"
                          placeholder={`Test value for ${name}`}
                          value={testVars[name] || ""}
                          onChange={(e) => setTestVars((prev) => ({ ...prev, [name]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Resolved URL preview */}
                {placeholders.length > 0 && (
                  <div className="text-xs font-mono px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.3)", color: "var(--sub)", wordBreak: "break-all", fontSize: 10 }}>
                    {step.url.replace(/\{\{(\w+)\}\}/g, (m, key) => testVars[key] || m)}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-accent px-3 py-1 text-xs"
                    onClick={() => onTest(testVars)}
                    disabled={testing || !step.url.trim()}
                  >
                    {testing ? "Testing..." : "Run Test"}
                  </button>
                  {testResult && (
                    <span className="text-xs" style={{ color: "error" in testResult ? "var(--orange)" : "var(--green)" }}>
                      {"error" in testResult
                        ? testResult.error
                        : `${testResult.status} — ${testResult.size.toLocaleString()} chars in ${testResult.elapsed}ms`}
                    </span>
                  )}
                </div>

                {/* Test result preview */}
                {testResult && !("error" in testResult) && (
                  <div
                    className="rounded-lg p-3 text-xs font-mono overflow-auto"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      maxHeight: 160,
                      color: "var(--sub)",
                    }}
                  >
                    {testResult.preview}
                    {testResult.truncated && (
                      <span style={{ color: "var(--orange)" }}> ...truncated</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inference fields */}
      {!isCurl && (
        <textarea
          className="input w-full px-3 py-2 font-mono text-sm leading-relaxed"
          style={{ minHeight: 180, resize: "vertical" }}
          placeholder={`Write your prompt here. Use {{variables}} from previous steps or transaction data.\n\nExample: Given {{FullTransaction}}, analyze if any patterns from {{RelevantArticles}} apply...`}
          value={step.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          spellCheck={false}
        />
      )}

      {/* Output variable — hidden for last step (it's the final verdict) */}
      {!isLast && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs" style={{ color: "var(--sub)" }}>
            Output variable:
          </span>
          <div className="flex items-center">
            <span className="text-xs font-mono" style={{ color: "var(--sub)" }}>{"{{"}</span>
            <input
              className="input px-2 py-1 text-xs font-mono"
              style={{ width: 200 }}
              placeholder="e.g. RelevantArticles"
              value={step.outputVar}
              onChange={(e) => onChange({ outputVar: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
            />
            <span className="text-xs font-mono" style={{ color: "var(--sub)" }}>{"}}"}</span>
          </div>
        </div>
      )}

      {/* Available vars hint */}
      {availableVars.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {availableVars.map((v) => (
            <span
              key={v}
              className="text-xs px-1.5 py-0.5 rounded font-mono cursor-default"
              style={{
                background: "rgba(0,0,0,0.3)",
                color: "var(--sub)",
                fontSize: 10,
              }}
              title={`{{${v}}}`}
            >
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
