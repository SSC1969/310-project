// need bosh rush timer and hush timer

import { LevelCurse, LevelStage, RoomType, StageID } from "isaac-typescript-definitions";
import { getStage, getStageID, hasCurse, logError } from "isaacscript-common";
import { ITEM_QUALITY_VALUES, QUALITY_CHANCE_BY_POOL } from "./params";

export const FLOOR_SIZE: int = 169;
export const ROOM_TYPE_VALUE: Map<RoomType, float> = calculate_room_values();

// Iterate through room types and qualities to create value maps for each room
function calculate_room_values(): Map<RoomType, float> {

    let room_type_values: Map<RoomType, float> = new Map([
        [RoomType.DEFAULT, 0.0],
        [RoomType.TREASURE, 1.0],
        [RoomType.SHOP, 1.0],
        [RoomType.BOSS, 1.0],
    ]);

    for (const type of room_type_values.keys()) {
        let value: float = 0.0;

        for (const quality of ITEM_QUALITY_VALUES.keys()) {
            let qual_val = ITEM_QUALITY_VALUES.get(quality);
            if (qual_val === undefined) {
                logError(`Error getting value for quality '${quality}'!`);
                qual_val = 0.0;
            }
            let qual_prob = QUALITY_CHANCE_BY_POOL.get(type)?.get(quality);
            if (qual_prob === undefined) {
                logError(`Error getting probability for quality '${quality}'`);
                qual_prob = 0.0;
            }
            value += qual_val * qual_prob;
        }

        room_type_values.set(type, value);
    }

    // logMap(room_type_values, "Room Type Values");

    return room_type_values;
}


/*
 *  Room generation algorithm based off of:
 *  https://bindingofisaacrebirth.wiki.gg/wiki/Level_Generation
 */
export function get_number_of_rooms(): int {
    let floor_depth = getStageID();

    // special case for void floor
    if (floor_depth == StageID.VOID) {
        return 1;
    }

    // calculate count using floor depth/stage
    let room_count = Math.round(Math.min(20, (floor_depth * 10 / 3) + 5.5));

    // special case for curse of the labyrinth
    if (hasCurse(LevelCurse.LABYRINTH)) {
        room_count = Math.round(Math.min(45, 1.8 * room_count));
        return room_count;
    }


    // 4 more rooms are added for curse of the lost
    if (hasCurse(LevelCurse.LOST)) {
        room_count += 4;
    }

    return room_count;
}

export function guaranteed_special_room_count(): int {
    let rooms = 0;
    // pre-chapter 4 there are five special rooms (treasure, shop, 2x secrets, boss)
    if (getStage() < LevelStage.WOMB_1) {
        rooms = 5;

        // on labyrinth floors there is an extra treasure room and an extra boss room
        if (hasCurse(LevelCurse.LABYRINTH)) {
            rooms += 2;
        }
    } else {
        // after that there are only three (boss, 2x secrets)
        rooms = 3;
    }

    // TODO: eventually account for other special room types (challenges, curses, dice, etc.)

    return rooms;
}


export function pretty_floor_values(values: float[]): string {
    let s = "\n";

    let i = 0;
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            let v = values[i];
            if (v !== undefined) {
                s = s.concat(v.toFixed(1).padStart(4, "0"));
            } else {
                s = s.concat("00.0");
            }
            s = s.concat(" ");
            i += 1;
        }
        s = s.concat("\n");
    }

    return s;
}

