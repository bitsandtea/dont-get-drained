"use client";

export function MrInference({ size = 48, mood = "neutral" }: { size?: number; mood?: "neutral" | "happy" | "thinking" }) {
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
      <rect x="12" y="0" width="16" height="10" rx="2" fill="var(--purple)" />
      <rect x="8" y="9" width="24" height="3" rx="1" fill="var(--purple)" />

      <rect x="6" y="12" width="28" height="24" rx="6" fill="var(--panel-bg)" stroke="var(--accent)" strokeWidth="1.5" />

      <line x1="20" y1="12" x2="20" y2="7" stroke="var(--accent)" strokeWidth="1" />
      <circle cx="20" cy="5" r="2" fill="var(--accent)">
        <animate
          attributeName="opacity"
          values={thinking ? "0.3;1;0.3" : "0.6;1;0.6"}
          dur={thinking ? "0.5s" : "2s"}
          repeatCount="indefinite"
        />
      </circle>

      <g style={thinking ? { animation: "scan-eyes 0.8s ease-in-out infinite" } : undefined}>
        <circle cx="14" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
        <circle cx="14" cy="22" r="1.5" fill="var(--background)" />
        <circle cx="26" cy="22" r="3.5" fill="var(--accent)" opacity="0.9" />
        <circle cx="26" cy="22" r="1.5" fill="var(--background)" />
      </g>

      <circle cx="26" cy="22" r="5" fill="none" stroke="var(--yellow)" strokeWidth="0.8" />
      <line x1="31" y1="22" x2="34" y2="30" stroke="var(--yellow)" strokeWidth="0.6" />

      <path d={mouthPath} stroke="var(--accent)" strokeWidth="1.2" fill="none" strokeLinecap="round" />

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

      <circle cx="9" cy="32" r="1" fill="var(--sub)" />
      <circle cx="31" cy="32" r="1" fill="var(--sub)" />
    </svg>
  );
}
