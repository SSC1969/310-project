import { LevelStage, ModCallback, RoomShape, RoomType } from "isaac-typescript-definitions";
import {
    Callback,
    CallbackCustom,
    getNumRooms,
    getRoomDescriptor,
    getRoomGridIndex,
    getRoomShape,
    getRoomShapeAdjacentGridIndexes,
    getRoomsInsideGrid,
    getRoomType,
    getStage,
    hexToColor,
    log,
    logError,
    ModCallbackCustom,
    ModFeature,
    roomExists,
    sumMap,
} from "isaacscript-common";
import {
    FLOOR_SIZE,
    get_number_of_rooms,
    pretty_floor_values,
} from "./consts";
import { generateGradient } from "./gradient";
import { found_all_rooms_of_type, get_unvisited_rooms, get_value_of_type, get_visible_rooms } from "./room";

export class Agent extends ModFeature {
    values: float[] = Array.from({ length: FLOOR_SIZE }, () => 0.0);
    timer: int = 0;

    @CallbackCustom(ModCallbackCustom.POST_NEW_ROOM_REORDERED)
    post_new_room_reordered(): void {

        log("Calculating floor value...");
        this.calculate_floor_value();
        this.colour_minimap();

        this.timer = 5;
    }

    @Callback(ModCallback.POST_UPDATE)
    interval_function(): void {
        this.timer -= 1;

        if (this.timer === 0) {
            log("Calculating floor value (tick)...");
            this.calculate_floor_value();
            this.colour_minimap();
            // TODO: run code to actually clear the current room (pick up any pickups, items, etc. and leave in the most valuable direction)
        }
    }

    // sets a value based on the given safegridindex, taking room shape into account
    set_value(idx: int, value: float): void {
        // make sure the idx is actually set to the correct safe square of the room,
        // since it technically could be anything
        idx = getRoomDescriptor(idx).SafeGridIndex;
        const shape = getRoomShape(idx);

        // no matter what we want to set the value of the base grid index
        this.values[idx] = value;
        switch (shape) {
            case RoomShape.IIH:
                this.values[idx + 1] = value;
                break;
            case RoomShape.IIV:
                this.values[idx + 13] = value;
                break;
            case RoomShape.LBL:
                this.values[idx + 1] = value;
                this.values[idx + 14] = value;
                break;
            case RoomShape.LBR:
                this.values[idx + 1] = value;
                this.values[idx + 13] = value;
                break;
            case RoomShape.LTL:
                // this is the uniqe case; the safe grid index is in the top right
                this.values[idx + 12] = value;
                this.values[idx + 13] = value;
                break;
            case RoomShape.LTR:
                this.values[idx + 13] = value;
                this.values[idx + 14] = value;
                break;
            case RoomShape.SHAPE_1x2:
                this.values[idx + 13] = value;
                break;
            case RoomShape.SHAPE_2x1:
                this.values[idx + 1] = value;
                break;
            case RoomShape.SHAPE_2x2:
                this.values[idx + 1] = value;
                this.values[idx + 13] = value;
                this.values[idx + 14] = value;
                break;
        }
    }


    calculate_floor_value(): void {
        // reset the values from the last run of this function
        this.values.fill(0.0);

        // Compute the values for each safe grid index
        for (let idx = 0; idx < FLOOR_SIZE; idx += 1) {
            // keep the current room at 0.0, since it might not have been marked as
            // cleared before this code runs
            if (getRoomGridIndex() === idx) {
                this.set_value(idx, 0.0);
                continue;
            }

            // the agent technically isn't supposed to know this, so we
            // count it as if it's just an invisible room
            let minimap_desc = MinimapAPI?.GetRoomByIdx(idx);
            if (!minimap_desc) {
                // specifically skip setting the value through the setter for invisible rooms,
                // since the model is just assumed that each invisible room is a 1x1
                this.values[idx] = this.invisible_room_value(idx);
                continue;
            }

            // visited room, keep it's value at 0
            if (minimap_desc.IsVisited()) {
                this.set_value(idx, 0.0);
                continue;
            }

            if (!minimap_desc.IsVisible()) {
                this.values[idx] = this.invisible_room_value(idx);
                continue;
            }

            // At this point we have continued for every room except unvisited visible rooms

            // Only compute special room values
            if (minimap_desc.Type != RoomType.DEFAULT) {
                this.set_value(idx, this.special_room_value(idx));
                continue;
            }
            // now the only case remaining is unvisited default rooms, which need to be calculated in the
            // next iteration, since their values are based on the values of their neighbours
        }

        let unvisited_visible_rooms = [...getRoomsInsideGrid()];
        unvisited_visible_rooms = get_unvisited_rooms(get_visible_rooms(unvisited_visible_rooms));

        // filter out every non-special room
        unvisited_visible_rooms = unvisited_visible_rooms.filter((room) => room.Data?.Type === RoomType.DEFAULT);

        for (let room of unvisited_visible_rooms) {
            const idx = room.SafeGridIndex;
            const value = this.unvisited_room_value(idx);
            this.set_value(idx, value);
        }

        // let s = pretty_floor_values(this.values)
        // log(s);

        // TODO: run an MDP using the calculated floor values as the reward table
    }

