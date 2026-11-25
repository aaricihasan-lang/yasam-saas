/**
 * I18N — Ayarlar › Sistem Yedeği / Geri Yükleme: katalog + gösterim harness'ı (DB / ağ YOK).
 * Çalıştırma: npx tsx scripts/settings-backup-i18n/backup-i18n.harness.ts
 *
 *  [K] Katalog: TR modül / tablo etiketleri lib/backup/registry ile BİREBİR (166 tablo + 17 modül); EN eksiksiz, Türkçe
 *      karakter yok; TR ve EN anahtar ağacı aynı.
 *  [T] TR BİREBİR: next-intl createTranslator ile TR çıktısı, değişiklikten önceki şablon dizeleriyle karakter karakter
 *      aynı (binlik ayraç yok, kesme işaretleri, çoğul sarmalı).
 *  [V] Gösterim yardımcıları (app/settings/backupI18n): TR'de sunucu/istemci Türkçe metni birebir; EN'de yalnız koddan;
 *      lib/backup'ın ürettiği HER kodun EN metni var ve Türkçe karakter içermiyor; bilinmeyen kod → genel metin.
 *  [A] Dışa Aktarım (Premium Word Arşivi): her kapsam notu / iş / uyarı kodlu; her kodun EN metni; EN gösterim Türkçe
 *      içermez (yalnız arşivdeki Türkçe dosya adları BENİOKU.txt / ARŞİV-RAPORU.txt anılır); TR birebir; arşiv DOSYASI
 *      üreticileri (BENİOKU / ARŞİV-RAPORU) kod alanı okumaz.
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
  archiveJobLabel,
  archiveJobMessage,
  archiveNote,
  archiveWarnings,
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
await check("K1 TR tablo etiketleri registry ile birebir (166)", () => {
  const tables = TR.settings.backup.tables as Tree;
  assert.equal(exportable.length, 166);
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
  // Arşiv içindeki dosya ADLARI (BENİOKU.txt, ARŞİV-RAPORU.txt) dosya içeriğinin parçasıdır ve Türkçe kalır → metinde
  // birebir anılır (kullanıcı arşivde bu adları görür); bunun dışında EN'de Türkçe karakter yok.
  const bad = leaves(EN.settings.backup).filter(([, v]) => !v.trim() || TURKISH.test(v.replace(/BENİOKU\.txt|ARŞİV-RAPORU\.txt/g, "")));
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
  // Owner §20 / A16 (R5): OKUNABİLİR Word çıktısı ekran dilinde — dil girdisi YALNIZ bu iki okunabilir-çıktı
  // modülünde. Teknik JSON yedek hattı (aşağıdaki denetim) bunları içe aktarmaz → yedek dosyası dil-bağımsız kalır.
  const READABLE_OUTPUT = ["lib/backup/fileText.ts", "lib/backup/readableExport.ts"];
  const bad = files
    .filter((f) => !READABLE_OUTPUT.includes(f))
    .filter((f) => LOCALE_INPUT.test(readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  assert.deepEqual(bad, []);
  const IMPORTS_READABLE = /from "(?:\.\/|@\/lib\/backup\/)(?:fileText|readableExport|readableView)"/;
  const technical = ["engine", "client", "format", "service", "registry", "types", "columns", "hdFiles", "sifaV2Files", "storagePaths"]
    .map((n) => `lib/backup/${n}.ts`)
    .concat(files.filter((f) => f.startsWith("app/api/settings/")));
  const leaks = technical.filter((f) => IMPORTS_READABLE.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepEqual(leaks, [], "teknik yedek hattı okunabilir-çıktı modüllerini içe aktarmamalı");
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

// ─── [A] Dışa Aktarım (Premium Word Arşivi) ──────────────────────────────────
const PLAN_SRC = readFileSync(join(ROOT, "lib/archive/server/plan.ts"), "utf8");
const ARCHIVE_CLIENT_SRC = readFileSync(join(ROOT, "lib/archive/client.ts"), "utf8");
const enArchive = (k: string) => tEn.has(k);
await check("A1 plan.ts: her kapsam notu scope_code + reason_code taşır; her iş display taşır; ham warnings.push yok", () => {
  const pushes = [...PLAN_SRC.matchAll(/(excluded|restricted|preferences)\.push\(\{(?:[^\n]*\}\);$|[\s\S]*?\n\s*\}\);)/gm)].map((m) => m[0]);
  assert.ok(pushes.length >= 20, `not sayısı ${pushes.length}`);
  for (const p of pushes) assert.ok(p.includes("scope_code") && p.includes("reason_code"), p.slice(0, 160));
  const jobs = [...PLAN_SRC.matchAll(/push\(\{\s*kind: "[a-z_]+"[\s\S]*?\}\);/g)].map((m) => m[0]);
  assert.ok(jobs.length >= 8, `iş sayısı ${jobs.length}`);
  for (const j of jobs) assert.ok(j.includes("display:"), j.slice(0, 160));
  // Tek warnings.push warn() yardımcısının içinde (metin + kod birlikte); başka ham çağrı yok.
  assert.equal((PLAN_SRC.match(/\bwarnings\.push\(/g) ?? []).length, 1, "plan.ts'te kodsuz warnings.push kalmamalı (warn() kullan)");
});
await check("A2 MEDIA_NOT_ARCHIVED ↔ MEDIA_NOT_ARCHIVED_CODES sayı eşit; kaynak etiketlerinin EN metni var", () => {
  const MEDIA_SRC = readFileSync(join(ROOT, "lib/archive/server/media.ts"), "utf8");
  const FILES_SRC = readFileSync(join(ROOT, "lib/archive/server/files.ts"), "utf8");
  const notArchived = MEDIA_SRC.slice(MEDIA_SRC.indexOf("export const MEDIA_NOT_ARCHIVED"));
  const naCount = (notArchived.slice(0, notArchived.indexOf("];")).match(/\{ scope: "/g) ?? []).length;
  const codes = [...PLAN_SRC.matchAll(/\{ scope: "(NA_[A-Z_]+)", reason: "([A-Z_]+)" \}/g)].map((m) => [m[1], m[2]]);
  assert.equal(codes.length, naCount);
  assert.equal(naCount, 5);
  for (const [sc, rc] of codes) assert.ok(enArchive(`archive.scopes.${sc}`) && enArchive(`archive.reasons.${rc}`), `${sc}/${rc}`);
  const mediaKeys = [...MEDIA_SRC.matchAll(/^  ([a-z_]+): \{ table: "/gm)].map((m) => m[1]);
  assert.ok(mediaKeys.length >= 11, `medya kaynağı ${mediaKeys.length}`);
  for (const k of mediaKeys) assert.ok(enArchive(`archive.mediaSources.${k}`), k);
  const fileKeys = [...FILES_SRC.matchAll(/^  ([a-z_]+): \{ module: "/gm)].map((m) => m[1]);
  assert.equal(fileKeys.length, 4);
  for (const k of fileKeys) assert.ok(enArchive(`archive.fileSources.${k}`), k);
});
await check("A3 lib/archive'ın ürettiği her kodun EN metni var", () => {
  const srcs = ["lib/archive/server/plan.ts", "lib/archive/server/data.ts", "lib/archive/server/reports.ts", "lib/archive/client.ts", "lib/archive/server/handlers.ts"]
    .map((f) => readFileSync(join(ROOT, f), "utf8"))
    .join("\n");
  const found = new Set<string>();
  for (const m of srcs.matchAll(/(?:cm\(|code: |skipCode: )"([A-Z][A-Z0-9_]+)"/g)) found.add(m[1]);
  const special = new Set(["TABLE", "FILE_SOURCE", "MEDIA_SOURCE", "MODULE_LIST", "HTTP_STATUS", "SERVER_CODE", "NETWORK", "UNKNOWN"]);
  const missing = [...found].filter((c) => !special.has(c) && !["scopes", "reasons", "warnings", "jobs", "messages", "serverCodes"].some((g) => enArchive(`archive.${g}.${c}`)));
  assert.deepEqual(missing, []);
  assert.ok(found.size >= 45, `kod sayısı ${found.size}`);
});
await check("A4 EN gösterim: kapsam notu / uyarı / iş adı / iş mesajı Türkçe içermez; TR birebir", () => {
  type C = { code: string; params?: Record<string, string | number> };
  const notes: { scope: string; reason: string; scope_code: C; reason_code: C }[] = [
    { scope: "Seçilmeyen modüller", reason: "Numeroloji, Human Design", scope_code: { code: "UNSELECTED_MODULES" }, reason_code: { code: "MODULE_LIST", params: { modules: "numerology,human_design" } } },
    { scope: "Danışan Yolculuğu › Seanslar", reason: "kayıt tarihi alanı yok (tarih aralığı seçildi)", scope_code: { code: "TABLE", params: { module: "clients", table: "client_sessions" } }, reason_code: { code: "NO_CREATED_AT" } },
    { scope: "Gökyüzü Atlası hazır raporları (3 kayıtlı analiz)", reason: "x", scope_code: { code: "ASTRO_REPORTS", params: { count: 3 } }, reason_code: { code: "ATLAS_NO_PERMISSION" } },
    { scope: "Kayıt tarihi aralığı", reason: "y", scope_code: { code: "DATE_RANGE" }, reason_code: { code: "DATE_RANGE_OUTSIDE", params: { from: "2026-01-01", to: "" } } },
    { scope: "Numeroloji hazır raporları", reason: "z", scope_code: { code: "NUMEROLOGY_REPORTS" }, reason_code: { code: "PERMISSION_OFF", params: { module: "numerology" } } },
    { scope: "Analiz görselleri", reason: "w", scope_code: { code: "FILE_SOURCE", params: { source: "analysis_image" } }, reason_code: { code: "FILES_LIST_FAILED", params: { detail: "42P01" } } },
    { scope: "Ürün & Stok fotoğrafları", reason: "v", scope_code: { code: "MEDIA_SOURCE", params: { table: "oil_inventory" } }, reason_code: { code: "NOT_CLIENT_LINKED_MEDIA" } },
  ];
  for (const n of notes) {
    const en = archiveNote(tEn, false, n);
    assert.ok(!TURKISH.test(en.scope + en.reason), JSON.stringify(en));
    assert.deepEqual(archiveNote(tTr, true, n), { scope: n.scope, reason: n.reason });
  }
  assert.deepEqual(archiveNote(tEn, false, notes[0]), { scope: "Modules not selected", reason: "Numerology, Human Design" });
  assert.equal(archiveNote(tEn, false, notes[3]).reason, "2026-01-01 – today; records outside the range are out of scope");
  assert.equal(archiveNote(tEn, false, notes[2]).scope, "Celestial Atlas ready reports (3 saved analyses)");
  assert.equal(archiveNote(tEn, false, { scope: "eski", reason: "eski" }).reason, "details in BENİOKU.txt (in Turkish)");
  const w = archiveWarnings(tEn, false, ["a", "b"], [{ code: "TABLE_COUNT_FAILED", params: { module: "clients", table: "clients", detail: "timeout" } }, { code: "AUDIT_NOT_WRITTEN" }]);
  assert.deepEqual(w, ["Client Journey › Clients: the count could not be read (timeout) — this section may be incomplete.", "The audit record could not be written; the archive can still be created."]);
  assert.deepEqual(archiveWarnings(tTr, true, ["a"], []), ["a"]);
  const jobs: { kind: string; label: string; display: C }[] = [
    { kind: "data", label: "Danışan Yolculuğu — kayıt dökümü", display: { code: "DATA_JOB", params: { module: "clients" } } },
    { kind: "client_dossier", label: "Danışan dosyası — Ayşe Yılmaz", display: { code: "DOSSIER_JOB", params: { name: "Ayşe Yılmaz" } } },
    { kind: "numerology_record", label: "Numeroloji — kayıt", display: { code: "NUMEROLOGY_JOB", params: { name: "" } } },
    { kind: "hd_report", label: "HD raporu — Danışan Yolculuğu bağı olmayan", display: { code: "HD_REPORT_JOB", params: { name: "" } } },
    { kind: "astro_report", label: "Atlas — analiz", display: { code: "ASTRO_JOB", params: { name: "" } } },
    { kind: "file", label: "Analiz görseli 1234abcd.png", display: { code: "FILE_JOB", params: { source: "analysis_image", name: "", id: "1234abcd" } } },
    { kind: "media", label: "Kişisel Ofis görselleri — 1234abcd", display: { code: "MEDIA_JOB", params: { table: "expert_workspace_assets", id: "1234abcd" } } },
  ];
  assert.deepEqual(
    jobs.map((j) => archiveJobLabel(tEn, false, j)),
    [
      "Client Journey — record dump",
      "Client file — Ayşe Yılmaz", // kullanıcı içeriği (danışan adı) çevrilmez
      "Numerology — record",
      "HD report — not linked to Client Journey",
      "Atlas — analysis",
      "Analysis images — 1234abcd",
      "Personal Office images — 1234abcd",
    ],
  );
  for (const j of jobs) assert.equal(archiveJobLabel(tTr, true, j), j.label);
  const msgs: [string, C, string][] = [
    ["İptal edildi.", { code: "JOB_CANCELLED" }, "Cancelled."],
    ["Sunucu hatası (502).", { code: "HTTP_STATUS", params: { status: 502 } }, "Server error. Please try again later."],
    ["x", { code: "SERVER_CODE", params: { code: "RATE_LIMITED", status: 429 } }, "Too many requests; the archive continues where it left off after a short wait."],
    ["12 / 15 kayıt arşivlendi · Hata", { code: "DATA_PARTIAL", params: { rows: 12, expected: 15, errors: 1 } }, "12 / 15 records archived · 1 part errors (details in ARŞİV-RAPORU.txt)"],
    ["2 görsel…", { code: "IMAGES_REJECTED", params: { count: 2 } }, "2 image links could not be verified as belonging to this account and were not archived (the record is in the JSON backup)."],
    ["Android…", { code: "JOB_SKIPPED" }, "Skipped due to a permission or device restriction (details in ARŞİV-RAPORU.txt)."],
  ];
  for (const [tr, c, en] of msgs) {
    assert.equal(archiveJobMessage(tEn, false, tr, c), en);
    assert.equal(archiveJobMessage(tTr, true, tr, c), tr);
  }
});
await check("A5 TR arşiv arayüz metinleri eski kaynakla birebir (örnekler)", () => {
  const cases: [string, Record<string, string | number>, string][] = [
    ["archive.modulesHeading", { selected: "17", total: "17" }, "1 · Modüller (17/17)"],
    ["archive.moduleTables", { count: 29, n: "29" }, "29 tablo"],
    ["archive.someClients", { max: "100" }, "Seçili danışanlar (en fazla 100)"],
    ["archive.planSummary", { jobs: "1200", records: "34567" }, "1200 parça · 34567 kayıt"],
    ["archive.summaryLine", { label: "Numeroloji", records: "5" }, "Numeroloji: 5 kayıt"],
    ["archive.excludedTitle", { n: "3" }, "Kapsam dışı kalanlar (3)"],
    ["archive.noteLine", { scope: "A", reason: "B" }, "• A: B"],
    ["archive.progressLine", { done: "3", total: "10", pct: "30" }, "3 / 10 parça · %30"],
    ["archive.progressCounts", { ok: "1", failed: "2", skipped: "3", empty: "4", records: "5" }, "Başarılı 1 · Başarısız 2 · Atlanan 3 · Boş 4 · 5 kayıt"],
    ["archive.resultCounts", { ok: "1", failed: "0", skipped: "0", empty: "2", records: "10", files: "3", size: "1.5 MB" }, "Başarılı 1 · Başarısız 0 · Atlanan 0 · Boş (içerik yok) 2 · 10 kayıt · 3 dosya · 1.5 MB"],
    ["archive.emptyNote", { count: 2, n: "2" }, "2 kayıtta rapora girecek içerik yoktu (ör. yalnız ad bilgisi olan danışan); bu bir hata değildir, kayıtlar Kayıt Dökümü'nde yer alır."],
    ["archive.retry", { count: 4, n: "4" }, "Başarısız 4 parçayı yeniden dene (ek arşiv)"],
    ["archive.toast.complete", { files: "12", size: "3.4 MB", volumes: " (2 cilt)" }, "12 dosya · 3.4 MB indirildi (2 cilt)."],
    ["archive.toast.partial", { count: 2, n: "2" }, "2 parça alınamadı. Arşiv indirildi; eksikler ARŞİV-RAPORU.txt dosyasında."],
    ["archive.toast.pickClient", {}, "Danışan seçin veya 'Tüm danışanlar'ı işaretleyin."],
    ["archive.intro2", {}, "Fotoğraf ve ekler isteğe bağlıdır; Word'e gömülmez, ayrı dosya olarak eklenir."],
    ["archive.intro3", {}, 'Eksik kalan parça olursa arşiv "EKSİK" olarak işaretlenir ve ARŞİV-RAPORU.txt dosyasında listelenir.'],
    ["archive.restrictedTitle", {}, 'Size ait ama bu arşive alınamayacak içerik var — arşiv "EKSİK" olarak işaretlenecek:'],
  ];
  for (const [k, v, exp] of cases) assert.equal(tTr(k, v), exp, k);
  const tr = createTranslator({ locale: "tr", messages: TR as never, namespace: "settings.backup" as never }) as unknown as {
    markup(k: string, v: Record<string, (c: string) => string>): string;
  };
  const strong = { strong: (c: string) => `<strong>${c}</strong>` };
  assert.equal(
    tr.markup("archive.intro", strong),
    "<strong>Premium Word Arşivi</strong> (ZIP): kayıtlarınızın okunabilir Word dökümü, danışan dosyaları ve kayıtlı hazır analiz raporlarınız düzenli klasörlerde. Raporlar yeniden hesaplanmaz; kayıtlı hâlleriyle üretilir.",
  );
  assert.equal(tr.markup("archive.intro1", strong), "Word arşivi <strong>geri yüklenemez</strong>. Hesaba geri yükleme için <strong>Sistem Yedeği (JSON)</strong> sekmesini kullanın.");
});
await check("A6 arşiv DOSYA içeriği dil-bağımsız: BENİOKU / ARŞİV-RAPORU üreticileri yalnız Türkçe alanları okur; lib/archive dil girdisi okumaz", () => {
  const readme = ARCHIVE_CLIENT_SRC.slice(ARCHIVE_CLIENT_SRC.indexOf("function readme("));
  assert.ok(readme.length > 500);
  assert.ok(!/_code|display|message_code|warning_codes/.test(readme), "readme/runReport kod alanı okumamalı");
  const LOCALE_INPUT = /next-intl|@\/lib\/i18n|getLocale|NEXT_LOCALE|accept-language|requestTranslator|useLocale|useTranslations/i;
  const dir = ["lib/archive/client.ts", "lib/archive/types.ts", "lib/archive/zip.ts", "lib/archive/scope.ts", ...readdirSync(join(ROOT, "lib/archive/server")).map((f) => `lib/archive/server/${f}`)];
  // Owner §20 / A16 (R5): Kayıt Dökümü Word İÇERİĞİ plan dilinde (`file_locale`). Dil girdisi YALNIZ bu tesisatta:
  // http (istek dili → plan), handlers (plan dili → parça), data (belge metinleri), reports (ctx tipi).
  const LOCALE_PLUMBING = ["lib/archive/server/http.ts", "lib/archive/server/handlers.ts", "lib/archive/server/data.ts", "lib/archive/server/reports.ts"];
  const bad = dir
    .filter((f) => !LOCALE_PLUMBING.includes(f))
    .filter((f) => LOCALE_INPUT.test(readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  assert.deepEqual(bad, []);
});

console.log(`backup-i18n.harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
