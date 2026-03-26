// need bosh rush timer and hush timer

import { LevelCurse, LevelStage, RoomType, StageID } from "isaac-typescript-definitions";
import { getEffectiveStage, getStage, getStageID, hasCurse } from "isaacscript-common";

export const FLOOR_SIZE: int = 169;
export const ROOM_TYPE_VALUE: Map<RoomType, float> = new Map([
    [RoomType.DEFAULT, 0.0],
    [RoomType.TREASURE, 1.0],
    [RoomType.SHOP, 1.0],
    [RoomType.BOSS, 1.0],
]);

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

