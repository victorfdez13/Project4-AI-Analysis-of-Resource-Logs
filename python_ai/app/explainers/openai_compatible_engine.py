from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

from app.config import settings
from app.context_layer import AnalysisContext
from app.interfaces import ExplanationEngine, ExplanationOutput
from app.model_layer import ModelLayerResult


def _truncate(text: str, max_len: int = 180) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _to_output_from_text(content: str) -> ExplanationOutput:
    return ExplanationOutput(
        summary=_truncate(content, max_len=110),
        explanation=content,
    )


def _parse_json_output(candidate: str) -> ExplanationOutput | None:
    try:
        parsed_content = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed_content, dict):
        return None

    summary = _safe_text(parsed_content.get("summary"))
    explanation = _safe_text(parsed_content.get("explanation"))
    if not summary or not explanation:
        return None

    return ExplanationOutput(summary=summary, explanation=explanation)


def _extract_remote_output(content: str) -> ExplanationOutput:
    candidates = [content]

    fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if fenced_match:
        candidates.insert(0, fenced_match.group(1))

    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end > start:
        candidates.append(content[start : end + 1])

    for candidate in candidates:
        parsed = _parse_json_output(candidate)
        if parsed is not None:
            return parsed

    return _to_output_from_text(content)


class OpenAiCompatibleExplanationEngine(ExplanationEngine):
    def _build_prompt(
        self,
        context: AnalysisContext,
        model_result: ModelLayerResult,
        prompt_matches: list[str],
    ) -> str:
        anchor_log = context.anchor_log
        vector = model_result.anchor_row["vector"]
        repeated_examples = "; ".join(context.repeated_error_samples[:3]) or "none"
        prompt_match_text = ", ".join(prompt_matches[:5]) or "none"
        filters = ", ".join(context.active_filter_labels) or "none"

        return (
            "Explain this SpeedAdmin log in plain language for support staff or customers.\n"
            "Do not mention algorithms, scoring models, or implementation details.\n"
            "Return only a compact JSON object with keys summary and explanation.\n"
            "Do not add markdown, headings, or code fences.\n\n"
            f"Dataset: {_safe_text(anchor_log.get('datasetName'))}\n"
            f"LogId: {_safe_text(anchor_log.get('logId'))}\n"
            f"Category: {_safe_text(anchor_log.get('category'))}\n"
            f"Message: {_safe_text(anchor_log.get('message'))}\n"
            f"Level: {_safe_text(anchor_log.get('level'))}\n"
            f"Linked logs: {len(context.linked_logs)}\n"
            f"Selected logs: {len(context.selected_logs)}\n"
            f"Applied filters: {filters}\n"
            f"Repeated error examples: {repeated_examples}\n"
            f"Prompt-relevant terms: {prompt_match_text}\n"
            f"Missing data score: {vector['missing_data_score']}\n"
            f"Linked activity count: {vector['linked_log_count']}\n"
            f"Predicted label: {model_result.assessment_result['predicted_label']}\n"
            f"Priority score: {model_result.anchor_row['risk_score']}\n"
            f"Movement: {model_result.movement_signal['movement']}\n"
            f"User question: {_safe_text(context.user_prompt)}\n"
        )

    def _call_remote(self, prompt: str) -> ExplanationOutput | None:
        if not settings.REMOTE_LLM_BASE_URL or not settings.REMOTE_LLM_MODEL:
            return None

        try:
            url = settings.REMOTE_LLM_BASE_URL.rstrip("/") + "/chat/completions"
            payload = {
                "model": settings.REMOTE_LLM_MODEL,
                "temperature": 0.2,
                "max_tokens": 400,
                "messages": [
                    {
                        "role": "system",
                        "content": settings.REMOTE_LLM_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            }
            data = json.dumps(payload).encode("utf-8")
            headers = {"Content-Type": "application/json"}
            if settings.REMOTE_LLM_API_KEY:
                headers["Authorization"] = f"Bearer {settings.REMOTE_LLM_API_KEY}"

            request = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(request, timeout=settings.REMOTE_LLM_TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")

            parsed_response = json.loads(raw)
            content = (
                parsed_response.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            if not content:
                return None

            return _extract_remote_output(content)
        except Exception:
            return None

    def generate(
        self,
        context: AnalysisContext,
        model_result: ModelLayerResult,
        prompt_matches: list[str],
    ) -> ExplanationOutput:
        prompt = self._build_prompt(context, model_result, prompt_matches)
        remote_output = self._call_remote(prompt)
        if remote_output is not None:
            return remote_output

        anchor_log = context.anchor_log
        summary = (
            f"Log {_safe_text(anchor_log.get('logId') or 'ad-hoc')} looks worth reviewing. "
            f"It appears to be a {_safe_text(anchor_log.get('category') or 'system')} event."
        )
        explanation = (
            f"The main log message says: {_truncate(_safe_text(anchor_log.get('message')) or 'No message was provided.')}"
            " The remote explanation backend did not return usable text, so this fallback kept the response readable."
        )
        return ExplanationOutput(summary=summary, explanation=explanation)
