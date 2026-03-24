import { DisplayFlag, RoomType } from "isaac-typescript-definitions";
import {
  CallbackCustom,
  getFloorDisplayFlags,
  getRoomDisplayFlags,
  getRoomShape,
  getRoomShapeAdjacentGridIndexes,
  getRoomsInsideGrid,
  getRoomType,
  getRoomVisitedCount,
  hasFlag,
  isRoomVisible,
  logArray,
  ModCallbackCustom,
  ModFeature,
  sumMap,
} from "isaacscript-common";
import {
  FLOOR_SIZE,
  get_number_of_rooms,
  guaranteed_special_room_count,
  ROOM_TYPE_VALUE,
} from "./consts";

export class Agent extends ModFeature {
  values: float[] = Array<float>(FLOOR_SIZE).fill(0.0);

  @CallbackCustom(ModCallbackCustom.POST_NEW_ROOM_REORDERED)
  calculate_floor_value(_: RoomType) {
    // reset the values from the last run of this function
    this.values.fill(0.0);

    const minimap_flags = getFloorDisplayFlags();

    // Compute the values for each safe grid index
    minimap_flags.forEach((_, idx) => {
      // visited room, keep it's value at 0
      if (getRoomVisitedCount(idx) > 0) {
        return;
      }
      // INVISIBLE (i.e. not revealed on map)
      if (!isRoomVisible(idx)) {
        this.values[idx] = this.invisible_room_value(idx);
        return;
      }
      // unvisited special room, give it it's assigned value
      if (getRoomType(idx) != RoomType.DEFAULT) {
        this.values[idx] = this.special_room_value(idx);
        return;
      }

      // now the only case remaining is unvisited default rooms, which need to be calculated in the
      // next iteration, since their values are based on the values of their neighbours
    });

    // We do a second iteration, since unvisited rooms' value is determined by the values of their neighbours
    minimap_flags.forEach((_, idx) => {
      // skip if this room has been visited
      if (getRoomVisitedCount(idx) > 0) {
        return;
      }
      // skip if this is an invisible room
      if (!isRoomVisible(idx)) {
        return;
      }
      // skip if this room is a special room (i.e. no other entrances)
      if (getRoomType(idx) != RoomType.DEFAULT) {
        return;
      }

      // SHADOW (i.e. unvisited regular room)
      this.values[idx] = this.unvisited_room_value(idx);
    });

    logArray(this.values, "Map Room Values:");
  }

  /// Calculates the value of an invisible (not guaranteed to exist) room
  invisible_room_value(_idx: int): float {
    let weighted_vals: Map<RoomType, float> = new Map();

    // TODO: eventually expand this to cover more than three cases
    let types = [RoomType.BOSS, RoomType.TREASURE, RoomType.SHOP];

    types.forEach((r_type) => {
      // first, we need to calculate the number of yet-to-be-discovered rooms on this floor
      let remaining_rooms = get_number_of_rooms();

      // subtract all the visible rooms
      remaining_rooms -= getRoomsInsideGrid().filter((room_desc) =>
        isRoomVisible(room_desc),
      ).length;

      // subtract the number of special rooms this floor should have
      remaining_rooms -= guaranteed_special_room_count();

      // TODO: we need to adjust the probability if we're calculating the boss room probability, since it
      // changes based on distance from the starting room

      // multiply probability by room value
      const room_value = ROOM_TYPE_VALUE.get(r_type);
      if (room_value === undefined) {
        weighted_vals.set(r_type, 0.0);
        return;
      }
      let weighted_value = room_value / remaining_rooms;

      weighted_vals.set(r_type, weighted_value);
    });

    return sumMap(weighted_vals);
  }

  /// Returns the value of the special room at idx
  special_room_value(idx: int): float {
    const type = getRoomType(idx);
    if (type === undefined) return 0.0;

    let v = ROOM_TYPE_VALUE.get(type);
    if (v === undefined) return 0.0;

    return v;
  }

  unvisited_room_value(idx: int): float {
    // the value of an unvisited room is the sum of the values of the potential connections it has;
    // so we just sum the value of all adjacent rooms that aren't also unvisited
    let shape = getRoomShape(idx);
    if (shape === undefined) return 0.0;

    let potential_neighbours = getRoomShapeAdjacentGridIndexes(idx, shape);

    // remove any neighbours that are also visible (but not visited or special)
    let invisible_neighbours: int[] = [];
    potential_neighbours.forEach((idx, _) => {
      if (
        !(
          hasFlag(getRoomDisplayFlags(idx), DisplayFlag.VISIBLE)
          && getRoomVisitedCount(idx) === 0
          && getRoomType(idx) === RoomType.DEFAULT
        )
      ) {
        invisible_neighbours.push(idx);
      }
    });

    // now just sum the values of all the filtered rooms (which are unvisited, invisible)
    let v: float = 0.0;
    invisible_neighbours.forEach((idx) => {
      let nv = this.values[idx];
      if (nv !== undefined) {
        v += nv;
      }
    });

    return v;
  }
}
