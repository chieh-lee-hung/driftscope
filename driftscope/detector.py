"""MMD detection and quadrant classification."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Sequence

import numpy as np

from .embedding import EmbeddingEngine, cosine_similarity, embed_batch

DEFAULT_DRIFT_THRESHOLD = 0.3
DEFAULT_ALERT_THRESHOLD = 0.4
DEFAULT_QUERY_SIMILARITY_THRESHOLD = 0.85
DEFAULT_PATH_SIMILARITY_THRESHOLD = 0.8
DEFAULT_MIN_SAMPLE_SIZE = 10
DEFAULT_MIN_BASELINE_SIZE = 50


@dataclass(slots=True)
class DriftThresholds:
    drift_threshold: float = DEFAULT_DRIFT_THRESHOLD
    alert_threshold: float = DEFAULT_ALERT_THRESHOLD
    query_similarity_threshold: float = DEFAULT_QUERY_SIMILARITY_THRESHOLD
    path_similarity_threshold: float = DEFAULT_PATH_SIMILARITY_THRESHOLD
    min_sample_size: int = DEFAULT_MIN_SAMPLE_SIZE
    min_baseline_size: int = DEFAULT_MIN_BASELINE_SIZE


class DriftAnalyzer:
    """High-level API for analyzing drift between baseline and current windows."""

    def __init__(
        self,
        embedding_engine: EmbeddingEngine | None = None,
        thresholds: DriftThresholds | None = None,
    ):
        self.embedding_engine = embedding_engine or EmbeddingEngine()
        self.thresholds = thresholds or DriftThresholds()

    def analyze(
        self,
        baseline_trajectories: Sequence[dict[str, Any]],
        current_trajectories: Sequence[dict[str, Any]],
    ) -> dict[str, Any]:
        return analyze(
            baseline_trajectories=baseline_trajectories,
            current_trajectories=current_trajectories,
            embedding_engine=self.embedding_engine,
            thresholds=self.thresholds,
        )


def compute_mmd(
    X: np.ndarray,
    Y: np.ndarray,
    gamma: float | None = None,
    min_samples: int = DEFAULT_MIN_SAMPLE_SIZE,
) -> float:
    """
    Compute normalized Maximum Mean Discrepancy using an RBF kernel.

    Returns a score in the 0..1 range after simple scaling/clipping.
    """
    X = _ensure_2d_array(X)
    Y = _ensure_2d_array(Y)

    if len(X) < min_samples or len(Y) < min_samples:
        raise ValueError(
            "Insufficient samples for reliable drift analysis: "
            f"baseline={len(X)}, current={len(Y)}, required={min_samples}"
        )

    if X.shape[1] != Y.shape[1]:
        raise ValueError(
            "Embedding dimensions must match: "
            f"baseline={X.shape[1]}, current={Y.shape[1]}"
        )

    if gamma is None:
        gamma = _estimate_gamma(X, Y)

    K_xx = _rbf_kernel(X, X, gamma)
    K_yy = _rbf_kernel(Y, Y, gamma)
    K_xy = _rbf_kernel(X, Y, gamma)

    n, m = len(X), len(Y)
    mmd_sq = (
        (K_xx.sum() - np.trace(K_xx)) / (n * (n - 1))
        + (K_yy.sum() - np.trace(K_yy)) / (m * (m - 1))
        - 2.0 * K_xy.mean()
    )

    return float(np.clip(mmd_sq * 10.0, 0.0, 1.0))


def separate_input_vs_behavior_drift(
    baseline: Sequence[dict[str, Any]],
    current: Sequence[dict[str, Any]],
    embedding_engine: EmbeddingEngine | None = None,
    query_similarity_threshold: float = DEFAULT_QUERY_SIMILARITY_THRESHOLD,
    path_similarity_threshold: float = DEFAULT_PATH_SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    """
    Distinguish query mix change from behavior change.

    For each current query:
    1. Find the nearest baseline query.
    2. If the query is similar enough, compare tool path similarity.
    3. Similar query + different path => behavior drift.
    4. No similar query => input drift.
    """
    engine = embedding_engine or EmbeddingEngine()
    total = len(current)
    if total == 0:
        return {
            "behavior_drift_ratio": 0.0,
            "input_drift_ratio": 0.0,
            "same_path_ratio": 0.0,
            "behavior_drift_examples": [],
            "input_drift_examples": [],
            "matched_examples": [],
            "total_analyzed": 0,
        }

    if not baseline:
        return {
            "behavior_drift_ratio": 0.0,
            "input_drift_ratio": 1.0,
            "same_path_ratio": 0.0,
            "behavior_drift_examples": [],
            "input_drift_examples": [
                {
                    "query": str(item.get("query", "")),
                    "best_match_similarity": 0.0,
                    "best_match_query": None,
                }
                for item in current[:5]
            ],
            "matched_examples": [],
            "total_analyzed": total,
        }

    baseline_query_vectors = _embed_queries(baseline, engine)
    current_query_vectors = _embed_queries(current, engine)

    behavior_drift_examples: list[dict[str, Any]] = []
    input_drift_examples: list[dict[str, Any]] = []
    matched_examples: list[dict[str, Any]] = []
    matched_same_path = 0
    path_deltas: list[float] = []

    for index, current_item in enumerate(current):
        similarities = np.array(
            [
                cosine_similarity(current_query_vectors[index], base_vec)
                for base_vec in baseline_query_vectors
            ],
            dtype=np.float32,
        )
        best_idx = int(similarities.argmax())
        best_similarity = float(similarities[best_idx])
        baseline_item = baseline[best_idx]

        if best_similarity < query_similarity_threshold:
            input_drift_examples.append(
                {
                    "query": str(current_item.get("query", "")),
                    "best_match_similarity": best_similarity,
                    "best_match_query": str(baseline_item.get("query", "")),
                }
            )
            continue

        path_analysis = compare_paths(
            baseline_item.get("steps", []),
            current_item.get("steps", []),
        )
        matched_payload = {
            "query": str(current_item.get("query", "")),
            "baseline_query": str(baseline_item.get("query", "")),
            "query_similarity": best_similarity,
            "path_similarity": path_analysis["path_similarity"],
            "baseline_path": path_analysis["baseline_path"],
            "current_path": path_analysis["current_path"],
            "baseline_steps": path_analysis["baseline_steps"],
            "current_steps": path_analysis["current_steps"],
        }
        path_deltas.append(1.0 - path_analysis["path_similarity"])

        if path_analysis["path_similarity"] < path_similarity_threshold:
            behavior_drift_examples.append(matched_payload)
        else:
            matched_same_path += 1
            matched_examples.append(matched_payload)

    return {
        "behavior_drift_ratio": len(behavior_drift_examples) / total,
        "input_drift_ratio": len(input_drift_examples) / total,
        "same_path_ratio": matched_same_path / total,
        "average_path_delta": float(np.mean(path_deltas)) if path_deltas else 0.0,
        "behavior_drift_examples": behavior_drift_examples[:10],
        "input_drift_examples": input_drift_examples[:5],
        "matched_examples": matched_examples[:5],
        "total_analyzed": total,
    }


def classify_drift(
    output_drift: float,
    trajectory_drift: float,
    threshold: float = DEFAULT_DRIFT_THRESHOLD,
) -> str:
    """Classify the current state into one of the four dashboard quadrants."""
    high_output = output_drift > threshold
    high_trajectory = trajectory_drift > threshold

    if not high_output and not high_trajectory:
        return "normal"
    if high_output and high_trajectory:
        return "severe"
    if high_trajectory:
        return "hidden"
    return "input_drift"


def compare_paths(
    baseline_steps: Sequence[dict[str, Any]],
    current_steps: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """
    Compare two tool paths using normalized sequence similarity.

    We compare tool names only for path shape, not tool results, because the
    purpose here is to detect route changes through the agent graph.
    """
    baseline_path = [str(step.get("tool", "unknown_tool")) for step in baseline_steps]
    current_path = [str(step.get("tool", "unknown_tool")) for step in current_steps]
    baseline_joined = " -> ".join(baseline_path)
    current_joined = " -> ".join(current_path)
    similarity = SequenceMatcher(a=baseline_joined, b=current_joined).ratio()

    return {
        "path_similarity": float(similarity),
        "baseline_path": baseline_path,
        "current_path": current_path,
        "baseline_steps": len(baseline_path),
        "current_steps": len(current_path),
    }


def analyze(
    baseline_trajectories: Sequence[dict[str, Any]],
    current_trajectories: Sequence[dict[str, Any]],
    embedding_engine: EmbeddingEngine | None = None,
    thresholds: DriftThresholds | None = None,
) -> dict[str, Any]:
    """Run the full Layer 3 analysis pipeline."""
    thresholds = thresholds or DriftThresholds()
    engine = embedding_engine or EmbeddingEngine()

    baseline_list = list(baseline_trajectories)
    current_list = list(current_trajectories)

    insufficient = _validate_sample_sizes(
        baseline_list=baseline_list,
        current_list=current_list,
        thresholds=thresholds,
    )
    if insufficient is not None:
        return insufficient

    baseline_traj_embs = embed_batch(
        baseline_list, mode="trajectory", engine=engine
    )
    current_traj_embs = embed_batch(
        current_list, mode="trajectory", engine=engine
    )
    baseline_out_embs = embed_batch(
        baseline_list, mode="output", engine=engine
    )
    current_out_embs = embed_batch(
        current_list, mode="output", engine=engine
    )

    trajectory_drift = compute_mmd(
        baseline_traj_embs,
        current_traj_embs,
        min_samples=thresholds.min_sample_size,
    )
    output_drift = compute_mmd(
        baseline_out_embs,
        current_out_embs,
        min_samples=thresholds.min_sample_size,
    )

    separation = separate_input_vs_behavior_drift(
        baseline=baseline_list,
        current=current_list,
        embedding_engine=engine,
        query_similarity_threshold=thresholds.query_similarity_threshold,
        path_similarity_threshold=thresholds.path_similarity_threshold,
    )
    baseline_consistency = compute_response_consistency(
        baseline_list,
        embedding_engine=engine,
        query_similarity_threshold=thresholds.query_similarity_threshold,
    )
    current_consistency = compute_response_consistency(
        current_list,
        embedding_engine=engine,
        query_similarity_threshold=thresholds.query_similarity_threshold,
    )
    tool_usage = compute_tool_usage_drift(
        baseline=baseline_list,
        current=current_list,
    )
    trajectory_drift = max(
        trajectory_drift,
        float(separation.get("average_path_delta", 0.0)),
        float(tool_usage.get("js_divergence", 0.0)),
    )
    drift_type = classify_drift(
        output_drift=output_drift,
        trajectory_drift=trajectory_drift,
        threshold=thresholds.drift_threshold,
    )
    overall_score = max(output_drift, trajectory_drift)

    return {
        "status": "ok",
        "overall_drift_score": overall_score,
        "output_drift": output_drift,
        "trajectory_drift": trajectory_drift,
        "drift_type": drift_type,
        "behavior_drift_ratio": separation["behavior_drift_ratio"],
        "input_drift_ratio": separation["input_drift_ratio"],
        "same_path_ratio": separation["same_path_ratio"],
        "average_path_delta": separation["average_path_delta"],
        "behavior_drift_examples": separation["behavior_drift_examples"],
        "input_drift_examples": separation["input_drift_examples"],
        "matched_examples": separation["matched_examples"],
        "baseline_count": len(baseline_list),
        "current_count": len(current_list),
        "baseline_start": _window_start(baseline_list),
        "baseline_end": _window_end(baseline_list),
        "current_start": _window_start(current_list),
        "current_end": _window_end(current_list),
        "baseline_response_consistency": baseline_consistency["score"],
        "current_response_consistency": current_consistency["score"],
        "response_consistency_delta": (
            current_consistency["score"] - baseline_consistency["score"]
        ),
        "response_consistency_details": {
            "baseline": baseline_consistency,
            "current": current_consistency,
        },
        "tool_frequency_drift": tool_usage["js_divergence"],
        "tool_frequency_changes": tool_usage["top_changes"],
        "tool_frequency_distribution": {
            "baseline": tool_usage["baseline_distribution"],
            "current": tool_usage["current_distribution"],
        },
        "should_alert": (
            drift_type in {"hidden", "severe"}
            and trajectory_drift > thresholds.drift_threshold
        ),
        "thresholds": {
            "drift_threshold": thresholds.drift_threshold,
            "alert_threshold": thresholds.alert_threshold,
            "query_similarity_threshold": thresholds.query_similarity_threshold,
            "path_similarity_threshold": thresholds.path_similarity_threshold,
            "min_sample_size": thresholds.min_sample_size,
            "min_baseline_size": thresholds.min_baseline_size,
        },
    }


def serialize_analysis(analysis: dict[str, Any]) -> str:
    """Serialize an analysis result for persistence or fixtures."""
    return json.dumps(analysis, ensure_ascii=False, indent=2)


def compute_response_consistency(
    trajectories: Sequence[dict[str, Any]],
    embedding_engine: EmbeddingEngine | None = None,
    query_similarity_threshold: float = DEFAULT_QUERY_SIMILARITY_THRESHOLD,
) -> dict[str, Any]:
    """
    Estimate how consistently the system answers semantically similar queries.

    Score combines two pieces:
    - mean output similarity for matched query pairs
    - stability of those similarities (low std deviation is better)
    """
    engine = embedding_engine or EmbeddingEngine()
    records = list(trajectories)
    if len(records) < 2:
        return {
            "score": 1.0,
            "pair_count": 0,
            "mean_similarity": 1.0,
            "similarity_std": 0.0,
        }

    query_vectors = _embed_queries(records, engine)
    output_vectors = embed_batch(records, mode="output", engine=engine)
    similarities: list[float] = []

    for left in range(len(records)):
        for right in range(left + 1, len(records)):
            query_similarity = cosine_similarity(
                query_vectors[left], query_vectors[right]
            )
            if query_similarity < query_similarity_threshold:
                continue
            output_similarity = cosine_similarity(
                output_vectors[left], output_vectors[right]
            )
            similarities.append(output_similarity)

    if not similarities:
        return {
            "score": 1.0,
            "pair_count": 0,
            "mean_similarity": 1.0,
            "similarity_std": 0.0,
        }

    mean_similarity = float(np.mean(similarities))
    similarity_std = float(np.std(similarities))
    score = float(np.clip(mean_similarity * (1.0 - similarity_std), 0.0, 1.0))
    return {
        "score": score,
        "pair_count": len(similarities),
        "mean_similarity": mean_similarity,
        "similarity_std": similarity_std,
    }


def compute_tool_usage_drift(
    baseline: Sequence[dict[str, Any]],
    current: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Compare tool usage distributions with Jensen-Shannon divergence."""
    baseline_counter = _tool_counter(baseline)
    current_counter = _tool_counter(current)
    baseline_distribution = _normalize_counter(baseline_counter)
    current_distribution = _normalize_counter(current_counter)
    tool_names = sorted(set(baseline_distribution) | set(current_distribution))

    if not tool_names:
        return {
            "js_divergence": 0.0,
            "top_changes": [],
            "baseline_distribution": {},
            "current_distribution": {},
        }

    p = np.array([baseline_distribution.get(name, 0.0) for name in tool_names])
    q = np.array([current_distribution.get(name, 0.0) for name in tool_names])
    js_divergence = _jensen_shannon_divergence(p, q)

    top_changes = []
    for name in tool_names:
        baseline_share = baseline_distribution.get(name, 0.0)
        current_share = current_distribution.get(name, 0.0)
        top_changes.append(
            {
                "tool": name,
                "baseline_share": baseline_share,
                "current_share": current_share,
                "share_delta": current_share - baseline_share,
                "baseline_count": int(baseline_counter.get(name, 0)),
                "current_count": int(current_counter.get(name, 0)),
            }
        )
    top_changes.sort(key=lambda item: abs(item["share_delta"]), reverse=True)

    return {
        "js_divergence": js_divergence,
        "top_changes": top_changes[:8],
        "baseline_distribution": baseline_distribution,
        "current_distribution": current_distribution,
    }


