import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from feature_builder import feature_dicts


def choose_model(preferred):
    if preferred == "lightgbm" or preferred == "auto":
        try:
            from lightgbm import LGBMClassifier
            return LGBMClassifier(
                n_estimators=350,
                learning_rate=0.05,
                num_leaves=48,
                subsample=0.9,
                colsample_bytree=0.9,
                random_state=42,
            ), "lightgbm"
        except Exception:
            if preferred == "lightgbm":
                raise

    if preferred == "xgboost" or preferred == "auto":
        try:
            from xgboost import XGBClassifier
            return XGBClassifier(
                n_estimators=300,
                learning_rate=0.05,
                max_depth=6,
                subsample=0.9,
                colsample_bytree=0.9,
                eval_metric="logloss",
                random_state=42,
            ), "xgboost"
        except Exception:
            if preferred == "xgboost":
                raise

    if preferred == "randomforest":
        return RandomForestClassifier(n_estimators=250, min_samples_leaf=5, n_jobs=-1, random_state=42), "randomforest"

    return LogisticRegression(max_iter=1000, n_jobs=-1), "logistic_regression"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="ml/data/training_features.csv")
    parser.add_argument("--model-out", default="ml/models/solve_model.joblib")
    parser.add_argument("--metrics-out", default="ml/models/solve_model_metrics.json")
    parser.add_argument("--model", default="auto", choices=["auto", "lightgbm", "xgboost", "randomforest", "logistic"])
    args = parser.parse_args()

    frame = pd.read_csv(args.features)
    frame = frame.dropna(subset=["is_solved"])
    y = frame["is_solved"].astype(int)
    x_train, x_test, y_train, y_test = train_test_split(
        frame,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y if y.nunique() > 1 else None,
    )

    model, model_name = choose_model(args.model)
    pipeline = Pipeline([
        ("vectorizer", DictVectorizer(sparse=True)),
        ("model", model),
    ])
    pipeline.fit(feature_dicts(x_train), y_train)

    probabilities = pipeline.predict_proba(feature_dicts(x_test))[:, 1]
    predictions = (probabilities >= 0.5).astype(int)
    metrics = {
        "model": model_name,
        "rows": int(len(frame)),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "accuracy": float(accuracy_score(y_test, predictions)),
        "log_loss": float(log_loss(y_test, probabilities)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)) if y_test.nunique() > 1 else None,
    }

    Path(args.model_out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "metrics": metrics}, args.model_out)
    Path(args.metrics_out).write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
