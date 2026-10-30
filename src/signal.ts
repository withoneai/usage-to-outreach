import { CRATER_THRESHOLD_PCT, MIN_BASELINE_EVENTS, SPIKE_THRESHOLD_PCT } from "./config.js";
import type { Account, Signal, UsageWindow } from "./types.js";

/**
 * Classifies one account's week-over-week usage in code. The model is never
 * asked to work out whether a change happened, only what it means: a model
 * that rounds a percentage differently than the code does produces a draft
 * that quotes a number nobody can defend.
 */
export function classify(account: Account, window: UsageWindow): Signal {
  const { thisWeek, lastWeek } = window;

  // Both weeks are too quiet to mean anything either way: a two-person trial
  // account firing four events is noise, not a signal, and never reaches the
  // model.
  if (thisWeek < MIN_BASELINE_EVENTS && lastWeek < MIN_BASELINE_EVENTS) {
    return { account, thisWeek, lastWeek, pctChange: null, fromZero: false, classification: "steady" };
  }

  // No baseline to compare against: the account went from nothing to real
  // usage. A percent change has no ceiling here, so none is reported; the
  // raw count carries the story instead.
  if (lastWeek === 0) {
    return { account, thisWeek, lastWeek, pctChange: null, fromZero: true, classification: "spike" };
  }

  const pctChange = Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10;
  if (pctChange >= SPIKE_THRESHOLD_PCT) {
    return { account, thisWeek, lastWeek, pctChange, fromZero: false, classification: "spike" };
  }
  if (pctChange <= CRATER_THRESHOLD_PCT) {
    return { account, thisWeek, lastWeek, pctChange, fromZero: false, classification: "crater" };
  }
  return { account, thisWeek, lastWeek, pctChange, fromZero: false, classification: "steady" };
}

export function describeChange(signal: Signal): string {
  if (signal.fromZero) return `0 to ${signal.thisWeek} events`;
  if (signal.thisWeek === 0) return `${signal.lastWeek} to 0 events`;
  const sign = (signal.pctChange ?? 0) > 0 ? "+" : "";
  return `${signal.lastWeek} to ${signal.thisWeek} events (${sign}${signal.pctChange}%)`;
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
