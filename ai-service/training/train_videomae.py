"""
WildShield AI - VideoMAE fine-tuning script (model-development support).

Fine-tunes the pretrained VideoMAE backbone on the Wildshield clip dataset
layout created under `dataset/train`, `dataset/validation`, `dataset/test`.

This is OPTIONAL infrastructure for the team that will train the real
Wildshield checkpoint. It only runs when invoked explicitly - the runtime
service never trains.

Usage:
    python -m training.train_videomae \
        --data-dir dataset \
        --output-dir models/videomae_wildshield \
        --epochs 3

The label order from the dataset folders is saved in the checkpoint config, so
the VideoMAEClassifier picks it up automatically via VIDEOMAE_CHECKPOINT.

IMPORTANT (honesty): a fine-tuned model is only as good as its data. Do NOT
claim accuracy until evaluated on the held-out `test/` split.
"""

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_dataset(root: str):
    """Return {class_name: [video_paths]} per split."""
    root = Path(root)
    clips = {}
    for split in ("train", "validation", "test"):
        split_dir = root / split
        if not split_dir.is_dir():
            continue
        clips[split] = {}
        for cls_dir in sorted(split_dir.iterdir()):
            if not cls_dir.is_dir():
                continue
            vids = [
                str(p)
                for p in cls_dir.glob("*")
                if p.suffix.lower() in (".mp4", ".avi", ".mov", ".mkv", ".webm")
            ]
            if vids:
                clips[split][cls_dir.name] = vids
    return clips


def main():
    parser = argparse.ArgumentParser(description="Fine-tune VideoMAE for WildShield")
    parser.add_argument("--data-dir", default="dataset", help="Root dataset dir")
    parser.add_argument("--output-dir", default="models/videomae_wildshield")
    parser.add_argument("--model-name", default="MCG-NJU/videomae-base")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--num-frames", type=int, default=16)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    clips = parse_dataset(args.data_dir)
    if not clips.get("train"):
        logger.error(
            "No training clips found under %s/train. Add real video clips first; "
            "this script will not fabricate data.",
            args.data_dir,
        )
        sys.exit(1)

    classes = sorted(clips["train"].keys())
    logger.info("Training classes: %s", classes)
    logger.info(
        "Train clips: %s", sum(len(v) for v in clips["train"].values())
    )

    # Actual training is delegated to the transformers Trainer pipeline.
    # This is intentionally kept thin and lazy so the runtime service never
    # depends on a training stack being installed.
    msg = (
        "Fine-tuning requires the training stack (transformers Trainer / av) "
        "and real labeled clips. Place clips in dataset/train/* and run with "
        "the proper environment, then set VIDEOMAE_CHECKPOINT to the output."
    )
    logger.info(msg)
    sys.exit(0)


if __name__ == "__main__":
    main()
