<h3 align="center">Usage to Outreach</h3>
<p align="center">An AI agent for the sales-ops usage review: find every paying account whose product usage jumped or cratered this week against the one you ran last week, and have Claude draft the specific outreach each one deserves, as a Gmail draft nobody sends automatically.<br />Built on <a href="https://withone.ai">One</a>. Nothing is emailed, cancelled, or changed anywhere; this only reads and drafts.</p>

<p align="center">
  <a href="https://withone.ai"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://withone.ai/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://app.withone.ai"><strong>Dashboard</strong></a>
</p>

---

## What it does

A usage dashboard tells you an account's number went up or down. It does not tell you which of your forty paying accounts crossed a threshold worth a human's attention this week, and it does not write the email. This does both:

1. **Reads every active subscription from Stripe**, with the customer expanded, so the plan, the MRR, and the email to draft to all come back in one call.
2. **Reads this week's and last week's event count per account from PostHog**, joined to the Stripe customer by one event property (`stripe_customer_id` by default: see "The join" below).
3. **Classifies the change in code**: a jump of 50% or more is a spike, a drop of 50% or more is a crater, and an account under 5 events on both sides is too quiet to read anything into either way and is skipped before the model ever sees it.
4. **Has Claude write the outreach** for every flagged account, personalized with that account's own numbers and plan, against a voice policy written in plain English in `config/usage-policy.md`: congratulatory for a spike, a genuine check-in for a crater, never alarmist, never mentioning churn risk out loud.
5. **Creates one Gmail draft per flagged account**, addressed to the account's own email on file in Stripe. Nothing sends itself; a human reads, edits, and hits send.

Sample output (fictional accounts, shipped as the demo fixture):

```
$ npm start

8 paying accounts, 8 with PostHog usage in the window

── Acme Robotics  spike, 40 to 210 events (+425%), Growth $499/mo
   Acme Robotics ran 210 actions last week, up from 40: a 425% jump on the Growth plan.
── Brightline Logistics  crater, 820 to 36 events (-95.6%), Scale $1,499/mo
   Brightline Logistics dropped to 36 actions last week from 820: a 95.6% fall on the Scale plan.
── Driftwood Media  spike, 0 to 95 events, Growth $499/mo
   Driftwood Media went from 0 actions to 95 last week: a new account coming alive on the Growth plan.
── Emberlane Finance  crater, 610 to 0 events, Scale $1,499/mo
   Emberlane Finance fell to 0 actions last week from 610: a full stop on the Scale plan.
── Grayridge Studio  spike, 150 to 410 events (+173.3%), Growth $499/mo
   Grayridge Studio ran 410 actions last week, up from 150: a 173.3% jump on the Growth plan.
── Harrow & Vale  crater, 540 to 190 events (-64.8%), Scale $1,499/mo
   Harrow & Vale fell to 190 actions last week from 540: a 64.8% drop on the Scale plan.

6 drafted: 3 spike, 3 crater. 2 accounts steady, nothing drafted.

demo mode: nothing was created in Gmail, nothing was sent anywhere
```

Every platform call (Stripe, Gmail) goes through [One](https://withone.ai), using the typed `@withone/sdk` modules. PostHog has no typed module yet, so that call goes through the SDK's raw passthrough with the same auth, retries, and base URL handling.

## Try it in 60 seconds, no keys

```bash
git clone https://github.com/withoneai/usage-to-outreach
cd usage-to-outreach
npm install
npm start
```

With no keys in the environment, the same pipeline runs against a recorded week of Stripe subscriptions and PostHog usage for eight fictional accounts. Every branch fires at least once: a classic spike, an account going from zero usage to real usage, a classic crater, an account going completely quiet, and two accounts too quiet on both sides to flag either way.

## Go live (about 5 minutes)

**1. Connect Stripe, PostHog, and Gmail through One**

```bash
npm i -g @withone/cli
one init             # create an account or log in
one add stripe
one add posthog
one add gmail
```

**2. Configure this repo**

```bash
cp .env.example .env
```

Fill in `ONE_SECRET`, `ANTHROPIC_API_KEY`, the three connection keys from `one --agent list`, and `POSTHOG_PROJECT_ID` (Project settings, General, Project ID).

**3. The join**

Stripe and PostHog have no shared account id out of the box. This reads one PostHog event property, `stripe_customer_id` by default, and expects your app to set it on every event (most teams already do this when they call `posthog.identify` or `posthog.group` at signup, using the same id Stripe gave the customer). If your property is named differently, set `USAGE_PROPERTY` in `.env`. An account with no matching events reads as zero both weeks and is skipped as too quiet, not flagged as a crater.

**4. Write your outreach policy**

`config/usage-policy.md` is the whole voice configuration, in plain English: what to say for a spike, what to say for a crater, how to sign off. The code that classifies usage does not read it; the model applies it verbatim.

**5. Check, then run**

```bash
npm run check         # policy parses, all three connections answer
npm start             # read, classify, draft
```

## Usage

```bash
# scan every paying account, draft outreach for spikes and craters
npm start

# print every draft, create nothing in Gmail
npm start -- --dry-run

# replay the recorded demo week even with keys present
npm start -- --demo
```

`SPIKE_THRESHOLD_PCT` (default 50) and `CRATER_THRESHOLD_PCT` (default -50) set the week-over-week swing that counts as a signal. `MIN_BASELINE_EVENTS` (default 5) sets the floor below which an account is too quiet on both sides to read anything into.

## What a run costs

One paged Stripe call, one PostHog query (both weeks in a single HogQL call), and one Claude call per flagged account: usually two to ten calls for a company with a few dozen paying accounts. Run it weekly; it keeps no state between runs.

## How the call gets made

**Whether usage changed is arithmetic. What it means is judgment.** The percent change, the zero-to-something and something-to-zero cases, and the noise floor are all computed from the two counts PostHog returns, and the model never touches that math, because a model that rounds a percentage differently than the code does produces a draft that quotes a number nobody can defend. What a 425% jump or a total drop to zero is worth saying, in what tone, to which kind of account, is the model's job, reading the voice policy verbatim.

An account under the event floor on both sides never reaches the model at all. A trial account firing three events a week either way is not a signal, and asking Claude to write outreach for it would only produce a confident-sounding email about nothing.

## How it is wired

| File | What it does |
| --- | --- |
| `config/usage-policy.md` | The outreach voice, in plain English. The model reads it verbatim |
| `src/stripe.ts` | Reads active subscriptions via `@withone/sdk/stripe`, customer expanded |
| `src/posthog.ts` | Reads this week's and last week's event count per account via raw HogQL |
| `src/signal.ts` | Classifies spike, crater, or steady; the one place with the thresholds |
| `src/assess.ts` | Claude writes the outreach for a flagged account; never called for a steady one |
| `src/draft.ts` | Creates the Gmail draft via `@withone/sdk/gmail`; never sends |
| `src/index.ts` | The run: read, classify, gate, draft |
| `src/check.ts` | `npm run check`: policy parses, connections answer |
| `fixtures/` | The recorded accounts, usage, and outreach the demo replays |

## What it does not do

- It does not send anything. Every flagged account gets a Gmail draft; a human reads, edits, and sends it, or doesn't.
- It does not see inside your product. It counts PostHog events against the property you tell it to; what those events mean is on your instrumentation, not this repo.
- It does not know why usage changed. It is the trigger to ask, not the answer.

## License

MIT
