#!/usr/bin/env node
// GEÇİCİ KANIT (bir sonraki commit'te kaldırılır): main'deki ÖNCEKİ koşucu (.onceki-run-regression.mjs; yalnız --list
// eklendi, zaman aşımı/kill mantığı aynen) aynı sahte senaryolarla Linux'ta çalıştırılır. Beklenen "önce" davranışı:
// takılan test zaman aşımında FAIL üretemez, koşucu dış sınırda (60 sn) zorla durdurulur.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(HERE, "run-regression-timeout.harness.mjs"), "--runner", path.join(HERE, ".onceki-run-regression.mjs")], { encoding: "utf8" });
const out = `${r.stdout}${r.stderr}`;
for (const l of out.split(/\r?\n/)) if (l.trim() && !/harness: \d+ PASS/.test(l)) console.log(`  ÖNCE │ ${l.replace(/^(PASS|FAIL) /, "$1: ")}`);
const hung = /DIŞ SINIRDA DURDURULDU \(takıldı\)/.test(out);
console.log(`önceki koşucu Linux'ta takıldı mı: ${hung ? "EVET (hata yeniden üretildi)" : "HAYIR"}`);
console.log(`onceki kanit: ${hung ? 1 : 0} PASS / ${hung ? 0 : 1} FAIL`);
process.exit(hung ? 0 : 1);
