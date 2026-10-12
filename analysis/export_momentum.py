"""Builds site/data/momentum_examples.json: three anonymised example practices for the
Momentum prototype, with Day 3 / 7 / 14 snapshots computed from the challenge CSVs.

Definitions:
- Trial anchor = the workspace's first workspace_created event (UTC).
- Day N snapshot = events in [anchor, anchor + N x 24 hours). Half-open, elapsed time,
  never calendar days.
- Exact duplicate event rows are removed.
- Product events exclude workspace_created and the subscription/billing events
  (subscription_started, billing_page_viewed).
- Counts are event counts, not unique clients, appointments or completed sessions.
- client_created is split by its source property (import, manual, online_booking, or
  unspecified when the property is missing): imported records are existing clients.
- Active days = distinct trial days with a qualifying action. Whether a practice kept going
  is decided on the page from the tracked totals, not exported here.

Example selection (deterministic, documented in README): only workspaces that stayed unpaid
for the whole 14-day window, so no post-subscription activity is shown as a trial
achievement. Patterns use distinct product event types:
  quiet       <= 1 type by Day 3 and <= 2 by Day 14, with at least one event by Day 14
  rhythm      <= 2 types by Day 3 and >= 2 new types between Day 3 and Day 14
  established >= 5 types by Day 3 and >= 6 by Day 14, with at least one imported client
              record by Day 14 (34 of the 64 candidates import, and imports are two thirds of
              all client records, so the flagship example shows the most common source)
Within each pattern, pick the workspace whose Day 14 event total is closest to the pattern's
median; ties go to the lowest workspace_id. Each pattern prefers a profession no earlier
example already shows (A, then B, then C), so the three are not all the same profession.

Run: .venv/bin/python analysis/export_momentum.py
"""

import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from continuation_gap import QUALIFYING
from sanity_checks import signup_utc

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT = ROOT / "site" / "data" / "momentum_examples.json"
CHECKPOINTS = (3, 7, 14)
TRIAL_DAYS = 14
HOURS_PER_DAY = 24
NON_PRODUCT = {"workspace_created", "subscription_started", "billing_page_viewed"}
# Shown as activity metrics and milestones, in display order.
METRICS = ["client_created", "appointment_created", "note_created", "ai_scribe_used",
           "invoice_sent", "client_booked_online"]
REQUIRED = {
    "trials": ["workspace_id", "signed_up_at_local", "timezone", "profession", "team_size_at_signup",
               "paid_within_30_days", "paid_at_utc"],
    "events": ["workspace_id", "timestamp_utc", "event", "properties"],
}
CLIENT_SOURCES = ["import", "manual", "online_booking", "unspecified"]
PATTERNS = [
    ("A", "quiet", "Quiet start"),
    ("B", "rhythm", "Finding their rhythm"),
    ("C", "established", "Established momentum"),
]


def load() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    trials = pd.read_csv(DATA_DIR / "trials.csv")
    raw = pd.read_csv(DATA_DIR / "events.csv")
    for name, frame in (("trials", trials), ("events", raw)):
        missing = set(REQUIRED[name]) - set(frame.columns)
        if missing:
            raise SystemExit(f"{name}.csv is missing columns: {sorted(missing)}")
    events = raw.drop_duplicates(["workspace_id", "timestamp_utc", "event", "properties"]).copy()
    events["ts"] = pd.to_datetime(events["timestamp_utc"], utc=True, errors="coerce")
    events["source"] = events["properties"].str.extract(r"(?:^|;)source=([^;]*)")[0].fillna("unspecified")
    ws = trials.set_index("workspace_id")
    ws["anchor"] = events[events["event"] == "workspace_created"].groupby("workspace_id")["ts"].min()
    ws["signup_utc"] = signup_utc(trials).set_axis(trials["workspace_id"])
    ws["paid_at"] = pd.to_datetime(ws["paid_at_utc"], utc=True)
    events = events.join(ws[["anchor", "paid_at"]], on="workspace_id")
    events["hours"] = (events["ts"] - events["anchor"]) / pd.Timedelta(hours=1)
    report = {
        "trial rows": len(trials),
        "unique workspace_ids": trials["workspace_id"].nunique(),
        "event rows (raw)": len(raw),
        "exact duplicates removed": len(raw) - len(events),
        "unparsed event timestamps": int(events["ts"].isna().sum()),
        "events with unknown workspace_id": int((~events["workspace_id"].isin(ws.index)).sum()),
        "workspaces without workspace_created": int(ws["anchor"].isna().sum()),
        "timezone conversion failures": int(ws["signup_utc"].isna().sum()),
        "events before workspace_created (flagged)": int((events["hours"] < 0).sum()),
        "product events": int((~events["event"].isin(NON_PRODUCT)).sum()),
        "subscription/billing events": int(events["event"].isin(NON_PRODUCT - {"workspace_created"}).sum()),
    }
    return ws, events, report


