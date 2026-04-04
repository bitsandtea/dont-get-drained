"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CONTRACTS, TOKENS, SAFE_ABI, ERC20_ABI, GUARD_STORAGE_SLOT } from "@/lib/contracts";

type QuotePreview = {
  outputAmount: string;
  outputToken: string;
  gasFeeUSD: string;
  gasEstimate: string;
  routing: string;
  priceImpact: string;
  executionPrice: string;
};

type AssetChange = {
  asset: string;
  changeType: string;
  from: string;
  to: string;
  rawAmount: string;
  amount: string;
  symbol: string;
  decimals: number;
  contractAddress?: string;
  tokenId?: string;
};

type SimulationResult = {
  changes: AssetChange[];
  gasUsed?: string;
  error?: unknown;
};

type ReviewResult = {
  txHash: string;
  swapTx: { to: string; data: string; value: string; gasLimit?: string };
  verdict: boolean;
  quote: string;
  gasFeeUSD: string;
  routing: string;
  aiAnswer: string;
  teeProof: { text: string; signature: string } | null;
  verified: boolean | null;
  rootHash: string;
  storageTxHash: string;
  simulation: SimulationResult | null;
};

type ApproveResult = {
  success: boolean;
  txHash: string;
  blockNumber: number;
  approved: boolean;
};

const TARGET_CHAIN_ID = 31337;
const ANVIL_RPC = "http://127.0.0.1:8545";

function MrInference({ size = 48, mood = "neutral" }: { size?: number; mood?: "neutral" | "happy" | "thinking" }) {
  const mouthPath =
    mood === "happy"
      ? "M 16 30 Q 20 35 24 30"
      : mood === "thinking"
        ? "M 16 31 L 24 31"
        : "M 16 30 Q 20 33 24 30";

  const thinking = mood === "thinking";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={thinking ? { animation: "bob 1.2s ease-in-out infinite" } : undefined}
    >
      {/* Top hat */}
      <rect x="12" y="0" width="16" height="10" rx="2" fill="var(--purple)" />
      <rect x="8" y="9" width="24" height="3" rx="1" fill="var(--purple)" />

      {/* Head */}
      <rect x="6" y="12" width="28" height="24" rx="6" fill="var(--panel-bg)" stroke="var(--accent)" strokeWidth="1.5" />

      {/* Antenna */}
      <line x1="20" y1="12" x2="20" y2="7" stroke="var(--accent)" strokeWidth="1" />
      <circle cx="20" cy="5" r="2" fill="var(--accent)">
        <animate
          attributeName="opacity"
          values={thinking ? "0.3;1;0.3" : "0.6;1;0.6"}
          dur={thinking ? "0.5s" : "2s"}
          repeatCount="indefinite"
        />
      </circle>

      {/* Eyes group — scans left/right when thinking */}
      <g style={thinking ? { animation: "scan-eyes 0.8s ease-in-out infinite" } : undefined}>
        <circle cx="14" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
        <circle cx="14" cy="22" r="1.5" fill="var(--background)" />
        <circle cx="26" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
        <circle cx="26" cy="22" r="1.5" fill="var(--background)" />
      </g>

      {/* Monocle */}
      <circle cx="26" cy="22" r="5" fill="none" stroke="var(--yellow)" strokeWidth="0.8" />
      <line x1="31" y1="22" x2="34" y2="30" stroke="var(--yellow)" strokeWidth="0.6" />

      {/* Mouth */}
      <path d={mouthPath} stroke="var(--accent)" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* Cheek indicators — blink fast when thinking */}
      <rect x="8" y="26" width="3" height="1" rx="0.5" fill="var(--green)">
        <animate
          attributeName="opacity"
          values={thinking ? "0.2;1;0.2" : "0.5;0.5;0.5"}
          dur={thinking ? "0.4s" : "1s"}
          repeatCount="indefinite"
        />
      </rect>
      <rect x="29" y="26" width="3" height="1" rx="0.5" fill="var(--green)">
        <animate
          attributeName="opacity"
          values={thinking ? "1;0.2;1" : "0.5;0.5;0.5"}
          dur={thinking ? "0.4s" : "1s"}
          repeatCount="indefinite"
        />
      </rect>

      {/* Jaw bolts */}
      <circle cx="9" cy="32" r="1" fill="var(--sub)" />
      <circle cx="31" cy="32" r="1" fill="var(--sub)" />
    </svg>
  );
}

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

