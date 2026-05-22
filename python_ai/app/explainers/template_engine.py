from __future__ import annotations

from app.context_layer import AnalysisContext
from app.interfaces import ExplanationEngine, ExplanationOutput
from app.model_layer import ModelLayerResult


def _truncate(text: str, max_len: int = 180) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


def _priority_text(risk_score: int) -> str:
    if risk_score >= 9:
        return "high priority"
    if risk_score >= 4:
        return "worth a closer look"
    return "fairly routine"


def _level_text(level: float) -> str:
    level_value = int(level)
    if level_value >= 5:
        return "very severe"
    if level_value >= 4:
        return "serious"
    if level_value >= 3:
        return "warning-level"
    if level_value >= 1:
        return "informational"
    return "unclear"


def _build_evidence_lines(
    context: AnalysisContext,
    model_result: ModelLayerResult,
    prompt_matches: list[str],
) -> list[str]:
    vector = model_result.anchor_row["vector"]
    evidence: list[str] = []

    if context.linked_logs:
        evidence.append(
            f"It is connected to {len(context.linked_logs)} related log(s) through the same session, resource, or linked entities."
        )

    repeated_error_samples = context.repeated_error_samples
    if repeated_error_samples:
        evidence.append(
            "The same error appears more than once in the nearby activity, including: "
            + "; ".join(repeated_error_samples)
            + "."
        )

    if vector["missing_data_score"] >= 2:
        evidence.append(
            "Some important details are missing, which makes the activity look less trustworthy or harder to verify."
        )
    elif vector["missing_data_score"] >= 1:
        evidence.append("A few expected details are missing from the log.")

    if vector["login_without_session"] >= 1:
        evidence.append(
            "This looks like a login-related event, but it does not carry a session reference."
        )

    if vector["has_impersonator"] >= 1:
        evidence.append(
            "The log shows that one user may have been acting on behalf of another user."
        )

    if vector["change_count"] >= 3:
        evidence.append(
            f"The log records several changes at once ({int(vector['change_count'])} changes)."
        )

    if vector["off_hours_activity"] >= 1:
        evidence.append("The activity happened outside normal working hours.")

    if vector["weekend_activity"] >= 1:
        evidence.append("The activity happened during the weekend.")

    if vector["linked_log_count"] >= 6 or vector["distinct_category_count"] >= 4:
        evidence.append(
            "The activity spreads across several related entries, which may mean the issue affected more than one step."
        )

    if model_result.movement_signal["movement"] == "increasing":
        evidence.append(
            "The nearby activity suggests the situation may be getting worse rather than fading out."
        )

    if prompt_matches:
        evidence.append(
            "It also matches what the user asked about, especially: "
            + ", ".join(prompt_matches[:4])
            + "."
        )

    return evidence


class TemplateExplanationEngine(ExplanationEngine):
    def generate(
        self,
        context: AnalysisContext,
        model_result: ModelLayerResult,
        prompt_matches: list[str],
    ) -> ExplanationOutput:
        anchor_log = context.anchor_log
        risk_score = int(model_result.anchor_row["risk_score"])
        assessment_result = model_result.assessment_result
        vector = model_result.anchor_row["vector"]
        dataset = anchor_log.get("datasetName") or "ADHOC"
        log_id = anchor_log.get("logId") or "ad-hoc"
        category = str(anchor_log.get("category") or "event")
        priority_text = _priority_text(risk_score)
        related_part = (
            f" It is connected to {len(context.linked_logs)} related log(s)."
            if context.linked_logs
            else ""
        )

        summary = (
            f"Log {log_id} from {dataset} looks {priority_text}. "
            f"It appears to be a {category} event and was assessed as {assessment_result['predicted_label']}."
            f"{related_part}"
        )

        evidence_lines = _build_evidence_lines(context, model_result, prompt_matches)
        parts: list[str] = []

        message = str(anchor_log.get("message") or "").strip()
        if message:
            parts.append(f"The main log message says: {_truncate(message)}")

        parts.append(
            f"This entry looks {_priority_text(risk_score)} because the log itself is {_level_text(vector['level'])} and the surrounding evidence points in the same direction."
        )

        if evidence_lines:
            parts.extend(evidence_lines[:4])

        if assessment_result["predicted_label"] == "critical":
            parts.append("In simple terms, this looks like something support should review quickly.")
        elif assessment_result["predicted_label"] == "watch":
            parts.append("In simple terms, this does not look harmless and should be checked more closely.")
        else:
            parts.append("In simple terms, this looks more like background activity unless other business context says otherwise.")

        if context.user_prompt:
            parts.append(f"This explanation was guided by the user's question: {_truncate(context.user_prompt, 120)}")

        return ExplanationOutput(
            summary=summary,
            explanation=" ".join(parts),
        )
