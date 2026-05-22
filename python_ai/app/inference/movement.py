from typing import Any

from app.feature_engineering import log_sort_key


def measure_activity_movement(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "sample_size": 0,
            "change_rate": 0.0,
            "baseline_risk": 0.0,
            "average_risk": 0.0,
            "next_risk_estimate": 0.0,
            "movement": "stable",
            "fit_score": 0.0,
        }

    ordered_rows = sorted(rows, key=lambda row: log_sort_key(row["log"]))
    y_values = [float(row["risk_score"]) for row in ordered_rows]
    x_values = list(range(len(y_values)))
    count = len(y_values)

    mean_x = sum(x_values) / count
    mean_y = sum(y_values) / count

    denominator = sum((value - mean_x) ** 2 for value in x_values)
    if denominator == 0:
        change_rate = 0.0
    else:
        change_rate = sum(
            (x_value - mean_x) * (y_value - mean_y)
            for x_value, y_value in zip(x_values, y_values)
        ) / denominator

    baseline_risk = mean_y - change_rate * mean_x
    predictions = [baseline_risk + change_rate * x_value for x_value in x_values]

    total_variance = sum((value - mean_y) ** 2 for value in y_values)
    residual_variance = sum(
        (actual - predicted) ** 2
        for actual, predicted in zip(y_values, predictions)
    )
    if total_variance == 0:
        fit_score = 1.0
    else:
        fit_score = max(0.0, 1.0 - (residual_variance / total_variance))

    if change_rate > 0.15:
        movement = "increasing"
    elif change_rate < -0.15:
        movement = "decreasing"
    else:
        movement = "stable"

    return {
        "sample_size": count,
        "change_rate": round(change_rate, 3),
        "baseline_risk": round(baseline_risk, 3),
        "average_risk": round(mean_y, 2),
        "next_risk_estimate": round(max(0.0, baseline_risk + change_rate * count), 2),
        "movement": movement,
        "fit_score": round(fit_score, 3),
    }
