import { name } from "../package.json";
import { Agent } from "./agent";
import { initModFeatures } from "isaacscript-common";
import { mod } from "./mod";

// This function is run when your mod first initializes.
export function main(): void {
    const MOD_FEATURES = [Agent];
    initModFeatures(mod, MOD_FEATURES);

    Isaac.DebugString(`${name} initialized`);
}
