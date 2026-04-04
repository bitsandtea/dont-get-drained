"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { CONTRACTS, SAFE_ABI, GUARD_STORAGE_SLOT } from "@/lib/contracts";

const ANVIL_RPC = "http://127.0.0.1:8545";
const TARGET_CHAIN_ID = 31337;

export default function GuardPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [safeAddr, setSafeAddr] = useState(CONTRACTS.SAFE || "");
  const [guardInput, setGuardInput] = useState("");
  const [currentGuard, setCurrentGuard] = useState<string | null>(null);
  const [loading, setLoading] = useState("");
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    console.log(msg);
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) { addLog("MetaMask not found"); return; }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== TARGET_CHAIN_ID) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
        });
      }
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setWallet(addr);
      addLog(`Connected: ${addr}`);
    } catch (e) {
      addLog(`Connect failed: ${(e as Error).message}`);
    }
  }

  async function readGuard() {
    if (!ethers.isAddress(safeAddr)) { addLog("Invalid Safe address"); return; }
    try {
      const provider = new ethers.JsonRpcProvider(ANVIL_RPC);
      const slot = await provider.getStorage(safeAddr, GUARD_STORAGE_SLOT);
      const guard = ethers.getAddress("0x" + slot.slice(26));
      setCurrentGuard(guard);
      addLog(`Current guard: ${guard === ethers.ZeroAddress ? "None (0x0)" : guard}`);
    } catch (e) {
      addLog(`Read failed: ${(e as Error).message}`);
    }
  }

  async function setGuard() {
    if (!wallet) { addLog("Connect wallet first"); return; }
    if (!ethers.isAddress(safeAddr)) { addLog("Invalid Safe address"); return; }

    // Treat empty input or "0" as address(0)
    const target = !guardInput.trim() || guardInput.trim() === "0"
      ? ethers.ZeroAddress
      : guardInput.trim();

    if (!ethers.isAddress(target)) { addLog("Invalid guard address"); return; }

    setLoading("setGuard");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      const safe = new ethers.Contract(safeAddr, SAFE_ABI, signer);

      const iface = new ethers.Interface(["function setGuard(address guard) external"]);
      const data = iface.encodeFunctionData("setGuard", [target]);

      const nonce = await safe.nonce();
      addLog(`Safe nonce: ${nonce}`);
      addLog(`Target guard: ${target === ethers.ZeroAddress ? "REMOVE (0x0)" : target}`);

      const safeTxHash: string = await safe.getTransactionHash(
        safeAddr, 0, data, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, nonce,
      );
      addLog(`Safe tx hash: ${safeTxHash}`);

      // TX 1: approveHash
      addLog("[TX 1/2] approveHash...");
      const approveTx = await safe.approveHash(safeTxHash);
      const approveReceipt = await approveTx.wait();
      addLog(`[TX 1/2] mined block ${approveReceipt.blockNumber}`);

      // TX 2: execTransaction
      const safeSig = ethers.concat([
        ethers.zeroPadValue(signerAddr, 32),
        ethers.ZeroHash,
        "0x01",
      ]);
      addLog("[TX 2/2] execTransaction...");
      const tx = await safe.execTransaction(
        safeAddr, 0, data, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, safeSig,
      );
      const receipt = await tx.wait();

      // Check events
      const EXEC_SUCCESS = ethers.id("ExecutionSuccess(bytes32,uint256)");
      const EXEC_FAILURE = ethers.id("ExecutionFailure(bytes32,uint256)");
      const success = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_SUCCESS);
      const failure = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_FAILURE);

      addLog(`[TX 2/2] mined block ${receipt.blockNumber} — ${success ? "SUCCESS" : failure ? "FAILED" : "unknown"}`);

      // Re-read guard
      await readGuard();
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally {
      setLoading("");
    }
  }

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl space-y-6">

        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[var(--accent)]">Guard Manager</h1>
          <p className="text-sm text-[var(--sub)]">Set or remove the guard on a Safe. For testing only.</p>
          <a href="/" className="text-sm text-[var(--sub)] hover:text-[var(--accent)] transition-colors">&larr; Back to app</a>
        </header>

        {/* Connect */}
        {!wallet ? (
          <button onClick={connectWallet} className="btn btn-orange w-full py-3 text-base">
            Connect MetaMask
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-4 py-2.5 border border-white/5">
            <div className="w-2 h-2 rounded-full bg-[var(--green)]" />
            <code className="text-sm text-[var(--orange)] font-mono">{wallet}</code>
          </div>
        )}

        {/* Safe address */}
        <div className="card p-5 space-y-3">
          <label className="text-xs text-[var(--sub)] block">Safe Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={safeAddr}
              onChange={(e) => setSafeAddr(e.target.value)}
              className="input flex-1 px-3 py-2 text-sm font-mono"
              placeholder="0x..."
            />
            <button onClick={readGuard} className="btn btn-accent px-4 py-2 text-sm">
              Read Guard
            </button>
          </div>
          {currentGuard !== null && (
            <div className="bg-black/20 rounded-lg px-3 py-2 border border-white/5">
              <span className="text-xs text-[var(--sub)]">Current guard: </span>
              <code className={`text-sm font-mono ${currentGuard === ethers.ZeroAddress ? "text-[var(--yellow)]" : "text-[var(--green)]"}`}>
                {currentGuard === ethers.ZeroAddress ? "None" : currentGuard}
              </code>
            </div>
          )}
        </div>

        {/* Set guard */}
        <div className="card p-5 space-y-3">
          <label className="text-xs text-[var(--sub)] block">New Guard Address</label>
          <p className="text-xs text-[var(--sub)]">Leave empty or enter &quot;0&quot; to remove the guard.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={guardInput}
              onChange={(e) => setGuardInput(e.target.value)}
              className="input flex-1 px-3 py-2 text-sm font-mono"
              placeholder="0x... or 0 to remove"
            />
            <button
              onClick={setGuard}
              disabled={!!loading || !wallet}
              className="btn btn-orange px-4 py-2 text-sm"
            >
              {loading ? "Sending..." : "Set Guard"}
            </button>
          </div>
          {/* Quick buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setGuardInput(CONTRACTS.INFERENCE_GUARD)}
              className="text-xs px-2.5 py-1 rounded border border-white/10 text-[var(--sub)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-colors"
            >
              InferenceGuard ({CONTRACTS.INFERENCE_GUARD ? CONTRACTS.INFERENCE_GUARD.slice(0, 8) + "..." : "not set"})
            </button>
            <button
              onClick={() => setGuardInput("0")}
              className="text-xs px-2.5 py-1 rounded border border-white/10 text-[var(--sub)] hover:text-[var(--yellow)] hover:border-[var(--yellow)]/30 transition-colors"
            >
              Remove (0x0)
            </button>
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="card p-4 space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--sub)] uppercase tracking-wider">Log</span>
              <button onClick={() => setLog([])} className="text-xs text-[var(--sub)] hover:text-[var(--accent)]">Clear</button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {log.map((line, i) => (
                <pre key={i} className="text-xs text-[var(--foreground)] font-mono whitespace-pre-wrap">{line}</pre>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
