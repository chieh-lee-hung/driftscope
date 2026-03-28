"""Load DriftScope dashboard data from SQLite for the Next.js frontend."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def main() -> None:
    args = parse_args()
    if args.command == "analysis":
        payload = load_latest_analysis(
            db_path=args.db,
            project=args.project,
            start=args.start,
            end=args.end,
        )
    else:
        payload = load_trajectories(
            baseline_db=args.baseline_db,
            current_db=args.current_db,
            project=args.project,
            start=args.start,
            end=args.end,
            limit=args.limit,
        )
    print(json.dumps(payload, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    analysis_parser = subparsers.add_parser("analysis")
    analysis_parser.add_argument("db", type=Path)
    analysis_parser.add_argument("--project", type=str, default=None)
    analysis_parser.add_argument("--start", type=float, default=None)
    analysis_parser.add_argument("--end", type=float, default=None)

    trajectories_parser = subparsers.add_parser("trajectories")
    trajectories_parser.add_argument("baseline_db", type=Path)
    trajectories_parser.add_argument("current_db", type=Path)
    trajectories_parser.add_argument("--project", type=str, default=None)
    trajectories_parser.add_argument("--start", type=float, default=None)
    trajectories_parser.add_argument("--end", type=float, default=None)
    trajectories_parser.add_argument("--limit", type=int, default=100)
    return parser.parse_args()


def load_latest_analysis(
    db_path: Path,
    project: str | None = None,
    start: float | None = None,
    end: float | None = None,
) -> dict[str, Any]:
    db_path = db_path.expanduser().resolve()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        query = """
            SELECT
                id,
                project,
                baseline_start,
                baseline_end,
                current_start,
                current_end,
                output_drift,
                trajectory_drift,
                drift_type,
                details,
                created_at
            FROM analyses
        """
        clauses = []
        params: list[Any] = []
        if project:
            clauses.append("project = ?")
            params.append(project)
        if start is not None:
            clauses.append("current_end >= ?")
            params.append(start)
        if end is not None:
            clauses.append("current_start <= ?")
            params.append(end)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY id DESC LIMIT 1"
        row = conn.execute(query, params).fetchone()
    finally:
        conn.close()

    if row is None:
        raise SystemExit("No analysis rows found in SQLite database.")

    details = json.loads(row["details"]) if row["details"] else {}
    details.update(
        {
            "project": row["project"],
            "baseline_start": row["baseline_start"],
            "baseline_end": row["baseline_end"],
            "current_start": row["current_start"],
            "current_end": row["current_end"],
            "output_drift": row["output_drift"],
            "trajectory_drift": row["trajectory_drift"],
            "drift_type": row["drift_type"],
        }
    )
    if "generated_at" not in details and row["created_at"]:
        details["generated_at"] = _sqlite_time_to_epoch(row["created_at"])

    return {
        "analysis": details,
        "source": {
            "kind": "sqlite",
            "path": str(db_path),
            "updated_at": row["created_at"],
        },
    }


def load_trajectories(
    baseline_db: Path,
    current_db: Path,
    project: str | None = None,
    start: float | None = None,
    end: float | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    baseline_db = baseline_db.expanduser().resolve()
    current_db = current_db.expanduser().resolve()
    baseline = _load_trajectory_rows(baseline_db, project, start, end, limit)
    current = _load_trajectory_rows(current_db, project, start, end, limit)
    return {
        "baseline": baseline,
        "current": current,
        "source": {
            "kind": "sqlite",
            "baseline_path": str(baseline_db),
            "current_path": str(current_db),
        },
    }


def _load_trajectory_rows(
    db_path: Path,
    project: str | None,
    start: float | None,
    end: float | None,
    limit: int,
) -> list[dict[str, Any]]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        query = """
            SELECT id, project, query, steps, output, duration, timestamp
            FROM trajectories
        """
        clauses = []
        params: list[Any] = []
        if project:
            clauses.append("project = ?")
            params.append(project)
        if start is not None:
            clauses.append("timestamp >= ?")
            params.append(start)
        if end is not None:
            clauses.append("timestamp <= ?")
            params.append(end)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    items = []
    for row in rows:
        items.append(
            {
                "id": row["id"],
                "project": row["project"],
                "query": row["query"],
                "steps": json.loads(row["steps"]),
                "output": row["output"],
                "duration": row["duration"],
                "timestamp": row["timestamp"],
            }
        )
    return list(reversed(items))


def _sqlite_time_to_epoch(value: str) -> float:
    parsed = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    return parsed.replace(tzinfo=timezone.utc).timestamp()


if __name__ == "__main__":
    main()
