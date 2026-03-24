from datetime import timedelta

from floor import Floor
from parameters import ROOM_DISCOUNT
from room import ItemPool, Room

# each room is a 'state', but they have to be computed dynamically based on probabilities
# e.g. the agent only knows the type of the room, and uses that to calculate the reward based on it's possible contents


# regular room -> isn't valuable alone, but can provide value by leading to a room with a reward
# therefore it's value is sum(pk * rk) * d, where pk is the probability for room type k and rk is that room type's reward/value

# treasure room -> has p0, p1, p2, p3, p4 as chances for Q0-4 items
# reward for treasure room is sum(pk * rk) * d, where rk is the reward for collecting the item, and d is the discount given based on the distance from the room

# boss room -> value is a combination of both the item gotten by beating the boss, and the opportunity to go to the next floor
# next floor's reward is determined by the following parameters:
#   time remaining until next time-gated goal (e.g. boss rush/hush) - inverse relationship, encourage the agent to go faster to reach time-gated bosses
#   amount of current floor cleared/special rooms cleared - if there are still many undiscovered (or uncleared) rooms on this floor, we might want to stay to get them

# shop -> has item probabilities based on pool, similar to boss/treasure
# also gets adjusted based on the agent's current coin count
# if time, implement extra reward based on bombing donation machine/shopkeeper, and -reward for potential of greed fight


# This class contains all of the current state information
class Agent:
    timer: timedelta
    pickups: dict = {
        "coins": 0,
        "bombs": 0,
        "keys": 0,
    }
    current_room: Room
    floor: Floor

    # Calculates the value of a given room based on it's reward and the discount based on distance from the agent
    def room_value(self, room: Room) -> float:
        # room value
        v = room.reward(self)
        # discount for time it takes to reach this room
        d = self.distance_between(self.current_room, room) * ROOM_DISCOUNT

        return v * d


treasure_pool = ItemPool.new({9.19, 33.44, 32.60, 20.47, 4.29})
shop_pool = ItemPool.new([])

# we need to map out the floor layout. known tiles are simple
# unknown tiles need to have a value made by combining the probability of each possible state of that tile;
# e.g. V(t) = p(t = n) * rn + p(t = b) * rb + p(t = i) * ri
# we then use the taxicab distance between the tile and the agent's current tile to discount the reward (e.g. R(t) = V(t) - dist * discount)
# we repeat for every tile in the floor to assign a reward to every tile, including discounting

# three tile states:
# unknown
# unvisited
# visited

# unknown tiles will be assigned value based on above
# unvisited tiles will be assigned value based on their room type; if it's a normal room, it's value is based on the potential value of the surrounding unknown tiles
# the agent then chooses an tile based on it's reward and the navigation distance between itself and the tile

# so: info for a tile:
# unknown/known -> the presence of a Room object in the given index
# visited: boolean
# type: RoomType
#
# then we need methods that operate on a tile/room:
# calculate value (without discounting)
#   visited tile: 0
#   unknown tile: sum(P(T=t)*Rt), probability of the room being a given type * the reward for that room type
#   unvisited tile: sum of neighbouring tiles' values, excluding unvisited tiles, or just the reward for that room type
