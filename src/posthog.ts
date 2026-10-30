import { DEMO, connections, loadFixture, oneClient, posthogProjectId, usageProperty } from "./config.js";
import type { UsageWindow } from "./types.js";

/** PostHog has no typed wrapper in the SDK yet, so this goes through raw passthrough. */
const QUERY_SYSTEM_ID = "conn_mod_def::GJ6IfjkjagM::9SyVCJYeSTeaNt_lGbUoeQ";

async function hogql(query: string): Promise<unknown[][]> {
  const res = await oneClient()
    .connection(connections.posthog())
    .runRaw({
      systemId: QUERY_SYSTEM_ID,
      method: "POST",
      path: "/api/projects/{{project_id}}/query/",
      pathParams: { project_id: posthogProjectId() },
      body: { query: { kind: "HogQLQuery", query } },
    });
  const results = (res.data as { results?: unknown[][] })?.results;
  if (!Array.isArray(results)) {
    throw new Error(`PostHog returned no results for: ${query.slice(0, 120)}...`);
  }
  return results;
}

/** HogQL reads double quotes as an identifier, so string literals are single-quoted. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * This week's and last week's event count per account, keyed by whatever
 * property joins a PostHog event to a Stripe customer (USAGE_PROPERTY,
 * default stripe_customer_id). One query, both weeks: a count of zero on
 * either side and a missing row for an account with no events at all come
 * out the same shape, which is what lets signal.ts treat them identically.
 */
export async function readWeeklyUsage(now: Date): Promise<Map<string, UsageWindow>> {
  if (DEMO) {
    const fixture = loadFixture("posthog/usage.json") as Record<string, UsageWindow>;
    return new Map(Object.entries(fixture));
  }

  const property = usageProperty();
  const thisWeekStart = new Date(now);
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
  const lastWeekStart = new Date(now);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 14);

  const rows = await hogql(
    `SELECT properties['${property}'] AS account, ` +
      `countIf(timestamp >= toDateTime(${lit(thisWeekStart.toISOString())})) AS this_week, ` +
      `countIf(timestamp < toDateTime(${lit(thisWeekStart.toISOString())})) AS last_week ` +
      `FROM events ` +
      `WHERE timestamp >= toDateTime(${lit(lastWeekStart.toISOString())}) ` +
      `AND timestamp < toDateTime(${lit(now.toISOString())}) ` +
      `AND notEmpty(properties['${property}']) ` +
      `GROUP BY account`,
  );

  const usage = new Map<string, UsageWindow>();
  for (const row of rows) {
    const [account, thisWeek, lastWeek] = row as [string, number, number];
    usage.set(String(account), { thisWeek: Number(thisWeek), lastWeek: Number(lastWeek) });
  }
  return usage;
}

/** A cheap liveness probe for `npm run check`: a query that touches no real property. */
export async function probePostHog(): Promise<void> {
  await hogql("SELECT 1");
}
