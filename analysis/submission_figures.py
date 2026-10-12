"""Writes the figures quoted in the growth challenge submission to submission/assets/figures.json.

Every number in submission/ comes from this file, which reuses the definitions in
analysis_reproduce.py and continuation_gap.py. It prints nothing but a summary.

Run: .venv/bin/python analysis/submission_figures.py
"""

import json
from pathlib import Path

import pandas as pd
from scipy.stats import norm

from analysis_reproduce import LEAKAGE, diff_ci, load, risk_ratio_ci, wilson
from continuation_gap import QUALIFYING
from sanity_checks import WINDOW_DAYS

OUT = Path(__file__).resolve().parent.parent / "submission" / "assets" / "figures.json"
BREADTH_BANDS = [("0-1", 0, 1), ("2-3", 2, 3), ("4-5", 4, 5), ("6+", 6, 99)]


def rate_block(k: int, n: int) -> dict:
    lo, hi = wilson(k, n)
    return {"paid": k, "n": n, "rate": k / n, "ci": [lo, hi]}


def breadth(workspaces: pd.DataFrame, events: pd.DataFrame) -> list[dict]:
    """Distinct product event types in days 0-3, among practices unpaid at Day 3."""
    unpaid = workspaces[~(workspaces["paid"] & (workspaces["paid_day"] < 3))]
    product = events[~events["event"].isin(LEAKAGE)]
    types = product[(product["day"] >= 0) & (product["day"] < 3)].groupby("workspace_id")["event"].nunique()
    types = types.reindex(unpaid.index, fill_value=0)
    rows = []
    for label, lo, hi in BREADTH_BANDS:
        members = unpaid.index[(types >= lo) & (types <= hi)]
        rows.append({"band": label, **rate_block(int(unpaid.loc[members, "paid"].sum()), len(members))})
    return rows


def repeat_use(workspaces: pd.DataFrame, events: pd.DataFrame) -> dict:
    """Actions by Day 3 among practices unpaid at Day 3: once versus two or more times."""
    unpaid = workspaces[~(workspaces["paid"] & (workspaces["paid_day"] < 3))]
    product = events[~events["event"].isin(LEAKAGE)]
    out = {}
    for name in ["note_created", "appointment_created", "template_opened", "client_created"]:
        counts = product[(product["event"] == name) & (product["day"] >= 0) & (product["day"] < 3)]
        counts = counts.groupby("workspace_id").size().reindex(unpaid.index, fill_value=0)
        once, many = counts == 1, counts >= 2
        out[name] = {
            "once": rate_block(int(unpaid.loc[once[once].index, "paid"].sum()), int(once.sum())),
            "twice_or_more": rate_block(int(unpaid.loc[many[many].index, "paid"].sum()), int(many.sum())),
        }
    return out


def continuation(workspaces: pd.DataFrame, events: pd.DataFrame, included: set[str]) -> dict:
    """Unpaid at Day 7 with a qualifying action by Day 3: did they act again in Days 3-7?"""
    unpaid = workspaces.index[~(workspaces["paid"] & (workspaces["paid_day"] < WINDOW_DAYS / 2))]
    actions = events[events["event"].isin(included)]
    early = set(actions.loc[(actions["day"] >= 0) & (actions["day"] < 3), "workspace_id"])
    later = set(actions.loc[(actions["day"] >= 3) & (actions["day"] < 7), "workspace_id"])
    base = unpaid[unpaid.isin(early)]
    continued = base.isin(later)
    paid = workspaces.loc[base, "paid"]
    yes, no = rate_block(int(paid[continued].sum()), int(continued.sum())), rate_block(int(paid[~continued].sum()), int((~continued).sum()))
    lo, hi = diff_ci(yes["paid"], yes["n"], no["paid"], no["n"])
    rr, rr_lo, rr_hi = risk_ratio_ci(yes["paid"], yes["n"], no["paid"], no["n"])
    return {
        "cohort": len(base), "continued": yes, "did_not": no,
        "difference_pp": 100 * (yes["rate"] - no["rate"]), "difference_ci_pp": [100 * lo, 100 * hi],
        "risk_ratio": [rr, rr_lo, rr_hi],
    }


