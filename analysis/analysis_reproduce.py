"""Reproduces every figure in the written submission and site/ from data/. Prints aggregates only,
never practice names or emails.

Definitions:
- Trial start = first workspace_created event (UTC). Signup local time is converted to
  UTC only to cross-check it.
- Exact duplicate event rows are removed; repeated actions at different times are kept.
- Outcome = paid_within_30_days from trials.csv.
- Day-3 landmark (main comparison): workspaces still unpaid at start + 3 days, behaviour
  in [start, start + 3d). Every counted event precedes payment by construction.
- First 14 days (descriptive): [start, start + 14d), events at or after paid_at_utc
  dropped. Payers who pay early have a shorter pre-payment window, so these rates are
  biased; read them as description, not prediction.
- subscription_started and billing_page_viewed are never predictors.

Run: .venv/bin/python analysis/analysis_reproduce.py
"""

import math
from pathlib import Path

import pandas as pd
from scipy.stats import norm

from sanity_checks import START_GAP_TOLERANCE_MIN, WINDOW_DAYS, signup_utc

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LANDMARK_DAYS = 3
MIN_RELIABLE_N = 30
Z = norm.ppf(0.975)
LEAKAGE = {"subscription_started", "billing_page_viewed", "workspace_created"}
# Mental-health professions: the "solo therapist" the email is written for.
THERAPY_PROFESSIONS = {"Counselor", "Psychologist", "Social Worker", "Therapist (LMFT)", "Psychiatrist"}
# Events an earlier AI-drafted analysis reported with post-payment activity included.
POST_PAY_CONTRAST = ["ai_scribe_used", "client_booked_online", "invoice_sent"]


def wilson(k: int, n: int) -> tuple[float, float]:
    p = k / n
    centre = (p + Z**2 / (2 * n)) / (1 + Z**2 / n)
    half = Z * math.sqrt(p * (1 - p) / n + Z**2 / (4 * n**2)) / (1 + Z**2 / n)
    return centre - half, centre + half


def diff_ci(k1: int, n1: int, k2: int, n2: int) -> tuple[float, float]:
    """Newcombe hybrid score interval for p1 - p2 (holds up at small n, unlike Wald)."""
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1)
    l2, u2 = wilson(k2, n2)
    d = p1 - p2
    return d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)


def risk_ratio_ci(k1: int, n1: int, k2: int, n2: int) -> tuple[float, float, float]:
    rr = (k1 / n1) / (k2 / n2)
    se = math.sqrt(1 / k1 - 1 / n1 + 1 / k2 - 1 / n2)
    return rr, rr * math.exp(-Z * se), rr * math.exp(Z * se)


def compare(label: str, has: pd.Series, paid: pd.Series, rr: bool = False) -> None:
    k1, n1 = int(paid[has].sum()), int(has.sum())
    k2, n2 = int(paid[~has].sum()), int((~has).sum())
    if n1 == 0 or n2 == 0:
        print(f"  {label:<30} n/a")
        return
    lo, hi = diff_ci(k1, n1, k2, n2)
    flag = f"  [n<{MIN_RELIABLE_N}: indicative only]" if min(n1, n2) < MIN_RELIABLE_N else ""
    line = (f"  {label:<30} {k1:>3}/{n1:<4} {k1 / n1:6.1%}   vs {k2:>3}/{n2:<4} {k2 / n2:6.1%}"
            f"   diff {100 * (k1 / n1 - k2 / n2):+5.1f}pp [{100 * lo:+.1f}, {100 * hi:+.1f}]")
    if rr and k1 and k2:
        r, rl, rh = risk_ratio_ci(k1, n1, k2, n2)
        line += f"   RR {r:.1f}x [{rl:.1f}, {rh:.1f}]"
    print(line + flag)


def did(workspaces: pd.Index, events: pd.DataFrame, name: str) -> pd.Series:
    """Per-workspace flag: did `name` at least once within `events`."""
    return pd.Series(workspaces.isin(events.loc[events["event"] == name, "workspace_id"]), index=workspaces)


