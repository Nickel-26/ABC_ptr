"""
CF-Scope Analyzer Module
Computes weighted tag scores, identifies strengths/weaknesses, and generates visualizations.
"""

from datetime import datetime
from typing import Optional
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio

TAG_CATEGORY_MAPPING = {
    "dp": "Dynamic Programming",
    "bitmasks": "Dynamic Programming",
    "divide and conquer": "Dynamic Programming",
    "greedy": "Greedy",
    "mathematics": "Mathematics",
    "number theory": "Number Theory",
    "combinatorics": "Number Theory",
    "geometry": "Geometry",
    "probabilities": "Mathematics",
    "fft": "Mathematics",
    "graph matchings": "Graphs",
    "graphs": "Graphs",
    "dfs and similar": "Graphs",
    "bfs": "Graphs",
    "shortest paths": "Graphs",
    "connected components": "Graphs",
    "2-sat": "Graphs",
    "trees": "Graphs",
    "digraphs": "Graphs",
    "strings": "Strings",
    "string suffix structures": "Strings",
    "pattern matching": "Strings",
    "hashing": "Strings",
    "suffix automata": "Strings",
    "data structures": "Data Structures",
    "disjoint set union": "Data Structures",
    "segment tree": "Data Structures",
    "fenwick tree": "Data Structures",
    "sparse table": "Data Structures",
    "binary indexed tree": "Data Structures",
    "stack": "Data Structures",
    "queue": "Data Structures",
    "deque": "Data Structures",
    "heap": "Data Structures",
    "priority queue": "Data Structures",
    "hash tables": "Data Structures",
    "sorting": "Data Structures",
    "binary search": "Data Structures",
    "divide and conquer optimization": "Dynamic Programming",
    "knuth optimization": "Dynamic Programming",
    "concave quadratic optimization": "Dynamic Programming",
    "implementation": "Implementation",
    "constructive algorithms": "Implementation",
    "simulation": "Implementation",
    "parsing": "Implementation",
    "recursion": "Implementation",
    "brute force": "Implementation",
    "meet-in-the-middle": "Implementation",
    "output expeditions": "Implementation",
}

MAJOR_CATEGORIES = [
    "Dynamic Programming",
    "Greedy",
    "Mathematics",
    "Graphs",
    "Strings",
    "Data Structures",
    "Number Theory",
    "Geometry",
]

CYBERPUNK_COLORS = [
    "#00ff9f",  # Neon green
    "#ff6b35",  # Neon orange
    "#00d4ff",  # Cyan
    "#ff00ff",  # Magenta
    "#ffe600",  # Yellow
    "#00ff9f",  # Green (repeat for variety)
    "#ff6b35",  # Orange (repeat)
    "#00d4ff",  # Cyan (repeat)
]

CYBERPUNK_BG = "#0a0a0f"
CYBERPUNK_GRID = "#1a1a2e"
CYBERPUNK_TEXT = "#e0e0e0"


def _get_current_time_from_data(df: pd.DataFrame) -> datetime:
    """Extract most recent submission time from data as reference."""
    return pd.to_datetime(df["submission_time"]).max()


def _calculate_complexity_multiplier(attempts: int) -> float:
    """Apply complexity multiplier based on number of attempts."""
    if attempts == 1:
        return 1.0
    elif attempts == 2:
        return 0.85
    else:
        return 0.7


def _calculate_recency_decay(submission_time: datetime, reference_time: datetime) -> float:
    """
    Exponential decay: 90 days = ~0.76, 365 days = ~0.34
    Using decay constant 0.003 per day.
    """
    if pd.isna(submission_time) or pd.isna(reference_time):
        return 1.0
    
    days_since = (reference_time - submission_time).days
    decay = 0.003 * days_since
    return max(0.1, 1.0 / (1 + 0.5 * decay))


def calculate_tag_scores(df: pd.DataFrame) -> dict:
    """
    Calculate weighted scores for all tags.
    
    Args:
        df: DataFrame with columns [problem_id, rating, tags, submission_time, attempts, verdict]
    
    Returns:
        Dict mapping tag -> weighted score
    """
    if df.empty:
        return {}
    
    reference_time = _get_current_time_from_data(df)
    tag_scores = {}
    
    for _, row in df.iterrows():
        rating = row.get("rating", 0)
        attempts = row.get("attempts", 1)
        submission_time = row.get("submission_time")
        verdict = row.get("verdict", "OK")
        
        if pd.isna(rating):
            rating = 0
        if pd.isna(attempts):
            attempts = 1
        
        base_score = rating / 100.0
        
        if verdict != "OK":
            continue
        
        complexity_mult = _calculate_complexity_multiplier(attempts)
        
        if submission_time is not None:
            recency = _calculate_recency_decay(submission_time, reference_time)
        else:
            recency = 1.0
        
        weight = base_score * complexity_mult * recency
        
        tags = row.get("tags", "")
        if pd.isna(tags) or not tags:
            continue
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            if not tag:
                continue
            tag_lower = tag.lower()
            mapped_tag = TAG_CATEGORY_MAPPING.get(tag_lower, tag.title())
            
            if mapped_tag not in tag_scores:
                tag_scores[mapped_tag] = 0.0
            tag_scores[mapped_tag] += weight
    
    return tag_scores


