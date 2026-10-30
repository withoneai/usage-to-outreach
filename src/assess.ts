import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DEMO, loadFixture, loadPolicy } from "./config.js";
import { describeChange, money } from "./signal.js";
import type { Outreach, Signal } from "./types.js";

const client = new Anthropic();

const OutreachSchema = z.object({
  headline: z.string(),
  subject: z.string(),
  body: z.string(),
});

/**
 * Writes the outreach for one flagged account. Classification, the percent
 * change, and the account's plan and MRR are all established in signal.ts
 * and stripe.ts before this is ever called; the model's only job is what to
 * say about them, against the voice rules in config/usage-policy.md.
 */
export async function writeOutreach(signal: Signal): Promise<Outreach> {
  if (DEMO) {
    const recorded = loadFixture("assessments.json") as Record<string, Outreach>;
    const outreach = recorded[signal.account.customerId];
    if (!outreach) {
      throw new Error(`No recorded outreach for ${signal.account.customerId} in fixtures/assessments.json.`);
    }
    return outreach;
  }

  const prompt = `You are a customer success lead drafting first-touch outreach off one account's usage change, following the voice policy below exactly.

## Our outreach policy

${loadPolicy()}

## The account

Name: ${signal.account.name || "(no name on file)"}
Plan: ${signal.account.plan}, ${money(signal.account.mrr)}/mo
Signal: ${signal.classification}
Usage change: ${describeChange(signal)}

## Instructions

- headline: one sentence for an internal log, naming the concrete numbers.
- subject and body: the email, under 150 words, personalized with the account's own numbers above. Plain text, no placeholders left unfilled, sign off as written in the policy file.
- Never invent a number, a feature, or a fact not given above.
- Style: no em dashes or en dashes anywhere. Use a comma, period, colon, or parentheses instead.`;

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(OutreachSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to draft outreach for ${signal.account.customerId}.`);
  }
  if (!response.parsed_output) {
    throw new Error("Claude returned output that did not match the schema.");
  }
  return response.parsed_output;
}
