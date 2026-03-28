"""OpenAI embedding conversion helpers."""

from __future__ import annotations

import hashlib
import os
from typing import Any, Iterable, Sequence

try:
    import numpy as np
except ImportError as exc:  # pragma: no cover - exercised by import time only
    raise RuntimeError(
        "driftscope.embedding requires numpy. Install requirements first."
    ) from exc

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]

DEFAULT_EMBED_MODEL = "text-embedding-3-small"
FALLBACK_DIMENSION = 256
KEY_ARG_CANDIDATES = (
    "query",
    "topic",
    "action",
    "type",
    "category",
    "keyword",
    "search",
    "input",
)


class EmbeddingEngine:
    """Convert trajectories and outputs into vectors."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_EMBED_MODEL,
        use_fallback: bool | None = None,
        fallback_dimension: int = FALLBACK_DIMENSION,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model
        self.fallback_dimension = fallback_dimension
        self._client = None

        if use_fallback is None:
            use_fallback = OpenAI is None or not self.api_key
        self.use_fallback = use_fallback

        if not self.use_fallback and OpenAI is not None:
            self._client = OpenAI(api_key=self.api_key)

    def embed_trajectory(self, trajectory: dict[str, Any]) -> np.ndarray:
        text = trajectory_to_text(trajectory)
        return self.embed_text(text)

    def embed_output(self, trajectory: dict[str, Any]) -> np.ndarray:
        return self.embed_text(str(trajectory.get("output", "")))

    def embed_text(self, text: str) -> np.ndarray:
        if self.use_fallback:
            return _fallback_embed_text(text, dimension=self.fallback_dimension)

        if self._client is None:
            raise RuntimeError("OpenAI client is not available.")

        response = self._client.embeddings.create(model=self.model, input=text)
        return np.array(response.data[0].embedding, dtype=np.float32)

    def embed_batch(
        self,
        trajectories: Sequence[dict[str, Any]],
        mode: str,
        batch_size: int = 100,
    ) -> np.ndarray:
        if mode not in {"trajectory", "output"}:
            raise ValueError("mode must be 'trajectory' or 'output'")

        texts = _collect_texts(trajectories, mode=mode)
        if not texts:
            width = self.fallback_dimension if self.use_fallback else 0
            return np.zeros((0, width), dtype=np.float32)

        if self.use_fallback:
            embeddings = [
                _fallback_embed_text(text, dimension=self.fallback_dimension)
                for text in texts
            ]
            return np.vstack(embeddings)

        if self._client is None:
            raise RuntimeError("OpenAI client is not available.")

        all_embeddings: list[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            response = self._client.embeddings.create(model=self.model, input=batch)
            for item in response.data:
                all_embeddings.append(np.array(item.embedding, dtype=np.float32))

        return np.vstack(all_embeddings)


def embed_trajectory(
    trajectory: dict[str, Any],
    engine: EmbeddingEngine | None = None,
) -> np.ndarray:
    return (engine or EmbeddingEngine()).embed_trajectory(trajectory)


def embed_output(
    trajectory: dict[str, Any],
    engine: EmbeddingEngine | None = None,
) -> np.ndarray:
    return (engine or EmbeddingEngine()).embed_output(trajectory)


def embed_batch(
    trajectories: Sequence[dict[str, Any]],
    mode: str,
    engine: EmbeddingEngine | None = None,
    batch_size: int = 100,
) -> np.ndarray:
    return (engine or EmbeddingEngine()).embed_batch(
        trajectories, mode=mode, batch_size=batch_size
    )


def trajectory_to_text(trajectory: dict[str, Any]) -> str:
    """Serialize one trajectory into a text representation for embedding."""
    query = str(trajectory.get("query", ""))
    steps = trajectory.get("steps", []) or []
    duration = float(trajectory.get("duration", 0.0))

    tool_sequence = []
    for step in steps:
        tool_name = str(step.get("tool", "unknown_tool"))
        key_arg = extract_key_arg(step.get("args", {}))
        tool_sequence.append(f"{tool_name}({key_arg})" if key_arg else tool_name)

    path_str = " -> ".join(tool_sequence) if tool_sequence else "no_tools"
    return (
        f"QUERY: {query}\n"
        f"PATH: {path_str}\n"
        f"STEPS: {len(steps)}\n"
        f"DURATION: {duration:.1f}s"
    )


def extract_key_arg(args: dict[str, Any] | None) -> str:
    """Pick one representative argument so the path string keeps semantic signal."""
    if not args:
        return ""

    for key in KEY_ARG_CANDIDATES:
        if key in args:
            return str(args[key])[:50]

    first_value = next(iter(args.values()))
    return str(first_value)[:50]


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Return cosine similarity between two vectors."""
    denominator = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if denominator == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / denominator)


def _collect_texts(
    trajectories: Sequence[dict[str, Any]],
    mode: str,
) -> list[str]:
    if mode == "trajectory":
        return [trajectory_to_text(item) for item in trajectories]
    return [str(item.get("output", "")) for item in trajectories]


def _fallback_embed_text(text: str, dimension: int) -> np.ndarray:
    """
    Local deterministic embedding for development and tests.

    It is not semantically strong like a real embedding model, but it preserves
    token overlap well enough to unblock detector development without API calls.
    """
    vector = np.zeros(dimension, dtype=np.float32)
    tokens = list(_tokenize(text))
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimension
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0)
        vector[index] += sign * weight

    norm = float(np.linalg.norm(vector))
    if norm > 0:
        vector /= norm
    return vector


def _tokenize(text: str) -> Iterable[str]:
    cleaned = []
    for char in text.lower():
        if char.isalnum():
            cleaned.append(char)
        else:
            cleaned.append(" ")
    return (token for token in "".join(cleaned).split() if token)
