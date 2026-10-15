/**
 * FINAL-A2 / Görev 8 — Astroloji profil silme onay katmanları (DB'siz, ağsız).
 *
 *  A) Davranış: ProfileDeleteFlow'un kullandığı saf plan (app/admin/astroloji/_lib/profileDeletePlan)
 *     bileşenle AYNI kurallarla sürülür; sahte DELETE sayacı ile:
 *       • 1 profil (tekli) → mevcut 2 "Evet", ifade YOK, 2. Evet'te DELETE.
 *       • 1–2 profil toplu → mevcut 3 "Evet" korunur, ifade YOK (3 aşamaya ZORLANMAZ / zayıflatılmaz).
 *       • 3+ profil toplu → 3 katman; 2. katmanda "N KAYDI SİL" yazılmadan ilerlenmez; yanlış ifade bloklar.
 *       • Her katmanda Vazgeç → DELETE çağrısı yok.
 *       • Sunucu onay sayısı asla aşağı çekilmez.
 *  B) Statik bağlantı: bileşen planı kullanıyor, düğme yalnız eşleşmede açık, DELETE yalnız onYes→"delete".
 *
 * Çalıştır: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/final-a2/astro/profile-delete-confirm.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canProceedProfileDelete,
  profileDeleteAction,
  profileDeletePlan,
  type ProfileDeleteMode,
} from "../../../app/admin/astroloji/_lib/profileDeletePlan";
import { bulkDeletePhrase } from "../../../lib/ui/bulkDeleteGuard";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

type Act = { yes: true } | { type: string } | { cancel: true };

/** Bileşenin onay döngüsünü birebir taklit eder (step/typed + onYes + Vazgeç). */
function drive(mode: ProfileDeleteMode, count: number, serverRequired: number, acts: Act[]) {
  const plan = profileDeletePlan(mode, count, serverRequired);
  let step = 1;
  let typed = "";
  let deleteCalls = 0;
  let closed = false;
  let blocked = 0;
  for (const a of acts) {
    if (closed) break;
    if ("cancel" in a) {
      closed = true;
      break;
    }
    if ("type" in a) {
      typed = a.type;
      continue;
    }
    // Düğme devre dışıysa tıklama hiçbir şey yapmaz (disabled={busy || !canProceed}).
    if (!canProceedProfileDelete(plan, step, typed)) {
      blocked++;
      continue;
    }
    const r = profileDeleteAction(plan, step, typed);
    if (r === "blocked") blocked++;
    else if (r === "delete") {
      deleteCalls++;
      closed = true;
    } else step++;
  }
  return { plan, deleteCalls, blocked, step };
}

const YES: Act = { yes: true };
const CANCEL: Act = { cancel: true };

console.log("\nA) Tekli (1 profil) — mevcut onay korunur");
{
  const p = profileDeletePlan("single", 1, 2);
  ok(p.required === 2 && !p.guarded && p.phrase === null && p.phraseStep === null, "tekli: 2 katman, ifade yok");
  ok(drive("single", 1, 2, [YES, YES]).deleteCalls === 1, "tekli: 2. Evet'te DELETE (tek çağrı)");
  ok(drive("single", 1, 2, [YES]).deleteCalls === 0, "tekli: 1 Evet DELETE göndermez");
  ok(drive("single", 1, 2, [CANCEL]).deleteCalls === 0, "tekli: 1. katmanda Vazgeç → DELETE yok");
  ok(drive("single", 1, 2, [YES, CANCEL]).deleteCalls === 0, "tekli: 2. katmanda Vazgeç → DELETE yok");
}

console.log("\nB) Toplu 1–2 profil — 3 aşamaya ZORLANMAZ, mevcut 3 Evet korunur (zayıflatılmaz)");
for (const n of [1, 2]) {
  const p = profileDeletePlan("bulk", n, 3);
  ok(!p.guarded && p.phrase === null && p.required === 3, `toplu ${n}: ifade yok, sunucu 3 Evet korunur`);
  ok(drive("bulk", n, 3, [YES, YES, YES]).deleteCalls === 1, `toplu ${n}: 3 Evet → DELETE`);
  ok(drive("bulk", n, 3, [YES, YES]).deleteCalls === 0, `toplu ${n}: 2 Evet → DELETE yok`);
}

