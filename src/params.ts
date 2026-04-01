import { RoomType } from "isaac-typescript-definitions"

export const BOSS_ROOM_UNCOMPLETED_ROOM_MODIFIER = 1.25;
export const SHORTEST_POSSIBLE_TIME_PER_STAGE = 120_000;
export const DISCOUNT_FACTOR = 0.3;
export const CONVERGENCE_THRESHOLD = 0.01;
export const NEXT_FLOOR_BASE_VALUE = 10.0;

export const ITEM_QUALITY_VALUES = new Map([
    ["q0", 0.1],
    ["q1", 0.3],
    ["q2", 0.8],
    ["q3", 3.0],
    ["q4", 10.0]
]);

// quality chances sourced from:
// https://docs.google.com/spreadsheets/d/1Jg0IVPsLMDaesOiV10k4NAE6L8sVEANLE43OO_B4G28/edit?gid=151440470#gid=151440470

export const QUALITY_CHANCE_BY_POOL: Map<RoomType, Map<string, float>> = new Map([
    [RoomType.TREASURE, new Map([
        ["q0", 9.19],
        ["q1", 33.44],
        ["q2", 32.60],
        ["q3", 20.47],
        ["q4", 4.29]
    ])],
    [RoomType.SHOP, new Map([
        ["q0", 3.16],
        ["q1", 29.47],
        ["q2", 41.05],
        ["q3", 25.26],
        ["q4", 1.05]
    ])],
    [RoomType.BOSS, new Map([
        ["q0", 1.72],
        ["q1", 43.10],
        ["q2", 25.86],
        ["q3", 29.31],
        ["q4", 0.0]
    ])],
]);
