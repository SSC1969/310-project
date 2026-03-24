import { name } from "../package.json";
import { Agent } from "./floor";
import { addCollectible, getPlayers, initModFeatures, ModCallbackCustom } from "isaacscript-common";
import { mod } from "./mod";
import { CollectibleType } from "isaac-typescript-definitions";

// This function is run when your mod first initializes.
export function main(): void {
    const MOD_FEATURES = [Agent];
    initModFeatures(mod, MOD_FEATURES);

    // Print a message to the "log.txt" file.
    Isaac.DebugString(`${name} initialized, ready to calculate stuff`);
    mod.AddCallbackCustom(ModCallbackCustom.POST_GAME_STARTED_REORDERED_LAST, on_run_start, false);
    print("please");
}

function on_run_start(): void {
    let p = getPlayers()[0];
    if (p !== undefined) {
        addCollectible(p, CollectibleType.BLACK_CANDLE);
    }
    //
    // kill all enemies in the room
    Isaac.ExecuteCommand("debug 10");

}
