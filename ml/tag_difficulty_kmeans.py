import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_samples
from sklearn.preprocessing import StandardScaler


MODEL_PATH = "ml/models/tag_difficulty_kmeans.joblib"
FEATURES_PATH = "ml/data/training_features.csv"
LABELS = ["easy", "medium", "hard"]
MODEL_FEATURES = [
    "avg_problem_rating",
    "unsolved_rate",
    "avg_rating_gap",
    "avg_attempt_number",
    "inverse_popularity",
]


def tag_name(column):
    return column.removeprefix("tag__")


def tag_columns(frame):
    return [column for column in frame.columns if column.startswith("tag__")]


def safe_mean(series, default=0.0):
    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return default
    return float(numeric.mean())


def normalize_problem_id(value):
    if pd.isna(value):
        return None
    return str(value).strip()


def load_training_frame(path, nrows=None):
    return pd.read_csv(path, nrows=nrows)


def aggregate_tag_features(frame, min_attempts=1):
    rows = []
    frame = frame.copy()
    frame["is_solved"] = pd.to_numeric(frame["is_solved"], errors="coerce").fillna(0).astype(int)

    for column in tag_columns(frame):
        tagged = frame[pd.to_numeric(frame[column], errors="coerce").fillna(0) > 0]
        if len(tagged) < min_attempts:
            continue

        solved = tagged[tagged["is_solved"] == 1]
        solve_rate = float(len(solved) / len(tagged)) if len(tagged) else 0.0
        avg_problem_rating = safe_mean(tagged["problem_rating"], 1200.0)
        avg_solved_rating = safe_mean(solved["problem_rating"], avg_problem_rating)
        avg_rating_gap = safe_mean(tagged["rating_gap"], 0.0)
        avg_attempt_number = safe_mean(tagged["attempt_number_on_problem"], 1.0)
        avg_popularity = safe_mean(tagged["problem_solved_count"], 0.0)

        rows.append({
            "tag": tag_name(column),
            "attempts": int(len(tagged)),
            "solved": int(len(solved)),
            "failed": int(len(tagged) - len(solved)),
            "solve_rate": solve_rate,
            "avg_problem_rating": avg_problem_rating,
            "avg_solved_rating": avg_solved_rating,
            "avg_rating_gap": avg_rating_gap,
            "avg_attempt_number": avg_attempt_number,
            "avg_popularity": avg_popularity,
            "unsolved_rate": 1.0 - solve_rate,
            "inverse_popularity": 1.0 / np.log1p(max(avg_popularity, 1.0)),
        })

    return pd.DataFrame(rows)


def difficulty_index(features):
    if features.empty:
        return pd.Series(dtype=float)

    rating_rank = features["avg_problem_rating"].rank(pct=True)
    unsolved_rank = features["unsolved_rate"].rank(pct=True)
    gap_rank = features["avg_rating_gap"].rank(pct=True)
    attempt_rank = features["avg_attempt_number"].rank(pct=True)
    inverse_popularity_rank = features["inverse_popularity"].rank(pct=True)

    return (
        0.45 * rating_rank
        + 0.25 * unsolved_rank
        + 0.15 * gap_rank
        + 0.10 * attempt_rank
        + 0.05 * inverse_popularity_rank
    )


