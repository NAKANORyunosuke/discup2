from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
MISSION_DATA_PATH = ROOT / "data" / "missions.json"
OUTPUT_PATH = ROOT / "data" / "mission-patterns.json"
IMAGE_DIR = ROOT / "assets" / "missions"

CELL_WIDTH = 154
CELL_HEIGHT = 68
CROP_MARGIN = 3
ANY_OCCUPANCY_LIMIT = 0.16
MIN_CONFIDENCE_GAP = 5.0

SYMBOL_LABELS = {
    "red": "赤7",
    "blue": "青7",
    "black": "黒BAR",
    "cherry": "チェリー",
    "watermelon": "スイカ",
    "replay": "リプレイ",
    "star": "星",
}

REEL_SEQUENCES = {
    "left": [
        "star", "cherry", "watermelon", "replay", "watermelon", "black",
        "star", "replay", "cherry", "replay", "star", "watermelon",
        "blue", "star", "star", "replay", "star", "watermelon",
        "replay", "red", "watermelon",
    ],
    "middle": [
        "replay", "cherry", "star", "replay", "watermelon", "blue",
        "cherry", "star", "replay", "cherry", "black", "star", "star",
        "replay", "cherry", "star", "replay", "watermelon", "cherry",
        "red", "star",
    ],
    "right": [
        "replay", "star", "watermelon", "star", "replay", "blue",
        "watermelon", "star", "replay", "cherry", "watermelon", "black",
        "star", "replay", "blue", "watermelon", "replay", "star",
        "watermelon", "red", "cherry",
    ],
}

LEFT_CODE_TO_BOTTOM = {
    "1": 2,
    "2": 1,
    "3": 21,
    "4": 20,
    "5": 19,
    "6": 18,
    "7": 17,
    "8": 16,
    "9": 15,
    "a": 14,
    "b": 13,
    "c": 12,
    "d": 11,
    "e": 10,
    "f": 9,
    "g": 8,
    "h": 7,
    "i": 6,
    "j": 5,
    "k": 4,
    "l": 3,
}


def stopped_window(sequence: list[str], bottom: int) -> tuple[str, str, str]:
    """Return the visible top, middle, and bottom symbols for a lower stop."""
    length = len(sequence)
    return tuple(sequence[(bottom + 1 - row) % length] for row in range(3))


def unique_windows(sequence: list[str]) -> list[tuple[str, str, str]]:
    windows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for bottom in range(1, len(sequence) + 1):
        window = stopped_window(sequence, bottom)
        if window in seen:
            continue
        seen.add(window)
        windows.append(window)
    return windows


def cell_features(image: np.ndarray, column: int, row: int) -> np.ndarray:
    y0 = row * CELL_HEIGHT + CROP_MARGIN
    y1 = (row + 1) * CELL_HEIGHT - CROP_MARGIN
    x0 = column * CELL_WIDTH + CROP_MARGIN
    x1 = (column + 1) * CELL_WIDTH - CROP_MARGIN
    cell = image[y0:y1, x0:x1]
    maximum = cell.max(axis=2)
    minimum = cell.min(axis=2)
    nonwhite = minimum < 248
    dark = maximum < 110
    saturated = (maximum - minimum) > 35
    colorful = nonwhite & saturated
    red = (
        (cell[:, :, 0] > 140)
        & (cell[:, :, 0] > cell[:, :, 1] * 1.25)
        & (cell[:, :, 0] > cell[:, :, 2] * 1.15)
    )
    green = (
        (cell[:, :, 1] > 70)
        & (cell[:, :, 1] > cell[:, :, 0] * 0.72)
        & (cell[:, :, 1] > cell[:, :, 2] * 1.12)
    )
    blue = (
        (cell[:, :, 2] > 80)
        & (cell[:, :, 2] > cell[:, :, 0] * 1.05)
        & (cell[:, :, 2] > cell[:, :, 1] * 0.85)
    )
    yellow = (
        (cell[:, :, 0] > 140)
        & (cell[:, :, 1] > 100)
        & (cell[:, :, 2] < 135)
    )
    magenta = (
        (cell[:, :, 0] > 110)
        & (cell[:, :, 2] > 60)
        & (cell[:, :, 1] < 125)
        & (cell[:, :, 0] > cell[:, :, 1] * 1.15)
    )
    cyan = (
        (cell[:, :, 1] > 100)
        & (cell[:, :, 2] > 100)
        & (cell[:, :, 0] < 130)
    )
    masks = [
        nonwhite,
        dark,
        colorful,
        red,
        green,
        blue,
        yellow,
        magenta,
        cyan,
    ]
    return np.array([mask.mean() for mask in masks], dtype=float)