def window(events: pd.DataFrame, days: int) -> pd.DataFrame:
    hours = days * HOURS_PER_DAY
    product = events[~events["event"].isin(NON_PRODUCT)]
    return product[(product["hours"] >= 0) & (product["hours"] < hours)]


def select_examples(ws: pd.DataFrame, events: pd.DataFrame) -> tuple[dict, dict]:
    unpaid_through_trial = ws.index[ws["paid_at"].isna() | (ws["paid_at"] >= ws["anchor"] + pd.Timedelta(days=TRIAL_DAYS))]
    d3 = window(events, 3).groupby("workspace_id")["event"].nunique().reindex(unpaid_through_trial, fill_value=0)
    d14 = window(events, 14).groupby("workspace_id")["event"].nunique().reindex(unpaid_through_trial, fill_value=0)
    total14 = window(events, 14).groupby("workspace_id").size().reindex(unpaid_through_trial, fill_value=0)
    first14 = window(events, 14)
    imported = total14.index.isin(first14.loc[(first14["event"] == "client_created") & (first14["source"] == "import"), "workspace_id"])
    rules = {
        "quiet": (d3 <= 1) & (d14 <= 2) & (total14 >= 1),
        "rhythm": (d3 <= 2) & (d14 - d3 >= 2),
        "established": (d3 >= 5) & (d14 >= 6) & imported,
    }
    chosen, sizes = {}, {}
    used_professions = set()
    for key, mask in rules.items():
        pool = total14[mask]
        sizes[key] = len(pool)
        if pool.empty:
            raise SystemExit(f"no workspace matches the {key} pattern")
        # Prefer a profession no earlier example already shows, so the three read as different practices.
        other = pool[~ws.loc[pool.index, "profession"].isin(used_professions)]
        pool = other if not other.empty else pool
        distance = (pool - pool.median()).abs()
        chosen[key] = sorted(distance[distance == distance.min()].index)[0]
        used_professions.add(ws.loc[chosen[key], "profession"])
    return chosen, {"eligible (unpaid through Day 14)": len(unpaid_through_trial), **{f"{k} candidates": v for k, v in sizes.items()}}


