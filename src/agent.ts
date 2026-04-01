import { ButtonAction, CollectibleType, DoorSlot, EntityCollisionClass, EntityFlag, EntityType, GridEntityType, LevelCurse, LevelStage, ModCallback, PickupVariant, RoomShape, RoomType } from "isaac-typescript-definitions";
import {
    addCollectible,
    addFlag,
    Callback,
    CallbackCustom,
    getGridEntitiesInRadius,
    getHighestArrayElement,
    getNumRooms,
    getRoomAdjacentGridIndexes,
    getRoomDescriptor,
    getRoomGridIndex,
    getRoomShape,
    getRoomShapeAdjacentExistingGridIndexes,
    getRoomShapeAdjacentGridIndexes,
    getRoomsInsideGrid,
    getRoomType,
    getStage,
    hasCurse,
    hexToColor,
    isActiveCollectible,
    log,
    logError,
    ModCallbackCustom,
    ModFeature,
    restart,
    roomExists,
    spawnNPC,
    sumMap,
} from "isaacscript-common";
import {
    FLOOR_SIZE,
    get_number_of_rooms,
} from "./consts";
import { generateGradient } from "./gradient";
import { found_all_rooms_of_type, get_next_floor_value, get_unvisited_rooms, get_value_of_type, get_visible_rooms } from "./room";
import { CONVERGENCE_THRESHOLD, DISCOUNT_FACTOR } from "./params";
import { mod } from "./mod";

export class Agent extends ModFeature {
    rewards: float[] = Array.from({ length: FLOOR_SIZE }, () => 0.0);
    utilities: float[] = Array.from({ length: FLOOR_SIZE }, () => 0.0);
    timer: int = 0;
    target_slot = DoorSlot.NO_DOOR_SLOT;
    player_pos_marker!: EntityNPC;

    @CallbackCustom(ModCallbackCustom.POST_GAME_STARTED_REORDERED_LAST, false)
    post_game_started(): void {
        mod.toggleDoorDisplay(true);
        mod.togglePlayerDisplay(true);

        // add black candle to avoid curses, could be removed later?
        addCollectible(Isaac.GetPlayer(), CollectibleType.BLACK_CANDLE);

        // reset run if the first floor is labyrinth
        if (hasCurse(LevelCurse.LABYRINTH)) {
            restart();
        }

        // automatically kill all enemies in the room
        Isaac.ExecuteCommand("debug 10");
        // enable godmode
        Isaac.ExecuteCommand("debug 3");

        // display a marker above the optimal door
        mod.setDoorDisplay((door) => {
            let val: number = this.utilities[door.TargetRoomIndex] || 0.0;
            let str = val.toFixed(2);
            if (door.Slot === this.target_slot) {
                str = str.concat("\n!!!");
            }
            // don't display anything if the room is a secret room
            if (door.IsRoomType(RoomType.SECRET) || door.IsRoomType(RoomType.SUPER_SECRET)) {
                return "";
            }

            return str;
        });

        mod.setPlayerDisplay((_player) => {
            if (getRoomType() === RoomType.BOSS && this.target_slot === DoorSlot.NO_DOOR_SLOT) {
                return "Next floor";
            } else return "";
        });

        Isaac.GetPlayer().AddEntityFlags(EntityFlag.NO_TARGET);

        // spawn in an npc for using in pathfinding
        this.player_pos_marker = spawnNPC(EntityType.MAGGOT, 1, 0, Isaac.GetPlayer().Position)
        this.player_pos_marker.MaxHitPoints = 0.0;
        this.player_pos_marker.EntityCollisionClass = EntityCollisionClass.NONE;
        this.player_pos_marker.AddEntityFlags(addFlag(EntityFlag.PERSISTENT, EntityFlag.FRIENDLY));
        this.player_pos_marker.Position = Isaac.GetPlayer().Position;
        this.player_pos_marker.Visible = false;
    }

    @CallbackCustom(ModCallbackCustom.POST_NEW_ROOM_REORDERED)
    post_new_room_reordered(): void {
        this.player_pos_marker.Position = Isaac.GetPlayer().Position;
        this.timer = 5;
    }

    @Callback(ModCallback.POST_UPDATE)
    interval_function(): void {
        this.timer -= 1;


        this.player_pos_marker.Pathfinder.FindGridPath(this.player_pos_marker.TargetPosition, 1.5 * Isaac.GetPlayer().MoveSpeed, 0, true);
        Isaac.GetPlayer().Position = this.player_pos_marker.Position;

        // automatically go through a door if the agent is close enough (since the navigation cannot enter doors)
        if (getGridEntitiesInRadius(Isaac.GetPlayer().Position, 25).some((entity) =>
            entity.GetType() === GridEntityType.DOOR && entity.ToDoor()?.Slot === this.target_slot
        )) {
            Isaac.GetPlayer().Position = this.player_pos_marker.TargetPosition;
        }

        if (this.timer === 0) {
            log("Calculating floor value...");
            this.calculate_floor_value();
            this.colour_minimap();
            this.target_slot = this.get_policy();
            if (getRoomType() === RoomType.BOSS && this.target_slot === DoorSlot.NO_DOOR_SLOT) {
                // if this is the case we want to move to the next floor
                this.player_pos_marker.TargetPosition = Vector(2, 6);
            }
        } else {
            const t_pos = Game().GetRoom().GetDoor(this.target_slot)?.Position || Isaac.GetPlayer().Position;
            this.player_pos_marker.TargetPosition = t_pos;
        }
    }

