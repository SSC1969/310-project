from enum import Enum
from typing import Dict, Self

import numpy as np
from consts import AVERAGE_ROOM_COUNT, Chapter, DoorSlot, RoomType
from room import Room


class Floor:
    chapter: Chapter
    # rooms are stored by grid index
    rooms: [[Room]]
    types_discovered: dict[RoomType, bool]
    special_room_positions: dict[RoomType, (int, int)]
    rooms_cleared: int
    starting_position: (int, int)

    def new(chapter: Chapter) -> Self:
        floor = Floor
        floor.chapter = chapter

        return floor

    def add_room(self, index: int, room: Room):
        self.rooms[index] = room

    def calculate_treasure_chance(self) -> float:
        return 1.0 / AVERAGE_ROOM_COUNT[self.chapter]

    def calculate_boss_chance(self, room: Room) -> float:
        return 1.0

    def calculate_shop_chance(self) -> float:
        return 1.0 / AVERAGE_ROOM_COUNT[self.chapter]

    def get_room_actions(self):
        # states = room types
        # action = go a direction
        # transitions is (current room, direction, that direction leads to room type)
        # e.g. for the map layout (assuming we can only see rooms bordering c):
        """
        -i-
        nc-
        bn-
        """
        # we'd have the transitions:
        # t[up] = [c: [item: 1, boss: 0], n: [], ...]
        # t[left] = [item: 0, boss: 0.1]
        # t[right] = [item: 0, boss: 0]
        # t[down] = [item: 0, boss: 0.1]
        """
        t = [
            (up) [x]
        ]
        """
        # so:
        # 1. we go through each discovered room and get p(rk) for each room type in each direction
        # 2. we map it into a numpy array with shape (d, r, r') where r is the room, d is the direction,
        #    and r' is the newly-entered room

        # no, i need the transition function of (A, R, R'), where R and R' are all the possible grid
        # spaces in the map (13x13). then, the reward for each grid space is set based on it's type (if known)
        # or the chance that it is valuable

        transitions = np.zeros((len(DoorSlot), 169, 169))

        # iterate through actions (possible entrances)
        for slot in DoorSlot:
            # figure out what happens when you apply that action to each possible state (location on the floor map)
            for row in range(13):
                for col in range(13):
                    # we want to set the probability of reaching the neighbouring rooms to 1,
                    # everything else can stay at zero
                    if self.rooms[row][col] is not None:
                        i1: int = self.rooms[row][col].grid_index
                        i2: int = self.rooms[row][col].neighbour_index[slot]

                        transitions[slot, i1, i2] = 1.0

        # since the agent doesn't know where the boss is, it will calculate a probability
        # based on rooms explored and distance from the starting location

        return transitions
