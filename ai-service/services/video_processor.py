"""Video processor - IMPLEMENTED IN PHASE 5.

Will handle:
    - Opening uploaded videos with OpenCV
    - Metadata extraction (duration, fps, frame count)
    - Frame sampling at a configurable FRAME_INTERVAL (not every frame)
    - Snapshot extraction for important detections
    - Optional annotated-video rendering
"""