def practice_payload(code: str, pattern: str, label: str, wid: str, ws: pd.DataFrame, events: pd.DataFrame) -> dict:
    row = ws.loc[wid]
    tz = ZoneInfo(row["timezone"])
    own = window(events, TRIAL_DAYS)
    own = own[own["workspace_id"] == wid]
    qualifying = own[own["event"].isin(QUALIFYING)]
    snapshots = {}
    for day in CHECKPOINTS:
        w = own[own["hours"] < day * HOURS_PER_DAY]
        q = qualifying[qualifying["hours"] < day * HOURS_PER_DAY]
        clients = w[w["event"] == "client_created"]
        snapshots[str(day)] = {
            "counts": {m: int((w["event"] == m).sum()) for m in METRICS},
            "client_sources": {s: int((clients["source"] == s).sum()) for s in CLIENT_SOURCES},
            "active_days": int((q["hours"] // HOURS_PER_DAY).nunique()),
            "workflow_types": int(w["event"].nunique()),
            "workflow_list": sorted(w["event"].unique().tolist()),
            "total_events": len(w),
        }
    def first_of(rows: pd.DataFrame) -> dict | None:
        if rows.empty:
            return None
        first = rows.sort_values("ts").iloc[0]
        return {
            "trial_day": int(first["hours"] // HOURS_PER_DAY) + 1,  # "Day 1" = first 24 elapsed hours
            "local_date": first["ts"].tz_convert(tz).strftime("%a %-d %b"),
        }

    milestones = {m: first_of(own[own["event"] == m]) for m in METRICS}
    milestones = {m: v for m, v in milestones.items() if v}
    clients = own[own["event"] == "client_created"]
    client_milestones = {s: first_of(clients[clients["source"] == s]) for s in CLIENT_SOURCES}
    client_milestones = {s: v for s, v in client_milestones.items() if v}
    daily = {m: [0] * TRIAL_DAYS for m in METRICS}
    for _, ev in own[own["event"].isin(METRICS)].iterrows():
        daily[ev["event"]][int(ev["hours"] // HOURS_PER_DAY)] += 1
    return {
        "id": code,
        "label": f"Example Practice {code}",
        "pattern": label,
        "pattern_key": pattern,
        "profession": row["profession"],
        "team_size": str(row["team_size_at_signup"]),
        "trial_start_local": row["anchor"].tz_convert(tz).strftime("%a %-d %b %Y"),
        "snapshots": snapshots,
        "milestones": milestones,
        "client_milestones": client_milestones,
        "daily": daily,
    }


def verify(payload: dict, chosen: dict, events: pd.DataFrame) -> list[str]:
    """Independent re-count straight from the deduplicated events, plus contract checks."""
    problems = []
    forbidden = {"owner_email", "practice_name", "workspace_id", "email"}
    text = json.dumps(payload)
    for key in forbidden:
        if f'"{key}"' in text:
            problems.append(f"forbidden key exported: {key}")
    for practice, (_, wid) in zip(payload["practices"], chosen.items()):
        if wid in text:
            problems.append("raw workspace id leaked")
        mine = events[(events["workspace_id"] == wid) & ~events["event"].isin(NON_PRODUCT)]
        prev = None
        for day in CHECKPOINTS:
            snap = practice["snapshots"][str(day)]["counts"]
            for m in METRICS:
                expected = int(((mine["event"] == m) & (mine["ts"] >= mine["anchor"]) & (mine["ts"] < mine["anchor"] + pd.Timedelta(hours=day * HOURS_PER_DAY))).sum())
                if snap[m] != expected:
                    problems.append(f"{practice['id']} day {day} {m}: {snap[m]} != {expected}")
                if prev and snap[m] < prev[m]:
                    problems.append(f"{practice['id']} {m} decreases at day {day}")
            prev = snap
        for m in METRICS:
            if sum(practice["daily"][m]) != practice["snapshots"]["14"]["counts"][m]:
                problems.append(f"{practice['id']} daily {m} doesn't sum to the Day 14 count")
            if (m in practice["milestones"]) != (practice["snapshots"]["14"]["counts"][m] > 0):
                problems.append(f"{practice['id']} milestone {m} inconsistent with counts")
        for source in CLIENT_SOURCES:
            if (source in practice["client_milestones"]) != (practice["snapshots"]["14"]["client_sources"][source] > 0):
                problems.append(f"{practice['id']} client milestone {source} inconsistent with sources")
        for day in CHECKPOINTS:
            snap = practice["snapshots"][str(day)]
            if sum(snap["client_sources"].values()) != snap["counts"]["client_created"]:
                problems.append(f"{practice['id']} day {day} client sources don't sum to client_created")
            if snap["active_days"] > day:
                problems.append(f"{practice['id']} day {day} has more active days than elapsed days")
    return problems


def main() -> None:
    ws, events, report = load()
    chosen, selection = select_examples(ws, events)
    payload = {
        "definitions": {
            "checkpoints": "Cumulative product events in [workspace created, + N x 24 hours), UTC.",
            "counts": "Event counts, not unique clients, appointments or completed sessions.",
            "source": "Fictional Carepatron internship dataset; three anonymised example workspaces.",
        },
        "metrics": METRICS,
        "practices": [practice_payload(code, key, label, chosen[key], ws, events) for code, key, label in PATTERNS],
    }
    problems = verify(payload, {key: chosen[key] for _, key, _ in PATTERNS}, events)
    print("VALIDATION")
    for k, v in report.items():
        print(f"  {k:44} {v}")
    print("SELECTION")
    for k, v in selection.items():
        print(f"  {k:44} {v}")
    for p in payload["practices"]:
        s3, s7, s14 = (p["snapshots"][d] for d in ("3", "7", "14"))
        print(f"  {p['label']} ({p['pattern']}): workflow types {s3['workflow_types']} -> {s7['workflow_types']} -> {s14['workflow_types']}, "
              f"events {s3['total_events']} -> {s7['total_events']} -> {s14['total_events']}, "
              f"client sources at Day 14 {s14['client_sources']}")
    print("VERIFICATION", "passed" if not problems else "FAILED")
    for p in problems:
        print("  ", p)
    if problems:
        raise SystemExit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
