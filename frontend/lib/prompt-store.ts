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
  `- User's stated intent: {{intent}}`,
  ``,
  `Known safe tokens: USDC ({{USDC}}), DAI ({{DAI}}), WETH ({{WETH}})`,
  ``,
  `IMPORTANT routing context: DEX routers (Uniswap, etc.) use multi-hop routes to find the best price. This means:`,
  `- ETH is automatically wrapped to WETH (treat them as equivalent)`,
  `- The router may swap through intermediate tokens (e.g. ETH → WETH → USDT → USDC) for better pricing`,
  `- Seeing WETH, USDT, DAI, or other stablecoins as intermediate hops in the simulation is NORMAL Uniswap behavior`,
  `- Only the final token received by the recipient matters for evaluating the intent`,
  `- Judge the intent against the INPUT token (ETH) and the FINAL OUTPUT token received by the recipient, NOT intermediate routing hops`,
  ``,
  `Transaction simulation results (Alchemy):`,
  `  {{simulationResults}}`,
  ``,
  `Flag if: unknown token as FINAL destination (not intermediate), suspicious recipient address, unusually large amount, or simulation shows the recipient receiving a different token than expected. Do NOT flag intermediate routing tokens (WETH, USDT, DAI, etc.) that appear in multi-hop swaps.`,
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
