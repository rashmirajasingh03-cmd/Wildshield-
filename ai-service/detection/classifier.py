"""
Threat classifier for WildShield AI.

OBJECT DETECTION and THREAT DETECTION are SEPARATE stages:

- An animal detected alone          => OBSERVATION (cat: wildlife), threat level NONE
- A person detected alone           => OBSERVATION (cat: human_presence), threat level NONE
- A weapon/trap/fire detected       => THREAT
- A person + animal + weapon co-    => "human attacking wildlife" THREAT (highest severity)
  occurring in the same context

The taxonomy below is label-based and label-agnostic to the underlying YOLO
model: whichever labels a configured model produces are classified here.
The stock COCO model (yolo11n.pt) only detects a fraction of these labels
(person, some animals, knife). A custom wildlife/weapon model loaded via
MODEL_PATH unlocks the rest (baboon, arrow, gun, axe, trap, fire, ...).
"""

import logging
from dataclasses import dataclass

from .detector import Detection

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ANIMAL / WILDLIFE classes. Presence of an animal is NEVER a threat by itself.
# ---------------------------------------------------------------------------
WILDLIFE_CLASSES = {
    # COCO-detected wildlife
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant",
    "bear", "zebra", "giraffe",
    # Primates (custom models)
    "baboon", "monkey", "ape", "gorilla", "chimpanzee", "orangutan", "lemur",
    "macaque", "marmoset", "capuchin",
    # Hoofed mammals
    "deer", "elk", "moose", "antelope", "gazelle", "wildebeest", "bison",
    "buffalo", "warthog", "boar", "wild_boar", "pig", "impala", "caribou",
    "rhinoceros", "rhino", "hippopotamus", "hippo", "gemsbok",
    # Big cats / predators
    "lion", "tiger", "leopard", "cheetah", "panther", "jaguar", "cougar",
    "puma", "bobcat", "lynx", "hyena", "wolf", "fox", "jackal", "wild_dog",
    "dingo",
    # Reptiles / amphibians
    "crocodile", "alligator", "caiman", "snake", "python", "cobra", "lizard",
    "iguana", "tortoise", "turtle",
    # Birds
    "peacock", "peafowl", "parrot", "eagle", "hawk", "vulture", "owl",
    "falcon", "stork", "crane", "flamingo", "hornbill", "toucan",
    "kingfisher",
    # Small mammals
    "rabbit", "hare", "squirrel", "porcupine", "mongoose", "meerkat",
    "badger", "otter", "mole_rat", "armadillo", "pangolin",
    # Semiaquatic
    "seal", "dolphin", "manatee", "walrus",
}

# ---------------------------------------------------------------------------
# HUMAN classes. A person is an observation, NOT a threat, unless the attack
# logic (analyzer) confirms an attack in progress.
# ---------------------------------------------------------------------------
HUMAN_CLASSES = {"person", "human", "man", "woman", "child", "ranger"}

# ---------------------------------------------------------------------------
# HUMAN ATTACK / co-existence categories (declared in classifier but the real
# threat determination for persons happens in the analyzer).
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# WEAPON / projectiles. Their mere presence is a threat.
# ---------------------------------------------------------------------------
GUN_CLASSES = {
    "gun", "guns", "pistol", "handgun", "revolver", "rifle", "shotgun",
    "assault_rifle", "submachine_gun", "machine_gun", "sniper_rifle",
    "hunting_rifle", "air_rifle", "firearm",
}
EDGE_WEAPON_CLASSES = {
    "knife", "knives", "switchblade", "dagger", "machete", "sword", "sabre",
    "bayonet", "blade", "cleaver",
}
IMPACT_WEAPON_CLASSES = {
    "axe", "hatchet", "club", "mace", "bat", "baseball_bat", "hammer",
    "pike", "truncheon", "batton",
}
PROJECTILE_CLASSES = {
    "arrow", "arrows", "bow", "longbow", "crossbow", "bolt", "arrowhead",
    "quiver", "spear", "javelin", "harpoon", "lance", "trident", "slingshot",
    "blowgun", "dart",
}
TRAP_CLASSES = {
    "trap", "traps", "snare", "snares", "snare_trap", "cage_trap",
    "leg_hold_trap", "net", "net_trap", "cage", "wire_trap", "pitfall",
}

