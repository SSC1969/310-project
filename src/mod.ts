import { ISCFeature, upgradeMod } from "isaacscript-common";
import { name } from "../package.json";

const modVanilla = RegisterMod(name, 1);
const FEATURES = [ISCFeature.PAUSE] as const;
export const mod = upgradeMod(modVanilla, FEATURES);

