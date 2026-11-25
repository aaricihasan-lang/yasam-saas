/**
 * I18N — Ayarlar › Sistem Yedeği / Geri Yükleme: katalog + gösterim harness'ı (DB / ağ YOK).
 * Çalıştırma: npx tsx scripts/settings-backup-i18n/backup-i18n.harness.ts
 *
 *  [K] Katalog: TR modül / tablo etiketleri lib/backup/registry ile BİREBİR (165 tablo + 17 modül); EN eksiksiz, Türkçe
 *      karakter yok; TR ve EN anahtar ağacı aynı.
 *  [T] TR BİREBİR: next-intl createTranslator ile TR çıktısı, değişiklikten önceki şablon dizeleriyle karakter karakter
 *      aynı (binlik ayraç yok, kesme işaretleri, çoğul sarmalı).
 *  [V] Gösterim yardımcıları (app/settings/backupI18n): TR'de sunucu/istemci Türkçe metni birebir; EN'de yalnız koddan;
 *      lib/backup'ın ürettiği HER kodun EN metni var ve Türkçe karakter içermiyor; bilinmeyen kod → genel metin.
 *  [S] Dil bağımsızlığı (statik): yedek hattı (lib/backup/*, yedek / geri yükleme route'ları) hiçbir dil girdisi
 *      okumaz (next-intl, lib/i18n, NEXT_LOCALE, accept-language yok) → dosya içeriği ekran dilinden etkilenemez.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { BACKUP_REGISTRY, EXPORT_MODULE_ORDER, MODULE_LABELS, isExportable, moduleKeyOf } from "../../lib/backup/registry";
import { FAILURE_LABELS } from "../../lib/backup/format";
import {
  clientErrorText,
  codedText,
  localizedError,
  localizedLines,
  moduleLabel,
  tableLabel,
  tableTitle,
  type BackupTranslator,
} from "../../app/settings/backupI18n";
import { BackupClientError } from "../../lib/backup/client";
import type { CodedMessage } from "../../lib/backup/types";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message.slice(0, 600));
  }
}

type Tree = { [k: string]: string | Tree };
const load = (loc: string) => JSON.parse(readFileSync(join(ROOT, `messages/${loc}/settings.backup.json`), "utf8")) as { settings: { backup: Tree } };
const TR = load("tr");
const EN = load("en");
const leaves = (o: string | Tree, p = ""): [string, string][] =>
  typeof o === "string" ? [[p, o]] : Object.entries(o).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k));
const TURKISH = /[ğüşıöçĞÜŞİÖÇâÂ]/;

const mk = (locale: "tr" | "en", messages: unknown): BackupTranslator =>
  createTranslator({ locale, messages: messages as never, namespace: "settings.backup" as never }) as unknown as BackupTranslator;
const tTr = mk("tr", TR);
const tEn = mk("en", EN);
const exportable = BACKUP_REGISTRY.filter(isExportable);

// ─── [K] Katalog ─────────────────────────────────────────────────────────────
await check("K1 TR tablo etiketleri registry ile birebir (165)", () => {
  const tables = TR.settings.backup.tables as Tree;
  assert.equal(exportable.length, 165);
  assert.equal(Object.keys(tables).length, exportable.length);
  for (const e of exportable) assert.equal(tables[e.table], e.label, e.table);
});
await check("K2 TR modül etiketleri MODULE_LABELS ile birebir (17)", () => {
  const mods = TR.settings.backup.modules as Tree;
  assert.equal(Object.keys(mods).length, 17);
  for (const k of EXPORT_MODULE_ORDER) assert.equal(mods[k], MODULE_LABELS[k], k);
});
await check("K3 TR ve EN anahtar ağacı aynı", () => {
  assert.deepEqual(leaves(TR.settings.backup).map(([k]) => k).sort(), leaves(EN.settings.backup).map(([k]) => k).sort());
});
await check("K4 EN değerlerinde Türkçe karakter yok + boş değer yok", () => {
  const bad = leaves(EN.settings.backup).filter(([, v]) => !v.trim() || TURKISH.test(v));
  assert.deepEqual(bad, []);
});
await check("K5 EN her dışa aktarılabilir tablo + modül için etiket var", () => {
  for (const e of exportable) assert.ok(tEn.has(`tables.${e.table}`), e.table);
  for (const k of EXPORT_MODULE_ORDER) assert.ok(tEn.has(`modules.${k}`), k);
});
await check("K6 TR başarısızlık etiketleri FAILURE_LABELS ile birebir", () => {
  for (const [code, label] of Object.entries(FAILURE_LABELS)) assert.equal(tTr(`failures.${code}`), label, code);
  for (const code of Object.keys(FAILURE_LABELS)) assert.ok(tEn.has(`failures.${code}`), code);
});
await check("K7 Owner onaylı adlar EN katalogda", () => {
  const m = EN.settings.backup.modules as Tree;
  assert.equal(m.astrology, "Celestial Atlas");
  assert.equal(m.sifa_rehberi, "Natural Wellness Guide");
  assert.equal(m.cupping, "Cupping & Hijama");
  assert.equal(m.clients, "Client Journey");
  assert.equal(m.stones, "Natural Stones");
});

// ─── [T] TR birebir (eski şablonlar) ─────────────────────────────────────────
await check("T1 TR statik metinler eski kaynakla birebir", () => {
  const exp: Record<string, string> = {
    "backup.title": "Sistem Yedeği — JSON",
    "backup.excludedNote":
      'Hesap/oturum bilgileri, yönetici kayıtları, arama indeksleri ve paylaşımlı kataloglar yedeğe alınmaz (dosyadaki "excluded" listesinde gerekçeleriyle yazılıdır).',
    "backup.preparing": "Hazırlanıyor…",
    "backup.download": "Sistem Yedeği İndir",
    "backup.planPreparing": "Plan hazırlanıyor…",
    "backup.hdFilesRow": "Human Design görselleri (dosya)",
    "backup.hdFilesProgress": "Human Design görselleri",
    "backup.toastOkTitle": "Yedek Alındı",
    "backup.toastIncompleteTitle": "Yedek EKSİK",
    "backup.failed": "Yedek alınamadı.",
    "restore.status.COMPLETE": "TAMAMLANDI",
    "restore.status.PARTIAL": "KISMİ",
    "restore.status.FAILED": "BAŞARISIZ",
    "restore.introTitle": "Geri Yükleme hesabınızı yedek tarihindeki hâline döndürmez. Yalnız eksik kayıtlar eklenir; mevcut kayıtlar değiştirilmez veya silinmez.",
    "restore.intro4":
      "Human Design görselleri dosyadan geri yüklenir (boyut ve SHA-256 doğrulamalı, mevcut dosyanın üzerine yazılmaz); diğer modüllerin fotoğraf ve dosyaları yedeğe dahil değildir ve geri yüklenmez.",
    "restore.otherAccount":
      "Bu yedek başka bir hesaptan alınmış. Kayıt kimlikleri korunur; kaynak hesapta hâlâ duran kayıtlar 'başka hesapta mevcut' olarak atlanır.",
    "restore.invalidJson":
      "Dosya geçerli bir JSON yedeği değil (bozuk, yarım kalmış veya boş dosya). Sistem Yedeği sekmesinden alınmış dosyayı seçin.",
    "restore.readFailed": "Dosya okunamadı.",
    "restore.confirm":
      "Onaylıyorum: yalnız eksik kayıtlar eklenecek; mevcut kayıtlarım değiştirilmeyecek veya silinmeyecek ve hesabım yedek tarihindeki hâline dönmeyecek.",
    "restore.toastComplete": "Eksik kayıtlar eklendi; mevcut kayıtlar değiştirilmedi.",
    "restore.toastPartial": "Geri yükleme kısmen tamamlandı; ayrıntılar aşağıda.",
    "restore.failed": "Geri yükleme başarısız.",
    "restore.skippedTitle": "Atlanan tablolar",
    "restore.restoring": "Geri Yükleniyor…",
    "restore.submit": "Yedeği İçe Aktar",
    "restore.pickAria": "Yedek dosyası seç",
    "restore.pickHint": "Dosyayı seçmek için tıklayın",
    "restore.fileLabel": "JSON Yedek Dosyası",
  };
  for (const [k, v] of Object.entries(exp)) assert.equal(tTr(k), v, k);
});
await check("T2 TR parametreli metinler eski şablonla birebir (binlik ayraç yok)", () => {
  const n = 12345;
  const cases: [string, Record<string, string | number>, string][] = [
    ["backup.moduleItem", { label: "Danışan Yolculuğu", count: 14, n: "14" }, "Danışan Yolculuğu (14 tablo)"],
    ["backup.moduleItem", { label: "Genel", count: 1, n: "1" }, "Genel (1 tablo)"],
    ["backup.progress", { index: "3", total: "165", label: "Danışan Notları", rows: String(n) }, `Tablo 3/165: Danışan Notları — ${n} kayıt`],
    ["backup.toastOkBody", { rows: String(n) }, `Tamlık kontrolü geçti (${n} kayıt).`],
    ["backup.toastIncompleteBody", { count: 2, n: "2" }, "2 tablo tam okunamadı. Ayrıntılar aşağıda; lütfen tekrar deneyin."],
    ["backup.outcomeComplete", { tables: "165", rows: String(n) }, `Tamlık kontrolü geçti: 165 tablonun tamamı eksiksiz okundu (${n} kayıt).`],
    ["backup.outcomeIncomplete", { count: 1, n: "1" }, "Yedek EKSİK: 1 tablo tam okunamadı. Dosya indirildi ama bu tablolar için güvenilir değildir."],
    ["backup.outcomeFile", { name: "yasam-yedek-2026-11-25.json" }, "Dosya: yasam-yedek-2026-11-25.json"],
    ["backup.rows", { rows: String(n) }, `${n} kayıt`],
    ["backup.rowsOfExpected", { rows: "5", expected: "6" }, "5 / 6 kayıt"],
    ["restore.badge.inserted", { n: "1200" }, "1200 eklendi"],
    ["restore.badge.present", { n: "0" }, "0 zaten vardı"],
    ["restore.badge.unlicensed", { n: "3" }, "3 lisans dışı"],
    ["restore.badge.parentMissing", { n: "4" }, "4 bağlı kaydı yok"],
    ["restore.badge.failed", { n: "5" }, "5 başarısız"],
    ["restore.droppedColumns", { columns: "a, b" }, "Tanınmayan alanlar yok sayıldı: a, b"],
    ["restore.incompleteInFile", { count: 2, n: "2", tables: "Danışanlar, Seanslar" }, "Bu yedek dosyasında 2 tablo alındığı sırada EKSİK işaretlenmiş: Danışanlar, Seanslar"],
    ["restore.valid", { version: "3.0", tables: "3", rows: String(n) }, `✓ v3.0 — 3 tablo, ${n} kayıt; biçim geçerli.`],
    ["restore.progress", { index: "2", total: "9", label: "Danışanlar", sent: "200", totalRows: "1500" }, "Tablo 2/9: Danışanlar — 200/1500 kayıt"],
    ["restore.result", { status: "TAMAMLANDI" }, "Sonuç: TAMAMLANDI"],
    ["restore.resultTotals", { inserted: "1500", present: "2" }, " — 1500 kayıt eklendi, 2 kayıt zaten vardı"],
  ];
  for (const [k, v, exp] of cases) assert.equal(tTr(k, v), exp, k);
});
await check("T3 TR zengin metin (strong) eski JSX ile birebir", () => {
  const tr = createTranslator({ locale: "tr", messages: TR as never, namespace: "settings.backup" as never }) as unknown as {
    markup(k: string, v: Record<string, (c: string) => string>): string;
  };
  assert.equal(
    tr.markup("backup.intro", { strong: (c) => `<strong>${c}</strong>` }),
    "Veritabanı kayıtlarınızın JSON yedeği; <strong>Human Design harita ve rapor görselleri dahildir</strong>, diğer modüllerin fotoğraf ve dosyaları dahil değildir. Bu dosya Geri Yükleme sekmesi ile yeniden içe aktarılabilir. İndirme sonunda her tablo sunucudaki kayıt sayısıyla karşılaştırılır ve sonuç aşağıda gösterilir.",
  );
});
await check("T4 TR tableTitle / tableLabel eski kural ile birebir (tüm registry + bilinmeyen + hd_files)", () => {
  for (const e of BACKUP_REGISTRY) {
    const old = isExportable(e) || true ? `${MODULE_LABELS[moduleKeyOf(e)] ?? ""} › ${e.label}` : "";
    if (isExportable(e)) {
      assert.equal(tableTitle(tTr, e.table), old, e.table);
      assert.equal(tableLabel(tTr, e.table), e.label, e.table);
    } else {
      // Yedek dışı tablolar: eski TABLE_LABEL[t] = registry etiketi (= tablo kimliği, off()).
      assert.equal(tableLabel(tTr, e.table), e.label, e.table);
    }
  }
  assert.equal(tableTitle(tTr, "hd_files"), "hd_files");
  assert.equal(tableLabel(tTr, "bilinmeyen_tablo"), "bilinmeyen_tablo");
  for (const k of EXPORT_MODULE_ORDER) assert.equal(moduleLabel(tTr, k), MODULE_LABELS[k]);
});

// ─── [V] Gösterim yardımcıları ───────────────────────────────────────────────
/** lib/backup'ın ürettiği dil-bağımsız kodlar (kaynak taraması — yeni kod eklenirse EN metni zorunlu). */
const LIB_FILES = ["lib/backup/engine.ts", "lib/backup/client.ts", "lib/backup/format.ts", "lib/backup/service.ts"];
const emitted = new Set<string>();
for (const f of LIB_FILES) {
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const m of src.matchAll(/code: "([A-Z][A-Z0-9_]+)"/g)) emitted.add(m[1]);
  for (const m of src.matchAll(/"(FILE_[A-Z_]+|BACKUP_PLAN_FAILED|RESTORE_PLAN_FAILED)"/g)) emitted.add(m[1]);
}
const SERVER_BODY_CODES = new Set(["BACKUP_BAD_TABLE", "RESTORE_BAD_PLAN", "RESTORE_NO_TABLE", "RESTORE_NO_ROWS", "RESTORE_CHUNK_TOO_LARGE"]);
await check("V1 lib/backup'ın ürettiği her kod için EN gösterim var (Türkçe yok, genel metne düşmez)", () => {
  assert.ok(emitted.size >= 25, `kod sayısı ${emitted.size}`);
  const generic = tEn("codes.SERVER_TEXT");
  for (const code of emitted) {
    if (SERVER_BODY_CODES.has(code) || code === "SERVER_TEXT") continue; // SERVER_TEXT bilinçli genel metin; HTTP yanıt gövdesi `code` → istemcide HTTP durumuyla gösterilir (V4).
    const params: Record<string, string | number> = { status: 500, reason: "unlicensed", count: 2, expected: 5, rows: 4, ids: "x1", detail: "42P01: relation", version: "9.9", table: "sifa_topics", paths: "a/b.png", path: "a/b.png", code: "X_Y" };
    const text = codedText(tEn, { code, params });
    assert.ok(text && text !== generic, `${code} → genel metne düştü`);
    assert.ok(!TURKISH.test(text), `${code} → Türkçe: ${text}`);
  }
});
await check("V2 EN kod metinleri: parametreler, çoğul, sürüm yok, gerekçe etiketi", () => {
  assert.equal(codedText(tEn, { code: "COUNT_MISMATCH", params: { expected: 1200, rows: 1199 } }), "Count mismatch: expected 1200, read 1199");
  assert.equal(codedText(tEn, { code: "FK_NULLED", params: { count: 1 } }), "No linked (optional) record was found for 1 record; the link was left empty.");
  assert.equal(codedText(tEn, { code: "FK_NULLED", params: { count: 3 } }), "No linked (optional) record was found for 3 records; the link was left empty.");
  assert.equal(codedText(tEn, { code: "FILE_UNSUPPORTED_VERSION", params: { version: "" } }), "Unsupported backup version: (none)");
  assert.equal(codedText(tEn, { code: "SKIPPED", params: { reason: "membership_inactive" } }), "Skipped: membership not active");
  assert.equal(codedText(tEn, { code: "HTTP_STATUS", params: { status: 401 } }), "Your session could not be verified. Please sign in again.");
  assert.equal(codedText(tEn, { code: "HTTP_STATUS", params: { status: 502 } }), "Server error. Please try again later.");
  assert.equal(codedText(tEn, { code: "HTTP_STATUS", params: { status: 404 } }), "The action could not be completed (404).");
  assert.equal(codedText(tEn, { code: "BILINMEYEN_KOD" }), "The server reported an error");
});
await check("V3 localizedLines / localizedError: TR birebir, EN koddan, kodsuz fazlalık tek genel satır", () => {
  const texts = ["unlicensed: Modül hesabınızda aktif değil.", "3 kayıtta bağlı (isteğe bağlı) kayıt bulunamadı; bağlantı boş bırakıldı."];
  const codes: CodedMessage[] = [{ code: "SKIPPED", params: { reason: "unlicensed" } }, { code: "FK_NULLED", params: { count: 3 } }];
  assert.deepEqual(localizedLines(tTr, true, texts, codes), texts);
  const en = localizedLines(tEn, false, texts, codes);
  assert.equal(en.length, 2);
  assert.ok(en.every((x) => !TURKISH.test(x)));
  const legacy = localizedLines(tEn, false, ["eski sunucunun Türkçe uyarısı"], undefined);
  assert.deepEqual(legacy, ["The server reported an additional warning."]);
  assert.equal(localizedError(tTr, true, "Sayım uyuşmazlığı: beklenen 5, okunan 4", [{ code: "COUNT_MISMATCH", params: { expected: 5, rows: 4 } }]), "Sayım uyuşmazlığı: beklenen 5, okunan 4");
  assert.equal(localizedError(tEn, false, "Sayım uyuşmazlığı: beklenen 5, okunan 4", [{ code: "COUNT_MISMATCH", params: { expected: 5, rows: 4 } }]), "Count mismatch: expected 5, read 4");
  assert.equal(localizedError(tEn, false, null, undefined), null);
  assert.equal(localizedError(tEn, false, "Türkçe", undefined), "The server reported an error");
});
await check("V4 clientErrorText: TR mesaj birebir, EN HTTP/koddan, ağ hatası", () => {
  const e1 = new BackupClientError("Demo hesabında bu işlem kullanılamaz.", "BACKUP_PLAN_FAILED", 403, null);
  assert.equal(clientErrorText(tTr, true, e1, "backup.failed"), "Demo hesabında bu işlem kullanılamaz.");
  assert.equal(clientErrorText(tEn, false, e1, "backup.failed"), "You do not have permission for this action.");
  assert.equal(clientErrorText(tTr, true, new Error(""), "backup.failed"), "Yedek alınamadı.");
  assert.equal(clientErrorText(tEn, false, new TypeError("Failed to fetch"), "restore.failed"), "Connection error");
  assert.equal(clientErrorText(tEn, false, new Error("Türkçe bir şey"), "restore.failed"), "The restore failed.");
  const e2 = new BackupClientError("Geri yükleme planı alınamadı.", "RESTORE_PLAN_FAILED", null, null);
  assert.equal(clientErrorText(tEn, false, e2, "restore.failed"), "The restore plan could not be retrieved.");
});
await check("V5 EN tüm tablolar için tableTitle Türkçe karakter içermez", () => {
  for (const e of exportable) assert.ok(!TURKISH.test(tableTitle(tEn, e.table)), `${e.table}: ${tableTitle(tEn, e.table)}`);
});

