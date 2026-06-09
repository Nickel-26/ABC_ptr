import argparse
import csv
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen


CF_API_URL = "https://codeforces.com/api/problemset.problems"


def fetch_problem_metadata():
    request = Request(CF_API_URL, headers={"User-Agent": "cp-dashboard-ml/1.0"})
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("status") != "OK":
        raise RuntimeError(payload.get("comment", "Codeforces API returned a non-OK response"))

    solved_counts = {
        f"{item['contestId']}{item['index']}": item.get("solvedCount", 0)
        for item in payload["result"].get("problemStatistics", [])
        if item.get("contestId") and item.get("index")
    }

    rows = []
    for problem in payload["result"].get("problems", []):
        contest_id = problem.get("contestId")
        index = problem.get("index")
        if not contest_id or not index:
            continue
        problem_id = f"{contest_id}{index}"
        rows.append({
            "problem_id": problem_id,
            "contest_id": contest_id,
            "index": index,
            "name": problem.get("name"),
            "rating": problem.get("rating"),
            "tags": problem.get("tags", []),
            "solved_count": solved_counts.get(problem_id, 0),
            "url": f"https://codeforces.com/contest/{contest_id}/problem/{index}",
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-json", default="ml/data/cf_problem_metadata.json")
    parser.add_argument("--out-csv", default="ml/data/cf_problem_metadata.csv")
    args = parser.parse_args()

    rows = fetch_problem_metadata()
    Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out_csv).parent.mkdir(parents=True, exist_ok=True)

    metadata = {
        "fetched_at": int(time.time()),
        "source": CF_API_URL,
        "problems": rows,
    }
    Path(args.out_json).write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    with Path(args.out_csv).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["problem_id", "contest_id", "index", "name", "rating", "tags", "solved_count", "url"])
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "tags": "|".join(row["tags"])})

    print(f"Wrote {len(rows)} Codeforces problems")


if __name__ == "__main__":
    main()