def main() -> None:
    mission_data = json.loads(MISSION_DATA_PATH.read_text(encoding="utf-8"))
    missions = mission_data["missions"]
    features: dict[str, list[list[np.ndarray]]] = {}

    for mission in missions:
        image_path = IMAGE_DIR / f"{mission['no']}.jpg"
        with Image.open(image_path) as source:
            if source.size != (462, 242):
                raise RuntimeError(
                    f"Unexpected image size for mission {mission['no']}: {source.size}"
                )
            image = np.asarray(source.convert("RGB"))
        features[mission["no"]] = [
            [cell_features(image, column, row) for row in range(3)]
            for column in range(3)
        ]

    training: dict[tuple[int, str], list[np.ndarray]] = defaultdict(list)
    for mission in missions:
        expected = stopped_window(
            REEL_SEQUENCES["left"],
            LEFT_CODE_TO_BOTTOM[mission["left"]],
        )
        for row, symbol in enumerate(expected):
            training[(row, symbol)].append(features[mission["no"]][0][row])

    centroids = {
        key: np.median(values, axis=0)
        for key, values in training.items()
    }
    residuals = []
    for key, values in training.items():
        residuals.extend(value - centroids[key] for value in values)
    scale = np.std(np.asarray(residuals), axis=0)
    scale = np.maximum(
        scale,
        np.array([0.015, 0.015, 0.015, 0.015, 0.01, 0.01, 0.01, 0.008, 0.008]),
    )

    reel_windows = {
        reel: unique_windows(sequence)
        for reel, sequence in REEL_SEQUENCES.items()
    }

    def classify(no: str, column: int, reel: str):
        column_features = features[no][column]
        if max(value[0] for value in column_features) < ANY_OCCUPANCY_LIMIT:
            return None, None

        scores = []
        for window in reel_windows[reel]:
            score = sum(
                np.sum(((column_features[row] - centroids[(row, symbol)]) / scale) ** 2)
                for row, symbol in enumerate(window)
            )
            scores.append((float(score), window))
        scores.sort(key=lambda item: item[0])
        confidence_gap = scores[1][0] - scores[0][0]
        return scores[0][1], confidence_gap

    patterns = {}
    confidence_gaps = []
    wildcard_columns = 0
    left_validation_errors = []

    for mission in missions:
        no = mission["no"]
        expected_left = stopped_window(
            REEL_SEQUENCES["left"],
            LEFT_CODE_TO_BOTTOM[mission["left"]],
        )
        observed_left, _ = classify(no, 0, "left")
        if observed_left != expected_left:
            left_validation_errors.append(no)

        pattern = {"left": list(expected_left)}
        for column, reel in [(1, "middle"), (2, "right")]:
            window, confidence_gap = classify(no, column, reel)
            pattern[reel] = list(window) if window else None
            if window is None:
                wildcard_columns += 1
            else:
                confidence_gaps.append(confidence_gap)
        patterns[no] = pattern

    if left_validation_errors:
        raise RuntimeError(
            "Left reel validation failed: " + ", ".join(left_validation_errors)
        )
    minimum_gap = min(confidence_gaps)
    if minimum_gap < MIN_CONFIDENCE_GAP:
        raise RuntimeError(
            f"Pattern classification confidence is too low: {minimum_gap:.3f}"
        )

    payload = {
        "source": "assets/missions/*.jpg",
        "sourceVersion": mission_data["version"],
        "total": len(patterns),
        "symbolLabels": SYMBOL_LABELS,
        "reelWindows": {
            reel: [list(window) for window in windows]
            for reel, windows in reel_windows.items()
        },
        "reelSequences": REEL_SEQUENCES,
        "patterns": patterns,
        "validation": {
            "imageSize": [462, 242],
            "leftPatternsVerified": len(missions),
            "wildcardColumns": wildcard_columns,
            "minimumConfidenceGap": round(float(minimum_gap), 3),
        },
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "Wrote data/mission-patterns.json | "
        f"missions={len(patterns)} | wildcards={wildcard_columns} | "
        f"min_gap={minimum_gap:.3f}"
    )


if __name__ == "__main__":
    main()
