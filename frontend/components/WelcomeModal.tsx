"use client";

import { useState, useEffect } from "react";
import { MrInference } from "./MrInference";
import { useWallet } from "./WalletProvider";

const WELCOME_KEY = "mr-dgd-welcomed";

const DRAIN_HEADLINES = [
  { dao: "Ronin Network", amount: "$625M", cause: "Compromised validator keys left unchecked" },
  { dao: "Wormhole", amount: "$320M", cause: "Unvalidated guardian signatures" },
  { dao: "Beanstalk", amount: "$182M", cause: "Flash-loan governance attack with no cooldown" },
  { dao: "Mango Markets", amount: "$114M", cause: "Oracle price manipulation went unguarded" },
  { dao: "Badger DAO", amount: "$120M", cause: "Malicious approvals injected via compromised frontend" },
];

export function WelcomeModal() {
  const { wallet } = useWallet();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (wallet) return; // don't show if already connected
    const seen = localStorage.getItem(WELCOME_KEY);
    if (!seen) setShow(true);
  }, [wallet]);

  function dismiss() {
    localStorage.setItem(WELCOME_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--accent)]/30 bg-[var(--panel-bg)] shadow-2xl overflow-hidden"
        style={{ animation: "fade-in-up 0.4s ease-out" }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-4">
          <MrInference size={72} mood="happy" />
          <h2 className="text-2xl font-bold text-[var(--accent)] text-center">
            Mr. Don&apos;t Get Drained
          </h2>
          <p className="text-sm text-[var(--sub)] text-center max-w-sm">
            is in the house.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-5">
          <p className="text-sm text-gray-300 leading-relaxed">
            Hey there! Before you start swapping, let&apos;s talk about why I exist.
            DAOs and protocols have lost <span className="text-[var(--orange)] font-semibold">billions</span> to
            preventable mistakes &mdash; transactions that a second pair of eyes could have caught.
          </p>

          {/* Drain headlines */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[var(--sub)] uppercase tracking-wider">
              Real drains that could have been prevented
            </span>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {DRAIN_HEADLINES.map((d) => (
                <div
                  key={d.dao}
                  className="flex items-start gap-3 bg-black/30 rounded-lg px-3 py-2 border border-white/5"
                >
                  <span className="text-[var(--orange)] font-mono text-sm font-bold whitespace-nowrap">
                    {d.amount}
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm text-[var(--foreground)] font-medium">{d.dao}</span>
                    <p className="text-xs text-[var(--sub)] leading-snug">{d.cause}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            I&apos;m your AI-powered swap guardian. Every transaction you make goes through
            my risk analysis &mdash; running inside a <span className="text-[var(--purple)] font-medium">trusted execution environment</span> so
            nobody can tamper with my verdict, not even the people running me.
            I check for price manipulation, suspicious contracts, and anything that smells off.
          </p>

          <p className="text-sm text-[var(--accent)] font-medium text-center">
            Connect your wallet to get started. I&apos;ve got your back.
          </p>

          <button
            onClick={dismiss}
            className="btn btn-accent w-full py-3 text-base font-semibold"
          >
            Let&apos;s Go
          </button>
        </div>
      </div>
    </div>
  );
}
