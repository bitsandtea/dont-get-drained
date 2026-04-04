import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "prompt-config.json");

export const DEFAULT_PROMPT_TEMPLATE = [
  `Analyze this swap for safety. Reply with ONLY valid JSON, no markdown fences, no extra text.`,
  ``,
  `Response format: {"approved": 1, "notes": "reason here"}`,
  `Use approved: 1 to approve, approved: 0 to reject.`,
  ``,
  `Swap details:`,
  `- Swapping {{amountIn}} ETH for {{outputAmount}} {{tokenSymbol}}`,
  `- Token out address: {{tokenOut}}`,
  `- Recipient / swapper: {{recipient}}`,
  `- Routing: {{routing}}`,
  "- Estimated gas: ${{gasFeeUSD}}",
  `- Transaction target: {{txTarget}}`,
  ``,
  `Known safe tokens: USDC ({{USDC}}), DAI ({{DAI}}), WETH ({{WETH}})`,
  `Flag if: unknown token, suspicious address, or unusually large amount.`,
].join("\n");

export function getPromptTemplate(): string {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    return data.template || DEFAULT_PROMPT_TEMPLATE;
  } catch {
    return DEFAULT_PROMPT_TEMPLATE;
  }
}

export function setPromptTemplate(template: string): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ template }, null, 2), "utf-8");
}

export function renderPrompt(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
