"""Reproduces the two findings behind the Momentum upgrade. Prints aggregates only.

1. Continuation gap: among practices still unpaid at Day 7 that recorded a qualifying
   action in [start, start + 3d), compare those that recorded another qualifying action in
   [start + 3d, start + 7d) with those that didn't, on paid_within_30_days.
   Qualifying action = any product event except workspace_created, the outcome/leakage
   events (subscription_started, billing_page_viewed), template_opened (browsing a template
   is not a completed workflow action) and staff_invited (team setup, not client work).
   Every counted event precedes payment by construction (unpaid at Day 7).
   The figures are sensitive to that definition, so the all-product-events version is
   printed too.
2. Client record sources: client_created events in the first 14 days, before payment.

Observational: continuing activity may reflect fit, intent or practice size rather than
cause payment.

Run: .venv/bin/python analysis/continuation_gap.py
"""

import pandas as pd

from analysis_reproduce import LEAKAGE, MIN_RELIABLE_N, diff_ci, load, risk_ratio_ci, wilson
from sanity_checks import WINDOW_DAYS

FIRST_CHECKPOINT_DAYS = 3
SECOND_CHECKPOINT_DAYS = 7
# The six recorded workflow events the journey and the experiment use. Client-originated events
# (client_booked_online) count as recorded workflow activity, not as a practitioner returning.
QUALIFYING = {"client_created", "appointment_created", "note_created", "ai_scribe_used", "invoice_sent", "client_booked_online"}


def rate(k: int, n: int) -> str:
    lo, hi = wilson(k, n)
    flag = f" [n<{MIN_RELIABLE_N}: indicative only]" if n < MIN_RELIABLE_N else ""
    return f"{k}/{n} = {k / n:.1%} (95% CI {lo:.1%}-{hi:.1%}){flag}"


def continuation_gap(workspaces: pd.DataFrame, events: pd.DataFrame, included: set[str], label: str) -> None:
    unpaid = workspaces.index[~(workspaces["paid"] & (workspaces["paid_day"] < SECOND_CHECKPOINT_DAYS))]
    actions = events[events["event"].isin(included)]
    early = set(actions.loc[(actions["day"] >= 0) & (actions["day"] < FIRST_CHECKPOINT_DAYS), "workspace_id"])
    later = set(actions.loc[(actions["day"] >= FIRST_CHECKPOINT_DAYS) & (actions["day"] < SECOND_CHECKPOINT_DAYS), "workspace_id"])
    base = unpaid[unpaid.isin(early)]
    continued = base.isin(later)
    paid = workspaces.loc[base, "paid"]
    k1, n1 = int(paid[continued].sum()), int(continued.sum())
    k2, n2 = int(paid[~continued].sum()), int((~continued).sum())
    lo, hi = diff_ci(k1, n1, k2, n2)
    rr, rr_lo, rr_hi = risk_ratio_ci(k1, n1, k2, n2)
    print(f"\nCONTINUATION GAP ({label})")
    print(f"  unpaid at day {SECOND_CHECKPOINT_DAYS} with a qualifying action by day {FIRST_CHECKPOINT_DAYS}: {len(base)}")
    print(f"  continued in days {FIRST_CHECKPOINT_DAYS}-{SECOND_CHECKPOINT_DAYS}: {n1}/{len(base)} = {n1 / len(base):.1%}; did not: {n2} = {n2 / len(base):.1%}")
    print(f"  later paid, continued:     {rate(k1, n1)}")
    print(f"  later paid, did not:       {rate(k2, n2)}")
    print(f"  difference {100 * (k1 / n1 - k2 / n2):+.1f}pp [{100 * lo:+.1f}, {100 * hi:+.1f}]; risk ratio {rr:.1f}x [{rr_lo:.1f}, {rr_hi:.1f}]")


def client_sources(events: pd.DataFrame) -> None:
    before_payment = events["paid_at"].isna() | (events["ts"] < events["paid_at"])
    clients = events[(events["event"] == "client_created") & (events["day"] >= 0) & (events["day"] < WINDOW_DAYS) & before_payment]
    counts = clients["source"].fillna("unspecified").value_counts()
    print(f"\nCLIENT RECORD SOURCES (client_created, first {WINDOW_DAYS} days, before payment): {len(clients)}")
    for source, n in counts.items():
        print(f"  {source:<16} {n:>5}  {n / len(clients):.1%}")


def main() -> None:
    workspaces, events, _ = load()
    continuation_gap(workspaces, events, QUALIFYING, "qualifying actions: the six journey events")
    continuation_gap(workspaces, events, set(events["event"]) - LEAKAGE, "sensitivity: every product event")
    client_sources(events)


if __name__ == "__main__":
    main()