def _validate_sample_sizes(
    baseline_list: Sequence[dict[str, Any]],
    current_list: Sequence[dict[str, Any]],
    thresholds: DriftThresholds,
) -> dict[str, Any] | None:
    if len(current_list) < thresholds.min_sample_size:
        return {
            "status": "insufficient_data",
            "message": (
                f"Current data is insufficient ({len(current_list)} < "
                f"{thresholds.min_sample_size}). Collect more recent trajectories."
            ),
            "baseline_count": len(baseline_list),
            "current_count": len(current_list),
        }

    if len(baseline_list) < thresholds.min_baseline_size:
        return {
            "status": "insufficient_data",
            "message": (
                f"Baseline data is insufficient ({len(baseline_list)} < "
                f"{thresholds.min_baseline_size}). Collect more baseline trajectories."
            ),
            "baseline_count": len(baseline_list),
            "current_count": len(current_list),
        }

    return None


def _ensure_2d_array(data: np.ndarray) -> np.ndarray:
    array = np.asarray(data, dtype=np.float32)
    if array.ndim != 2:
        raise ValueError(f"Expected a 2D array, got shape {array.shape}")
    return array


def _estimate_gamma(X: np.ndarray, Y: np.ndarray) -> float:
    all_data = np.vstack([X, Y])
    squared_distances = _pairwise_squared_distances(all_data, all_data)
    non_zero = squared_distances[squared_distances > 0]
    if non_zero.size == 0:
        return 1.0
    median_distance = float(np.median(non_zero))
    if median_distance <= 0:
        return 1.0
    return 1.0 / median_distance