function ThinkingScreen() {
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

        {/* Progress bar */}
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

        {/* Activity dots */}
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

function abbreviate(addr: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-[var(--sub)] hover:text-[var(--accent)] transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--accent)] hover:underline transition-colors"
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const STEP_LABELS = ["Configure", "Mr. Inference", "Execute"];

export default function Home() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [tokenOut, setTokenOut] = useState("USDC");
  const [amountIn, setAmountIn] = useState("0.1");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [executed, setExecuted] = useState(false);
  const [step, setStep] = useState(0); // 0=Configure, 1=Mr. Inference, 2=Execute
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [safeBalances, setSafeBalances] = useState<{ eth: string; usdc: string; dai: string } | null>(null);
  const [safeAddress, setSafeAddress] = useState(CONTRACTS.SAFE || "");
  const [safeInput, setSafeInput] = useState(CONTRACTS.SAFE || "");
  const [guardAddress, setGuardAddress] = useState("");
  const [safeOwners, setSafeOwners] = useState<string[]>([]);
  const [safeLoaded, setSafeLoaded] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [guardInput, setGuardInput] = useState(CONTRACTS.AI_GUARD || "");
  const [quotePreview, setQuotePreview] = useState<QuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  // Debounced quote fetching when token or amount changes
  useEffect(() => {
    const amount = parseFloat(amountIn);
    if (!amountIn || isNaN(amount) || amount <= 0) {
      setQuotePreview(null);
      setQuoteError("");
      return;
    }

    const token = TOKENS[tokenOut];
    if (!token) return;

    setQuoteLoading(true);
    setQuoteError("");

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenOut: token.address,
          amountIn: amount,
          recipient: safeAddress || undefined,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setQuotePreview(data);
          setQuoteError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setQuoteError(e.message || "Quote failed");
            setQuotePreview(null);
          }
        })
        .finally(() => setQuoteLoading(false));
    }, 500);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [tokenOut, amountIn, safeAddress]);

  async function loadSafe(address?: string) {
    const addr = address || safeInput.trim();
    if (!ethers.isAddress(addr)) {
      setError("Invalid Safe address");
      return;
    }
    setLoadingSafe(true);
    setError("");
    try {
      const provider = new ethers.JsonRpcProvider(ANVIL_RPC);

      // Verify it's a contract, not an EOA
      const code = await provider.getCode(addr);
      if (code === "0x" || code === "0x0") {
        setError("Not a contract — this looks like a regular wallet address");
        setSafeLoaded(false);
        return;
      }

      // Verify it's a Safe by calling getOwners() and nonce()
      const safe = new ethers.Contract(addr, SAFE_ABI, provider);
      let owners: string[];
      try {
        const [ownersResult, nonceResult] = await Promise.all([
          safe.getOwners() as Promise<string[]>,
          safe.nonce() as Promise<bigint>,
        ]);
        owners = ownersResult;
        void nonceResult; // just need it to not revert
      } catch {
        setError("Not a Safe — address does not implement Safe interface (getOwners/nonce)");
        setSafeLoaded(false);
        return;
      }

      if (!owners.length) {
        setError("Not a Safe — no owners returned");
        setSafeLoaded(false);
        return;
      }

      setSafeOwners(owners);

      const [ethBal, usdcBal, daiBal, guardSlot] = await Promise.all([
        provider.getBalance(addr),
        new ethers.Contract(CONTRACTS.USDC, ERC20_ABI, provider).balanceOf(addr),
        new ethers.Contract(CONTRACTS.DAI, ERC20_ABI, provider).balanceOf(addr),
        provider.getStorage(addr, GUARD_STORAGE_SLOT),
      ]);
      setSafeBalances({
        eth: parseFloat(ethers.formatEther(ethBal)).toFixed(4),
        usdc: parseFloat(ethers.formatUnits(usdcBal, 6)).toFixed(2),
        dai: parseFloat(ethers.formatUnits(daiBal, 18)).toFixed(2),
      });

      // Read guard from Safe storage slot
      const guard = ethers.getAddress("0x" + guardSlot.slice(26));
      setGuardAddress(guard === ethers.ZeroAddress ? "" : guard);

      setSafeAddress(addr);
      setSafeInput(addr);
      setSafeLoaded(true);
    } catch (e) {
      console.error("Failed to load Safe:", e);
      setError(e instanceof Error ? e.message : "Failed to load Safe data");
      setSafeLoaded(false);
    } finally {
      setLoadingSafe(false);
    }
  }

  async function setGuardOnSafe() {
    const addr = guardInput.trim();
    if (!wallet) { setError("Connect wallet first"); return; }
    if (!ethers.isAddress(addr)) { setError("Invalid guard address"); return; }
    setLoading("setGuard");
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        try {
          await window.ethereum!.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
          });
        } catch {
          throw new Error(`Switch MetaMask to chain ${TARGET_CHAIN_ID} (Anvil)`);
        }
      }
      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
      const readProvider = new ethers.JsonRpcProvider(ANVIL_RPC);

      console.log("=== SET GUARD ===");
      console.log("Safe address:", safeAddress);
      console.log("Guard to set:", addr);
      console.log("Signer:", signerAddr);

      // Pre-validate: is it a contract?
      const guardCode = await readProvider.getCode(addr);
      console.log("Guard bytecode length:", guardCode.length, guardCode === "0x" ? "(NOT A CONTRACT)" : "(ok)");
      if (guardCode === "0x" || guardCode === "0x0") {
        throw new Error("Guard address is not a contract");
      }

      // Pre-validate: does it implement the Guard interface (supportsInterface)?
      const ERC165_ABI = ["function supportsInterface(bytes4) external view returns (bool)"];
      const guardContract = new ethers.Contract(addr, ERC165_ABI, readProvider);
      try {
        const supportsGuard = await guardContract.supportsInterface("0xe6d7a83a");
        console.log("supportsInterface(0xe6d7a83a) [Safe Guard]:", supportsGuard);
        if (!supportsGuard) {
          // Try the other common Guard interface ID
          const alt = await guardContract.supportsInterface("0x945b8148");
          console.log("supportsInterface(0x945b8148) [IGuard alt]:", alt);
          if (!alt) {
            throw new Error("Contract does not implement Guard interface (supportsInterface check failed)");
          }
        }
      } catch (e) {
        if ((e as Error).message?.includes("does not implement")) throw e;
        console.warn("supportsInterface call failed:", (e as Error).message);
        throw new Error("Guard address does not support ERC-165 — not a valid guard contract");
      }

      // Read guard slot BEFORE
      const guardSlotBefore = await readProvider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
      const guardBefore = ethers.getAddress("0x" + guardSlotBefore.slice(26));
      console.log("Guard slot BEFORE:", guardBefore);

      // Encode setGuard(address) — self-call on the Safe
      const iface = new ethers.Interface(["function setGuard(address guard) external"]);
      const data = iface.encodeFunctionData("setGuard", [addr]);

      const operation = 0;
      const nonce = await safe.nonce();
      console.log("Safe nonce:", nonce.toString());
      console.log("Calldata:", data);

      const safeTxHash: string = await safe.getTransactionHash(
        safeAddress, 0, data, operation, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, nonce,
      );
      console.log("Safe tx hash:", safeTxHash);

      // TX 1: Pre-approve hash on-chain
      console.log("[TX 1/2] Sending approveHash...");
      const approveTx = await safe.approveHash(safeTxHash);
      console.log("[TX 1/2] approveHash sent:", approveTx.hash);
      const approveReceipt = await approveTx.wait();
      console.log("[TX 1/2] approveHash mined, block:", approveReceipt.blockNumber, "status:", approveReceipt.status);

      // Build "pre-approved" signature: r = owner, s = 0, v = 1
      const safeSig = ethers.concat([
        ethers.zeroPadValue(signerAddr, 32),
        ethers.ZeroHash,
        "0x01",
      ]);

      // TX 2: Execute the setGuard call through the Safe
      console.log("[TX 2/2] Sending execTransaction...");
      const tx = await safe.execTransaction(
        safeAddress, 0, data, operation, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, safeSig,
      );
      console.log("[TX 2/2] execTransaction sent:", tx.hash);
      const receipt = await tx.wait();
      console.log("[TX 2/2] execTransaction mined, block:", receipt.blockNumber, "status:", receipt.status);

      // Parse events — check for ExecutionSuccess vs ExecutionFailure
      const EXEC_SUCCESS_TOPIC = ethers.id("ExecutionSuccess(bytes32,uint256)");
      const EXEC_FAILURE_TOPIC = ethers.id("ExecutionFailure(bytes32,uint256)");
      for (const log of receipt.logs) {
        if (log.topics[0] === EXEC_SUCCESS_TOPIC) {
          console.log("[EVENT] ExecutionSuccess — inner call succeeded");
        } else if (log.topics[0] === EXEC_FAILURE_TOPIC) {
          console.error("[EVENT] ExecutionFailure — inner setGuard call FAILED");
        }
      }
      console.log("All events:", receipt.logs.map((l: { topics: string[] }) => l.topics[0]));

      // Read guard slot AFTER
      const guardSlotAfter = await readProvider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
      const guardAfter = ethers.getAddress("0x" + guardSlotAfter.slice(26));
      console.log("Guard slot AFTER:", guardAfter);
      if (guardAfter === ethers.ZeroAddress) {
        console.error("Guard NOT set — slot is still zero address");
      } else {
        console.log("Guard successfully set to:", guardAfter);
      }
      console.log("=================");

      // Reload safe to pick up the new guard
      await loadSafe(safeAddress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set guard");
    } finally {
      setLoading("");
    }
  }

  // Refresh balances after execution
  useEffect(() => {
    if (executed && safeAddress) loadSafe(safeAddress);
  }, [executed]);

  function goNext() {
    setStep((s) => Math.min(s + 1, 2));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setError("MetaMask not found");
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr: unknown) {
          // 4902 = chain not added yet — add it
          if ((switchErr as { code?: number })?.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: `0x${TARGET_CHAIN_ID.toString(16)}`,
                chainName: "Anvil Local Fork",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }

      const signer = await provider.getSigner();
      setWallet(await signer.getAddress());
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function submitForReview() {
    setLoading("review");
    setError("");
    setReview(null);
    setApproveResult(null);
    setExecuted(false);

    try {
      const token = TOKENS[tokenOut];
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenOut: token.address,
          amountIn: parseFloat(amountIn),
          recipient: safeAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Log Alchemy simulation before/after asset changes
      if (data.simulation?.changes?.length) {
        console.log("=== ALCHEMY SIMULATION: ASSET CHANGES ===");
        for (const c of data.simulation.changes) {
          const dir = c.changeType === "TRANSFER" && c.to?.toLowerCase() === safeAddress.toLowerCase()
            ? "IN"
            : "OUT";
          console.log(
            `[${dir}] ${c.amount} ${c.symbol} (${c.changeType})`,
            `| from: ${c.from} → to: ${c.to}`
          );
        }
        if (data.simulation.gasUsed) {
          console.log("Simulated gas used:", data.simulation.gasUsed);
        }
        console.log("=========================================");
      } else if (data.simulation === null) {
        console.log("[SIM] Alchemy simulation not configured — set ALCHEMY_RPC_URL in .env.local");
      } else {
        console.log("[SIM] No asset changes returned from simulation");
      }

      setReview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setLoading("");
    }
  }

  async function submitApproval() {
    if (!review) return;
    setLoading("approve");
    setError("");

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: review.txHash,
          rootHash: review.rootHash,
          execute: review.verdict,
          guardAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApproveResult(data);
      goNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setLoading("");
    }
  }

  async function executeSwap() {
    if (!review || !wallet) return;
    setLoading("execute");
    setError("");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        throw new Error(`Wrong network — switch MetaMask to chain ${TARGET_CHAIN_ID} (Anvil)`);
      }
      const signer = await provider.getSigner();

      // Execute through the Safe so the guard can enforce single-use
      const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
      const usdc = new ethers.Contract(CONTRACTS.USDC, ERC20_ABI, provider);
      const { to, data, value } = review.swapTx;
      const operation = 0;  // Call
      const safeTxGas = 0n;
      const baseGas = 0n;
      const gasPrice = 0n;
      const gasToken = ethers.ZeroAddress;
      const refundReceiver = ethers.ZeroAddress;

      // --- Balances BEFORE ---
      const safeEthBefore = await provider.getBalance(safeAddress);
      const safeUsdcBefore = await usdc.balanceOf(safeAddress);
      const userEthBefore = await provider.getBalance(wallet!);
      console.log("=== PRE-SWAP ===");
      console.log("Safe  ETH :", ethers.formatEther(safeEthBefore));
      console.log("Safe  USDC:", ethers.formatUnits(safeUsdcBefore, 6));
      console.log("User  ETH :", ethers.formatEther(userEthBefore));
      console.log("Swap value:", ethers.formatEther(value));
      console.log("Swap to:  ", to);
      console.log("================");

      // Get Safe nonce and compute its tx hash
      const nonce = await safe.nonce();
      const safeTxHash: string = await safe.getTransactionHash(
        to, value, data, operation, safeTxGas, baseGas, gasPrice,
        gasToken, refundReceiver, nonce,
      );

      console.log("Safe nonce:", nonce.toString());
      console.log("Safe tx hash:", safeTxHash);

      // Pre-approve the hash on-chain so execTransaction needs no signMessage
      const signerAddr = await signer.getAddress();
      console.log("Approving hash on Safe...");
      const approveTx = await safe.approveHash(safeTxHash);
      await approveTx.wait();

      // Build "pre-approved" signature (65 bytes): r = owner address, s = 0, v = 1
      const safeSig = ethers.concat([
        ethers.zeroPadValue(signerAddr, 32),
        ethers.ZeroHash,
        "0x01",
      ]);

      console.log("Calling Safe.execTransaction...");
      const tx = await safe.execTransaction(
        to, value, data, operation, safeTxGas, baseGas, gasPrice,
        gasToken, refundReceiver, safeSig,
      );

      const receipt = await tx.wait();
      console.log("Tx mined:", receipt.hash, "| status:", receipt.status);

      // --- Balances AFTER ---
      const safeEthAfter = await provider.getBalance(safeAddress);
      const safeUsdcAfter = await usdc.balanceOf(safeAddress);
      const userEthAfter = await provider.getBalance(wallet!);
      console.log("=== POST-SWAP ===");
      console.log("Safe  ETH :", ethers.formatEther(safeEthAfter), `(${ethers.formatEther(safeEthAfter - safeEthBefore)})`);
      console.log("Safe  USDC:", ethers.formatUnits(safeUsdcAfter, 6), `(+${ethers.formatUnits(safeUsdcAfter - safeUsdcBefore, 6)})`);
      console.log("User  ETH :", ethers.formatEther(userEthAfter), `(${ethers.formatEther(userEthAfter - userEthBefore)})`);
      console.log("=================");

      setExecuted(true);
      loadSafe(safeAddress);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setLoading("");
    }
  }

  const inferMood = loading === "review" ? "thinking" : review ? (review.verdict ? "happy" : "neutral") : "neutral";

  // Check if connected wallet is a Safe owner/signer
  const isOwner = wallet
    ? safeOwners.some((o) => o.toLowerCase() === wallet.toLowerCase())
    : false;

  // Determine which steps are "complete" (3 steps: Configure, Mr. Inference, Execute)
  const stepDone = [safeLoaded && !!amountIn, !!review, !!approveResult];

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl space-y-6">

        {/* Header */}
        <header className="text-center space-y-3 mb-2">
          <div className="flex items-center justify-center">
            <MrInference size={56} mood={inferMood} />
          </div>
          <h1 className="text-3xl font-bold tracking-wide text-[var(--accent)]">
            Mr. Inference
          </h1>
          <p className="text-sm text-[var(--sub)]">
            Your personal swap guardian for Safe wallets
          </p>
        </header>

        {/* Connect wallet gate — nothing else visible until connected */}
        {!wallet ? (
          <section className="card card-orange p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]">
                1
              </div>
              <h2 className="text-lg font-semibold">Connect Wallet</h2>
            </div>
            <p className="text-sm text-[var(--sub)]">Connect your MetaMask wallet to get started.</p>
            <button onClick={connectWallet} className="btn btn-orange w-full py-3 text-base">
              Connect MetaMask
            </button>
          </section>
        ) : (
        <>
        {/* Connected wallet bar */}
        <div className="flex items-center justify-between bg-black/30 rounded-lg px-4 py-3 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--green)]" style={{ animation: "pulse-soft 2s infinite" }} />
            <span className="text-sm text-[var(--sub)]">Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-base text-[var(--orange)] font-mono">{abbreviate(wallet)}</code>
            <CopyButton text={wallet} />
          </div>
        </div>

        {/* Treasury Panel */}
        <section className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--purple)] flex items-center justify-center text-black font-bold text-lg">
                  S
                </div>
                {safeLoaded && (
                  <div
                    className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--green)] border-2 border-[var(--background)]"
                    style={{ animation: "pulse-soft 2s infinite" }}
                  />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--accent)]">Safe Explorer</h2>
                <p className="text-xs text-[var(--sub)]">Enter a Safe address to inspect</p>
              </div>
            </div>
            {safeLoaded && (
              <span className={`px-2.5 py-1 text-xs font-medium border rounded-md ${guardAddress ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]" : "border-[var(--yellow)] text-[var(--yellow)] bg-[var(--orange-dim)]"}`}>
                {guardAddress ? "Guarded" : "No Guard"}
              </span>
            )}
          </div>

          {/* Safe address input */}
          <div>
            <label className="text-xs text-[var(--sub)] block mb-1.5">Safe Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x..."
                value={safeInput}
                onChange={(e) => setSafeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadSafe(); }}
                className="input flex-1 px-4 py-2.5 text-sm font-mono"
              />
              <button
                onClick={() => loadSafe()}
                disabled={loadingSafe || !safeInput.trim()}
                className="btn btn-accent px-5 py-2.5 text-sm"
              >
                {loadingSafe ? "Loading..." : "Load"}
              </button>
            </div>
          </div>

          {/* Loaded safe data */}
          {safeLoaded && (
            <>
              <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--sub)]">Vault Address</span>
                  <CopyButton text={safeAddress} />
                </div>
                <code className="text-base text-[var(--accent)] break-all font-mono">
                  {safeAddress}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5">
                  <span className="text-xs text-[var(--sub)] block mb-1">Guard Contract</span>
                  <code className="text-sm text-[var(--purple)] font-mono">
                    {guardAddress ? abbreviate(guardAddress) : "None"}
                  </code>
                </div>
                <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5">
                  <span className="text-xs text-[var(--sub)] block mb-1">Owners ({safeOwners.length})</span>
                  <div className="space-y-0.5">
                    {safeOwners.length > 0
                      ? safeOwners.map((o) => (
                          <code key={o} className="text-sm text-[var(--purple)] font-mono block">{abbreviate(o)}</code>
                        ))
                      : <code className="text-sm text-[var(--purple)] font-mono">---</code>}
                  </div>
                </div>
              </div>

              {/* Set Guard prompt — shown when no guard is detected */}
              {!guardAddress && (
                <div className="bg-black/20 rounded-lg px-4 py-3 border border-[var(--yellow)]/30 space-y-2">
                  <span className="text-xs text-[var(--yellow)] block">No guard detected. Set one to enable AI protection:</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Guard contract address (0x...)"
                      value={guardInput}
                      onChange={(e) => setGuardInput(e.target.value)}
                      className="input flex-1 px-3 py-2 text-sm font-mono"
                    />
                    <button
                      onClick={setGuardOnSafe}
                      disabled={loading === "setGuard" || !wallet || !guardInput.trim()}
                      className="btn btn-orange px-4 py-2 text-sm"
                    >
                      {loading === "setGuard" ? "Setting..." : "Set Guard"}
                    </button>
                  </div>
                  {!wallet && <span className="text-xs text-[var(--sub)]">Connect wallet first to set guard</span>}
                </div>
              )}

              <div>
                <span className="text-xs text-[var(--sub)] block mb-2">Safe Balances</span>
                {safeBalances ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                      <span className="text-lg font-mono font-semibold text-[var(--accent)]">{safeBalances.eth}</span>
                      <span className="text-xs text-[var(--sub)] block mt-0.5">ETH</span>
                    </div>
                    <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                      <span className="text-lg font-mono font-semibold text-[var(--green)]">{safeBalances.usdc}</span>
                      <span className="text-xs text-[var(--sub)] block mt-0.5">USDC</span>
                    </div>
                    <div className="bg-black/20 rounded-lg px-3 py-2.5 border border-white/5 text-center">
                      <span className="text-lg font-mono font-semibold text-[var(--yellow)]">{safeBalances.dai}</span>
                      <span className="text-xs text-[var(--sub)] block mt-0.5">DAI</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {Object.entries(TOKENS).map(([symbol]) => (
                      <div key={symbol} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-black/20">
                        <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                        <span className="text-sm font-medium">{symbol}</span>
                        <span className="text-xs text-[var(--sub)]">--</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Not-owner warning — blocks the rest of the UI */}
        {wallet && safeLoaded && !isOwner && (
          <section className="card p-6 space-y-3 border border-[var(--yellow)]/40">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-[var(--yellow)] text-[var(--yellow)] bg-[var(--orange-dim)]">
                !
              </div>
              <h2 className="text-lg font-semibold text-[var(--yellow)]">Not a Safe Owner</h2>
            </div>
            <p className="text-sm text-[var(--sub)]">
              Your connected wallet <code className="text-[var(--orange)] font-mono">{abbreviate(wallet)}</code> is not an owner of this Safe.
              Connect with an owner wallet to manage swaps.
            </p>
            <div className="text-xs text-[var(--sub)]">
              Safe owners: {safeOwners.map((o) => (
                <code key={o} className="text-[var(--purple)] font-mono mr-2">{abbreviate(o)}</code>
              ))}
            </div>
          </section>
        )}

        {safeLoaded && isOwner && <>

        {/* Action Menu */}
        {!activeAction && (
          <section className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--sub)] uppercase tracking-wider">Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setActiveAction("swap")}
                className="flex flex-col items-center gap-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-dim)] px-4 py-5 hover:border-[var(--accent)] transition-colors group"
              >
                <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.54 7.13998L7.10999 17.57C6.31999 18.36 6.31999 19.64 7.10999 20.43L17.54 30.86L20.36 28.04L13.56 21.24H40V17.24H13.08L20.36 9.95998L17.54 7.13998Z" fill="#FF007A"/>
                  <path d="M30.46 40.86L40.89 30.43C41.68 29.64 41.68 28.36 40.89 27.57L30.46 17.14L27.64 19.96L34.44 26.76H8V30.76H34.92L27.64 38.04L30.46 40.86Z" fill="#FF007A"/>
                </svg>
                <span className="text-sm font-semibold text-[var(--accent)] group-hover:text-[var(--foreground)] transition-colors">Swap</span>
                <span className="text-[10px] text-[var(--sub)]">via Uniswap</span>
              </button>

              {[
                { label: "Transfer", icon: "arrow-up-right" },
                { label: "Approve", icon: "check-circle" },
                { label: "Stake", icon: "layers" },
                { label: "Bridge", icon: "globe" },
              ].map(({ label }) => (
                <button
                  key={label}
                  disabled
                  className="flex flex-col items-center gap-2.5 rounded-xl border border-white/5 bg-black/20 px-4 py-5 opacity-35 cursor-not-allowed"
                >
                  <div className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center">
                    <span className="text-xs text-gray-600">--</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-600">{label}</span>
                  <span className="text-[10px] text-gray-700">Coming soon</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ═══ SWAP WIZARD ═══ */}
        {activeAction === "swap" && <>

        {/* Back to actions */}
        <button
          onClick={() => { setActiveAction(null); setStep(0); setReview(null); setApproveResult(null); setExecuted(false); }}
          className="text-sm text-[var(--sub)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
        >
          &larr; Back to actions
        </button>

        {/* Step Progress */}
        <div className="flex items-center gap-0.5">
          {STEP_LABELS.map((label, i) => {
            const done = stepDone[i];
            const active = i === step;
            const isLast = i === STEP_LABELS.length - 1;
            return (
              <div key={i} className="flex items-center flex-1">
                <button
                  onClick={() => { if (done || i <= step) setStep(i); }}
                  className="flex items-center gap-2 group"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors ${
                      done && !active
                        ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                        : active
                          ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
                          : "border-gray-700 text-gray-600 bg-black/20"
                    }`}
                  >
                    {done && !active ? "\u2713" : i + 1}
                  </div>
                  <span
                    className={`text-sm font-medium transition-colors ${
                      done && !active
                        ? "text-[var(--green)] group-hover:text-[var(--accent)]"
                        : active
                          ? "text-[var(--accent)]"
                          : "text-gray-600"
                    }`}
                  >
                    {label}
                  </span>
                </button>
                {!isLast && (
                  <div className={`flex-1 h-px mx-3 ${done ? "bg-[var(--green)]" : "bg-gray-800"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 0: Configure */}
        {step === 0 && (
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
                onChange={(e) => setAmountIn(e.target.value)}
                className="input w-full px-4 py-3 text-xl font-mono"
              />
            </div>

            <div>
              <label className="text-sm text-[var(--sub)] block mb-1.5">Receive Token</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(TOKENS).map(([key, token]) => (
                  <button
                    key={key}
                    onClick={() => setTokenOut(key)}
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

            {/* Quote Preview */}
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
                {/* Main output */}
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

                {/* Details grid */}
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

                {/* Slippage note */}
                <div className="px-4 py-2 text-[10px] text-[var(--sub)] border-t border-white/5">
                  Max slippage: 0.5% &middot; via Uniswap Trading API
                </div>
              </div>
            )}

            {/* Fallback route line when no quote data yet */}
            {!quotePreview && !quoteLoading && !quoteError && (
              <div className="bg-black/20 rounded-lg px-4 py-2.5 border border-white/5 text-sm text-[var(--sub)]">
                Route: <span className="text-[var(--foreground)]">{amountIn} ETH</span>
                <span className="mx-1.5">&rarr;</span>
                <span className="text-[var(--accent)]">{tokenOut}</span>
                <span className="ml-1">via Uniswap Trading API</span>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={goBack} className="btn btn-accent px-6 py-3 text-base">
                &larr; Back
              </button>
              <button
                onClick={goNext}
                disabled={!amountIn}
                className="btn btn-accent flex-1 py-3 text-base"
              >
                Next &rarr;
              </button>
            </div>
          </section>
        )}

        {/* Step 2: Mr. Inference Review */}
        {step === 1 && (
          <section className="space-y-4">
            {loading === "review" ? (
              <ThinkingScreen />
            ) : !review ? (
              <div className="card p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-[var(--purple)] text-[var(--purple)] bg-[var(--green-dim)]">
                    3
                  </div>
                  <h2 className="text-lg font-semibold">Mr. Inference Review</h2>
                </div>

                <div className="flex items-center gap-3 bg-black/20 rounded-lg px-4 py-3 border border-white/5">
                  <MrInference size={36} mood="neutral" />
                  <p className="text-sm text-[var(--sub)]">
                    Send this swap to Mr. Inference for risk analysis inside a 0G TEE enclave.
                  </p>
                </div>

                <div className="bg-black/20 rounded-lg px-4 py-3 border border-white/5 text-sm">
                  <span className="text-[var(--sub)]">Swap: </span>
                  <span className="text-[var(--accent)] font-mono">{amountIn} ETH</span>
                  <span className="text-[var(--sub)] mx-1.5">&rarr;</span>
                  <span className="text-[var(--green)] font-mono">{tokenOut}</span>
                </div>

                <div className="flex gap-3">
                  <button onClick={goBack} className="btn btn-accent px-6 py-3 text-base">
                    &larr; Back
                  </button>
                  <button
                    onClick={submitForReview}
                    className="btn btn-accent flex-1 py-3 text-base"
                  >
                    Ask Mr. Inference
                  </button>
                </div>
              </div>
            ) : (
              <div className={`card ${review.verdict ? "card-green" : "card-orange"} p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MrInference size={36} mood={review.verdict ? "happy" : "neutral"} />
                    <h2 className="text-lg font-semibold">Mr. Inference&apos;s Verdict</h2>
                  </div>
                  <span
                    className={`px-3 py-1.5 text-sm font-bold rounded-md border ${
                      review.verdict
                        ? "border-[var(--green)] text-[var(--green)] bg-[var(--green-dim)]"
                        : "border-[var(--orange)] text-[var(--orange)] bg-[var(--orange-dim)]"
                    }`}
                  >
                    {review.verdict ? "APPROVED" : "REJECTED"}
                  </span>
                </div>

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

                <div>
                  <span className="text-xs text-[var(--sub)] block mb-2">Mr. Inference&apos;s Analysis</span>
                  <div className="bg-black/40 rounded-lg p-4 border border-white/5 max-h-48 overflow-y-auto">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {review.aiAnswer}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
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

                <div className="space-y-3">
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
                  <button
                    onClick={() => {
                      setReview(null);
                      goBack();
                    }}
                    className="btn btn-accent px-6 py-3 text-base"
                  >
                    &larr; Back
                  </button>
                  {review.verdict && (
                    <button
                      onClick={submitApproval}
                      disabled={loading === "approve"}
                      className="btn btn-green flex-1 py-3 text-base"
                    >
                      {loading === "approve" ? "Broadcasting..." : "Approve On-Chain & Continue"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Step 3: Execute */}
        {step === 2 && approveResult && (
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
              <button onClick={goBack} className="btn btn-accent px-6 py-3 text-base">
                &larr; Back
              </button>
              <button
                onClick={executeSwap}
                disabled={loading === "execute" || executed}
                className="btn btn-green flex-1 py-3 text-base"
              >
                {executed ? "Executed ✓" : loading === "execute" ? "Awaiting signature..." : "Execute Swap via Safe"}
              </button>
            </div>
          </section>
        )}
        </>}

        </>}

        {/* Error */}
        {error && (
          <div className="card card-orange p-4">
            <p className="text-sm text-[var(--orange)]">{error}</p>
          </div>
        )}
        </>
        )}

        {/* Footer */}
        <footer className="text-center pt-6 space-y-1">
          <p className="text-xs text-gray-600">
            Mr. Inference &middot; 0G Compute Network &middot; Safe Protocol &middot; Uniswap
          </p>
          <p className="text-xs text-gray-700">ETH Cannes 2026</p>
        </footer>
      </div>
    </main>
  );
}