    @Callback(ModCallback.POST_PICKUP_INIT)
    post_pickup_init(pickup: EntityPickup) {
        const player = Isaac.GetPlayer();

        this.player_pos_marker.Position = player.Position;
        if (this.player_pos_marker.Pathfinder.HasPathToPos(pickup.Position, true)) {
            log("Collecting pickup");
            const type = pickup.SubType;

            if (!pickup.IsShopItem()) {
                if (pickup.Variant === PickupVariant.COLLECTIBLE) {
                    if (isActiveCollectible(type)) {
                        mod.pressInput(player, ButtonAction.ITEM);
                    }
                    player.AddCollectible(type);
                    player.AnimateCollectible(type);
                    pickup.Remove();
                }
            }
        }
    }

    // sets a value based on the given safegridindex, taking room shape into account
    set_reward(idx: int, value: float): void {
        // make sure the idx is actually set to the correct safe square of the room,
        // since it technically could be anything
        idx = getRoomDescriptor(idx).SafeGridIndex;
        const shape = getRoomShape(idx);

        // no matter what we want to set the value of the base grid index
        this.rewards[idx] = value;
        switch (shape) {
            case RoomShape.IIH:
                this.rewards[idx + 1] = value;
                break;
            case RoomShape.IIV:
                this.rewards[idx + 13] = value;
                break;
            case RoomShape.LBL:
                this.rewards[idx + 1] = value;
                this.rewards[idx + 14] = value;
                break;
            case RoomShape.LBR:
                this.rewards[idx + 1] = value;
                this.rewards[idx + 13] = value;
                break;
            case RoomShape.LTL:
                // this is the uniqe case; the safe grid index is in the top right
                this.rewards[idx + 12] = value;
                this.rewards[idx + 13] = value;
                break;
            case RoomShape.LTR:
                this.rewards[idx + 13] = value;
                this.rewards[idx + 14] = value;
                break;
            case RoomShape.SHAPE_1x2:
                this.rewards[idx + 13] = value;
                break;
            case RoomShape.SHAPE_2x1:
                this.rewards[idx + 1] = value;
                break;
            case RoomShape.SHAPE_2x2:
                this.rewards[idx + 1] = value;
                this.rewards[idx + 13] = value;
                this.rewards[idx + 14] = value;
                break;
        }
    }


    calculate_floor_value(): void {
        // reset the values from the last run of this function
        this.rewards.fill(0.0);

        // Compute the values for each safe grid index
        for (let idx = 0; idx < FLOOR_SIZE; idx += 1) {
            // keep the current room at 0.0, since it might not have been marked as
            // cleared before this code runs
            if (getRoomGridIndex() === idx) {
                this.set_reward(idx, 0.0);
                continue;
            }

            // the agent technically isn't supposed to know this, so we
            // count it as if it's just an invisible room
            let minimap_desc = MinimapAPI?.GetRoomByIdx(idx);
            if (!minimap_desc) {
                // specifically skip setting the value through the setter for invisible rooms,
                // since the model is just assumed that each invisible room is a 1x1
                this.rewards[idx] = this.invisible_room_value(idx);
                continue;
            }

            // visited room, keep it's value at 0
            if (minimap_desc.IsVisited()) {
                this.set_reward(idx, 0.0);
                continue;
            }

            if (!minimap_desc.IsVisible()) {
                this.rewards[idx] = this.invisible_room_value(idx);
                continue;
            }

            // At this point we have continued for every room except unvisited visible rooms

            // Only compute special room values
            if (minimap_desc.Type != RoomType.DEFAULT) {
                this.set_reward(idx, this.special_room_value(idx));
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
            this.set_reward(idx, value);
        }

    }

    /// Calculates the value of an invisible (not guaranteed to exist) room
    invisible_room_value(idx: int): float {
        // skip setting the value if the map already has all the rooms on the floor (ignoring secret rooms)
        if (get_visible_rooms([...getRoomsInsideGrid()]).length === getNumRooms() - 2) return 0.0;

        // zero out the value if this is a secret room
        if (getRoomType(idx) === RoomType.SECRET || getRoomType(idx) === RoomType.SUPER_SECRET) return 0.0;

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
            let nv = this.rewards[idx];
            if (nv !== undefined) {
                v += nv;
            }
        });

