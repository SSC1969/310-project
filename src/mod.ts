import { upgradeMod } from "isaacscript-common";
import { name } from "../package.json";

const modVanilla = RegisterMod(name, 1);
const features = [] as const;
export const mod = upgradeMod(modVanilla, features);