console.log("\nC) Toplu 3+ profil — 3 katman + yazarak doğrulama");
for (const n of [3, 7, 100]) {
  const phrase = bulkDeletePhrase(n);
  ok(phrase === `${n} KAYDI SİL`, `${n}: ifade "${phrase}"`);
  const p = profileDeletePlan("bulk", n, 3);
  ok(p.guarded && p.required === 3 && p.phraseStep === 2 && p.phrase === phrase, `${n}: 3 katman, ifade 2. katmanda`);

  const okRun = drive("bulk", n, 3, [YES, { type: phrase }, YES, YES]);
  ok(okRun.deleteCalls === 1 && okRun.blocked === 0, `${n}: uyarı → doğru ifade → son onay → tek DELETE`);

  const noType = drive("bulk", n, 3, [YES, YES, YES, YES, YES]);
  ok(noType.deleteCalls === 0 && noType.step === 2 && noType.blocked >= 1, `${n}: ifade yazılmadan Evet 2. katmanda bloklanır`);

  const wrong = drive("bulk", n, 3, [YES, { type: `${n + 1} KAYDI SİL` }, YES, YES]);
  ok(wrong.deleteCalls === 0 && wrong.step === 2, `${n}: yanlış sayı içeren ifade bloklar`);
  ok(drive("bulk", n, 3, [YES, { type: "SİL" }, YES, YES]).deleteCalls === 0, `${n}: eksik ifade bloklar`);
  ok(drive("bulk", n, 3, [YES, { type: "TÜMÜNÜ SİL" }, YES, YES]).deleteCalls === 0, `${n}: başka ifade bloklar`);
  ok(profileDeleteAction(p, 2, "yanlış") === "blocked", `${n}: profileDeleteAction yanlış ifadede "blocked"`);

  // Ortak standardın açıkça söylenen toleransı: büyük/küçük harf + ı/i farkı + boşluk.
  ok(drive("bulk", n, 3, [YES, { type: `  ${n} kaydi sil ` }, YES, YES]).deleteCalls === 1, `${n}: harf/ı-i/boşluk toleransı (ortak kural)`);

  ok(drive("bulk", n, 3, [CANCEL]).deleteCalls === 0, `${n}: 1. katmanda Vazgeç → DELETE yok`);
  ok(drive("bulk", n, 3, [YES, CANCEL]).deleteCalls === 0, `${n}: 2. katmanda (yazmadan) Vazgeç → DELETE yok`);
  ok(drive("bulk", n, 3, [YES, { type: phrase }, CANCEL]).deleteCalls === 0, `${n}: 2. katmanda (ifade yazılı) Vazgeç → DELETE yok`);
  ok(drive("bulk", n, 3, [YES, { type: phrase }, YES, CANCEL]).deleteCalls === 0, `${n}: 3. katmanda Vazgeç → DELETE yok`);
  ok(!canProceedProfileDelete(p, 2, "") && canProceedProfileDelete(p, 2, phrase), `${n}: 2. katman düğmesi yalnız eşleşmede açık`);
  ok(canProceedProfileDelete(p, 1, "") && canProceedProfileDelete(p, 3, ""), `${n}: 1. ve 3. katman ifade istemez`);
}

console.log("\nD) Sunucu onay sayısı aşağı çekilmez");
ok(profileDeletePlan("bulk", 5, 4).required === 4, "sunucu 4 isterse 4 katman");
ok(profileDeletePlan("bulk", 5, 1).required === 3, "3+ toplu: sunucu 1 dese de en az 3 katman");
ok(profileDeletePlan("bulk", 5, null).required === 3, "önizleme yokken toplu varsayılan 3");
ok(profileDeletePlan("single", 1, null).required === 2, "önizleme yokken tekli varsayılan 2");

console.log("\nE) Statik bağlantı — ProfileDeleteFlow");
{
  const root = path.resolve(__dirname, "../../..");
  const src = readFileSync(path.join(root, "app/admin/astroloji/_components/ProfileDeleteFlow.tsx"), "utf8");
  ok(/from "\.\.\/_lib\/profileDeletePlan"/.test(src), "bileşen ortak planı içe aktarıyor");
  ok(/profileDeletePlan\(mode, n, preview\?\.requiredConfirmations\)/.test(src), "plan sunucu onay sayısıyla kuruluyor");
  ok(/disabled=\{busy \|\| !canProceed\}/.test(src), "Evet düğmesi ifade eşleşmeden devre dışı");
  ok(/onClick=\{onYes\}/.test(src), "Evet düğmesi onYes'e bağlı");
  ok((src.match(/void finalDelete\(\)/g) ?? []).length === 1 && /action === "delete"\) void finalDelete\(\)/.test(src), "DELETE yalnız profileDeleteAction → \"delete\" sonucunda");
  ok(/data-testid="astro-delete-phrase"/.test(src), "ifade alanı test kimliğiyle mevcut");
  ok(/ortak analiz/.test(src) && /KVKK kapsamlı/.test(src) && /Danışan Yolculuğu/.test(src) && /geri alınamaz/.test(src), "astrolojiye özel uyarı metinleri korunuyor");
  ok(/onClick=\{onClose\}/.test(src) && /Vazgeç/.test(src), "Vazgeç her katmanda onClose (DELETE yok)");
}

console.log(`\nPASS ${pass} · FAIL ${fail}`);
if (fail) {
  console.log("Başarısız:\n - " + failures.join("\n - "));
  process.exit(1);
}