def train_model(features_path=FEATURES_PATH, model_path=MODEL_PATH, min_global_attempts=100, limit=None):
    frame = load_training_frame(features_path, nrows=limit)
    global_features = aggregate_tag_features(frame, min_attempts=min_global_attempts)
    if len(global_features) < 3:
        raise ValueError("Need at least three tags with enough attempts to train K-Means.")

    global_features["difficulty_index"] = difficulty_index(global_features)
    scaler = StandardScaler()
    matrix = scaler.fit_transform(global_features[MODEL_FEATURES])

    kmeans = KMeans(n_clusters=3, random_state=42, n_init=20)
    clusters = kmeans.fit_predict(matrix)

    # Calculate silhouette scores for each tag to filter out "low confidence" classifications
    silhouette_scores = silhouette_samples(matrix, clusters)
    global_features["cluster"] = clusters
    global_features["silhouette"] = silhouette_scores

    # Filter out tags with low silhouette scores (near 0 or negative means they are on cluster boundaries)
    CONFIDENCE_THRESHOLD = 0.05
    filtered_features = global_features[global_features["silhouette"] >= CONFIDENCE_THRESHOLD].copy()

    # Fallback to original if filtering removes too many tags
    if len(filtered_features) >= 3:
        global_features = filtered_features

    cluster_order = (
        global_features.groupby("cluster")["difficulty_index"]
        .mean()
        .sort_values()
        .index
        .tolist()
    )
    cluster_to_label = {int(cluster): LABELS[index] for index, cluster in enumerate(cluster_order)}
    global_features["global_label"] = global_features["cluster"].map(cluster_to_label)

    artifact = {
        "model": kmeans,
        "scaler": scaler,
        "model_features": MODEL_FEATURES,
        "cluster_to_label": cluster_to_label,
        "global_tag_features": global_features.to_dict("records"),
        "source": features_path,
        "description": (
            "K-Means model that clusters Codeforces tags into easy, medium, and hard bands "
            "using global submission features derived from the historical dataset."
        ),
    }

    Path(model_path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)
    return artifact


def frame_from_payload(payload):
    rows = []
    for submission in payload.get("submissions", []):
        problem = submission.get("problem") or {}
        tags = problem.get("tags") or []
        verdict = str(submission.get("verdict", "")).upper()
        is_solved = 1 if verdict in {"OK", "ACCEPTED"} else 0
        rating = problem.get("rating") or payload.get("userRating") or 1200

        row = {
            "handle": payload.get("handle", "current-user"),
            "problem_id": normalize_problem_id(problem.get("problemId") or submission.get("problemId")),
            "rating_at_submission": payload.get("userRating") or 1200,
            "problem_rating": rating,
            "rating_gap": rating - (payload.get("userRating") or 1200),
            "attempt_number_on_problem": 1,
            "problem_solved_count": 0,
            "is_solved": is_solved,
        }
        for tag in tags:
            row[f"tag__{tag}"] = 1
        rows.append(row)

    if not rows:
        return pd.DataFrame()

    frame = pd.DataFrame(rows).fillna(0)
    attempts = {}
    attempt_numbers = []
    for problem_id in frame["problem_id"]:
        attempts[problem_id] = attempts.get(problem_id, 0) + 1
        attempt_numbers.append(attempts[problem_id])
    frame["attempt_number_on_problem"] = attempt_numbers
    return frame


def shift_label(label, offset):
    index = LABELS.index(label)
    index = max(0, min(len(LABELS) - 1, index + offset))
    return LABELS[index]


def classify_user_tags(artifact, user_frame, min_user_attempts=1):
    if user_frame.empty:
        return []

    user_features = aggregate_tag_features(user_frame, min_attempts=min_user_attempts)
    if user_features.empty:
        return []

    global_by_tag = {
        row["tag"]: row
        for row in artifact.get("global_tag_features", [])
    }

    matrix = artifact["scaler"].transform(user_features[artifact["model_features"]])
    clusters = artifact["model"].predict(matrix)

    results = []
    for row, cluster in zip(user_features.to_dict("records"), clusters):
        base_label = artifact["cluster_to_label"][int(cluster)]
        global_row = global_by_tag.get(row["tag"], {})
        global_solve_rate = float(global_row.get("solve_rate", row["solve_rate"]))
        global_avg_solved_rating = float(global_row.get("avg_solved_rating", row["avg_solved_rating"]))

        solve_rate_delta = row["solve_rate"] - global_solve_rate
        rating_delta = row["avg_solved_rating"] - global_avg_solved_rating

        adjustment = 0
        if solve_rate_delta >= 0.15 and rating_delta >= -100:
            adjustment = -1
        elif solve_rate_delta <= -0.15 or rating_delta <= -250:
            adjustment = 1

        adjusted_label = shift_label(base_label, adjustment)
        results.append({
            "tag": row["tag"],
            "label": adjusted_label,
            "kmeansLabel": base_label,
            "attempts": row["attempts"],
            "solved": row["solved"],
            "failed": row["failed"],
            "solveRate": round(row["solve_rate"], 3),
            "globalSolveRate": round(global_solve_rate, 3),
            "avgSolvedRating": round(row["avg_solved_rating"]),
            "globalAvgSolvedRating": round(global_avg_solved_rating),
            "reason": (
                f"K-Means label {base_label}; user solve-rate delta {solve_rate_delta:+.2f}; "
                f"avg solved rating delta {rating_delta:+.0f}."
            ),
        })

    return sorted(results, key=lambda item: (LABELS.index(item["label"]), -item["attempts"]))


