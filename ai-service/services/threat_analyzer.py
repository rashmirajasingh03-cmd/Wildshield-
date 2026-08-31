"""
WildShield threat analyzer — ACTION/INTERACTION based.

DETECTION != THREAT.
An animal, human, or weapon appearing in the video is NEVER an alert by itself.
Only dangerous ACTIONS/INTERACTIONS between actors produce an alert.

An attack is signalled by TEMPORAL MOTION, not by static object presence:

  approach  ->  the distance between two actors persistently shrinks over
               consecutive sampled frames
  contact   ->  actor boxes overlap or reach a small relative distance
               (touching / engaging)

Threat types detected (match the product rules):

  animal_attacking_human      any animal approaches + engages a human
  human_attacking_animal      a human approaches + engages an animal (physical)
  weapon_attack_on_animal     a weapon (arrow/knife/gun/...) engages an animal
  weapon_attack_on_human      a weapon engages a human
  animal_vs_animal_aggression a predator aggressively engages another animal
  animal_endangered_equipment a trap/snare engaged with an animal
  environmental_harm          fire engaged near an animal

NOT threats: animal walking alone, animal resting/eating, a person simply
near an animal without engagement, a weapon present without a victim, etc.

The verdict + incident structure is unchanged so the frontend and backend keep
working; each incident now also carries the structured AI fields
(threat_type, confidence, objects, action) requested by the spec.
"""

import logging
from dataclasses import asdict, dataclass

from detection.classifier import (
    TRAP_CLASSES,
    ThreatClassifier,
    is_wildlife,
    is_human,
    is_weapon,
    is_environmental,
    PREDATOR_CLASSES,
)
from detection.detector import Detection

logger = logging.getLogger(__name__)

MESSAGE_NO_THREAT = "No animal attack, harm, or abuse was detected."
MESSAGE_HARM = "An animal harm/attack event was detected in this video."

# Relative distance ratio at which two objects count as "engaged/contact".
CONTACT_RATIO = 0.55
# Minimum relative-distance decrease per frame to count as an approach step.
APPROACH_EPS = 0.03
# Consecutive decreasing steps required before contact for a physical attack.
MIN_APPROACH_STEPS = 2

INCIDENT_TYPE = {
    "animal_attacking_human": "Animal attacking human",
    "human_attacking_animal": "Human attacking animal",
    "weapon_attack_on_animal": "Animal attacked with weapon",
    "weapon_attack_on_human": "Human attacked with weapon",
    "animal_vs_animal_aggression": "Animal aggression toward another animal",
    "animal_endangered_equipment": "Animal endangered by trap/weapon",
    "environmental_harm": "Animal endangered by fire",
    "weapon_detected_alone": "Weapon detected in video",
}

INCIDENT_ACTION = {
    "animal_attacking_human": "attack",
    "human_attacking_animal": "attack",
    "weapon_attack_on_animal": "weapon_attack",
    "weapon_attack_on_human": "weapon_attack",
    "animal_vs_animal_aggression": "aggression",
    "animal_endangered_equipment": "endangerment",
    "environmental_harm": "endangerment",
    "weapon_detected_alone": "weapon_presence",
}

INCIDENT_RANK = {
    # Priority for reporting. Taken directly (first actor signature wins).
    # Weapon/human-attack incidents are the most specific and outrank generic
    # animal-vs-animal. Animal-vs-animal outranks animal-attacks-human because
    # a co-detected "person" is often only loosely present in a wildlife fight;
    # genuine animal aggression is a more reliable signal than a person
    # proximity that may stem from a false/loose human detection.
    "weapon_attack_on_human": 0,
    "weapon_attack_on_animal": 1,
    "human_attacking_animal": 2,
    "animal_attacking_human": 4,
    "animal_vs_animal_aggression": 3,
    "animal_endangered_equipment": 5,
    "environmental_harm": 6,
    "weapon_detected_alone": 7,
}


