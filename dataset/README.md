# WildShield AI - VideoMAE Fine-tuning Dataset Layout

This directory is the **structure** for training/evaluating a Wildshield-specific
VideoMAE action classifier. It intentionally contains **no fake training data**
- each class folder is empty (with a `.gitkeep`) until real, representative
video clips are added.

## Class folders

Each clip must be placed in the folder matching its single label:

| Folder                  | Meaning                                        |
|-------------------------|------------------------------------------------|
| `normal`                | Ordinary wildlife/forest footage, no incident  |
| `animal_attack`         | An animal attacking a human (or aggression)    |
| `human_attack`          | A human attacking an animal                    |
| `poaching`              | Poaching activity                              |
| `animal_capture`        | Trapping / capturing an animal                 |
| `weapon_use`            | A weapon being used in context                 |
| `suspicious_activity`   | Ambiguous / suspicious behaviour               |

## Splits

- `train/` - clips used to fine-tune the model.
- `validation/` - clips used during training to monitor generalization.
- `test/` - a held-out, representative set used ONLY for final evaluation.
  Report accuracy/precision/recall on this split; this is what the system is
  honest about.

## Requirements for honest results

1. No training data is fabricated. Populate folders from real recordings only.
2. Keep class distribution representative of real surveillance footage.
3. A held-out `test/` set must never be used for training/validation.
4. Do not claim accuracy until the fine-tuned model has been evaluated on the
   `test/` split.

## Loading a trained checkpoint

Once trained (e.g. via `transformers` `VideoMAEForVideoClassification`
fine-tuning on this ImageFolder-style layout), point the backend at it:

```
VIDEOMAE_CHECKPOINT=/path/to/your_finetuned_checkpoint
VIDEOMAE_NUM_FRAMES=16
```

The classifier (`ai-service/models/videomae_classifier.py`) will then run in
`finetuned_wildshield` mode and use these classes for real classification.
