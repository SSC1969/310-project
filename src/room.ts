import { GameStateFlag, LevelStage, RoomType } from "isaac-typescript-definitions";
import { getRoomDescriptorsForType, getStage, isRoomVisible, logError } from "isaacscript-common";
import { ROOM_TYPE_VALUE } from "./consts";
import { BOSS_ROOM_UNCOMPLETED_ROOM_MODIFIER, NEXT_FLOOR_BASE_VALUE, SHORTEST_POSSIBLE_TIME_PER_STAGE } from "./params";


export function get_unvisited_rooms(rooms: RoomDescriptor[]): RoomDescriptor[] {
    return rooms.filter((room) => room.VisitedCount == 0);
}

export function get_visible_rooms(rooms: RoomDescriptor[]): RoomDescriptor[] {
    return rooms.filter((room) => isRoomVisible(room))
}

export function found_all_rooms_of_type(rooms: RoomDescriptor[], r_type: RoomType): boolean {
    const minimap_rooms = rooms.map((room) => MinimapAPI?.GetRoomByIdx(room.SafeGridIndex));
    const rooms_of_type = minimap_rooms.filter((room) => room?.Type === r_type);

    const found_type_count = rooms_of_type.filter((room) => room?.IsVisible()).length;

    // the player has found all of the rooms of this type if found rooms is at least equal to the 
    // number of rooms matching the type
    return found_type_count >= rooms_of_type.length;
}

export function get_value_of_type(r_type: RoomType): float {
    let base_val = ROOM_TYPE_VALUE.get(r_type);
    if (!base_val) {
        logError(`Error getting value for type '${r_type!}'!`);
        return 0.0;
    }

    // we need to adjust the room value based on it's type and that type's specific
    // attributes/requirements
    let needs_key: boolean = false;

    switch (r_type) {
        // we only need to check if the player has a key if this isn't the first floor
        case RoomType.TREASURE:
            if (getStage() !== LevelStage.BASEMENT_1) {
                needs_key = true;
            }
            break;
        // the shop will have it's value multiplied based on the player's 'effective coins',
        // i.e. the number of coins they will have if they bomb the donation machine
        case RoomType.SHOP:
            // TODO: adjust reward based on the probability of the greed fight
            if (getStage() > LevelStage.BASEMENT_1) {
                needs_key = true;
            }
            const player = Isaac.GetPlayer();
            let effective_coins = player.GetNumCoins();
            // add some coins if the player can blow up the donation machine (avg. of 8)
            if (!Game().GetStateFlag(GameStateFlag.DONATION_SLOT_BROKEN) && player.GetNumBombs() > 0) {
                effective_coins += 8;
            }
            // < 3 coins means the player can't buy anything
            if (effective_coins < 3) {
                base_val = 0;
            } else if (effective_coins < 15) { // 3-14 coins means the player can buy pickups, but not items
                base_val *= 0.2;
            } else { // > 15 coins means the player can buy an item (or more!)
                let num_items_can_purchase = Math.trunc(effective_coins / 15);
                base_val *= num_items_can_purchase;
            }
            break;
        // boss room does change technically, but only when calculating utility, as the value of the
        // next floor is assigned to the state given by the taking the action of leaving this floor
        case RoomType.BOSS:
            break;
        case RoomType.DEFAULT:
            break;
    }

    // now adjust the value based on the parameters set
    if (needs_key && Isaac.GetPlayer().GetNumKeys() === 0) {
        base_val = 0;
    }

    return base_val;
}

export function get_next_floor_value(): float {
    let val = NEXT_FLOOR_BASE_VALUE;

    for (let r_type of [RoomType.TREASURE, RoomType.SHOP]) {
        if (getRoomDescriptorsForType(r_type).every((desc) => desc.VisitedCount > 0)) {
            // for each of the important types the agent has completed, we increase the value
            // of the boss room
            val *= BOSS_ROOM_UNCOMPLETED_ROOM_MODIFIER;
        }
    }

    // we also tweak the value if we're trying to reach boss rush or hush
    const time = Game().TimeCounter;
    const stage_id = getStage();
    let par_time_remaining = 0;
    let stages_remaining = 0; // includes the current stage (e.g. on depths 2 it should still be 1)
    if (stage_id < LevelStage.WOMB_1) {
        par_time_remaining = time - Game().BossRushParTime;
        stages_remaining = LevelStage.WOMB_1 - stage_id;
    } else if (stage_id < LevelStage.BLUE_WOMB) {
        par_time_remaining = time - Game().BlueWombParTime;
        stages_remaining = LevelStage.BLUE_WOMB - stage_id;
    }
    const ms_per_stage = par_time_remaining / stages_remaining;

    // it's still possible for the agent to reach the next time-gated challenge
    if (ms_per_stage > SHORTEST_POSSIBLE_TIME_PER_STAGE) {
        // value should increase if time is running short for reaching the challenge
        val /= (ms_per_stage / SHORTEST_POSSIBLE_TIME_PER_STAGE) - 1;
    }


    return val;
}
