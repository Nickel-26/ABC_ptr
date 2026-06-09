import argparse
from pathlib import Path

import pandas as pd

from feature_builder import build_training_features, load_metadata


def load_submissions(args):
    if args.input:
        return pd.read_csv(args.input, nrows=args.limit)

    from datasets import load_dataset

    dataset = load_dataset(args.hf_dataset, split=args.split, streaming=bool(args.limit))
    if args.limit:
        return pd.DataFrame(list(dataset.take(args.limit)))
    return dataset.to_pandas()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Local CSV/parquet-converted CSV with HF submission columns")
    parser.add_argument("--hf-dataset", default="denkCF/UsersCodeforcesSubmissionsEnd2024")
    parser.add_argument("--split", default="train")
    parser.add_argument("--metadata", default="ml/data/cf_problem_metadata.json")
    parser.add_argument("--output", default="ml/data/training_features.csv")
    parser.add_argument("--limit", type=int, default=200000)
    args = parser.parse_args()

    metadata = load_metadata(args.metadata)
    submissions = load_submissions(args)
    features = build_training_features(submissions, metadata)

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(args.output, index=False)
    print(f"Wrote {len(features)} training rows to {args.output}")


if __name__ == "__main__":
    main()