// ─── [S] Dil bağımsızlığı (statik) ───────────────────────────────────────────
await check("S1 yedek hattı hiçbir dil girdisi okumaz (lib/backup + yedek/geri yükleme route'ları)", () => {
  const files = [
    ...readdirSync(join(ROOT, "lib/backup")).filter((f) => f.endsWith(".ts")).map((f) => `lib/backup/${f}`),
    "app/api/settings/backup/route.ts",
    "app/api/settings/backup/table/route.ts",
    "app/api/settings/backup/files/route.ts",
    "app/api/settings/restore/route.ts",
    "app/api/settings/restore/chunk/route.ts",
    "app/api/settings/restore/files/route.ts",
  ];
  const LOCALE_INPUT = /next-intl|@\/lib\/i18n|from "\.\.\/i18n|getLocale|NEXT_LOCALE|accept-language|requestTranslator|useLocale|useTranslations/i;
  const bad = files.filter((f) => LOCALE_INPUT.test(readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  assert.deepEqual(bad, []);
});
await check("S2 dil-bağımsız kodlar YEDEK DOSYASINA yazılmaz (BackupFileV3 / BackupTableDump tiplerinde yok)", () => {
  const types = readFileSync(join(ROOT, "lib/backup/types.ts"), "utf8");
  const dump = types.slice(types.indexOf("export type BackupTableDump"), types.indexOf("export type BackupStoredFile"));
  const file = types.slice(types.indexOf("export type BackupFileV3"), types.indexOf("// ─── Dil-bağımsız mesaj kodu"));
  assert.ok(dump.length > 50 && file.length > 50);
  assert.ok(!/code/i.test(dump), "BackupTableDump kod alanı içermemeli");
  assert.ok(!/_code|codes/i.test(file), "BackupFileV3 kod alanı içermemeli");
  const client = readFileSync(join(ROOT, "lib/backup/client.ts"), "utf8");
  // Dosyaya yazılan tablo bölümü yalnız bu 6 alanı taşır (error_codes ayrı sonuç alanında).
  assert.ok(client.includes("tables[t.table] = { module: t.module, expected_count: expected, row_count: rows.length, complete, error: finalError, rows };"));
});

console.log(`backup-i18n.harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
