"""Object detector - IMPLEMENTED IN PHASE 5.

Will wrap an Ultralytics YOLO model and expose:

    detect(frame) -> list[Detection]

Design notes:
    - The initially supported categories are: person, animal, vehicle,
      knife, gun, backpack, trap.
    - A standard pretrained YOLO checkpoint can NOT reliably detect every
      weapon, species or trap. This module is therefore written so the
      MODEL_PATH / class mapping can be swapped for a custom-trained
      wildlife/security model without changing callers.
    - Species-specific detection (tiger, elephant, leopard, pangolin, ...)
      stays separate from generic "animal" detection to avoid false claims.
"""