WEAPON_CLASSES = (
    GUN_CLASSES | EDGE_WEAPON_CLASSES | IMPACT_WEAPON_CLASSES
    | PROJECTILE_CLASSES | TRAP_CLASSES
)

# Weapon threats and their severity/category
WEAPON_LEVELS = {
    **{c: ("CRITICAL", "firearm") for c in GUN_CLASSES},
    **{c: ("HIGH", "edged_weapon") for c in EDGE_WEAPON_CLASSES},
    **{c: ("HIGH", "impact_weapon") for c in IMPACT_WEAPON_CLASSES},
    **{c: ("HIGH", "projectile") for c in PROJECTILE_CLASSES},
    **{c: ("CRITICAL", "poaching_equipment") for c in TRAP_CLASSES},
}

# ---------------------------------------------------------------------------
# ENVIRONMENTAL THREATS
# ---------------------------------------------------------------------------
ENVIRONMENTAL_CLASSES = {
    "fire", "fire_flames", "flame", "flames", "wildfire", "forest_fire",
    "campfire", "burning", "smoke", "smokes", "fire_smoke", "ember",
}
ENVIRONMENTAL_LEVELS = {
    "fire": ("CRITICAL", "environmental_threat"),
    "fire_flames": ("CRITICAL", "environmental_threat"),
    "flame": ("CRITICAL", "environmental_threat"),
    "flames": ("CRITICAL", "environmental_threat"),
    "wildfire": ("CRITICAL", "environmental_threat"),
    "forest_fire": ("CRITICAL", "environmental_threat"),
    "campfire": ("MEDIUM", "environmental_threat"),
    "burning": ("HIGH", "environmental_threat"),
    "smoke": ("MEDIUM", "environmental_threat"),
    "smokes": ("MEDIUM", "environmental_threat"),
    "fire_smoke": ("HIGH", "environmental_threat"),
    "ember": ("MEDIUM", "environmental_threat"),
}

# ---------------------------------------------------------------------------
# VEHICLES - observations in a wildlife/forest context (not automatic threats)
# ---------------------------------------------------------------------------
VEHICLE_CLASSES = {
    "car", "motorcycle", "truck", "bus", "boat", "airplane", "bicycle",
    "train", "scooter", "quad", "atv", "unmanned_aerial_vehicle", "drone",
    "helicopter",
}


def _categorize(label: str) -> tuple[str, str, str]:
    """
    Returns (threat_level, threat_category, object_role) for a detected label.

    object_role is one of: 'wildlife', 'human', 'weapon', 'environmental',
    'vehicle', 'other'
    """
    label_lower = label.strip().lower()

    # Threat items first
    if label_lower in WEAPON_CLASSES:
        level, cat = WEAPON_LEVELS.get(label_lower, ("HIGH", "weapon"))
        return (level, cat, "weapon")

    if label_lower in ENVIRONMENTAL_CLASSES:
        level, cat = ENVIRONMENTAL_LEVELS.get(
            label_lower, ("HIGH", "environmental_threat")
        )
        return (level, cat, "environmental")

    # Observations (never threats by themselves)
    if label_lower in WILDLIFE_CLASSES:
        return ("NONE", "wildlife", "wildlife")

    if label_lower in HUMAN_CLASSES:
        return ("NONE", "human_presence", "human")

    if label_lower in VEHICLE_CLASSES:
        return ("NONE", "vehicle", "vehicle")

    # Unknown / other observed object
    return ("NONE", "observed_object", "other")


# Labels that participants in the "person attacking animal" reasoning care about
def is_wildlife(label: str) -> bool:
    return _categorize(label)[2] == "wildlife"


def is_human(label: str) -> bool:
    return _categorize(label)[2] == "human"


def is_weapon(label: str) -> bool:
    return _categorize(label)[2] == "weapon"


def is_environmental(label: str) -> bool:
    return _categorize(label)[2] == "environmental"


@dataclass
class ThreatClassifier:
    custom_rules: dict | None = None

    def classify(self, detection: Detection) -> Detection:
        level, category, _role = _categorize(detection.label)
        detection.threatLevel = level
        detection.threatCategory = category
        return detection

    def classify_all(self, detections: list[Detection]) -> list[Detection]:
        return [self.classify(d) for d in detections]