def stalled_experiment(workspaces: pd.DataFrame, events: pd.DataFrame) -> dict:
    """Baseline and an illustrative sample-size calculation for the Day 7 experiment.

    Stalled = unpaid at Day 7, a qualifying action by Day 3, and none in Days 3 to 7 (the six events).
    Primary outcome baseline = share of stalled practices with a qualifying action in Days 7 to 14.
    Assumptions are explicit: two-sided alpha 0.05, power 0.80, equal arms, the fictional baseline,
    and the fictional signup rate. These are not production inputs.
    """
    base_ok = continuation(workspaces, events, QUALIFYING)
    unpaid = workspaces.index[~(workspaces["paid"] & (workspaces["paid_day"] < WINDOW_DAYS / 2))]
    actions = events[events["event"].isin(QUALIFYING)]
    early = set(actions.loc[(actions["day"] >= 0) & (actions["day"] < 3), "workspace_id"])
    later = set(actions.loc[(actions["day"] >= 3) & (actions["day"] < 7), "workspace_id"])
    stalled = unpaid[unpaid.isin(early) & ~unpaid.isin(later)]
    returned = set(actions.loc[(actions["day"] >= 7) & (actions["day"] < WINDOW_DAYS), "workspace_id"])
    p1 = sum(1 for w in stalled if w in returned) / len(stalled)
    signup = workspaces["signup_utc"]
    weeks = (signup.max() - signup.min()).days / 7
    per_week = len(stalled) / weeks
    z_alpha, z_power = norm.ppf(0.975), norm.ppf(0.80)

    def n_per_arm(lift: float) -> int:
        p2 = p1 + lift
        pbar = (p1 + p2) / 2
        num = (z_alpha * (2 * pbar * (1 - pbar)) ** 0.5 + z_power * (p1 * (1 - p1) + p2 * (1 - p2)) ** 0.5) ** 2
        return int(-(-num // lift ** 2))

    rows = []
    for lift in [0.05, 0.10, 0.15]:
        n = n_per_arm(lift)
        rows.append({"absolute_lift": lift, "n_per_arm": n, "total": 2 * n, "weeks_at_observed_rate": 2 * n / per_week})
    return {
        "cohort_unpaid_day7": len(unpaid),
        "stalled": int(len(stalled)),
        "return_day7_to_14": {"k": len(stalled[stalled.isin(returned)]), "n": int(len(stalled)), "rate": p1},
        "paid_by_day30_baseline": base_ok["did_not"]["rate"],
        "signup_weeks": weeks,
        "stalled_per_week": per_week,
        "alpha": 0.05, "power": 0.80, "sample_rows": rows,
    }


def payment_timing(workspaces: pd.DataFrame) -> dict:
    payers = workspaces[workspaces["paid"]]
    return {
        "payers": int(len(payers)),
        "day_0_3": int((payers["paid_day"] < 3).sum()),
        "day_3_14": int(((payers["paid_day"] >= 3) & (payers["paid_day"] < 14)).sum()),
        "day_14_30": int((payers["paid_day"] >= 14).sum()),
    }


def client_sources(events: pd.DataFrame) -> dict:
    before_payment = events["paid_at"].isna() | (events["ts"] < events["paid_at"])
    clients = events[(events["event"] == "client_created") & (events["day"] >= 0) & (events["day"] < WINDOW_DAYS) & before_payment]
    counts = clients["source"].fillna("unspecified").value_counts()
    return {source: int(counts.get(source, 0)) for source in ["import", "manual", "online_booking", "unspecified"]}


def main() -> None:
    workspaces, events, _ = load()
    figures = {
        "trials": int(len(workspaces)),
        "paid_within_30": int(workspaces["paid"].sum()),
        "breadth_day3": breadth(workspaces, events),
        "repeat_use_day3": repeat_use(workspaces, events),
        "continuation_gap": continuation(workspaces, events, QUALIFYING),
        "stalled_experiment": stalled_experiment(workspaces, events),
        "continuation_sensitivity_all_events": continuation(workspaces, events, set(events["event"]) - LEAKAGE),
        "payment_timing": payment_timing(workspaces),
        "client_sources_first14_pre_payment": client_sources(events),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(figures, indent=1) + "\n")
    gap = figures["continuation_gap"]
    print(f"cohort {gap['cohort']}; continued {gap['continued']['paid']}/{gap['continued']['n']}; "
          f"did not {gap['did_not']['paid']}/{gap['did_not']['n']}")
    print(f"wrote {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
