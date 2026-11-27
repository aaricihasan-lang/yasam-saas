/**
 * Şifa Rehberi F3 — gerçek testler için PRODUCTION build'i (İZOLE test projesi ortamıyla; guard.ts FAIL-CLOSED).
 * Tarayıcıya gömülen NEXT_PUBLIC_* değerleri test projesininkidir → bu build YALNIZ yerel test içindir, yayınlanmaz.
 * Ardından: SIFA_F3_SERVER=start npx tsx scripts/sifa-rehberi-f3/real/akislar.real.mjs
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/build-prod.mts
 */
import { spawnSync } from "node:child_process";
import { childEnv } from "./support.mjs";

const r = spawnSync("npx", ["next", "build"], { cwd: process.cwd(), env: childEnv(), shell: true, stdio: "inherit" });
process.exit(r.status ?? 1);
