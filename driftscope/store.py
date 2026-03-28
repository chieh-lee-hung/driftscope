"""SQLite storage logic for DriftScope."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any


class TrajectoryStore:
    """Persist captured trajectories and analysis artifacts in SQLite."""

    def __init__(self, project: str, db_path: str | Path | None = None):
        self.project = project
        self.db_path = self._resolve_db_path(project, db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.conn = self._connect()
        self._init_schema()

    def _resolve_db_path(
        self, project: str, db_path: str | Path | None
    ) -> Path:
        if db_path is not None:
            return Path(db_path).expanduser()
        return Path(f"~/.driftscope/{project}.db").expanduser()

    def _init_schema(self) -> None:
        with self._lock:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS trajectories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    query TEXT,
                    steps TEXT NOT NULL,
                    output TEXT,
                    duration REAL,
                    timestamp REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS embeddings (
                    trajectory_id INTEGER PRIMARY KEY,
                    trajectory_emb BLOB,
                    output_emb BLOB,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (trajectory_id) REFERENCES trajectories(id)
                );

                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project TEXT NOT NULL,
                    baseline_start REAL,
                    baseline_end REAL,
                    current_start REAL,
                    current_end REAL,
                    output_drift REAL,
                    trajectory_drift REAL,
                    drift_type TEXT,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_trajectories_project_time
                ON trajectories(project, timestamp);
                """
            )
            self.conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def reset(self) -> None:
        with self._lock:
            self.conn.close()
            if self.db_path.exists():
                self.db_path.unlink()
            self.conn = self._connect()
        self._init_schema()

    def reconnect(self) -> None:
        with self._lock:
            self.conn.close()
            self.conn = self._connect()

    def save(self, record: dict[str, Any]) -> int:
        payload = (
            record["project"],
            record.get("query", ""),
            json.dumps(record.get("steps", []), ensure_ascii=False),
            record.get("output", ""),
            float(record.get("duration", 0.0)),
            float(record.get("timestamp", 0.0)),
        )
        with self._lock:
            cursor = self.conn.execute(
                """
                INSERT INTO trajectories
                (project, query, steps, output, duration, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
            self.conn.commit()
            return int(cursor.lastrowid)

    def get_trajectories(
        self, start_time: float, end_time: float, project: str | None = None
    ) -> list[dict[str, Any]]:
        effective_project = project or self.project
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT id, project, query, steps, output, duration, timestamp
                FROM trajectories
                WHERE project = ? AND timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
                """,
                (effective_project, float(start_time), float(end_time)),
            ).fetchall()
        return [self._row_to_trajectory(row) for row in rows]

    def list_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT id, project, query, steps, output, duration, timestamp
                FROM trajectories
                WHERE project = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (self.project, int(limit)),
            ).fetchall()
        return [self._row_to_trajectory(row) for row in rows]

    def save_analysis(self, analysis: dict[str, Any]) -> int:
        details = dict(analysis)
        details.pop("status", None)
        details.pop("output_drift", None)
        details.pop("trajectory_drift", None)
        details.pop("drift_type", None)
        details.pop("baseline_start", None)
        details.pop("baseline_end", None)
        details.pop("current_start", None)
        details.pop("current_end", None)

        payload = (
            self.project,
            analysis.get("baseline_start"),
            analysis.get("baseline_end"),
            analysis.get("current_start"),
            analysis.get("current_end"),
            analysis.get("output_drift"),
            analysis.get("trajectory_drift"),
            analysis.get("drift_type"),
            json.dumps(details, ensure_ascii=False),
        )
        with self._lock:
            cursor = self.conn.execute(
                """
                INSERT INTO analyses
                (
                    project,
                    baseline_start,
                    baseline_end,
                    current_start,
                    current_end,
                    output_drift,
                    trajectory_drift,
                    drift_type,
                    details
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                payload,
            )
            self.conn.commit()
            return int(cursor.lastrowid)

    def list_analyses(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
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
                WHERE project = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (self.project, int(limit)),
            ).fetchall()
        return [self._row_to_analysis(row) for row in rows]

    def _row_to_trajectory(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "project": row["project"],
            "query": row["query"],
            "steps": json.loads(row["steps"]),
            "output": row["output"],
            "duration": row["duration"],
            "timestamp": row["timestamp"],
        }

    def _row_to_analysis(self, row: sqlite3.Row) -> dict[str, Any]:
        details = json.loads(row["details"]) if row["details"] else {}
        details.update(
            {
                "id": row["id"],
                "project": row["project"],
                "baseline_start": row["baseline_start"],
                "baseline_end": row["baseline_end"],
                "current_start": row["current_start"],
                "current_end": row["current_end"],
                "output_drift": row["output_drift"],
                "trajectory_drift": row["trajectory_drift"],
                "drift_type": row["drift_type"],
                "created_at": row["created_at"],
            }
        )
        return details

    def close(self) -> None:
        with self._lock:
            self.conn.close()
