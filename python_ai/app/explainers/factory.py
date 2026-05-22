from app.config import settings
from app.explainers.openai_compatible_engine import OpenAiCompatibleExplanationEngine
from app.explainers.template_engine import TemplateExplanationEngine
from app.interfaces import ExplanationEngine


def get_explanation_engine() -> ExplanationEngine:
    backend = settings.EXPLANATION_BACKEND.lower()
    if backend in {"openai-compatible", "openai_compatible", "remote"}:
        return OpenAiCompatibleExplanationEngine()
    return TemplateExplanationEngine()