        return v;
    }

    // Determines the utility of a given room, used for value iteration
    get_utility(idx: int): float {

        // ensure idx is a 'safe' room grid index, meaning it is the top-left grid index in a larger room
        idx = getRoomDescriptor(idx).SafeGridIndex;

        let neighbours: Map<DoorSlot, int> = new Map();
        const minimap_desc = MinimapAPI?.GetRoomByIdx(idx);
        let is_boss = false;

        // scenarios in which the agent has not visited the room (non-existent rooms count as unvisited)
        if (!minimap_desc?.IsVisited()) {
            let shape = RoomShape.SHAPE_1x1;

            // first scenario: this room is not visible, so the agent doesn't know it's shape and
            // can't check the doors - in this case, we assume a 1x1 room and don't change the shape

            // second scenario: the room is visible, but isaac has not been, so we don't know which door
            // indexes are valid (aside from ones connected other visible rooms) - we assume all indexes are
            // valid for the given room shape
            if (minimap_desc?.IsVisible()) {
                shape = minimap_desc?.Shape;
                if (minimap_desc.Type === RoomType.BOSS) is_boss = true;
            }

            // include all potential neighbours, since the agent has no idea which adjacent rooms are
            // valid
            neighbours = new Map(getRoomShapeAdjacentGridIndexes(idx, shape));

        } else {
            if (minimap_desc.Type === RoomType.BOSS) is_boss = true;

            // third scenario: the room has been visited, so we know exactly which doors are valid
            // and we can ignore any actions that don't lead anywhere
            const shape = minimap_desc?.Shape || RoomShape.SHAPE_1x1;
            neighbours = new Map(getRoomShapeAdjacentExistingGridIndexes(idx, shape));
        }

        let action_values: float[] = [];

        // calculate the utility of each possible action
        neighbours.forEach((n_idx, _slot) => {
            // the utility given by going through this door (taking this action)
            let p = this.utilities[n_idx] || 0.0;
            action_values.push(p);
        });

        // if the room is a boss room, we need to add in another special action for going to the next floor
        if (is_boss) {
            action_values.push(get_next_floor_value());
        }

        let r = this.rewards[idx] || 0.0;
        let max = getHighestArrayElement(action_values) || 0.0;

        // bellman equation to calculate v(s)
        const v = r + DISCOUNT_FACTOR * max;

        return v;
    }

    get_policy(): DoorSlot {
        // reset the utilities to zeroes
        this.utilities.fill(0.0);
        let delta = 0.0;
        // repeatedly iterate until change in utility converges
        do {
            delta = 0.0;
            // iterate through each state/grid index of the floor
            for (let i = 0; i < FLOOR_SIZE; i += 1) {
                let temp = this.utilities[i] || 0.0;
                const vs = this.get_utility(i);
                this.utilities[i] = vs;
                delta = Math.max(delta, Math.abs(temp - vs));
            }
            // log(`Current delta: ${delta}/${CONVERGENCE_THRESHOLD}`);
        } while (delta > CONVERGENCE_THRESHOLD);

        // change in utility between iterations has reached the treshold, so we can decide the policy
        // based on whichever of the agent's current room's doors leads to the highest utility
        let action_utilities: Map<DoorSlot, float> = new Map();
        // figure out which adjacent room has the highest utility
        getRoomAdjacentGridIndexes().forEach((idx, slot) => {
            const u = this.utilities[idx];
            // skip this action/door slot if we can't get the utility for some reason
            if (!u) {
                logError(`Error getting utility for idx '${u}'!`);
                return;
            }

            action_utilities.set(slot, u);
        });

        // add an extra item to the map for the trapdoor
        if (getRoomType() === RoomType.BOSS) {
            action_utilities.set(DoorSlot.NO_DOOR_SLOT, get_next_floor_value());
        }

        // get the action with the highest value from the map
        const a = Array.from(action_utilities.entries()).reduce((a, b) => a[1] < b[1] ? b : a)[0];

        return a;
    }


    /// Colours the minimap on a scale from red to green based on each room's reward
    colour_minimap(): void {
        const GRADIENT = generateGradient(["#FF0000", "#00FF00"], 100);

        // we need to scale all the room values to be between 1 - 100
        // get the ratio of the max value : 100
        const max = Math.max(...this.rewards);
        const ratio = (100 / max);

        // now multiply each number by the ratio and round it into an int
        const vals = this.rewards.map((v) => Math.min(99, Math.round(v * ratio)));

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

        // log(pretty_floor_values(vals));

        Game().GetLevel().UpdateVisibility();
    }


    // mdp stuff:
    // state: room the agent is in
    // action: each door slot in the room (return to same room if door slot is not valid, e.g. in smaller rooms), and in boss rooms, an extra action for going to the next floor
    // transition function: the probability of an action having the intended effect is 100%
    // reward function: already calculated by `calculate_floor_value()`
}
