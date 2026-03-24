from datetime import timedelta
from enum import Enum

BOSS_RUSH_TIMER = timedelta(minutes=20)
HUSH_TIMER = timedelta(minutes=30)
FLOOR_SIZE = 169


# Possible types of room
class RoomType(Enum):
    ROOM_NULL = 0
    ROOM_DEFAULT = 1
    ROOM_SHOP = 2
    ROOM_TREASURE = 4
    ROOM_BOSS = 5


# Chapters in the game
class Chapter(Enum):
    ONE = 1
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7


# TODO: actually add the average room count for each chapter
ROOM_TYPE_VALUE: dict[RoomType, float] = {}
AVERAGE_ROOM_COUNT: dict[Chapter, int] = {}

for c in Chapter:
    AVERAGE_ROOM_COUNT[c] = min(c * 3.33 + 5, 20)


# Possible actions the agent can take from a given room
class DoorSlot(Enum):
    NONE = -1
    LEFT0 = 0
    UP0 = 1
    RIGHT0 = 2
    DOWN0 = 3
    LEFT1 = 4
    UP1 = 5
    RIGHT1 = 6
    DOWN1 = 7
