"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONTRACTS, SAFE_ABI, GUARD_STORAGE_SLOT } from "@/lib/contracts";
import { useTxToast } from "@/components/TxToaster";
import { useWallet } from "@/components/WalletProvider";

const TARGET_CHAIN_ID = 31337;
const ANVIL_RPC = "http://127.0.0.1:8545";

const POLICY_OPTIONS = [
  { value: 0, key: "unanimous", label: "Unanimous", desc: "All agents must approve" },
  { value: 1, key: "majority", label: "Majority", desc: "More than half must approve" },
  { value: 2, key: "anyReject", label: "Any Reject", desc: "Any rejection blocks the tx" },
];

type PanelAgent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
};

function abbreviate(addr: string) {
  if (!addr) return "---";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function GuardPage() {
  const txToast = useTxToast();
  const searchParams = useSearchParams();
  const addAgentId = searchParams.get("add");

  // --- Wallet ---
  const { wallet, connectWallet: globalConnect } = useWallet();

  // --- Safe ---
  const [safeAddress, setSafeAddress] = useState(CONTRACTS.SAFE || "");
  const [safeInput, setSafeInput] = useState(CONTRACTS.SAFE || "");
  const [safeLoaded, setSafeLoaded] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [safeOwners, setSafeOwners] = useState<string[]>([]);

  // --- Guard ---
  const [guardAddress, setGuardAddress] = useState("");
  const [guardInput, setGuardInput] = useState("");
  const [guardLoading, setGuardLoading] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // --- Panel ---
  const [panel, setPanel] = useState<PanelAgent[]>([]);
  const [policy, setPolicy] = useState(0);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(addAgentId);
  const [addInput, setAddInput] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edited state (what user wants to save)
  const [editedPanel, setEditedPanel] = useState<PanelAgent[]>([]);
  const [editedPolicy, setEditedPolicy] = useState(0);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const editedPanelRef = useRef(editedPanel);
  editedPanelRef.current = editedPanel;

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    console.log(msg);
  }

  // --- Wallet ---

  async function connectWallet() {
    try {
      await globalConnect();
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    }
  }

  // --- Load Safe ---

  async function loadSafe() {
    const addr = safeInput.trim();
    if (!ethers.isAddress(addr)) { setError("Invalid Safe address"); return; }
    setLoadingSafe(true);
    setError("");
    try {
      const provider = new ethers.JsonRpcProvider(ANVIL_RPC);
      const code = await provider.getCode(addr);
      if (code === "0x" || code === "0x0") {
        setError("Not a contract"); setSafeLoaded(false); return;
      }
      const safe = new ethers.Contract(addr, SAFE_ABI, provider);
      const [guardSlot, owners] = await Promise.all([
        provider.getStorage(addr, GUARD_STORAGE_SLOT),
        safe.getOwners() as Promise<string[]>,
      ]);
      const guard = ethers.getAddress("0x" + guardSlot.slice(26));
      setGuardAddress(guard === ethers.ZeroAddress ? "" : guard);
      setSafeAddress(addr);
      setSafeOwners(owners);
      setSafeLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Safe");
      setSafeLoaded(false);
    } finally {
      setLoadingSafe(false);
    }
  }

  // --- Set / Remove Guard ---

  async function setGuardOnSafe() {
    if (!wallet) { setError("Connect wallet first"); return; }
    if (!ethers.isAddress(safeAddress)) { setError("Load a Safe first"); return; }

    const target = !guardInput.trim() || guardInput.trim() === "0"
      ? ethers.ZeroAddress
      : guardInput.trim();

    if (!ethers.isAddress(target)) { setError("Invalid guard address"); return; }

    setGuardLoading("setGuard");
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);

      const iface = new ethers.Interface(["function setGuard(address guard) external"]);
      const data = iface.encodeFunctionData("setGuard", [target]);

      const nonce = await safe.nonce();
      addLog(`Safe nonce: ${nonce}`);
      addLog(`Target guard: ${target === ethers.ZeroAddress ? "REMOVE (0x0)" : target}`);

      const safeTxHash: string = await safe.getTransactionHash(
        safeAddress, 0, data, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, nonce,
      );
      addLog(`Safe tx hash: ${safeTxHash}`);

      addLog("[TX 1/2] approveHash...");
      const approveTx = await safe.approveHash(safeTxHash);
      const approveReceipt = await approveTx.wait();
      addLog(`[TX 1/2] mined block ${approveReceipt.blockNumber}`);

      const safeSig = ethers.concat([
        ethers.zeroPadValue(signerAddr, 32),
        ethers.ZeroHash,
        "0x01",
      ]);
      addLog("[TX 2/2] execTransaction...");
      const tx = await safe.execTransaction(
        safeAddress, 0, data, 0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, safeSig,
      );
      const receipt = await tx.wait();

      const EXEC_SUCCESS = ethers.id("ExecutionSuccess(bytes32,uint256)");
      const EXEC_FAILURE = ethers.id("ExecutionFailure(bytes32,uint256)");
      const txSuccess = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_SUCCESS);
      const txFailure = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_FAILURE);

      addLog(`[TX 2/2] mined block ${receipt.blockNumber} — ${txSuccess ? "SUCCESS" : txFailure ? "FAILED" : "unknown"}`);
      txToast.push(target === ethers.ZeroAddress ? "Guard removed" : "Guard set on Safe", receipt.hash);

      // Re-read guard
      const readProvider = new ethers.JsonRpcProvider(ANVIL_RPC);
      const slot = await readProvider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
      const newGuard = ethers.getAddress("0x" + slot.slice(26));
      setGuardAddress(newGuard === ethers.ZeroAddress ? "" : newGuard);
      setSuccess(target === ethers.ZeroAddress ? "Guard removed" : `Guard set to ${abbreviate(target)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardLoading("");
    }
  }

  // --- Load Panel ---

  const loadPanel = useCallback(async () => {
    if (!guardAddress) return;
    setLoadingPanel(true);
    try {
      const res = await fetch(`/api/guard/panel?guardAddress=${guardAddress}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const policyNum = POLICY_OPTIONS.findIndex((p) => p.key === data.policy);
      setPanel(data.panel);
      setPolicy(policyNum >= 0 ? policyNum : 0);
      setEditedPanel(data.panel);
      setEditedPolicy(policyNum >= 0 ? policyNum : 0);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load panel");
    } finally {
      setLoadingPanel(false);
    }
  }, [guardAddress]);

  useEffect(() => {
    if (guardAddress) loadPanel();
  }, [guardAddress, loadPanel]);

  // --- Auto-load Safe on mount when CONTRACTS.SAFE is set ---

  useEffect(() => {
    if (safeInput && !safeLoaded && !loadingSafe) {
      loadSafe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Sync ?add= query param into pendingAdd (works on re-navigation) ---

  useEffect(() => {
    if (addAgentId) setPendingAdd(addAgentId);
  }, [addAgentId]);

  // --- Auto-add agent from pendingAdd ---

  useEffect(() => {
    if (!pendingAdd || loadingPanel || !safeLoaded) return;
    if (editedPanelRef.current.some((a) => a.id === pendingAdd)) {
      setPendingAdd(null);
      return;
    }
    const idToAdd = pendingAdd;
    setPendingAdd(null);
    addAgentById(idToAdd);
  }, [pendingAdd, loadingPanel, safeLoaded]);

  async function addAgentById(idToAdd: string) {
    if (editedPanel.some((a) => a.id === idToAdd)) {
      setError("Agent already in panel");
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch(`/api/agents`);
      const agents: { id: string; name: string; description: string; capabilities: string[]; active: boolean }[] = await res.json();
      const agent = agents.find((a) => a.id === idToAdd);
      if (agent) {
        setEditedPanel((prev) => {
          if (prev.some((a) => a.id === idToAdd)) return prev;
          return [...prev, { id: agent.id, name: agent.name, description: agent.description, capabilities: agent.capabilities }];
        });
        setSuccess(`Added "${agent.name}" to panel. Click Save Panel to commit on-chain.`);
      } else {
        setError(`Agent not found: ${idToAdd.slice(0, 16)}...`);
      }
    } catch {
      setError("Failed to fetch agent info");
    } finally {
      setAddLoading(false);
    }
  }

  // --- Track dirty state ---

  useEffect(() => {
    const panelChanged =
      editedPanel.length !== panel.length ||
      editedPanel.some((a, i) => a.id !== panel[i]?.id);
    const policyChanged = editedPolicy !== policy;
    setDirty(panelChanged || policyChanged);
  }, [editedPanel, editedPolicy, panel, policy]);

  // --- Remove agent from edited panel (local only — committed on Save Panel) ---

  function removeAgent(id: string) {
    setEditedPanel((prev) => prev.filter((a) => a.id !== id));
  }

  // --- Save panel via Safe tx ---

  const isOwner = wallet
    ? safeOwners.some((o) => o.toLowerCase() === wallet.toLowerCase())
    : false;

  async function savePanel() {
    if (!wallet || !safeAddress || !guardAddress) return;
    if (!isOwner) {
      setError("Your wallet is not an owner of this Safe. Connect with an owner wallet.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    let executed = 0;
    try {
      const panelChanged =
        editedPanel.length !== panel.length ||
        editedPanel.some((a, i) => a.id !== panel[i]?.id);
      const policyChanged = editedPolicy !== policy;

      addLog("=== SAVE PANEL START ===");
      addLog(`Safe address: ${safeAddress}`);
      addLog(`Guard address (from state): ${guardAddress}`);
      addLog(`Wallet: ${wallet}`);
      addLog(`Panel changed: ${panelChanged}, Policy changed: ${policyChanged}`);
      addLog(`Edited panel IDs: ${editedPanel.map((a) => a.id).join(", ") || "(empty)"}`);
      addLog(`Current panel IDs: ${panel.map((a) => a.id).join(", ") || "(empty)"}`);

      const body: Record<string, unknown> = { guardAddress };
      if (panelChanged) body.agentIds = editedPanel.map((a) => a.id);
      if (policyChanged) body.policy = editedPolicy;

      addLog(`PUT body: ${JSON.stringify(body)}`);

      const res = await fetch("/api/guard/panel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addLog(`PUT failed: HTTP ${res.status} — ${JSON.stringify(data)}`);
        throw new Error(data.error || "Failed to encode");
      }
      const { calls } = await res.json();
      addLog(`PUT returned ${calls.length} call(s):`);
      calls.forEach((c: { to: string; data: string; description: string }, i: number) => {
        addLog(`  call[${i}]: to=${c.to}, description=${c.description}`);
        addLog(`  call[${i}] data: ${c.data}`);
      });

      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      addLog(`Signer address: ${signerAddr}`);

      const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
      const readProvider = new ethers.JsonRpcProvider(ANVIL_RPC);

      // Re-read the actual guard address from Safe storage for comparison
      const guardSlotRaw = await readProvider.getStorage(safeAddress, GUARD_STORAGE_SLOT);
      const actualGuard = ethers.getAddress("0x" + guardSlotRaw.slice(26));
      addLog(`Actual guard from Safe storage slot: ${actualGuard}`);
      addLog(`Guard slot raw: ${guardSlotRaw}`);
      if (actualGuard.toLowerCase() !== guardAddress.toLowerCase()) {
        addLog(`WARNING: Guard address mismatch! State=${guardAddress}, Actual=${actualGuard}`);
      }

      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        addLog(`--- Executing call ${i + 1}/${calls.length}: ${call.description} ---`);
        addLog(`  to: ${call.to}`);
        addLog(`  to === guardAddress? ${call.to.toLowerCase() === guardAddress.toLowerCase()}`);
        addLog(`  to === actualGuard? ${call.to.toLowerCase() === actualGuard.toLowerCase()}`);

        const nonce = await (new ethers.Contract(safeAddress, SAFE_ABI, readProvider)).nonce();
        addLog(`  Safe nonce: ${nonce}`);

        const safeTxHash: string = await safe.getTransactionHash(
          call.to, 0, call.data, 0, 0, 0, 0,
          ethers.ZeroAddress, ethers.ZeroAddress, nonce,
        );
        addLog(`  SafeTxHash: ${safeTxHash}`);

        addLog(`  [TX ${i * 2 + 1}] approveHash...`);
        const approveTx = await safe.approveHash(safeTxHash);
        const approveReceipt = await approveTx.wait();
        addLog(`  [TX ${i * 2 + 1}] approveHash mined in block ${approveReceipt.blockNumber}`);

        const safeSig = ethers.concat([
          ethers.zeroPadValue(signerAddr, 32),
          ethers.ZeroHash,
          "0x01",
        ]);
        addLog(`  Signature: ${ethers.hexlify(safeSig)}`);

        // Log the full execTransaction params
        addLog(`  [TX ${i * 2 + 2}] execTransaction params:`);
        addLog(`    to: ${call.to}`);
        addLog(`    value: 0`);
        addLog(`    data: ${call.data}`);
        addLog(`    operation: 0 (Call)`);
        addLog(`    safeTxGas: 0, baseGas: 0, gasPrice: 0`);
        addLog(`    gasToken: ${ethers.ZeroAddress}`);
        addLog(`    refundReceiver: ${ethers.ZeroAddress}`);

        // Try staticCall first to get a better error before sending
        try {
          addLog(`  [TX ${i * 2 + 2}] staticCall (dry run)...`);
          await safe.execTransaction.staticCall(
            call.to, 0, call.data, 0, 0, 0, 0,
            ethers.ZeroAddress, ethers.ZeroAddress, safeSig,
          );
          addLog(`  [TX ${i * 2 + 2}] staticCall succeeded`);
        } catch (staticErr: unknown) {
          const errObj = staticErr as { data?: string; message?: string; reason?: string; code?: string };
          addLog(`  [TX ${i * 2 + 2}] staticCall FAILED:`);
          addLog(`    code: ${errObj.code}`);
          addLog(`    reason: ${errObj.reason}`);
          addLog(`    data: ${errObj.data}`);
          addLog(`    message: ${errObj.message?.slice(0, 500)}`);

          // Decode known guard error selectors
          if (errObj.data) {
            const selector = typeof errObj.data === "string" ? errObj.data.slice(0, 10) : "";
            const knownErrors: Record<string, string> = {
              "0xc64891a5": "NotRelayer()",
              "0xc19f17a9": "NotApproved()",
              "0x6f47ab5f": "AlreadyConsumed()",
              "0x690ee9a9": "MissingRootHash() — guard checkTransaction did NOT bypass this call (to != address(this))",
              "0x93d1ddc7": "RootHashReused()",
            };
            addLog(`    error selector: ${selector} => ${knownErrors[selector] || "unknown"}`);
          }
          addLog(`  Proceeding with actual tx anyway (MetaMask will show the error)...`);
        }

        addLog(`  [TX ${i * 2 + 2}] execTransaction sending...`);
        const tx = await safe.execTransaction(
          call.to, 0, call.data, 0, 0, 0, 0,
          ethers.ZeroAddress, ethers.ZeroAddress, safeSig,
        );
        const receipt = await tx.wait();

        const EXEC_SUCCESS = ethers.id("ExecutionSuccess(bytes32,uint256)");
        const EXEC_FAILURE = ethers.id("ExecutionFailure(bytes32,uint256)");
        const txSuccess = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_SUCCESS);
        const txFailure = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === EXEC_FAILURE);
        addLog(`  [TX ${i * 2 + 2}] mined block ${receipt.blockNumber} — ${txSuccess ? "SUCCESS" : txFailure ? "INNER CALL FAILED" : "unknown status"}`);
        addLog(`  tx hash: ${receipt.hash}`);

        if (txFailure) {
          addLog(`  WARNING: Safe.execTransaction succeeded but inner call failed!`);
        }

        txToast.push("Guard panel updated", receipt.hash);
        executed++;
      }

      addLog("=== SAVE PANEL COMPLETE ===");
      setSuccess(`Panel updated (${calls.length} transaction${calls.length > 1 ? "s" : ""} executed)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save panel";
      addLog(`=== SAVE PANEL ERROR (${executed} succeeded before failure) ===`);
      addLog(`Error: ${msg}`);
      if (e && typeof e === "object") {
        const errObj = e as { code?: string; data?: string; reason?: string; transaction?: unknown };
        if (errObj.code) addLog(`Error code: ${errObj.code}`);
        if (errObj.data) addLog(`Error data: ${errObj.data}`);
        if (errObj.reason) addLog(`Error reason: ${errObj.reason}`);
        if (errObj.transaction) addLog(`Error transaction: ${JSON.stringify(errObj.transaction).slice(0, 500)}`);
      }
      setError(executed > 0 ? `Partial update: ${executed} tx succeeded, then failed — ${msg}` : msg);
    } finally {
      await loadPanel();
      setSaving(false);
    }
  }

  // --- Derived ---

  const hasGuard = !!guardAddress;

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl space-y-6">

        {/* Header */}
        <header className="text-center space-y-3 mb-2">
          <h1 className="text-3xl font-bold tracking-wide text-[var(--accent)]">
            Guard
          </h1>
          <p className="text-sm text-[var(--sub)]">
            Set the guard on your Safe and configure which agents protect it
          </p>
        </header>

        {/* Wallet connect */}
        {!wallet && (
          <section className="card card-orange p-6 space-y-3">
            <h2 className="text-lg font-semibold">Connect Wallet</h2>
            <p className="text-sm text-[var(--sub)]">Required to manage your guard and panel.</p>
            <button onClick={connectWallet} className="btn btn-orange w-full py-3 text-base">
              Connect MetaMask
            </button>
          </section>
        )}

        {wallet && (
          <div className="flex items-center justify-between bg-black/30 rounded-lg px-4 py-3 border border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--green)]" style={{ animation: "pulse-soft 2s infinite" }} />
              <span className="text-sm text-[var(--sub)]">Connected</span>
            </div>
            <code className="text-base text-[var(--orange)] font-mono">{abbreviate(wallet)}</code>
          </div>
        )}

        {/* Safe loader */}
        {!safeLoaded && (
          <section className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--accent)]">Load Safe</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Safe address (0x...)"
                value={safeInput}
                onChange={(e) => setSafeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadSafe(); }}
                className="input flex-1 px-4 py-2.5 text-sm font-mono"
              />
              <button
                onClick={loadSafe}
                disabled={loadingSafe || !safeInput.trim()}
                className="btn btn-accent px-5 py-2.5 text-sm"
              >
                {loadingSafe ? "Loading..." : "Load"}
              </button>
            </div>
          </section>
        )}

        {/* Safe + Guard info */}
        {safeLoaded && (
          <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--sub)]">Safe</span>
              <code className="text-sm text-[var(--accent)] font-mono">{abbreviate(safeAddress)}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--sub)]">Guard</span>
              {hasGuard ? (
                <code className="text-sm text-[var(--green)] font-mono">{abbreviate(guardAddress)}</code>
              ) : (
                <span className="text-sm text-[var(--yellow)]">None</span>
              )}
            </div>
          </div>
        )}

        {/* === SECTION 1: Set / Remove Guard === */}
        {safeLoaded && (
          <section className="card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[var(--accent)]">
              {hasGuard ? "Change Guard" : "Set Guard"}
            </h2>
            <p className="text-xs text-[var(--sub)]">
              {hasGuard
                ? "Update the guard contract or enter 0 to remove it."
                : "Enter the InferenceGuard contract address to enable AI protection."}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={guardInput}
                onChange={(e) => setGuardInput(e.target.value)}
                className="input flex-1 px-3 py-2 text-sm font-mono"
                placeholder="0x... or 0 to remove"
              />
              <button
                onClick={setGuardOnSafe}
                disabled={!!guardLoading || !wallet}
                className="btn btn-orange px-4 py-2 text-sm"
              >
                {guardLoading ? "Sending..." : hasGuard ? "Update" : "Set Guard"}
              </button>
            </div>
            {/* Quick buttons */}
            <div className="flex gap-2">
              {CONTRACTS.INFERENCE_GUARD && (
                <button
                  onClick={() => setGuardInput(CONTRACTS.INFERENCE_GUARD)}
                  className="text-xs px-2.5 py-1 rounded border border-white/10 text-[var(--sub)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-colors"
                >
                  InferenceGuard ({abbreviate(CONTRACTS.INFERENCE_GUARD)})
                </button>
              )}
              {hasGuard && (
                <button
                  onClick={() => setGuardInput("0")}
                  className="text-xs px-2.5 py-1 rounded border border-white/10 text-[var(--sub)] hover:text-[var(--yellow)] hover:border-[var(--yellow)]/30 transition-colors"
                >
                  Remove (0x0)
                </button>
              )}
            </div>
          </section>
        )}

        {/* === SECTION 2: Agent Panel (only when guard is active) === */}

        {safeLoaded && hasGuard && loadingPanel && (
          <div className="card p-8 text-center">
            <div className="flex items-center justify-center gap-3 text-[var(--sub)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)]" style={{ animation: "pulse-soft 0.8s infinite" }} />
              <span className="text-sm">Loading panel from guard contract...</span>
            </div>
          </div>
        )}

        {safeLoaded && hasGuard && !loadingPanel && (
          <section className="card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--accent)]">Agent Panel</h2>
              <span className="text-xs text-[var(--sub)]">
                {editedPanel.length} agent{editedPanel.length !== 1 && "s"}
              </span>
            </div>

            {/* Agent list */}
            {editedPanel.length === 0 ? (
              <div className="bg-black/20 rounded-lg px-4 py-6 border border-white/5 text-center space-y-3">
                <p className="text-sm text-[var(--sub)]">No agents in panel. Add one below or browse the marketplace.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {editedPanel.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 bg-black/20 rounded-lg px-4 py-3 border border-white/5"
                  >
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)] truncate">
                        {agent.name}
                      </p>
                      {agent.capabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="px-1.5 py-0.5 text-[9px] rounded bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--panel-border)]"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeAgent(agent.id)}
                      disabled={saving}
                      className="text-[var(--sub)] hover:text-[var(--orange)] transition-colors text-lg leading-none px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove from panel (save to commit)"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Policy selector */}
            <div>
              <label className="text-xs text-[var(--sub)] block mb-2">Aggregation Policy</label>
              <div className="grid grid-cols-3 gap-2">
                {POLICY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setEditedPolicy(opt.value)}
                    className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${
                      editedPolicy === opt.value
                        ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                        : "border-white/5 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <span className={`text-sm font-semibold block ${
                      editedPolicy === opt.value ? "text-[var(--accent)]" : "text-[var(--sub)]"
                    }`}>
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-[var(--sub)]">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Add agent by ID */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--sub)] block">Add Agent</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste agent ID (0x...)"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && addInput.trim()) {
                      addAgentById(addInput.trim());
                      setAddInput("");
                    }
                  }}
                  className="input flex-1 px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={() => {
                    if (addInput.trim()) {
                      addAgentById(addInput.trim());
                      setAddInput("");
                    }
                  }}
                  disabled={!addInput.trim() || addLoading}
                  className="btn btn-green px-4 py-2 text-sm"
                >
                  {addLoading ? "..." : "Add"}
                </button>
              </div>
              <Link href="/marketplace" className="text-xs text-[var(--accent)] hover:underline">
                Browse marketplace &rarr;
              </Link>
            </div>

            {/* Save */}
            <button
              onClick={savePanel}
              disabled={!dirty || saving || !wallet || !isOwner}
              className="btn btn-accent w-full py-2.5 text-sm"
            >
              {saving ? "Saving..." : dirty ? "Save Panel" : "No changes"}
            </button>

            {!wallet && dirty && (
              <p className="text-xs text-[var(--yellow)] text-center">
                Connect wallet to save changes
              </p>
            )}
            {wallet && !isOwner && (
              <p className="text-xs text-[var(--yellow)] text-center">
                Your wallet is not an owner of this Safe
              </p>
            )}
          </section>
        )}

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

        {/* Error / Success */}
        {error && (
          <div className="card card-orange p-4">
            <p className="text-sm text-[var(--orange)]">{error}</p>
          </div>
        )}
        {success && (
          <div className="card card-green p-4">
            <p className="text-sm text-[var(--green)]">{success}</p>
          </div>
        )}
      </div>
    </main>
  );
}
