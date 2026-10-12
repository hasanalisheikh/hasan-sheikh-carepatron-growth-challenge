"""Pre-analysis checks on the raw CSVs. Prints counts only, never practice names or emails."""

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
START_GAP_TOLERANCE_MIN = 5
WINDOW_DAYS = 14


def signup_utc(trials: pd.DataFrame) -> pd.Series:
    local = pd.to_datetime(trials["signed_up_at_local"], errors="coerce")
    out = pd.Series(pd.NaT, index=trials.index, dtype="datetime64[ns, UTC]")
    for tz, idx in trials.groupby("timezone").groups.items():
        try:
            out.loc[idx] = local.loc[idx].dt.tz_localize(
                tz, ambiguous="NaT", nonexistent="NaT"
            ).dt.tz_convert("UTC")
        except Exception as exc:  # unknown tz name: leave NaT so it's counted as a failure
            print(f"timezone parse failure: {tz!r} ({exc})")
    return out


def near_dst_change(trials: pd.DataFrame) -> pd.Series:
    """True where the UTC offset differs a day either side of signup, i.e. a DST change
    falls close enough to shift the local-to-UTC conversion."""
    local = pd.to_datetime(trials["signed_up_at_local"], errors="coerce")
    day = pd.Timedelta(days=1)
    out = pd.Series(False, index=trials.index)
    for tz, idx in trials.groupby("timezone").groups.items():
        offsets = [
            (local.loc[idx] + shift).dt.tz_localize(tz, ambiguous="NaT", nonexistent="NaT")
            .map(lambda ts: ts.utcoffset() if pd.notna(ts) else None)
            for shift in (-day, day)
        ]
        out.loc[idx] = (offsets[0] != offsets[1]).values
    return out


def main() -> None:
    trials = pd.read_csv(DATA_DIR / "trials.csv")
    events = pd.read_csv(DATA_DIR / "events.csv")
    events["ts"] = pd.to_datetime(events["timestamp_utc"], utc=True, errors="coerce")
    trials["signup_utc"] = signup_utc(trials)
    trials["paid_utc"] = pd.to_datetime(trials["paid_at_utc"], utc=True, errors="coerce")

    created = events[events["event"] == "workspace_created"].groupby("workspace_id")["ts"].min()
    merged = events.merge(created.rename("trial_start"), on="workspace_id", how="left")
    paid = trials["paid_within_30_days"] == "yes"
    gap_min = (trials.set_index("workspace_id")["signup_utc"] - created).dt.total_seconds() / 60
    paid_day = (trials.set_index("workspace_id")["paid_utc"] - created) / pd.Timedelta(days=1)
    events_per_workspace = events.groupby("workspace_id").size()

    checks = {
        "trials rows": len(trials),
        "unique trial workspace_ids": trials["workspace_id"].nunique(),
        "events rows": len(events),
        "event timestamps unparsed": events["ts"].isna().sum(),
        "event workspaces not in trials": (~events["workspace_id"].isin(trials["workspace_id"])).sum(),
        "trials with no events": (~trials["workspace_id"].isin(events["workspace_id"])).sum(),
        "trials with no workspace_created": (~trials["workspace_id"].isin(created.index)).sum(),
        "exact duplicate events": events.duplicated(["workspace_id", "timestamp_utc", "event", "properties"]).sum(),
        "events before workspace_created": (merged["ts"] < merged["trial_start"]).sum(),
        "signup local->UTC failures": trials["signup_utc"].isna().sum(),
        f"signup_utc vs workspace_created, |gap| > {START_GAP_TOLERANCE_MIN} min": (gap_min.abs() > START_GAP_TOLERANCE_MIN).sum(),
        "signups within a day of a DST change": near_dst_change(trials).sum(),
        "paid=yes": paid.sum(),
        "paid=yes but no paid_at_utc": (paid & trials["paid_utc"].isna()).sum(),
        "paid=no but has paid_at_utc": (~paid & trials["paid_utc"].notna()).sum(),
        "paid_at before signup": (trials["paid_utc"] < trials["signup_utc"]).sum(),
        f"payers paying on day {WINDOW_DAYS} (window edge)": ((paid_day >= WINDOW_DAYS) & (paid_day < WINDOW_DAYS + 1)).sum(),
        "workspaces with a single event": (events_per_workspace == 1).sum(),
    }
    width = max(map(len, checks))
    for name, value in checks.items():
        print(f"{name:<{width}}  {value}")

    print("\nevent counts:")
    print(events["event"].value_counts().to_string())


if __name__ == "__main__":
    main()