def build_tag_difficulty_summary(tag_difficulty, max_focus_tags=5):
    summary = {
        "easy": 0,
        "medium": 0,
        "hard": 0,
        "focusTags": [],
        "confidenceNote": "Uses K-Means tag difficulty compared with global Codeforces submission behavior.",
    }

    for item in tag_difficulty:
        label = item.get("label")
        if label in summary:
            summary[label] += 1

    hard_tags = [
        item for item in tag_difficulty
        if item.get("label") == "hard"
    ]
    hard_tags.sort(key=lambda item: (item.get("solveRate", 0), -item.get("attempts", 0)))

    summary["focusTags"] = [
        {
            "tag": item.get("tag"),
            "attempts": item.get("attempts", 0),
            "solveRate": item.get("solveRate", 0),
            "reason": item.get("reason", ""),
        }
        for item in hard_tags[:max_focus_tags]
    ]
    return summary


def load_or_train(args):
    if Path(args.model_path).exists() and not args.retrain:
        return joblib.load(args.model_path)
    return train_model(
        features_path=args.features,
        model_path=args.model_path,
        min_global_attempts=args.min_global_attempts,
        limit=args.limit,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default=FEATURES_PATH)
    parser.add_argument("--model-path", default=MODEL_PATH)
    parser.add_argument("--mode", choices=["train", "classify", "train-and-classify"], default="train")
    parser.add_argument("--handle", help="Classify a handle present in the training feature CSV.")
    parser.add_argument("--input", help="Optional backend-style JSON payload with submissions.")
    parser.add_argument("--min-global-attempts", type=int, default=100)
    parser.add_argument("--min-user-attempts", type=int, default=1)
    parser.add_argument("--limit", type=int, help="Optional row limit for faster experiments.")
    parser.add_argument("--retrain", action="store_true")
    args = parser.parse_args()

    if args.mode in {"train", "train-and-classify"}:
        artifact = train_model(
            features_path=args.features,
            model_path=args.model_path,
            min_global_attempts=args.min_global_attempts,
            limit=args.limit,
        )
    else:
        artifact = load_or_train(args)

    if args.mode == "train":
        counts = {}
        for row in artifact["global_tag_features"]:
            counts[row["global_label"]] = counts.get(row["global_label"], 0) + 1
        print(json.dumps({
            "modelPath": args.model_path,
            "source": artifact["source"],
            "clusterCounts": counts,
        }, indent=2))
        return

    if args.input:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        user_frame = frame_from_payload(payload)
        handle = payload.get("handle", "current-user")
    elif args.handle:
        frame = load_training_frame(args.features, nrows=args.limit)
        user_frame = frame[frame["handle"] == args.handle].copy()
        handle = args.handle
    else:
        raise ValueError("Classification needs either --handle or --input.")

    results = classify_user_tags(artifact, user_frame, min_user_attempts=args.min_user_attempts)
    print(json.dumps({
        "handle": handle,
        "modelPath": args.model_path,
        "labels": LABELS,
        "tagDifficulty": results,
    }, indent=2))


if __name__ == "__main__":
    main()
