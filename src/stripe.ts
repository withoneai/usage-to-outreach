import * as stripe from "@withone/sdk/stripe";
import { DEMO, connections, loadFixture, oneClient } from "./config.js";
import type { Account } from "./types.js";

interface StripeSubscription {
  customer: string | { id: string; email?: string | null; name?: string | null };
  items: { data: Array<{ quantity?: number; price?: { nickname?: string | null; id?: string; unit_amount?: number | null; currency?: string } }> };
}

function toAccount(sub: StripeSubscription): Account {
  const customer = sub.customer;
  const item = sub.items.data[0];
  const price = item?.price;
  return {
    customerId: typeof customer === "string" ? customer : customer.id,
    name: typeof customer === "string" ? "" : (customer.name ?? customer.email ?? ""),
    email: typeof customer === "string" ? "" : (customer.email ?? ""),
    plan: price?.nickname ?? price?.id ?? "unknown plan",
    mrr: ((price?.unit_amount ?? 0) * (item?.quantity ?? 1)) / 100,
    currency: (price?.currency ?? "usd").toUpperCase(),
  };
}

/**
 * Every account on an active subscription, with the customer expanded so the
 * email to draft to comes back in the same call. An account with no email on
 * file is skipped upstream, in index.ts: there is nowhere to send the draft.
 */
export async function readPayingAccounts(): Promise<Account[]> {
  if (DEMO) {
    const fixture = loadFixture("stripe/subscriptions.json") as { data: StripeSubscription[] };
    return fixture.data.map(toAccount);
  }

  const accounts: Account[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const res = await oneClient()
      .connection(connections.stripe())
      .run(
        stripe.listSubscriptions({
          query: {
            status: "active",
            limit: 100,
            expand: ["data.customer"],
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
        }),
      );
    const data = res.data as { data: Array<StripeSubscription & { id: string }>; has_more: boolean };
    accounts.push(...data.data.map(toAccount));
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }
  return accounts;
}

/** A cheap liveness probe for `npm run check`: one page of subscriptions. */
export async function probeStripe(): Promise<number> {
  const res = await oneClient()
    .connection(connections.stripe())
    .run(stripe.listSubscriptions({ query: { status: "active", limit: 1 } }));
  const data = res.data as { data: unknown[] };
  return data.data.length;
}