def get_strong_areas(df: pd.DataFrame, current_rating: int, min_solves: int = 3) -> list:
    """
    Identify user's strongest areas.
    
    Strong: Top 5 tags by cumulative weighted score where avg problem rating >= current_rating - 200.
    Requires min 3 solves per tag.
    """
    if df.empty:
        return []
    
    solved_df = df[df["verdict"] == "OK"]
    reference_time = _get_current_time_from_data(df)
    
    tag_stats = {}
    
    for _, row in solved_df.iterrows():
        attempts = row.get("attempts", 1)
        submission_time = row.get("submission_time")
        rating = row.get("rating", 0)
        
        if pd.isna(rating):
            rating = 0
        if pd.isna(attempts):
            attempts = 1
        
        base_score = rating / 100.0
        complexity_mult = _calculate_complexity_multiplier(attempts)
        
        if submission_time is not None:
            recency = _calculate_recency_decay(submission_time, reference_time)
        else:
            recency = 1.0
        
        weight = base_score * complexity_mult * recency
        
        tags = row.get("tags", "")
        if pd.isna(tags) or not tags:
            continue
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            if not tag:
                continue
            tag_lower = tag.lower()
            mapped_tag = TAG_CATEGORY_MAPPING.get(tag_lower, tag.title())
            
            if mapped_tag not in tag_stats:
                tag_stats[mapped_tag] = {"scores": [], "ratings": [], "count": 0}
            
            tag_stats[mapped_tag]["scores"].append(weight)
            tag_stats[mapped_tag]["ratings"].append(rating)
            tag_stats[mapped_tag]["count"] += 1
    
    strong_areas = []
    
    for tag, stats in tag_stats.items():
        if stats["count"] < min_solves:
            continue
        
        total_score = sum(stats["scores"])
        avg_rating = sum(stats["ratings"]) / len(stats["ratings"])
        
        if avg_rating >= current_rating - 200:
            strong_areas.append({
                "tag": tag,
                "total_score": round(total_score, 2),
                "problems_solved": stats["count"],
                "avg_rating": round(avg_rating, 1),
            })
    
    strong_areas.sort(key=lambda x: x["total_score"], reverse=True)
    return strong_areas[:5]


def get_weak_areas(df: pd.DataFrame, min_solves: int = 3) -> list:
    """
    Identify user's weak areas based on:
    1. High non-AC counts
    2. Low average solved rating
    """
    if df.empty:
        return []
    
    all_df = df.copy()
    solved_df = df[df["verdict"] == "OK"]
    
    reference_time = _get_current_time_from_data(df)
    
    tag_stats = {}
    
    for _, row in all_df.iterrows():
        verdict = row.get("verdict", "OK")
        rating = row.get("rating", 0)
        
        if pd.isna(rating):
            rating = 0
        
        tags = row.get("tags", "")
        if pd.isna(tags) or not tags:
            continue
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            if not tag:
                continue
            tag_lower = tag.lower()
            mapped_tag = TAG_CATEGORY_MAPPING.get(tag_lower, tag.title())
            
            if mapped_tag not in tag_stats:
                tag_stats[mapped_tag] = {
                    "ac_ratings": [],
                    "non_ac_count": 0,
                    "ac_count": 0,
                }
            
            if verdict == "OK":
                tag_stats[mapped_tag]["ac_ratings"].append(float(rating))
                tag_stats[mapped_tag]["ac_count"] += 1
            else:
                tag_stats[mapped_tag]["non_ac_count"] += 1
    
    weak_areas = []
    
    for tag, stats in tag_stats.items():
        total_attempts = stats["ac_count"] + stats["non_ac_count"]
        
        if total_attempts < min_solves:
            continue
        
        non_ac_ratio = stats["non_ac_count"] / total_attempts if total_attempts > 0 else 0
        
        avg_rating = 0
        if stats["ac_ratings"]:
            avg_rating = sum(stats["ac_ratings"]) / len(stats["ac_ratings"])
        
        weakness_score = non_ac_ratio * 100 + (1500 - avg_rating) / 10 if avg_rating > 0 else 0
        
        if non_ac_ratio > 0.5 or avg_rating < 1200:
            weak_areas.append({
                "tag": tag,
                "non_ac_ratio": round(non_ac_ratio * 100, 1),
                "problems_attempted": total_attempts,
                "non_ac_count": stats["non_ac_count"],
                "avg_solved_rating": round(avg_rating, 1),
                "weakness_score": round(weakness_score, 2),
            })
    
    weak_areas.sort(key=lambda x: x["weakness_score"], reverse=True)
    return weak_areas[:5]