def _fmt_timestamp(seconds: float) -> str:
    seconds = max(0, int(seconds or 0))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def _centroid(bbox: dict) -> tuple[float, float]:
    return (
        (bbox["x1"] + bbox["x2"]) / 2.0,
        (bbox["y1"] + bbox["y2"]) / 2.0,
    )


def _size(bbox: dict) -> float:
    return max(abs(bbox["x2"] - bbox["x1"]), abs(bbox["y2"] - bbox["y1"]))


def _rel_dist(bbox_a: dict, bbox_b: dict) -> float:
    """Centre distance normalized by the combined object size (0 = same spot)."""
    (ax, ay) = _centroid(bbox_a)
    (bx, by) = _centroid(bbox_b)
    d = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
    combined = _size(bbox_a) + _size(bbox_b)
    return d / max(1e-6, combined)


def _overlaps(bbox_a: dict, bbox_b: dict) -> bool:
    return not (
        bbox_a["x2"] <= bbox_b["x1"]
        or bbox_b["x2"] <= bbox_a["x1"]
        or bbox_a["y2"] <= bbox_b["y1"]
        or bbox_b["y2"] <= bbox_a["y1"]
    )


def _engaged(bbox_a: dict, bbox_b: dict) -> bool:
    return _overlaps(bbox_a, bbox_b) or _rel_dist(bbox_a, bbox_b) <= CONTACT_RATIO


