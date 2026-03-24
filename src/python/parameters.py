## Adjust these variables to tweak the model

## Reward given to the model for completing a given action
REWARDS = {
    "bosses": {
        "floor_boss": 1.0,
        "mom": 1.0,
        "moms_heart": 1.0,
        "chapter_5": 1.0,
        "chapter_6": 1.0,
        "mega_satan": 1.0,
        "delirium": 1.0,
    },
    "pickups": {"coin": 1.0, "key": 1.0, "bomb": 1.0, "battery": 1.0},
    "items": {"q0": 1.0, "q1": 1.0, "q2": 1.0, "q3": 1.0, "q4": 1.0},
    "progress": {
        "room": 1.0,
        "floor": 1.0,
    },
}

## Discount value for each door between the model and the desired room (state)
ROOM_DISCOUNT: float = 0.9

## How heavily weighted the distance from the starting room should be weighted for getting boss room
## probability (0.0 - 1.0)
BOSS_DISTANCE_WEIGHT: float = 0.5