def load() -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """Returns (one row per workspace, deduplicated events with day offsets, raw event count)."""
    trials = pd.read_csv(DATA_DIR / "trials.csv")
    raw = pd.read_csv(DATA_DIR / "events.csv")
    events = raw.drop_duplicates(["workspace_id", "timestamp_utc", "event", "properties"]).copy()
    events["ts"] = pd.to_datetime(events["timestamp_utc"], utc=True)
    for key in ["source", "plan", "billing"]:  # the only property keys in the data
        events[key] = events["properties"].str.extract(rf"(?:^|;){key}=([^;]*)")[0]

    workspaces = trials.set_index("workspace_id")
    workspaces["start"] = events[events["event"] == "workspace_created"].groupby("workspace_id")["ts"].min()
    workspaces["signup_utc"] = signup_utc(trials).set_axis(trials["workspace_id"])
    workspaces["paid_at"] = pd.to_datetime(workspaces["paid_at_utc"], utc=True)
    workspaces["paid"] = workspaces["paid_within_30_days"] == "yes"
    workspaces["paid_day"] = (workspaces["paid_at"] - workspaces["start"]) / pd.Timedelta(days=1)
    workspaces["solo"] = workspaces["team_size_at_signup"].astype(str) == "1"
    events = events.join(workspaces[["start", "paid_at"]], on="workspace_id")
    events["day"] = (events["ts"] - events["start"]) / pd.Timedelta(days=1)
    return workspaces, events, len(raw)


def report_data(workspaces: pd.DataFrame, events: pd.DataFrame, raw_count: int) -> None:
    print("DATA")
    print(f"  trials {len(workspaces)} | events {raw_count} raw, {raw_count - len(events)} exact duplicates removed, {len(events)} kept")
    print(f"  paid within 30 days: {workspaces['paid'].sum()}/{len(workspaces)} = {workspaces['paid'].mean():.1%}")
    gap_min = (workspaces["signup_utc"] - workspaces["start"]).dt.total_seconds().abs() / 60
    print(f"  signup (local->UTC) vs workspace_created: max gap {gap_min.max():.1f} min, >{START_GAP_TOLERANCE_MIN} min: {(gap_min > START_GAP_TOLERANCE_MIN).sum()}")
    subs = events[events["event"] == "subscription_started"]
    sub_at = subs.groupby("workspace_id")["ts"].min().reindex(workspaces.index)
    mismatch = (workspaces["paid"] != sub_at.notna()) | (sub_at.notna() & (sub_at != workspaces["paid_at"]))
    print(f"  trials.csv payment vs subscription_started disagreements: {mismatch.sum()}")
    payers = workspaces[workspaces["paid"]]
    print(f"  payment timing: before day {LANDMARK_DAYS} {(payers['paid_day'] < LANDMARK_DAYS).sum()}, "
          f"day {LANDMARK_DAYS}-{WINDOW_DAYS} {((payers['paid_day'] >= LANDMARK_DAYS) & (payers['paid_day'] < WINDOW_DAYS)).sum()}, "
          f"day {WINDOW_DAYS}+ {(payers['paid_day'] >= WINDOW_DAYS).sum()}")
    print("  plans:", ", ".join(f"{p}/{b} {n}" for (p, b), n in subs.groupby(["plan", "billing"]).size().items()))


def report_landmark(landmark: pd.DataFrame, early: pd.DataFrame) -> None:
    print(f"\nDAY-{LANDMARK_DAYS} LANDMARK (unpaid at day {LANDMARK_DAYS}; behaviour in days 0-{LANDMARK_DAYS}; outcome paid by day 30)")
    print(f"  workspaces {len(landmark)}, later paid {landmark['paid'].sum()}  (with behaviour vs without; diff 95% CI)")
    for name in sorted(set(early["event"]) - LEAKAGE):
        compare(name, did(landmark.index, early, name), landmark["paid"], rr=name == "ai_scribe_used")
    for source in ["manual", "import", "online_booking"]:
        compare(f"client_created source={source}", did(landmark.index, early[early["source"] == source], "client_created"), landmark["paid"])


