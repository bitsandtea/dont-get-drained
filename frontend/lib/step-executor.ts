import { renderPrompt } from "./prompt-store";
import { runInference, InferenceResult } from "./og-inference";
import { StepFlow } from "./agents";

export interface StepExecutionResult {
  vars: Record<string, string>;
  inferences: InferenceResult[];
  finalOutput: string;
}

/**
 * Execute a multi-step agent flow sequentially.
 * Each step is either a `curl` (HTTP fetch) or `inference` (AI call).
 * Each step's output is stored as a variable for subsequent steps.
 */
export async function executeStepFlow(
  flow: StepFlow,
  initialVars: Record<string, string>
): Promise<StepExecutionResult> {
  const vars = { ...initialVars };
  const inferences: InferenceResult[] = [];

  console.log(`[STEP-FLOW] ========================================`);
  console.log(`[STEP-FLOW] Starting multi-step flow: ${flow.steps.length} steps`);
  console.log(`[STEP-FLOW] Data sources: ${flow.dataSources.join(", ")}`);
  console.log(`[STEP-FLOW] Initial vars: ${Object.keys(initialVars).join(", ")}`);
  console.log(`[STEP-FLOW] ========================================`);

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const t0 = Date.now();
    console.log(`[STEP ${i}/${flow.steps.length - 1}] ---- type=${step.type} outputVar=${step.outputVar} ----`);

    if (step.type === "curl") {
      const url = renderPrompt(step.url || "", vars);
      const method = step.method || "GET";

      console.log(`[STEP ${i}] CURL ${method} ${url}`);

      // Validate URL against registered data sources
      const allowed = flow.dataSources.some((ds) => url.startsWith(ds));
      if (!allowed) {
        console.error(`[STEP ${i}] URL NOT ALLOWED — must match: ${flow.dataSources.join(", ")}`);
        throw new Error(
          `Step ${i}: URL "${url.slice(0, 120)}" is not allowed — must match a registered data source`
        );
      }
      console.log(`[STEP ${i}] URL allowed (matched data source)`);

      const opts: RequestInit = { method };
      if (step.method === "POST" && step.body) {
        const renderedBody = renderPrompt(step.body, vars);
        opts.body = renderedBody;
        opts.headers = { "Content-Type": "application/json" };
        console.log(`[STEP ${i}] Request body: ${renderedBody.slice(0, 500)}`);
      }

      const res = await fetch(url, opts);
      console.log(`[STEP ${i}] Response status: ${res.status} ${res.statusText}`);
      console.log(`[STEP ${i}] Response headers: content-type=${res.headers.get("content-type")}, content-length=${res.headers.get("content-length")}`);

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[STEP ${i}] CURL FAILED — status ${res.status}, body: ${errBody.slice(0, 500)}`);
        throw new Error(`Step ${i}: curl to ${url.slice(0, 80)} returned ${res.status}`);
      }
      const text = await res.text();
      vars[step.outputVar] = text;
      console.log(`[STEP ${i}] CURL response (${text.length} chars): ${text.slice(0, 1000)}${text.length > 1000 ? "... [truncated]" : ""}`);
      console.log(`[STEP ${i}] CURL done in ${Date.now() - t0}ms — stored in {{${step.outputVar}}}`);

    } else if (step.type === "inference") {
      const prompt = renderPrompt(step.prompt || "", vars);
      console.log(`[STEP ${i}] INFERENCE prompt (${prompt.length} chars):`);
      console.log(`[STEP ${i}] --- PROMPT START ---`);
      console.log(prompt.slice(0, 2000) + (prompt.length > 2000 ? `\n... [truncated, ${prompt.length} total chars]` : ""));
      console.log(`[STEP ${i}] --- PROMPT END ---`);

      const result = await runInference(prompt);
      vars[step.outputVar] = result.answer;
      inferences.push(result);

      console.log(`[STEP ${i}] INFERENCE response (${result.answer.length} chars):`);
      console.log(`[STEP ${i}] --- ANSWER START ---`);
      console.log(result.answer.slice(0, 2000) + (result.answer.length > 2000 ? `\n... [truncated, ${result.answer.length} total chars]` : ""));
      console.log(`[STEP ${i}] --- ANSWER END ---`);
      console.log(`[STEP ${i}] Model: ${result.model}, Provider: ${result.provider}, ChatID: ${result.chatId}`);
      console.log(`[STEP ${i}] TEE verified: ${result.verified}, has proof: ${!!result.teeProof}`);
      console.log(`[STEP ${i}] INFERENCE done in ${Date.now() - t0}ms — stored in {{${step.outputVar}}}`);
    }
  }

  const lastStep = flow.steps[flow.steps.length - 1];
  const finalOutput = vars[lastStep.outputVar] || "";
  console.log(`[STEP-FLOW] ========================================`);
  console.log(`[STEP-FLOW] Flow complete — ${inferences.length} inference(s), final output: ${finalOutput.length} chars`);
  console.log(`[STEP-FLOW] All vars: ${Object.keys(vars).join(", ")}`);
  console.log(`[STEP-FLOW] ========================================`);

  return {
    vars,
    inferences,
    finalOutput,
  };
}
