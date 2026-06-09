import argparse
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def level_for_score(score):
    if score <= 45:
        return "weak"
    if score <= 70:
        return "moderate"
    return "strong"


def build_profile(submissions):
    stats = defaultdict(lambda: {"solved": 0, "failed": 0, "ratings": []})
    solved_problem_ids = set()

    for submission in submissions:
        problem = submission.get("problem") or {}
        tags = problem.get("tags") or []
        rating = problem.get("rating") or 1200
        verdict = str(submission.get("verdict", "")).upper()
        ok = verdict in {"OK", "ACCEPTED"}
        if ok:
            solved_problem_ids.add(problem.get("problemId") or submission.get("problemId"))
        for tag in tags:
            if ok:
                stats[tag]["solved"] += 1
                stats[tag]["ratings"].append(rating)
            else:
                stats[tag]["failed"] += 1

    return stats, solved_problem_ids


def candidate_features(problem, user_rating, stats):
    tags = problem.get("tags") or ["__unknown__"]
    solved = mean([stats[tag]["solved"] for tag in tags]) if tags else 0
    failed = mean([stats[tag]["failed"] for tag in tags]) if tags else 0
    ratings = [rating for tag in tags for rating in stats[tag]["ratings"]]
    problem_rating = problem.get("rating") or user_rating
    total = solved + failed
    features = {
        "rating_at_submission": user_rating,
        "problem_rating": problem_rating,
        "rating_gap": problem_rating - user_rating,
        "tag_solved_count_before": solved,
        "tag_failed_count_before": failed,
        "tag_success_rate_before": solved / total if total else 0.5,
        "avg_solved_rating_in_tag_before": mean(ratings) if ratings else 0.0,
        "max_solved_rating_in_tag_before": max(ratings) if ratings else 0.0,
        "recent_solved_30d": 0,
        "recent_failed_30d": 0,
        "days_since_last_tag_solve": 999.0,
        "attempt_number_on_problem": 1,
        "problem_solved_count": problem.get("popularity") or 0,
        "tag_count": len(tags),
        "primary_tag": tags[0],
    }
    for tag in tags:
        features[f"tag__{tag}"] = 1
    return features


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def clip(value, low, high):
    return max(low, min(high, value))


def parse_timestamp(value):
    if not value:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def rating_component(rating, user_rating):
    return clip(50 + ((rating - user_rating) * 0.12), 0, 100)


def build_peer_baselines(features_path, user_rating, rating_window=150):
    path = Path(features_path)
    if not path.exists():
        return {}

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
        return {}

    peer_user_count = int(peers["handle"].nunique())
    tag_totals = peers[tag_cols].sum()
    total_tag_events = float(tag_totals.sum()) or 1.0
    per_user_counts = peers.groupby("handle")[tag_cols].sum()
    avg_counts = per_user_counts.mean()
    rating_band_peers = peers[
        peers["problem_rating"].fillna(user_rating).between(user_rating - 300, user_rating + 300)
    ]
    rating_band_tag_totals = rating_band_peers[tag_cols].sum() if not rating_band_peers.empty else tag_totals
    rating_band_total_tag_events = float(rating_band_tag_totals.sum()) or 1.0

    baselines = {}
    for column in tag_cols:
        tag = column.removeprefix("tag__")
        total = float(tag_totals[column])
        if total <= 0:
            continue
        baselines[tag] = {
            "peerAvgSolved": float(avg_counts[column]),
            "peerTopicRatio": total / total_tag_events,
            "peerRatingBandTopicRatio": float(rating_band_tag_totals[column]) / rating_band_total_tag_events,
            "peerSolvedCount": int(total),
            "peerUserCount": peer_user_count,
        }
    return baselines


def peer_component(tag, solved, user_topic_ratio, peer_baselines):
    peer = peer_baselines.get(tag)
    if not peer:
        return 50, None

    peer_avg = peer["peerAvgSolved"]
    peer_ratio = peer["peerTopicRatio"]
    peer_rating_band_ratio = peer.get("peerRatingBandTopicRatio", peer_ratio)

    if peer_avg > 0:
        count_score = 70 + (((solved - peer_avg) / peer_avg) * 35)
    else:
        count_score = 70 if solved else 45

    if peer_ratio > 0:
        ratio_score = 70 + (((user_topic_ratio - peer_ratio) / peer_ratio) * 35)
    else:
        ratio_score = 70 if user_topic_ratio else 45

    if peer_rating_band_ratio > 0:
        rating_band_score = 70 + (((user_topic_ratio - peer_rating_band_ratio) / peer_rating_band_ratio) * 35)
    else:
        rating_band_score = 70 if user_topic_ratio else 45

    score = clip((0.25 * count_score) + (0.35 * ratio_score) + (0.40 * rating_band_score), 0, 100)
    return score, peer


