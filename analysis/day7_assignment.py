"""Applies the Day 7 experiment's eligibility and randomisation rules to the fictional data.

Eligible (stalled): a trial workspace that is still unpaid at Day 7, recorded at least one
qualifying action before Day 3 and none from Day 3 to Day 7. Qualifying actions are the six
recorded workflow events. Eligible workspaces are assigned 1:1 at workspace level with a fixed
seed, so the split is reproducible and does not depend on anything a practitioner does.

The data has no unsubscribe or complaint fields, so suppression for those cannot be applied
here; subscribed workspaces are excluded because they have paid before Day 7. Prints
aggregates only.

Run: .venv/bin/python analysis/day7_assignment.py
"""

import numpy as np
import pandas as pd

from analysis_reproduce import load
from continuation_gap import QUALIFYING

DAY_BEFORE = 3
DAY_DECISION = 7
OUTCOME_END_DAY = 14
SEED = 7


def eligible_stalled(workspaces: pd.DataFrame, events: pd.DataFrame) -> pd.Index:
    unpaid = workspaces.index[~(workspaces["paid"] & (workspaces["paid_day"] < DAY_DECISION))]
    actions = events[events["event"].isin(QUALIFYING)]
    early = set(actions.loc[(actions["day"] >= 0) & (actions["day"] < DAY_BEFORE), "workspace_id"])
    middle = set(actions.loc[(actions["day"] >= DAY_BEFORE) & (actions["day"] < DAY_DECISION), "workspace_id"])
    return unpaid[unpaid.isin(early) & ~unpaid.isin(middle)]


def assign_arms(eligible: pd.Index, seed: int = SEED) -> pd.Series:
    """1:1 workspace-level assignment: a seeded shuffle of the sorted ids, first half treated."""
    ids = np.array(sorted(eligible))
    order = np.random.default_rng(seed).permutation(len(ids))
    arms = pd.Series("control", index=ids)
    arms.iloc[order[: len(ids) // 2]] = "treatment"
    return arms


def main() -> None:
    workspaces, events, _ = load()
    eligible = eligible_stalled(workspaces, events)
    arms = assign_arms(eligible)
    returned = set(events.loc[events["event"].isin(QUALIFYING) & (events["day"] >= DAY_DECISION)
                              & (events["day"] < OUTCOME_END_DAY), "workspace_id"])
    print(f"eligible stalled workspaces: {len(eligible)} of {len(workspaces)} trials")
    for arm in ["control", "treatment"]:
        members = arms.index[arms == arm]
        solo = (workspaces.loc[members, "team_size_at_signup"].astype(str) == "1").mean()
        us = (workspaces.loc[members, "country"] == "US").mean()
        back = pd.Index(members).isin(returned).mean()
        print(f"  {arm:<10} n={len(members):>3}  solo {solo:.0%}  US {us:.0%}  "
              f"returned to activity Day {DAY_DECISION} to {OUTCOME_END_DAY}: {back:.1%} (no message sent in this data)")


if __name__ == "__main__":
    main()
