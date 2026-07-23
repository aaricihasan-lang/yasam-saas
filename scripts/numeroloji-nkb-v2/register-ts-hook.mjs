/** Harness bootstrap: ts-ext-hook resolve hook'unu kaydeder. `node --import <bu dosya>`. */
import { register } from "node:module";
register("./ts-ext-hook.mjs", import.meta.url);
