from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    resource_id: str
    log_text: str
    timestamp: Optional[str] = None
    metadata: Optional[dict[str, Any]] = Field(default_factory=dict)
    prompt: Optional[str] = None
    user_prompt: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("user_prompt", "userPrompt"),
    )
    selected_logs: list[dict[str, Any]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("selected_logs", "selectedLogs"),
    )
    active_filters: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("active_filters", "activeFilters"),
    )


class GroupingInsight(BaseModel):
    group_id: int
    group_count: int
    group_size: int
    average_risk: float
    dominant_categories: list[str]
    summary: str


class PriorityAssessment(BaseModel):
    predicted_label: str
    confidence: float
    heuristic_risk_score: int
    assessment_path: list[str]


class ActivityMovement(BaseModel):
    sample_size: int
    change_rate: float
    baseline_risk: float
    average_risk: float
    next_risk_estimate: float
    movement: str
    fit_score: float


class ContextOverview(BaseModel):
    dataset: Optional[str] = None
    requested_log_id: Optional[int] = None
    selected_log_count: int
    linked_log_count: int
    filtered_log_count: int
    comparison_log_count: int
    active_filters: list[str]


class AnalyzeResponse(BaseModel):
    summary: str
    explanation: str
    anomalies: list[str]
    points_of_interest: list[str]
    related_resources: list[str]
    context_overview: ContextOverview
    feature_vector: dict[str, float]
    grouping_insight: GroupingInsight
    priority_assessment: PriorityAssessment
    activity_movement: ActivityMovement


class DatasetGroupOverview(BaseModel):
    group_id: int
    size: int
    average_risk: float
    dominant_risk_label: str
    dominant_categories: list[str]
    summary: str


class DatasetStudyResponse(BaseModel):
    dataset: str
    sample_size: int
    group_overview: list[DatasetGroupOverview]
    assessment_rules: list[str]
    activity_movement: ActivityMovement
