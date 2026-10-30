import { DEMO, loadPolicy } from "./config.js";
import { probeStripe } from "./stripe.js";
import { probePostHog } from "./posthog.js";
import { probeGmail } from "./draft.js";

/**
 * Proves the run will work before you rely on it: the voice policy parses,
 * and (live only) all three connections answer.
 */
let failed = false;

try {
  const policy = loadPolicy();
  console.log(`✓ config/usage-policy.md parses (${policy.split("\n").filter((l) => l.trim()).length} non-blank lines)`);

  if (DEMO) {
    console.log("\nNo keys in the environment, so none of the three connections were probed.");
    console.log("This clone will run `npm start` in demo mode: a recorded week, real pipeline.");
  } else {
    const subs = await probeStripe();
    console.log(`✓ Stripe answers (${subs} active subscription${subs === 1 ? "" : "s"} on the first page)`);
    await probePostHog();
    console.log("✓ PostHog answers (HogQL query endpoint reachable)");
    const email = await probeGmail();
    console.log(`✓ Gmail answers (${email})`);
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
