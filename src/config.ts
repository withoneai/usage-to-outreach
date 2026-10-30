import "dotenv/config";
import { readFileSync } from "node:fs";
import { One } from "@withone/sdk";

/**
 * Demo mode replays a recorded week of Stripe subscriptions, PostHog usage,
 * and Claude drafts from fixtures/. It turns on two ways: explicitly with
 * --demo, or implicitly when the required keys are absent. The implicit
 * fallback is what makes a fresh clone runnable with zero configuration: the
 * same pipeline runs end to end, only the Stripe read, the PostHog read, and
 * the Claude call come from disk instead of the wire.
 */
const KEYS_PRESENT = Boolean(
  process.env.ONE_SECRET &&
    process.env.ANTHROPIC_API_KEY &&
    process.env.ONE_CONNECTION_STRIPE &&
    process.env.ONE_CONNECTION_POSTHOG &&
    process.env.ONE_CONNECTION_GMAIL &&
    process.env.POSTHOG_PROJECT_ID,
);

export const DEMO = process.argv.includes("--demo") || !KEYS_PRESENT;
export const DEMO_REASON = process.argv.includes("--demo")
  ? "--demo"
  : KEYS_PRESENT
    ? ""
    : "no keys in the environment";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    console.error("Or run `npm start -- --demo` to replay a recorded week, no keys needed.");
    process.exit(1);
  }
  return value;
}

let client: One | undefined;
export function oneClient(): One {
  client ??= new One(required("ONE_SECRET"));
  return client;
}

export const connections = {
  stripe: () => required("ONE_CONNECTION_STRIPE"),
  posthog: () => required("ONE_CONNECTION_POSTHOG"),
  gmail: () => required("ONE_CONNECTION_GMAIL"),
};

export const posthogProjectId = () => required("POSTHOG_PROJECT_ID");

/** The event property joining a PostHog event to the Stripe customer it belongs to. */
export function usageProperty(): string {
  const prop = process.env.USAGE_PROPERTY || "stripe_customer_id";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(prop)) {
    console.error(`USAGE_PROPERTY must be a plain identifier, not "${prop}".`);
    process.exit(1);
  }
  return prop;
}

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.error(`${name} must be a number, not "${raw}".`);
    process.exit(1);
  }
  return value;
}

export const SPIKE_THRESHOLD_PCT = numberEnv("SPIKE_THRESHOLD_PCT", 50);
export const CRATER_THRESHOLD_PCT = numberEnv("CRATER_THRESHOLD_PCT", -50);
export const MIN_BASELINE_EVENTS = numberEnv("MIN_BASELINE_EVENTS", 5);

export function loadFixture(relPath: string): unknown {
  const url = new URL(`../fixtures/${relPath}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    throw new Error(`No fixture at fixtures/${relPath}.`);
  }
}

/**
 * "Now" for the run. Live, it is the clock. In demo mode it is pinned to the
 * moment the fixtures were captured, so "this week" and "last week" mean the
 * same thing no matter when you clone the repo.
 */
export function runDate(): Date {
  if (DEMO) {
    const meta = loadFixture("meta.json") as { captured_at: string };
    return new Date(meta.captured_at);
  }
  return new Date();
}

export function loadPolicy(): string {
  return readFileSync(new URL("../config/usage-policy.md", import.meta.url), "utf8");
}
