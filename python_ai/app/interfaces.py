from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.context_layer import AnalysisContext
from app.model_layer import ModelLayerResult


@dataclass
class ExplanationOutput:
    summary: str
    explanation: str


class ExplanationEngine(Protocol):
    def generate(
        self,
        context: AnalysisContext,
        model_result: ModelLayerResult,
        prompt_matches: list[str],
    ) -> ExplanationOutput:
        ...
