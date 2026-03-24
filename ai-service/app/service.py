from app.models import AnalyzeRequest, AnalyzeResponse


def analyze_log(request: AnalyzeRequest) -> AnalyzeResponse:
    return AnalyzeResponse(
        summary="Placeholder summary for provided log",
        explanation="This is a mock explanation. AI logic not implemented yet.",
        anomalies=[],
        related_resources=[],
    )
