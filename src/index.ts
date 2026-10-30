import { CRATER_THRESHOLD_PCT, DEMO, DEMO_REASON, MIN_BASELINE_EVENTS, SPIKE_THRESHOLD_PCT, runDate } from "./config.js";
import { readPayingAccounts } from "./stripe.js";
import { readWeeklyUsage } from "./posthog.js";
import { classify, describeChange, money } from "./signal.js";
import { writeOutreach } from "./assess.js";
import { createDraft } from "./draft.js";
import type { Drafted, Signal } from "./types.js";

function parseArgs(argv: string[]): { dryRun: boolean } {
  const args = argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      [
        "Usage:",
        "  npm start                    scan every paying account, draft outreach for spikes and craters",
        "  npm start -- --demo          replay a recorded week, no keys, no network",
        "  npm start -- --dry-run       print every draft, create nothing in Gmail",
        "",
        `Defaults: a spike is +${SPIKE_THRESHOLD_PCT}% week over week, a crater is ${CRATER_THRESHOLD_PCT}%, and an account under ${MIN_BASELINE_EVENTS} events on both sides is too quiet to read anything into.`,
      ].join("\n"),
    );
    process.exit(0);
  }
  return { dryRun: args.includes("--dry-run") };
}

const opts = parseArgs(process.argv);
const now = runDate();

const demoNote = DEMO ? ` (demo: ${DEMO_REASON}, replaying a recorded week)` : "";
console.log(`── usage to outreach${demoNote}\n`);
if (DEMO && DEMO_REASON !== "--demo") {
  console.log("   No keys found, so this replays one recorded week for a fictional 8-account book:");
  console.log("   real pipeline, fictional accounts.\n");
}

const [accounts, usage] = await Promise.all([readPayingAccounts(), readWeeklyUsage(now)]);
console.log(`${accounts.length} paying accounts, ${usage.size} with PostHog usage in the window\n`);

const signals: Signal[] = accounts
  .filter((a) => {
    if (a.email) return true;
    console.log(`── ${a.name || a.customerId}  skipped, no email on the Stripe customer record`);
    return false;
  })
  .map((a) => classify(a, usage.get(a.customerId) ?? { thisWeek: 0, lastWeek: 0 }));

const flagged = signals.filter((s) => s.classification !== "steady");
const steady = signals.length - flagged.length;

const drafted: Drafted[] = [];

for (const signal of flagged) {
  const { account } = signal;
  console.log(`── ${account.name}  ${signal.classification}, ${describeChange(signal)}, ${account.plan} ${money(account.mrr)}/mo`);

  try {
    const outreach = await writeOutreach(signal);
    console.log(`   ${outreach.headline}`);

    let draftId = "";
    if (opts.dryRun || DEMO) {
      console.log(`   subject: ${outreach.subject}`);
      console.log(`   ${outreach.body.split("\n").join("\n   ")}`);
    } else {
      draftId = await createDraft(account.email, outreach.subject, outreach.body);
      console.log(`   gmail draft created (${draftId})`);
    }
    drafted.push({ signal, outreach, draftId });
  } catch (err) {
    console.error(`   failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

const count = (c: Signal["classification"]) => drafted.filter((d) => d.signal.classification === c).length;
console.log(
  `\n${drafted.length} drafted: ${count("spike")} spike, ${count("crater")} crater. ${steady} account${steady === 1 ? "" : "s"} steady, nothing drafted.`,
);

if (opts.dryRun) {
  console.log("\ndry run: nothing created in Gmail");
} else if (DEMO) {
  console.log("\ndemo mode: nothing was created in Gmail, nothing was sent anywhere");
}
