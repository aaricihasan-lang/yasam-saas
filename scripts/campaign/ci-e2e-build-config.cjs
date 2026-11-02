// KAMPANYA MERKEZİ — YALNIZ CI tarayıcı işi (kampanya-tarayici.yml): runner'ın GEÇİCİ checkout'undaki next.config.ts'e test
// build'i için `typescript.ignoreBuildErrors` ekler. Tip denetimi zorunlu ana CI'da (ci.yml "TypeScript") yapılır; bu build'de
// tekrarlanması runner belleğini (webpack + tip denetimi) aşıyordu. Repodaki dosya değişmez (yalnız CI'da çalıştırılır).
"use strict";
const fs = require("node:fs");
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("ci-e2e-build-config: yalnız GitHub Actions içinde çalıştırılır");
const f = "next.config.ts";
const s = fs.readFileSync(f, "utf8");
const anchor = "const nextConfig: NextConfig = {";
if (!s.includes(anchor)) throw new Error("next.config.ts biçimi beklenmiyor");
fs.writeFileSync(f, s.replace(anchor, `${anchor}\n  typescript: { ignoreBuildErrors: true },`));
console.log("test build'i: tip denetimi ana CI'da; bu build'de atlanır");