def topic_score_from_history(
    tag,
    stat,
    user_rating,
    latest_ts,
    user_total_solved_tag_events,
    peer_baselines,
    predicted_score=None,
):
    solved = stat["solved"]
    failed = stat["failed"]
    attempts = solved + failed
    ratings = stat["ratings"]

    if attempts == 0:
        return None

    success_rate = solved / attempts if attempts else 0
    success_score = success_rate * 100
    avg_rating_score = rating_component(mean(ratings), user_rating) if ratings else 0

    recent_events = stat["recent_events"]
    if latest_ts and recent_events:
        recent_cutoff = latest_ts - (90 * 86400)
        recent = [event for event in recent_events if event["ts"] and event["ts"] >= recent_cutoff]
    else:
        recent = []

    if recent:
        recent_solved = sum(1 for event in recent if event["ok"])
        recent_score = (recent_solved / len(recent)) * 100
    elif stat["last_solved_ts"] and latest_ts:
        days_since = max(0, (latest_ts - stat["last_solved_ts"]) / 86400)
        recent_score = clip(100 - days_since, 20, 100)
    else:
        recent_score = 35

    score = int(round((0.50 * avg_rating_score) + (0.50 * success_score)))
    avg_rating = int(round(mean(ratings))) if ratings else None
    max_rating = int(round(max(ratings))) if ratings else None

    reasons = []
    if avg_rating is not None:
        diff = avg_rating - user_rating
        reasons.append(f"avg solved rating {avg_rating} ({diff:+.0f} vs your rating)")
    if max_rating is not None:
        reasons.append(f"max solved {max_rating}")
    reasons.append(f"{solved}/{attempts} accepted attempts")

    return {
        "tag": tag,
        "masteryScore": score,
        "predictedScoreNearRating": predicted_score,
        "level": level_for_score(score),
        "successRate": success_rate,
        "solved": solved,
        "failed": failed,
        "attempts": attempts,
        "avgSolvedRating": avg_rating,
        "maxSolvedRating": max_rating,
        "recentAttempts": len(recent),
        "avgSolvedRatingScore": int(round(avg_rating_score)),
        "acceptedAttemptScore": int(round(success_score)),
        "reason": "; ".join(reasons),
    }


def heuristic_probability(problem, user_rating, stats):
    tags = problem.get("tags") or []
    problem_rating = problem.get("rating") or user_rating
    rating_gap = problem_rating - user_rating
    rating_component = 1.0 / (1.0 + math.exp((rating_gap - 100) / 220.0))
    tag_rates = []
    for tag in tags:
        solved = stats[tag]["solved"]
        failed = stats[tag]["failed"]
        tag_rates.append((solved + 1) / (solved + failed + 2))
    tag_component = mean(tag_rates) if tag_rates else 0.5
    return float(clip((0.62 * rating_component) + (0.38 * tag_component), 0.03, 0.97))


def predict_probabilities(payload, model_path):
    stats, solved_problem_ids = build_profile(payload.get("submissions", []))
    user_rating = payload.get("userRating") or 1200
    candidates = payload.get("candidateProblems", [])
    model_file = Path(model_path)
    artifact = None
    if model_file.exists():
        import joblib
        artifact = joblib.load(model_file)

    predictions = []
    for problem in candidates:
        if problem.get("problemId") in solved_problem_ids:
            continue
        features = candidate_features(problem, user_rating, stats)
        if artifact:
            probability = float(artifact["pipeline"].predict_proba([features])[0][1])
            source = "model"
        else:
            probability = heuristic_probability(problem, user_rating, stats)
            source = "heuristic"
        predictions.append({**problem, "predictedSolveProbability": probability, "predictionSource": source})
    return predictions, stats


def topic_mastery(payload, model_path, features_path="ml/data/training_features.csv"):
    predictions, stats = predict_probabilities(payload, model_path)
    user_rating = payload.get("userRating") or 1200
    peer_baselines = build_peer_baselines(features_path, user_rating)
    predicted_by_tag = defaultdict(list)
    history = defaultdict(lambda: {
        "solved": 0,
        "failed": 0,
        "ratings": [],
        "last_solved_ts": None,
        "recent_events": [],
    })
    latest_ts = None

    for problem in predictions:
        rating = problem.get("rating") or user_rating
        if abs(rating - user_rating) > 350:
            continue
        for tag in problem.get("tags") or []:
            predicted_by_tag[tag].append(problem["predictedSolveProbability"])

    for submission in payload.get("submissions", []):
        problem = submission.get("problem") or {}
        tags = problem.get("tags") or []
        rating = problem.get("rating") or user_rating
        verdict = str(submission.get("verdict", "")).upper()
        ok = verdict in {"OK", "ACCEPTED"}
        ts = parse_timestamp(submission.get("submittedAt"))
        if ts:
            latest_ts = max(latest_ts or ts, ts)
        for tag in tags:
            stat = history[tag]
            stat["recent_events"].append({"ts": ts, "ok": ok})
            if ok:
                stat["solved"] += 1
                stat["ratings"].append(rating)
                if ts:
                    stat["last_solved_ts"] = max(stat["last_solved_ts"] or ts, ts)
            else:
                stat["failed"] += 1

    user_total_solved_tag_events = sum(stat["solved"] for stat in history.values())
    topics = []
    for tag, stat in history.items():
        predicted_score = None
        if predicted_by_tag[tag]:
            predicted_score = int(round(mean(predicted_by_tag[tag]) * 100))
        topic = topic_score_from_history(
            tag,
            stat,
            user_rating,
            latest_ts,
            user_total_solved_tag_events,
            peer_baselines,
            predicted_score,
        )
        if topic:
            topics.append(topic)

    topics.sort(key=lambda topic: topic["masteryScore"])
    return {
        "handle": payload.get("handle"),
        "predictionSource": predictions[0]["predictionSource"] if predictions else "none",
        "peerComparison": {
            "ratingWindow": 150,
            "peerUserCount": max((item["peerUserCount"] for item in peer_baselines.values()), default=0),
        },
        "topics": topics,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--model", default="ml/models/solve_model.joblib")
    parser.add_argument("--features", default="ml/data/training_features.csv")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    print(json.dumps(topic_mastery(payload, args.model, args.features), indent=2))


if __name__ == "__main__":
    main()