def _rbf_kernel(X: np.ndarray, Y: np.ndarray, gamma: float) -> np.ndarray:
    squared_distances = _pairwise_squared_distances(X, Y)
    return np.exp(-gamma * squared_distances).astype(np.float32)


def _pairwise_squared_distances(X: np.ndarray, Y: np.ndarray) -> np.ndarray:
    x_norm = np.sum(X * X, axis=1)[:, None]
    y_norm = np.sum(Y * Y, axis=1)[None, :]
    distances = x_norm + y_norm - 2.0 * (X @ Y.T)
    return np.maximum(distances, 0.0)


def _embed_queries(
    trajectories: Sequence[dict[str, Any]],
    engine: EmbeddingEngine,
) -> np.ndarray:
    vectors = [
        engine.embed_text(str(item.get("query", "")))
        for item in trajectories
    ]
    return np.vstack(vectors)


def _tool_counter(trajectories: Sequence[dict[str, Any]]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for item in trajectories:
        for step in item.get("steps", []):
            counter[str(step.get("tool", "unknown_tool"))] += 1
    return counter


def _normalize_counter(counter: Counter[str]) -> dict[str, float]:
    total = sum(counter.values())
    if total == 0:
        return {}
    return {
        key: float(value) / float(total)
        for key, value in counter.items()
    }


def _jensen_shannon_divergence(p: np.ndarray, q: np.ndarray) -> float:
    p = p.astype(np.float64)
    q = q.astype(np.float64)
    p_sum = p.sum()
    q_sum = q.sum()
    if p_sum == 0 and q_sum == 0:
        return 0.0
    if p_sum > 0:
        p = p / p_sum
    if q_sum > 0:
        q = q / q_sum
    midpoint = 0.5 * (p + q)
    return float(
        0.5 * _kl_divergence(p, midpoint) + 0.5 * _kl_divergence(q, midpoint)
    )


def _kl_divergence(p: np.ndarray, q: np.ndarray) -> float:
    mask = (p > 0) & (q > 0)
    if not np.any(mask):
        return 0.0
    return float(np.sum(p[mask] * np.log2(p[mask] / q[mask])))


def _window_start(trajectories: Sequence[dict[str, Any]]) -> float | None:
    timestamps = [
        float(item["timestamp"])
        for item in trajectories
        if item.get("timestamp") is not None
    ]
    return min(timestamps) if timestamps else None


def _window_end(trajectories: Sequence[dict[str, Any]]) -> float | None:
    timestamps = [
        float(item["timestamp"])
        for item in trajectories
        if item.get("timestamp") is not None
    ]
    return max(timestamps) if timestamps else None