def report_confounders(workspaces: pd.DataFrame, landmark: pd.DataFrame, early: pd.DataFrame) -> None:
    scribe = did(landmark.index, early, "ai_scribe_used")
    wrote_note = did(landmark.index, early, "note_created")
    us = landmark["country"] == "US"
    print(f"\n  AI Scribe by day {LANDMARK_DAYS}, stratified (confounder checks)")
    for label, mask in [("US", us), ("non-US", ~us), ("solo", landmark["solo"]), ("team 2+", ~landmark["solo"]),
                        (f"created a note by day {LANDMARK_DAYS}", wrote_note)]:
        compare(label, scribe[mask], landmark.loc[mask, "paid"])
    print(f"  payers who are US-based: {(workspaces['paid'] & (workspaces['country'] == 'US')).sum()}/{workspaces['paid'].sum()}; "
          f"US share of all trials: {(workspaces['country'] == 'US').sum()}/{len(workspaces)}")


def report_audience(landmark: pd.DataFrame, early: pd.DataFrame) -> None:
    print(f"\nJOURNEY AUDIENCE (solo, note by day {LANDMARK_DAYS}, no AI Scribe by day {LANDMARK_DAYS}, unpaid at day {LANDMARK_DAYS})")
    scribe = did(landmark.index, early, "ai_scribe_used")
    solo_writers = landmark["solo"] & did(landmark.index, early, "note_created")
    compare("solo note-writers: Scribe y/n", scribe[solo_writers], landmark.loc[solo_writers, "paid"])
    audience = landmark[solo_writers & ~scribe]
    therapy = audience["profession"].isin(THERAPY_PROFESSIONS)
    print(f"  audience {len(audience)}: therapy professions {therapy.sum()}, other {(~therapy).sum()}")
    print("  " + ", ".join(f"{k} {v}" for k, v in audience["profession"].value_counts().items()))


def report_first_window(workspaces: pd.DataFrame, events: pd.DataFrame) -> None:
    print(f"\nFIRST {WINDOW_DAYS} DAYS, DESCRIPTIVE (events before payment only; all {len(workspaces)} workspaces)")
    in_window = events[(events["day"] >= 0) & (events["day"] < WINDOW_DAYS)]
    pre_payment = in_window[in_window["paid_at"].isna() | (in_window["ts"] < in_window["paid_at"])]
    for name in sorted(set(pre_payment["event"]) - LEAKAGE):
        compare(name, did(workspaces.index, pre_payment, name), workspaces["paid"])
    print("  for contrast, INCLUDING post-payment events (the old draft's method):")
    for name in POST_PAY_CONTRAST:
        compare(f"{name} (incl. post-pay)", did(workspaces.index, in_window, name), workspaces["paid"])


def report_billing(workspaces: pd.DataFrame, events: pd.DataFrame) -> None:
    print("\nBILLING PAGE (intent signal, not a predictor)")
    views = events[events["event"] == "billing_page_viewed"]
    views_window = views[(views["day"] >= 0) & (views["day"] < WINDOW_DAYS)]
    viewed = did(workspaces.index, views_window, "billing_page_viewed")
    compare(f"viewed billing in days 0-{WINDOW_DAYS}", viewed, workspaces["paid"])
    paying_viewers = workspaces[workspaces["paid"] & viewed].index
    viewed_first = views_window[views_window["workspace_id"].isin(paying_viewers)
                                & (views_window["ts"] < views_window["paid_at"])]["workspace_id"].nunique()
    print(f"  paying workspaces with a days 0-{WINDOW_DAYS} view: {len(paying_viewers)}; "
          f"of these, no view before paying: {len(paying_viewers) - viewed_first}")
    payer_views = views[views["paid_at"].notna()]
    print(f"  all time: payers with any view {payer_views['workspace_id'].nunique()}/{workspaces['paid'].sum()}, "
          f"with a view before paying {payer_views[payer_views['ts'] < payer_views['paid_at']]['workspace_id'].nunique()}")


def main() -> None:
    workspaces, events, raw_count = load()
    landmark = workspaces[~(workspaces["paid_day"] < LANDMARK_DAYS)]
    early = events[(events["day"] >= 0) & (events["day"] < LANDMARK_DAYS) & events["workspace_id"].isin(landmark.index)]
    report_data(workspaces, events, raw_count)
    report_landmark(landmark, early)
    report_confounders(workspaces, landmark, early)
    report_audience(landmark, early)
    report_first_window(workspaces, events)
    report_billing(workspaces, events)


if __name__ == "__main__":
    main()
