import sharp from "sharp";
import { writeFileSync } from "fs";

const size = 1024;

const svg = `<svg
  width="${size}"
  height="${size}"
  viewBox="0 0 40 44"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- Top hat -->
  <rect x="12" y="0" width="16" height="10" rx="2" fill="#34d399" />
  <rect x="8" y="9" width="24" height="3" rx="1" fill="#34d399" />

  <!-- Face -->
  <rect x="6" y="12" width="28" height="24" rx="6" fill="rgba(15, 18, 28, 0.95)" stroke="#38bdf8" stroke-width="1.5" />

  <!-- Antenna -->
  <line x1="20" y1="12" x2="20" y2="7" stroke="#38bdf8" stroke-width="1" />
  <circle cx="20" cy="5" r="2" fill="#38bdf8" />

  <!-- Eyes -->
  <circle cx="14" cy="22" r="3.5" fill="#38bdf8" opacity="0.9" />
  <circle cx="14" cy="22" r="1.5" fill="#0c0e14" />
  <circle cx="26" cy="22" r="3.5" fill="#38bdf8" opacity="0.9" />
  <circle cx="26" cy="22" r="1.5" fill="#0c0e14" />

  <!-- Monocle -->
  <circle cx="26" cy="22" r="5" fill="none" stroke="#fbbf24" stroke-width="0.8" />
  <line x1="31" y1="22" x2="34" y2="30" stroke="#fbbf24" stroke-width="0.6" />

  <!-- Mouth (happy) -->
  <path d="M 16 30 Q 20 35 24 30" stroke="#38bdf8" stroke-width="1.2" fill="none" stroke-linecap="round" />

  <!-- Side LEDs -->
  <rect x="8" y="26" width="3" height="1" rx="0.5" fill="#34d399" />
  <rect x="29" y="26" width="3" height="1" rx="0.5" fill="#34d399" />

  <!-- Bolts -->
  <circle cx="9" cy="32" r="1" fill="#6b7280" />
  <circle cx="31" cy="32" r="1" fill="#6b7280" />
</svg>`;

await sharp(Buffer.from(svg)).resize(size, size).png().toFile("logo.png");
console.log("Created logo.png (1024x1024)");
