import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

from predict_mastery import level_for_score, predict_probabilities, topic_mastery


def rating_fit_score(problem_rating, user_rating):
    gap = abs((problem_rating or user_rating) - user_rating)
    return max(0.0, 1.0 - (gap / 600.0))


def challenge_score(problem_rating, user_rating):
    gap = (problem_rating or user_rating) - user_rating
    return max(0.0, 1.0 - (abs(gap - 150) / 350.0))


def build_peer_recommendation_baselines(features_path, user_rating, rating_window=150):
    path = Path(features_path)
    if not path.exists():
        return {"peerUserCount": 0, "tagRatios": {}, "ratingTagRatios": {}}

    import pandas as pd

    header = pd.read_csv(path, nrows=0)
    tag_cols = [column for column in header.columns if column.startswith("tag__")]
    usecols = ["handle", "rating_at_submission", "problem_rating", "is_solved", *tag_cols]
    frame = pd.read_csv(path, usecols=usecols)
    peers = frame[
        (frame["is_solved"] == 1)
        & (frame["rating_at_submission"].between(user_rating - rating_window, user_rating + rating_window))
    ].copy()

    if peers.empty:
        return {"peerUserCount": 0, "tagRatios": {}, "ratingTagRatios": {}}

    peer_user_count = int(peers["handle"].nunique())
    tag_totals = peers[tag_cols].sum()
    total_tag_events = float(tag_totals.sum()) or 1.0
    tag_ratios = {
        column.removeprefix("tag__"): float(tag_totals[column]) / total_tag_events
        for column in tag_cols
        if float(tag_totals[column]) > 0
    }

    peers["rating_bucket"] = (peers["problem_rating"].fillna(user_rating) / 100).round() * 100
    rating_tag_ratios = {}
    for rating_bucket, bucket_rows in peers.groupby("rating_bucket"):
        bucket_totals = bucket_rows[tag_cols].sum()
        bucket_total_events = float(bucket_totals.sum()) or 1.0
        rating_tag_ratios[int(rating_bucket)] = {
            column.removeprefix("tag__"): float(bucket_totals[column]) / bucket_total_events
            for column in tag_cols
            if float(bucket_totals[column]) > 0
        }

    return {
        "peerUserCount": peer_user_count,
        "tagRatios": tag_ratios,
        "ratingTagRatios": rating_tag_ratios,
    }


def peer_recommendation_score(problem, peer_baselines):
    tags = problem.get("tags") or []
    if not tags or peer_baselines["peerUserCount"] == 0:
        return 0.0

    topic_score = mean(peer_baselines["tagRatios"].get(tag, 0.0) for tag in tags)
    rating = problem.get("rating")
    rating_bucket = int(round((rating or 0) / 100) * 100) if rating else None
    rating_tag_ratios = peer_baselines["ratingTagRatios"].get(rating_bucket, {}) if rating_bucket else {}
    rating_topic_score = mean(rating_tag_ratios.get(tag, 0.0) for tag in tags)

    scaled_topic_score = min(1.0, topic_score * 8)
    scaled_rating_topic_score = min(1.0, rating_topic_score * 10)
    return (0.40 * scaled_topic_score) + (0.60 * scaled_rating_topic_score)


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def diversify_by_rating(results, limit, max_per_rating=2):
    selected = []
    rating_counts = defaultdict(int)
    seen_problem_ids = set()

    for problem in results:
        rating = problem.get("rating") or "unrated"
        if rating_counts[rating] >= max_per_rating:
            continue
        selected.append(problem)
        seen_problem_ids.add(problem.get("problemId"))
        rating_counts[rating] += 1
        if len(selected) == limit:
            return selected

    for problem in results:
        if problem.get("problemId") in seen_problem_ids:
            continue
        selected.append(problem)
        if len(selected) == limit:
            return selected

    return selected


def recommend(payload, model_path, limit, features_path="ml/data/training_features.csv"):
    predictions, _ = predict_probabilities(payload, model_path)
    mastery = topic_mastery(payload, model_path)
    mastery_by_tag = {topic["tag"]: topic for topic in mastery["topics"]}
    user_rating = payload.get("userRating") or 1200
    peer_baselines = build_peer_recommendation_baselines(features_path, user_rating)
    results = []

    for problem in predictions:
        tags = problem.get("tags") or []
        tag_scores = [mastery_by_tag[tag]["masteryScore"] for tag in tags if tag in mastery_by_tag]
        weakest_score = min(tag_scores) if tag_scores else 60
        weak_topic_bonus = (100 - weakest_score) / 100.0
        probability = problem["predictedSolveProbability"]
        fit = rating_fit_score(problem.get("rating"), user_rating)
        peer_score = peer_recommendation_score(problem, peer_baselines)
        popularity = math.log1p(problem.get("popularity") or 0) / 12.0
        rating_gap = (problem.get("rating") or user_rating) - user_rating
        too_easy_penalty = 0.35 if rating_gap < -100 else 0.0

        score = (
            35 * weak_topic_bonus
            + 30 * fit
            + 25 * probability
            + 10 * min(popularity, 1.0)
            + 25 * peer_score
            - 30 * too_easy_penalty
        )
        if probability < 0.15:
            score -= 15

        level = level_for_score(weakest_score)
        reason = "Targets a weak/moderate topic and stays close to your rating."
        if level == "strong":
            reason = "Good rating fit with topics you are already strong in."

        results.append({
            "problemId": problem.get("problemId"),
            "name": problem.get("name"),
            "rating": problem.get("rating"),
            "tags": tags,
            "url": problem.get("url"),
            "predictedSolveProbability": round(probability, 3),
            "peerRecommendationScore": round(peer_score, 3),
            "recommendationScore": int(round(score)),
            "reason": reason,
        })

    results.sort(key=lambda item: item["recommendationScore"], reverse=True)
    return {
        "handle": payload.get("handle"),
        "predictionSource": predictions[0]["predictionSource"] if predictions else "none",
        "peerUserCount": peer_baselines["peerUserCount"],
        "recommendations": diversify_by_rating(results, limit),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--model", default="ml/models/solve_model.joblib")
    parser.add_argument("--features", default="ml/data/training_features.csv")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    print(json.dumps(recommend(payload, args.model, args.limit, args.features), indent=2))


if __name__ == "__main__":
    main()
