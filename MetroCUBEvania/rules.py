"""
Logic rules for MetroCUBEvania using RuleBuilder
"""
from typing import TYPE_CHECKING

from rule_builder import (
    Rule,
    Has,
    HasAll,
    Or,
    OptionFilter,
)

from .options import MedalHunt

if TYPE_CHECKING:
    from . import MCVWorld

# Define region connection rules
REGION_CONNECTION_RULES: dict[tuple[str, str], "Rule[MCVWorld]"] = {
    ("Menu", "main"): None,
    ("main", "grass"): Or(Has("springboards"), Has("double jump")),
    ("main", "upper ice"): Has("double jump"),
    ("grass", "lava"): HasAll("double jump", "dive"),
    ("upper ice", "lower ice"): Has("key"),
}

# Define location rules (only for locations with requirements)
LOCATION_RULES: dict[str, "Rule[MCVWorld]"] = {
    # main region
    "Springboards Medal": Has("double jump"),

    # grass region
    "Cage Medal": Has("key"),

    # lower ice region
    "victory": Has("dive"),
}

# Victory rule - changes based on medal_hunt option
VICTORY_RULE: "Rule[MCVWorld]" = (
    # If medal hunt is enabled, require all medals + dive
    HasAll(
        "dive",
        "starting medal",
        "springboards medal",
        "lava medal",
        "cage medal",
        "ice medal",
        options=[OptionFilter(MedalHunt, 1)]
    )
    # If medal hunt is disabled, just require dive
    | Has("dive", options=[OptionFilter(MedalHunt, 0)])
)


def set_rules(world: "MCVWorld") -> None:
    """Apply all rules to the world"""
    # Set region connection rules
    for (source, destination), rule in REGION_CONNECTION_RULES.items():
        entrance = world.get_entrance(f"{source} -> {destination}")
        if rule is not None:
            world.set_rule(entrance, rule)

    # Set location rules
    for location_name, rule in LOCATION_RULES.items():
        location = world.get_location(location_name)
        world.set_rule(location, rule)

    # Set victory condition
    world.set_completion_rule(VICTORY_RULE)
