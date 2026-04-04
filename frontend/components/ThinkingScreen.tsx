"use client";

import { useState, useEffect } from "react";
import { MrInference } from "./MrInference";

const THINKING_MESSAGES = [
  "Checking token legitimacy...",
  "Analyzing swap parameters...",
  "Running risk assessment...",
  "Consulting the oracle...",
  "Verifying price feeds...",
  "Scanning for anomalies...",
  "Evaluating slippage risk...",
  "Cross-referencing contracts...",
];

export function ThinkingScreen() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card p-8 space-y-6">
      <div className="flex flex-col items-center gap-5">
        <MrInference size={80} mood="thinking" />

        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-[var(--accent)]">
            Mr. Inference is working...
          </h2>
          <p
            key={msgIndex}
            className="text-sm text-[var(--sub)]"
            style={{ animation: "fade-in-up 0.3s ease-out" }}
          >
            {THINKING_MESSAGES[msgIndex]}
          </p>
        </div>

        <div className="w-full max-w-xs h-1.5 rounded-full bg-black/30 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, var(--accent), var(--purple), var(--accent), transparent)",
              backgroundSize: "200% 100%",
              animation: "progress-sweep 1.5s linear infinite",
            }}
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--sub)]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" style={{ animation: "pulse-soft 0.8s infinite" }} />
            TEE Enclave
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple)]" style={{ animation: "pulse-soft 0.8s 0.3s infinite" }} />
            0G Network
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" style={{ animation: "pulse-soft 0.8s 0.6s infinite" }} />
            Analysis
          </span>
        </div>
      </div>
    </div>
  );
}
