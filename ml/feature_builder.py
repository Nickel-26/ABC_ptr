import ast
import json
import math
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
import pandas as pd


OK_VERDICTS = {"OK", "ACCEPTED"}


def normalize_problem_id(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text.replace("-", "").replace("_", "")


def parse_tags(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return []
    if isinstance(value, list):
        return [str(tag) for tag in value if tag]
    text = str(value)
    if "|" in text:
        return [tag for tag in text.split("|") if tag]
    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, list):
            return [str(tag) for tag in parsed if tag]
    except (SyntaxError, ValueError):
        pass
    return [text] if text else []


def load_metadata(path):
    metadata_path = Path(path)
    if metadata_path.suffix.lower() == ".json":
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        rows = payload.get("problems", payload if isinstance(payload, list) else [])
    else:
        rows = pd.read_csv(metadata_path).to_dict("records")

    by_problem_id = {}
    for row in rows:
        problem_id = normalize_problem_id(row.get("problem_id") or row.get("problemId"))
        if not problem_id:
            continue
        by_problem_id[problem_id] = {
            "problem_id": problem_id,
            "name": row.get("name"),
            "rating": safe_int(row.get("rating")),
            "tags": parse_tags(row.get("tags")),
            "solved_count": safe_int(row.get("solved_count") or row.get("popularity"), default=0),
            "url": row.get("url"),
        }
    return by_problem_id


def safe_int(value, default=None):
    try:
        if pd.isna(value):
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value, default=0.0):
    try:
        if pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def choose_column(df, candidates, required=True):
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    if required:
        raise ValueError(f"Missing one of required columns: {', '.join(candidates)}")
    return None


def history_snapshot(tags, tag_stats, now_ts, recent_window_seconds):
    solved = []
    failed = []
    avg_rating = []
    max_rating = []
    days_since = []
    recent_solved = 0
    recent_failed = 0

    for tag in tags:
        stat = tag_stats[tag]
        solved.append(stat["solved"])
        failed.append(stat["failed"])
        if stat["solved_ratings"]:
            avg_rating.append(float(np.mean(stat["solved_ratings"])))
            max_rating.append(float(np.max(stat["solved_ratings"])))
        if stat["last_solved_ts"]:
            days_since.append(max(0.0, (now_ts - stat["last_solved_ts"]) / 86400.0))

        while stat["recent"] and now_ts - stat["recent"][0][0] > recent_window_seconds:
            stat["recent"].popleft()
        recent_solved += sum(1 for _, ok in stat["recent"] if ok)
        recent_failed += sum(1 for _, ok in stat["recent"] if not ok)

    solved_count = float(np.mean(solved)) if solved else 0.0
    failed_count = float(np.mean(failed)) if failed else 0.0
    total = solved_count + failed_count
    return {
        "tag_solved_count_before": solved_count,
        "tag_failed_count_before": failed_count,
        "tag_success_rate_before": solved_count / total if total else 0.5,
        "avg_solved_rating_in_tag_before": float(np.mean(avg_rating)) if avg_rating else 0.0,
        "max_solved_rating_in_tag_before": float(np.max(max_rating)) if max_rating else 0.0,
        "recent_solved_30d": recent_solved,
        "recent_failed_30d": recent_failed,
        "days_since_last_tag_solve": float(np.min(days_since)) if days_since else 999.0,
    }


def build_training_features(submissions, metadata):
    handle_col = choose_column(submissions, ["handle", "user_handle", "author"])
    rating_col = choose_column(submissions, ["rating_at_submission", "user_rating", "rating"], required=False)
    problem_rating_col = choose_column(submissions, ["problem_rating", "problemRating"], required=False)
    problem_col = choose_column(submissions, ["id_of_submission_task", "problem_id", "problemId"])
    verdict_col = choose_column(submissions, ["verdict"])
    time_col = choose_column(submissions, ["time", "creationTimeSeconds", "submitted_at"])

    df = submissions.copy()
    df["_time"] = pd.to_numeric(df[time_col], errors="coerce").fillna(0)
    df["_problem_id"] = df[problem_col].map(normalize_problem_id)
    df = df.sort_values([handle_col, "_time"])

    rows = []
    recent_window_seconds = 30 * 86400

    for handle, user_rows in df.groupby(handle_col, sort=False):
        tag_stats = defaultdict(lambda: {
            "solved": 0,
            "failed": 0,
            "solved_ratings": [],
            "last_solved_ts": None,
            "recent": deque(),
        })
        attempts_by_problem = defaultdict(int)

        for _, submission in user_rows.iterrows():
            problem_id = submission["_problem_id"]
            meta = metadata.get(problem_id, {})
            tags = meta.get("tags") or ["__unknown__"]
            user_rating = safe_float(submission[rating_col], 1200.0) if rating_col else 1200.0
            problem_rating = (
                safe_float(submission[problem_rating_col], None)
                if problem_rating_col else None
            )
            if problem_rating is None:
                problem_rating = safe_float(meta.get("rating"), user_rating)
            now_ts = safe_float(submission["_time"], 0.0)
            attempts_by_problem[problem_id] += 1

            features = history_snapshot(tags, tag_stats, now_ts, recent_window_seconds)
            features.update({
                "handle": handle,
                "problem_id": problem_id,
                "rating_at_submission": user_rating,
                "problem_rating": problem_rating,
                "rating_gap": problem_rating - user_rating,
                "attempt_number_on_problem": attempts_by_problem[problem_id],
                "problem_solved_count": safe_float(meta.get("solved_count"), 0.0),
                "tag_count": len(tags),
                "primary_tag": tags[0],
                "is_solved": 1 if str(submission[verdict_col]).upper() in OK_VERDICTS else 0,
            })
            for tag in tags:
                features[f"tag__{tag}"] = 1
            rows.append(features)

            is_ok = features["is_solved"] == 1
            for tag in tags:
                stat = tag_stats[tag]
                if is_ok:
                    stat["solved"] += 1
                    stat["solved_ratings"].append(problem_rating)
                    stat["last_solved_ts"] = now_ts
                else:
                    stat["failed"] += 1
                stat["recent"].append((now_ts, is_ok))

    return pd.DataFrame(rows)


def feature_dicts(frame):
    drop_cols = {"handle", "problem_id", "is_solved"}
    records = []
    for row in frame.to_dict("records"):
        record = {}
        for key, value in row.items():
            if key in drop_cols:
                continue
            if isinstance(value, str):
                record[key] = value
            else:
                record[key] = 0 if pd.isna(value) else value
        records.append(record)
    return records
