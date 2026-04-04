"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";

type StorageEntry = {
  rootHash: string;
  txHash: string;
  submissionIndex: number | null;
  name: string;
  size: number;
  wallet: string;
  timestamp: number;
  contentType: string;
};

function abbreviate(s: string) {
  if (!s) return "---";
  return `${s.slice(0, 10)}...${s.slice(-6)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function OGStoragePage() {
  const { wallet, connectWallet } = useWallet();
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMine, setFilterMine] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [viewingHash, setViewingHash] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterMine && wallet
        ? `/api/og-storage?wallet=${wallet}`
        : "/api/og-storage";
      const res = await fetch(url);
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterMine, wallet]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleUpload() {
    if (!wallet) return;
    if (!uploadName.trim() || !uploadContent.trim()) {
      setUploadError("Name and content are required");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      // Try parsing as JSON, otherwise wrap as text
      let data: unknown;
      try {
        data = JSON.parse(uploadContent);
      } catch {
        data = uploadContent;
      }

      const res = await fetch("/api/og-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uploadName, data, wallet }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Upload failed");

      setUploadSuccess(`Uploaded! Root hash: ${result.rootHash.slice(0, 20)}...`);
      setUploadName("");
      setUploadContent("");
      setShowUploadForm(false);
      fetchEntries();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function viewFile(rootHash: string) {
    if (viewingHash === rootHash) {
      setViewingHash(null);
      setViewContent(null);
      return;
    }
    setViewingHash(rootHash);
    setViewLoading(true);
    setViewContent(null);
    try {
      const res = await fetch(`/api/og-storage/${rootHash}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Pretty-print if JSON
      try {
        const parsed = JSON.parse(data.content);
        setViewContent(JSON.stringify(parsed, null, 2));
      } catch {
        setViewContent(data.content);
      }
    } catch (e) {
      setViewContent(`Error: ${e instanceof Error ? e.message : "Failed to fetch"}`);
    } finally {
      setViewLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!uploadName.trim()) setUploadName(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadContent(reader.result as string);
    reader.readAsText(file);
  }

  return (
    <main className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <header className="text-center space-y-3 mb-2">
          <h1 className="text-3xl font-bold tracking-wide text-[var(--accent)]">
            0G Storage
          </h1>
          <p className="text-sm text-[var(--sub)]">
            Browse and upload files to the 0G decentralized storage network
          </p>
        </header>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => setFilterMine(false)}
              className={`btn px-4 py-2 text-sm ${!filterMine ? "btn-accent" : "btn-accent opacity-50"}`}
            >
              All Files
            </button>
            <button
              onClick={() => {
                if (!wallet) { connectWallet(); return; }
                setFilterMine(true);
              }}
              className={`btn px-4 py-2 text-sm ${filterMine ? "btn-accent" : "btn-accent opacity-50"}`}
            >
              My Files
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchEntries}
              className="btn btn-accent px-4 py-2 text-sm"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                if (!wallet) { connectWallet(); return; }
                setShowUploadForm(!showUploadForm);
              }}
              className="btn btn-green px-4 py-2 text-sm"
            >
              {showUploadForm ? "Cancel" : "Upload File"}
            </button>
          </div>
        </div>

        {/* Upload form */}
        {showUploadForm && wallet && (
          <div className="card p-5 space-y-4" style={{ animation: "fade-in-up 0.2s ease" }}>
            <h2 className="text-sm font-bold text-[var(--accent)]">
              Upload to 0G Storage
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--sub)] mb-1">File Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="my-data.json"
                  className="input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--sub)] mb-1">
                  Content (JSON or plain text)
                </label>
                <textarea
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  placeholder='{"key": "value"} or plain text...'
                  rows={6}
                  className="input w-full px-3 py-2 text-sm font-mono resize-y"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--sub)] mb-1">
                  Or select a file
                </label>
                <input
                  type="file"
                  accept=".json,.txt,.csv,.md"
                  onChange={handleFileSelect}
                  className="text-sm text-[var(--sub)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[var(--panel-border)] file:bg-[var(--panel-bg)] file:text-[var(--accent)] file:text-xs file:font-medium file:cursor-pointer"
                />
              </div>
            </div>
            {uploadError && (
              <p className="text-sm text-[var(--orange)]">{uploadError}</p>
            )}
            {uploadSuccess && (
              <p className="text-sm text-[var(--green)]">{uploadSuccess}</p>
            )}
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadName.trim() || !uploadContent.trim()}
              className="btn btn-green px-6 py-2 text-sm w-full"
            >
              {uploading ? "Uploading to 0G..." : "Upload"}
            </button>
          </div>
        )}

        {/* Not connected */}
        {!wallet && (
          <div className="card p-8 text-center space-y-3">
            <p className="text-[var(--sub)] text-sm">
              Connect your wallet to upload files and view your storage
            </p>
            <button onClick={connectWallet} className="btn btn-orange px-6 py-2 text-sm">
              Connect Wallet
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="flex items-center justify-center gap-3 text-[var(--sub)]">
              <span
                className="w-2 h-2 rounded-full bg-[var(--accent)]"
                style={{ animation: "pulse-soft 0.8s infinite" }}
              />
              <span className="text-sm">Loading storage index...</span>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && entries.length === 0 && (
          <div className="card p-8 text-center space-y-3">
            <p className="text-[var(--sub)]">
              {filterMine ? "You haven't uploaded any files yet." : "No files in storage yet."}
            </p>
          </div>
        )}

        {/* File list */}
        {!loading && entries.length > 0 && (
          <>
            <p className="text-xs text-[var(--sub)]">
              {entries.length} file{entries.length !== 1 && "s"}
            </p>
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.rootHash}>
                  <div
                    className="card p-4 cursor-pointer hover:border-[var(--accent)] transition-colors"
                    onClick={() => viewFile(entry.rootHash)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      {/* Name + type */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                            {entry.name}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-[var(--accent-dim)] text-[var(--accent)] shrink-0">
                            {entry.contentType.split("/")[1] || entry.contentType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--sub)]">
                          <span className="font-mono">{abbreviate(entry.rootHash)}</span>
                          <span>{formatBytes(entry.size)}</span>
                          <span>{timeAgo(entry.timestamp)}</span>
                        </div>
                      </div>

                      {/* Wallet + links */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-[var(--orange)]">
                          {`${entry.wallet.slice(0, 6)}...${entry.wallet.slice(-4)}`}
                        </span>
                        {entry.submissionIndex !== null && (
                          <a
                            href={`https://storagescan-galileo.0g.ai/submission/${entry.submissionIndex}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-[var(--accent)] underline hover:text-[var(--foreground)]"
                          >
                            Explorer
                          </a>
                        )}
                        <span className="text-[var(--accent)] text-xs">
                          {viewingHash === entry.rootHash ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content viewer */}
                  {viewingHash === entry.rootHash && (
                    <div
                      className="mx-2 border-x border-b border-[var(--panel-border)] rounded-b-xl bg-black/40 p-4"
                      style={{ animation: "fade-in-up 0.15s ease" }}
                    >
                      {viewLoading ? (
                        <div className="flex items-center gap-2 text-[var(--sub)] text-sm">
                          <span
                            className="w-2 h-2 rounded-full bg-[var(--accent)]"
                            style={{ animation: "pulse-soft 0.8s infinite" }}
                          />
                          Fetching from 0G Storage...
                        </div>
                      ) : (
                        <pre className="text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                          {viewContent}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