def generate_radar_data(df: pd.DataFrame) -> dict:
    """
    Generate data for radar chart showing skills across major categories.
    Counts ALL submissions (not just solved).
    """
    radar_data = {category: 0 for category in MAJOR_CATEGORIES}
    
    if df.empty:
        return radar_data
    
    for _, row in df.iterrows():
        tags = row.get("tags", "")
        if pd.isna(tags) or not tags:
            continue
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            if not tag:
                continue
            tag_lower = tag.lower()
            mapped = TAG_CATEGORY_MAPPING.get(tag_lower, tag.title())
            if mapped in radar_data:
                radar_data[mapped] += 1
    
    max_count = max(radar_data.values()) if radar_data else 1
    if max_count > 0:
        radar_data = {k: round(v / max_count * 100, 1) for k, v in radar_data.items()}
    
    return radar_data


def create_radar_chart(df: pd.DataFrame, handle: str, current_rating: int) -> go.Figure:
    """
    Create an interactive radar chart with cyberpunk theme.
    """
    radar_data = generate_radar_data(df)
    
    categories = list(radar_data.keys())
    values = list(radar_data.values())
    
    categories = categories + [categories[0]]
    values = values + [values[0]]
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatterpolar(
        r=values,
        theta=categories,
        fill="toself",
        fillcolor="rgba(0, 255, 159, 0.3)",
        line=dict(color="#00ff9f", width=2),
        name="Skill Level",
        hovertemplate="%{theta}: %{r}%<extra></extra>",
    ))
    
    fig.update_layout(
        polar=dict(
            bgcolor=CYBERPUNK_BG,
            radialaxis=dict(
                visible=True,
                range=[0, 100],
                tickcolor=CYBERPUNK_TEXT,
                tickfont=dict(color=CYBERPUNK_TEXT, size=10),
                gridcolor=CYBERPUNK_GRID,
                linecolor=CYBERPUNK_GRID,
            ),
            angularaxis=dict(
                tickcolor=CYBERPUNK_TEXT,
                tickfont=dict(color=CYBERPUNK_TEXT, size=11),
                gridcolor=CYBERPUNK_GRID,
                linecolor=CYBERPUNK_GRID,
            ),
        ),
        font=dict(color=CYBERPUNK_TEXT, family="Consolas, monospace"),
        title=dict(
            text=f"<b>CF-Scope Skill Radar</b><br><span style='font-size:14px;color:#00d4ff'>@{handle}</span>",
            font=dict(size=20, color="#00ff9f"),
            x=0.5,
            y=0.95,
        ),
        margin=dict(t=80, b=40, l=40, r=40),
        showlegend=False,
        height=500,
        width=500,
    )
    
    return fig


def generate_tag_distribution_data(df: pd.DataFrame) -> dict:
    """
    Generate tag distribution (count of submissions per tag).
    """
    if df.empty:
        return {}
    
    tag_counts = {}
    
    for _, row in df.iterrows():
        tags = row.get("tags", "")
        if pd.isna(tags) or not tags:
            continue
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            if not tag:
                continue
            tag_lower = tag.lower()
            if tag_lower in TAG_CATEGORY_MAPPING:
                mapped_tag = TAG_CATEGORY_MAPPING[tag_lower]
            else:
                mapped_tag = tag.title()
            
            tag_counts[mapped_tag] = tag_counts.get(mapped_tag, 0) + 1
    
    sorted_counts = dict(sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:15])
    return sorted_counts


