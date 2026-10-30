/** A paying account, read from an active Stripe subscription. */
export interface Account {
  customerId: string;
  name: string;
  email: string;
  plan: string;
  mrr: number;
  currency: string;
}

/** Raw event counts for one account over two trailing seven-day windows. */
export interface UsageWindow {
  thisWeek: number;
  lastWeek: number;
}

export type Classification = "spike" | "crater" | "steady";

/** What code established about one account's usage. None of it is judgment. */
export interface Signal {
  account: Account;
  thisWeek: number;
  lastWeek: number;
  /** Percent change, null when there is no comparable baseline (zero on both sides, or a jump from zero that has no percent). */
  pctChange: number | null;
  /** True when lastWeek was zero and thisWeek was not: the account had no comparable baseline, not a bounded jump. */
  fromZero: boolean;
  classification: Classification;
}

export interface Outreach {
  /** One line for the console: what happened and why it matters. */
  headline: string;
  subject: string;
  body: string;
}

export interface Drafted {
  signal: Signal;
  outreach: Outreach;
  /** Gmail draft id, once created. Empty in demo or dry-run, where nothing is drafted. */
  draftId: string;
}