    /// Calculates the value of an invisible (not guaranteed to exist) room
    invisible_room_value(_idx: int): float {
        // skip setting the value if the map already has all the rooms on the floor
        if (get_visible_rooms([...getRoomsInsideGrid()]).length === getNumRooms()) return 0.0;

        // first, we need to calculate the number of yet-to-be-discovered rooms on this floor
        let remaining_rooms = get_number_of_rooms();

        // subtract all visible non-special rooms
        remaining_rooms -= get_visible_rooms([...getRoomsInsideGrid()]).length;

        // now remaining rooms is all of the special rooms + the estimated number of undiscovered default rooms

        // subtract the number of special rooms this floor should have (it shouldn't matter which ones we've already seen)
        // remaining_rooms -= guaranteed_special_room_count();

        // remaining rooms it at least 1 if the code has executed to this point
        remaining_rooms = Math.max(1, remaining_rooms);

        // remaining rooms is the estimated number of default rooms left on this floor
        log(`${remaining_rooms} remaining`);

        const type_prob = 1 / remaining_rooms;

        let weighted_vals: Map<RoomType, float> = new Map();

        // TODO: eventually expand this to cover more than three cases
        let types = [RoomType.BOSS];

        // only add the treasure/shop rooms if this floor will spawn them
        if (getStage() < LevelStage.WOMB_1) {
            types.push(RoomType.TREASURE, RoomType.SHOP);
        }

        // now we calculate values
        types.forEach((r_type) => {
            // skip a room type if the player has already found it
            if (found_all_rooms_of_type([...getRoomsInsideGrid()], r_type)) return;

            // TODO: we need to adjust the probability if we're calculating the boss room probability, since it
            // changes based on distance from the starting room

            // multiply probability by room value
            const room_value = get_value_of_type(r_type);
            let weighted_value = room_value * type_prob;

            weighted_vals.set(r_type, weighted_value);
        });

        return sumMap(weighted_vals);
    }

    /// Returns the value of the special room at idx
    special_room_value(idx: int): float {
        const type = getRoomType(idx);
        if (!type) {
            logError(`Unable to get room type for GridIndex '${idx}'!`);
            return 0.0;
        };

        return get_value_of_type(type);
    }

    unvisited_room_value(idx: int): float {
        // the value of an unvisited room is the sum of the values of the potential connections it has;
        // so we just sum the value of all adjacent rooms that aren't also unvisited
        const shape = getRoomShape(idx);
        if (!shape) {
            logError(`Error getting room shape for index '${idx!}'`);
            return -1.0;
        }

        let potential_neighbours = getRoomShapeAdjacentGridIndexes(idx, shape);

        // remove any neighbours that are also visible (but not visited)
        let invisible_neighbours: int[] = [];
        potential_neighbours.forEach((idx, _) => {
            if (getRoomGridIndex() === idx) return;
            let minimap_desc = MinimapAPI?.GetRoomByIdx(idx);
            if (!minimap_desc) {
                invisible_neighbours.push(idx);
                return;
            }
            if (minimap_desc.IsVisited()) return;
            if (minimap_desc.IsVisible()) return;
            // if (minimap_desc.Type !== RoomType.DEFAULT) return;

            invisible_neighbours.push(idx);
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

    colour_minimap(): void {
        const GRADIENT = generateGradient(["#FF0000", "#00FF00"], 100);

        // we need to scale all the room values to be between 1 - 100
        // get the ratio of the max value : 100
        const max = Math.max(...this.values);
        const ratio = (100 / max);

        // now multiply each number by the ratio and round it into an int
        const vals = this.values.map((v) => Math.min(99, Math.round(v * ratio)));

        // vals will now be integers within the range of 0..100, so we can use it to index the gradient
        for (let idx = 0; idx < FLOOR_SIZE; idx += 1) {
            if (!roomExists(idx)) {
                continue;
            }
            let gi = vals[idx];
            if (gi === undefined) {
                logError(`Error getting gradient value at idx '${idx}'!`);
                gi = 100;
            }
            let c = GRADIENT[gi];
            if (c === undefined) {
                c = "#0000FF";
            }
            let desc = MinimapAPI?.GetRoomByIdx(idx);
            if (desc !== undefined) {
                desc.Color = hexToColor(c);
            }
        }

        log(pretty_floor_values(vals));

        Game().GetLevel().UpdateVisibility();
    }
}