def create_tag_distribution_chart(df: pd.DataFrame, handle: str) -> go.Figure:
    """
    Create a bar chart showing submissions per tag.
    """
    tag_data = generate_tag_distribution_data(df)
    
    if not tag_data:
        return go.Figure()
    
    tags = list(tag_data.keys())
    counts = list(tag_data.values())
    
    colors = [CYBERPUNK_COLORS[i % len(CYBERPUNK_COLORS)] for i in range(len(tags))]
    
    fig = go.Figure(go.Bar(
        x=tags,
        y=counts,
        marker_color=colors,
        text=counts,
        textposition='outside',
    ))
    
    fig.update_layout(
        font=dict(color=CYBERPUNK_TEXT, family="Consolas, monospace"),
        title=dict(
            text=f"<b>Submissions by Tag</b>",
            font=dict(size=18, color="#00ff9f"),
            x=0.5,
            y=0.95,
        ),
        xaxis=dict(
            title="",
            tickcolor=CYBERPUNK_TEXT,
            tickfont=dict(color=CYBERPUNK_TEXT, size=10),
            gridcolor=CYBERPUNK_GRID,
            linecolor=CYBERPUNK_GRID,
        ),
        yaxis=dict(
            title="Submissions",
            tickcolor=CYBERPUNK_TEXT,
            tickfont=dict(color=CYBERPUNK_TEXT, size=10),
            gridcolor=CYBERPUNK_GRID,
            linecolor=CYBERPUNK_GRID,
        ),
        margin=dict(t=60, b=100, l=50, r=30),
        height=400,
        width=None,
        showlegend=False,
    )
    
    return fig


def suggest_roadmap_problems(df: pd.DataFrame, weak_tags: list, current_rating: int = 1500) -> list:
    """
    Suggest 5 problems from weak areas that the user hasn't solved yet.
    Returns problems rated current_rating + 50 to current_rating + 300.
    """
    if df.empty or not weak_tags:
        return []
    
    if isinstance(weak_tags, str):
        weak_tags = [weak_tags]
    
    target_min = current_rating + 50
    target_max = current_rating + 300
    
    all_unique_problems = {}
    
    for _, row in df.iterrows():
        problem_key = f"{row.get('contest_id', 0)}{row.get('index', '')}"
        rating = row.get("rating", 0)
        
        if rating < target_min or rating > target_max:
            continue
        
        tags = row.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",")]
        
        for tag in tags:
            tag_lower = tag.lower()
            mapped = TAG_CATEGORY_MAPPING.get(tag_lower, tag.title())
            
            if mapped in weak_tags:
                if problem_key not in all_unique_problems:
                    all_unique_problems[problem_key] = {
                        "contest": row.get("contest_id", 0),
                        "index": row.get("index", ""),
                        "rating": rating,
                        "verdict": row.get("verdict", "NOT_STARTED"),
                    }
                break
    
    suggestions = []
    for prob_key, prob_info in all_unique_problems.items():
        suggestions.append({
            "contest": prob_info["contest"],
            "index": prob_info["index"],
            "rating": prob_info["rating"],
            "status": "Unsolved" if prob_info["verdict"] != "OK" else "Solved",
        })
    
    suggestions.sort(key=lambda x: x["rating"])
    return suggestions[:5]


def analyze_user(df: pd.DataFrame, current_rating: int = 1500) -> dict:
    """
    Complete analysis for a user.
    
    Returns dict with:
        - tag_scores
        - strong_areas
        - weak_areas
        - radar_data
    """
    tag_scores = calculate_tag_scores(df)
    strong = get_strong_areas(df, current_rating)
    weak = get_weak_areas(df)
    radar = generate_radar_data(df)
    
    return {
        "tag_scores": tag_scores,
        "strong_areas": strong,
        "weak_areas": weak,
        "radar_data": radar,
    }


def print_cli_summary(analysis: dict, handle: str) -> None:
    """Print CLI summary output."""
    print(f"\n{'='*50}")
    print(f"  CF-Scope Analysis for @{handle}")
    print(f"{'='*50}\n")
    
    print(">>> STRONG AREAS (Top 5)")
    print("-" * 40)
    if analysis["strong_areas"]:
        for i, area in enumerate(analysis["strong_areas"], 1):
            print(f"  {i}. {area['tag']}")
            print(f"     Score: {area['total_score']:.1f} | Solved: {area['problems_solved']} | Avg Rating: {area['avg_rating']}")
    else:
        print("  No strong areas identified.")
    
    print("\n>>> WEAK AREAS")
    print("-" * 40)
    if analysis["weak_areas"]:
        for i, area in enumerate(analysis["weak_areas"], 1):
            print(f"  {i}. {area['tag']}")
            print(f"     Non-AC: {area['non_ac_count']}/{area['problems_attempted']} ({area['non_ac_ratio']}%) | Avg Solved: {area['avg_solved_rating']}")
    else:
        print("  No weak areas identified.")
    
    print("\n>>> TAG SCORES")
    print("-" * 40)
    sorted_scores = sorted(analysis["tag_scores"].items(), key=lambda x: x[1], reverse=True)[:10]
    for tag, score in sorted_scores:
        print(f"  {tag}: {score:.1f}")
    
    print(f"\n{'='*50}\n")