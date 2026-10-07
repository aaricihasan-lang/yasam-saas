import { close, summary } from "./ui-lib.mjs";
const mod = await import(`./${process.argv[2]}`);
await mod.run();
await close();
process.exit(summary() ? 1 : 0);