def _trail_dist(points: list[tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0
    (x0, y0), (x1, y1) = points[0], points[-1]
    return ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5


def _mover_side(att_points, vic_points) -> str:
    """Which side really moved toward the engagement ('attacker'/'victim'/'tie')."""
    a = _trail_dist(att_points)
    v = _trail_dist(vic_points)
    if v > a * 1.25:
        return "victim"
    if a > v * 1.25:
        return "attacker"
    return "tie"


@dataclass
class _Candidate:
    kind: str
    attacker_filter: callable   # list[Detection] -> list[Detection] (potential attackers)
    victim_filter: callable     # list[Detection] -> list[Detection] (potential victims)
    weapon_based: bool          # engagement driven by a weapon/trap box
    static_hazard: bool = False # engagement is proximity alone (e.g. fire)
    other_animal_pool: bool = False  # when True, victims exclude the attacker itself

    def attacker(self, dets: list[Detection]) -> list[Detection]:
        out = [d for d in dets if self.attacker_filter(d)]
        if self.other_animal_pool and self.victim_filter is not None:
            # victim set is computed separately below
            pass
        return out

    def victim(self, dets: list[Detection], attackers: list[Detection]) -> list[Detection]:
        victims = [d for d in dets if self.victim_filter(d)]
        if self.other_animal_pool:
            # Keep the full animal pool as victims; identical detector objects
            # are excluded in the analysis loop so two distinct animals
            # (including predator-vs-predator fights) can register engagement.
            pass
        return victims


@dataclass
class ThreatAnalyzer:
    min_approach_steps: int = MIN_APPROACH_STEPS

    def analyze(self, detections: list[Detection]) -> dict:
        classifier = ThreatClassifier()
        annotated = classifier.classify_all(list(detections))

        by_frame: dict[int, list[Detection]] = {}
        for d in annotated:
            by_frame.setdefault(d.frame_index, []).append(d)
        frames_sorted = sorted(by_frame)

        def is_weapon_d(d):
            return is_weapon(d.label)

        def is_trap_d(d):
            return d.label in TRAP_CLASSES

        def is_predator_d(d):
            return d.label in PREDATOR_CLASSES

        def is_animal_d(d):
            return is_wildlife(d.label)

        def is_human_d(d):
            return is_human(d.label)

        def is_environmental_d(d):
            return is_environmental(d.label)

        candidates = [
            _Candidate(
                "weapon_attack_on_human", is_weapon_d, is_human_d,
                weapon_based=True, other_animal_pool=False,
            ),
            _Candidate(
                "weapon_attack_on_animal", is_weapon_d, is_animal_d,
                weapon_based=True, other_animal_pool=False,
            ),
            _Candidate(
                "animal_attacking_human", is_animal_d, is_human_d,
                weapon_based=False, other_animal_pool=False,
            ),
            _Candidate(
                "human_attacking_animal", is_human_d, is_animal_d,
                weapon_based=False, other_animal_pool=False,
            ),
            _Candidate(
                "animal_vs_animal_aggression", is_predator_d, is_animal_d,
                weapon_based=False, other_animal_pool=True,
            ),
            _Candidate(
                "environmental_harm", is_environmental_d, is_animal_d,
                weapon_based=False, static_hazard=True,
            ),
        ]

        findings = []  # per-candidate evidence across the whole clip

        for cand in candidates:
            dist_series: list[float | None] = []
            contact_frames: list[int] = []
            weapon_frames: list[int] = []
            timestamps: list[float] = []
            involved_labels: list[str] = []
            att_points: list[tuple[float, float]] = []
            vic_points: list[tuple[float, float]] = []
            avg_conf = 0.0
            conf_count = 0

            for fidx in frames_sorted:
                dets = by_frame[fidx]
                attackers = cand.attacker(dets)
                victims = cand.victim(dets, attackers)

                if not attackers or not victims:
                    dist_series.append(None)
                    continue

                # engagement between an attacker and a victim in this frame
                engaged_here = any(
                    _engaged(a.bbox, v.bbox) for a in attackers for v in victims
                )
                close_pairs = [
                    (a, v, _rel_dist(a.bbox, v.bbox))
                    for a in attackers for v in victims
                    if a is not v
                ]
                if close_pairs:
                    min_dist = min(p[2] for p in close_pairs)
                    dist_series.append(min_dist)
                    nearest = min(close_pairs, key=lambda p: p[2])
                    att_points.append(_centroid(nearest[0].bbox))
                    vic_points.append(_centroid(nearest[1].bbox))

                    if engaged_here:
                        contact_frames.append(fidx)
                        for det in (nearest[0], nearest[1]):
                            if det.label not in involved_labels:
                                involved_labels.append(det.label)
                            avg_conf += det.confidence
                            conf_count += 1
                        timestamps.append(min(d.timestamp for d in (nearest[0], nearest[1])))
                else:
                    dist_series.append(None)

                # weapon context for weapon_based candidates
                if cand.weapon_based:
                    victim_dets = victims
                    if any(
                        _engaged(w.bbox, v.bbox)
                        for w in attackers for v in victim_dets
                    ):
                        weapon_frames.append(fidx)

            if not contact_frames:
                continue

            first_contact = min(contact_frames)
            first_contact_series_idx = frames_sorted.index(first_contact)

            approach_steps = 0
            i = first_contact_series_idx
            while (
                i >= 1
                and dist_series[i] is not None
                and dist_series[i - 1] is not None
                and (dist_series[i] - dist_series[i - 1]) < -APPROACH_EPS
            ):
                approach_steps += 1
                i -= 1

            sustained_contact = len(contact_frames) >= 2

            # Decide whether this candidate engaged in a real attack.
            if cand.weapon_based or cand.static_hazard:
                # A weapon/trap touching its victim, or a hazard (fire) in
                # contact with an animal, is itself an attack signal.
                legitimate = bool(contact_frames)
                legit_frames = contact_frames
            else:
                # Physical attack requires approach motion OR sustained contact.
                legitimate = (
                    approach_steps >= self.min_approach_steps
                    or sustained_contact
                )
                legit_frames = contact_frames

            if not legitimate:
                continue

            # For weapon_based attacks a trap is reported as equipment
            # endangerment rather than a weapon strike.
            kind = cand.kind
            if cand.weapon_based and any(
                d.label in TRAP_CLASSES
                for fidx in legit_frames for d in by_frame[fidx]
                if is_weapon_d(d)
            ):
                if kind == "weapon_attack_on_animal":
                    kind = "animal_endangered_equipment"

            # Build incident evidence
            evidence_ts = timestamps[0] if timestamps else 0.0
            avg_conf = avg_conf / max(1, conf_count)

            # Which side actually moved toward the engagement. This
            # disambiguates who is THE attacker (animal vs human) when a person
            # and an animal end up close together.
            mover = _mover_side(att_points, vic_points)

            confidence = (
                0.55
                + 0.10 * min(approach_steps, self.min_approach_steps)
                + 0.05 * min(len(contact_frames), 6)
                + (0.10 if cand.weapon_based else 0.0)
                + 0.10 * avg_conf
            )
            confidence = round(min(0.99, max(0.0, confidence)), 2)

            findings.append({
                "kind": kind,
                "incident_type": INCIDENT_TYPE[kind],
                "action": INCIDENT_ACTION[kind],
                "frame": first_contact,
                "timestamp": _fmt_timestamp(evidence_ts),
                "prim_timestamp": evidence_ts,
                "persisted_frames": len(legit_frames),
                "approach_steps": approach_steps,
                "confidence": confidence,
                "mover": mover,
                "objects": involved_labels,
                "involved": {
                    "person": sorted({l for l in involved_labels if is_human(l)}),
                    "animal": sorted({l for l in involved_labels if is_wildlife(l)}),
                    "weapon": sorted({l for l in involved_labels if is_weapon(l)}),
                },
            })

        # --- Weapon-alone detection ---
        # If no engagement-based incidents were found but a weapon IS present
        # in the video, flag it as a threat. The mere presence of a weapon
        # (gun, knife, arrow, trap, etc.) near wildlife constitutes a threat
        # regardless of whether contact with a victim is observed.
        has_engagement_incidents = any(
            f["kind"] != "weapon_detected_alone" for f in findings
        )
        if not has_engagement_incidents:
            all_weapons = sorted(
                {d.label for d in annotated if is_weapon(d.label)}
            )
            if all_weapons:
                weapon_frames_seen = sorted(
                    {d.frame_index for d in annotated if is_weapon(d.label)}
                )
                first_weapon_frame = weapon_frames_seen[0] if weapon_frames_seen else 0
                first_weapon_ts = min(
                    (d.timestamp for d in annotated if is_weapon(d.label)),
                    default=0.0,
                )
                avg_weapon_conf = sum(
                    d.confidence for d in annotated if is_weapon(d.label)
                ) / max(1, sum(1 for d in annotated if is_weapon(d.label)))

                findings.append({
                    "kind": "weapon_detected_alone",
                    "incident_type": INCIDENT_TYPE["weapon_detected_alone"],
                    "action": INCIDENT_ACTION["weapon_detected_alone"],
                    "frame": first_weapon_frame,
                    "timestamp": _fmt_timestamp(first_weapon_ts),
                    "prim_timestamp": first_weapon_ts,
                    "persisted_frames": len(weapon_frames_seen),
                    "approach_steps": 0,
                    "confidence": round(min(0.99, 0.55 + 0.10 * avg_weapon_conf), 2),
                    "objects": all_weapons,
                    "involved": {
                        "person": sorted(
                            {d.label for d in annotated if is_human(d.label)}
                        ),
                        "animal": sorted(
                            {d.label for d in annotated if is_wildlife(d.label)}
                        ),
                        "weapon": all_weapons,
                    },
                })

        # --- Resolve directional ambiguity between animal-attacks-human and
        # human-attacks-animal. A person and an animal ending up close together
        # can legitimately trigger BOTH candidates (same physical proximity,
        # opposite attacker). Use the observed motion direction to keep only the
        # candidate whose designated attacker actually moved toward the other.
        def _mover_agrees(f):
            # The candidate is kept when its designated attacker (not the
            # victim) is the one that moved toward the engagement.
            return f["mover"] in ("attacker", "tie")

        has_proximity_pair = any(
            f["kind"] in ("animal_attacking_human", "human_attacking_animal")
            for f in findings
        )
        if has_proximity_pair:
            resolutions = []
            for f in findings:
                if f["kind"] in ("animal_attacking_human", "human_attacking_animal"):
                    if _mover_agrees(f):
                        resolutions.append(f)
                else:
                    resolutions.append(f)
            if any(
                f["kind"] in ("animal_attacking_human", "human_attacking_animal")
                for f in resolutions
            ):
                findings = resolutions

        incidents = self._rank_and_dedupe(findings, frames_sorted, by_frame)

        detections_out = [asdict(d) for d in annotated]

        if not incidents:
            return {
                "verdict": "NO_THREAT",
                "message": MESSAGE_NO_THREAT,
                "incident": None,
                "incidents_count": 0,
                "detections": detections_out,
            }

        primary = incidents[0]
        description = self._describe(primary)
        incident = {
            "incident_type": primary["incident_type"],
            "threat_type": primary["kind"],
            "description": description,
            "timestamp": primary["timestamp"],
            "frame": primary["frame"],
            "kind": primary["kind"],
            "persisted_frames": primary["persisted_frames"],
            "confidence": primary["confidence"],
            "objects": primary["objects"],
            "action": primary["action"],
            "involved": primary["involved"],
        }

        return {
            "verdict": "ANIMAL_HARM_DETECTED",
            "message": MESSAGE_HARM,
            "incident": incident,
            "incidents_count": len(incidents),
            "detections": detections_out,
        }

    @staticmethod
    def _rank_and_dedupe(findings, frames_sorted, by_frame):
        # A single clip may produce several findings; dedupe same-kind findings
        # that share nearby frames and keep the strongest.
        # Primary sort is by semantic priority (INCIDENT_RANK) so the most
        # specific/accurate incident type is always reported when several
        # candidates coexist; confidence breaks ties within a category. This
        # avoids reporting a weak "animal attacks human" when the real event
        # is animal-vs-animal aggression or a person attacking an animal.
        findings.sort(key=lambda f: (
            INCIDENT_RANK.get(f["kind"], 9),
            -f["confidence"],
        ))
        deduped = []
        for f in findings:
            if any(
                e["kind"] == f["kind"]
                and abs(e["frame"] - f["frame"]) <= max(3, f["persisted_frames"])
                for e in deduped
            ):
                continue
            deduped.append(f)
        return deduped

    @staticmethod
    def _describe(incident: dict) -> str:
        objs = [str(o).replace("_", " ") for o in incident["objects"]]
        objs_text = " and ".join(objs) if objs else "an animal"
        if incident["kind"] == "animal_attacking_human":
            return f"Detected aggressive interaction: {objs_text} engaged with a human."
        if incident["kind"] == "human_attacking_animal":
            return f"Detected a human physically attacking {objs_text}."
        if incident["kind"] in ("weapon_attack_on_animal", "animal_endangered_equipment"):
            return f"Detected {objs_text} involved with a weapon or trap."
        if incident["kind"] == "weapon_attack_on_human":
            return "Detected a weapon being used against a human."
        if incident["kind"] == "animal_vs_animal_aggression":
            return f"Detected aggressive behavior between animals: {objs_text}."
        if incident["kind"] == "environmental_harm":
            return "Detected an animal at risk from fire."
        if incident["kind"] == "weapon_detected_alone":
            return f"Detected a weapon ({', '.join(str(o).replace('_', ' ') for o in incident['objects'])}) in the video. Presence of a weapon constitutes a threat regardless of whether contact with a victim is observed."
        return f"Detected a harmful interaction: {objs_text}."