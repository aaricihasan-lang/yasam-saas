// ============================================================
// Aromaterapi C3D-D — Bilgi Kayıtları WRITE UI cutover sözleşme harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz, mutation yapmaz. Mevcut C2S/C2T POST/PATCH
// motorunun UI'a doğru bağlandığını, tenant/actor spoof edilmediğini, child preserve/
// clear/replace + reason + concurrency + demo + kapsam sınırlarını doğrular.
// FAIL → process.exit(1).
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function has(rel) { return existsSync(resolve(ROOT, rel)); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }
function noComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/^import[^\n]*$/gm, ""); }

const CREATE_PAGE = "app/aromaterapi/bilgi-kayitlari/yeni/page.tsx";
const EDIT_PAGE = "app/aromaterapi/bilgi-kayitlari/[id]/duzenle/page.tsx";
const VIEW = "app/aromaterapi/bilgi-kayitlari/_components/BilgiKayitlariView.tsx";
const DETAIL = "app/aromaterapi/bilgi-kayitlari/[id]/page.tsx";
const WRITE = "lib/aromaterapi/claimWrite.ts";
const HOOK = "app/aromaterapi/_components/write/useKnowledgeRecordForm.ts";
const FORM = "app/aromaterapi/_components/write/KnowledgeRecordForm.tsx";
const CHILD = "app/aromaterapi/_components/write/KnowledgeRecordChildEditors.tsx";
const CONFIG = "lib/aromaterapi/claimFormConfig.ts";

// ============================================================
console.log("\n[C3D-D-1] Route ve navigation");
// ============================================================
check("R01 yeni route var", has(CREATE_PAGE));
check("R02 yeni route create mode", /mode="create"/.test(read(CREATE_PAGE)));
check("R03 duzenle route var", has(EDIT_PAGE));
check("R04 duzenle route edit mode", /mode="edit"/.test(read(EDIT_PAGE)));
check("R05 yeni loading + duzenle loading", has("app/aromaterapi/bilgi-kayitlari/yeni/loading.tsx") && has("app/aromaterapi/bilgi-kayitlari/[id]/duzenle/loading.tsx"));
check("R06 listede Yeni Bilgi Kaydı aksiyonu", /bilgi-kayitlari\/yeni/.test(read(VIEW)) && /Yeni Bilgi Kaydı/.test(read(VIEW)));
check("R07 detayda Düzenle aksiyonu", /\/duzenle/.test(read(DETAIL)) && /Düzenle/.test(read(DETAIL)));
check("R08 detayda Sil/DELETE aksiyonu YOK",
  !/Sil<\/|onDelete|handleDelete|deleteKnowledge|deleteClaim|bulk.?delete/i.test(read(DETAIL)));
check("R09 modal içine sıkıştırma yok (bağımsız route)",
  read(CREATE_PAGE).includes("AromaterapiSectionShell") && read(EDIT_PAGE).includes("AromaterapiSectionShell"));
// Kullanıcı yüzeyinde serbest "claim" kelimesi yok (write UI dosyaları).
const userText = noComments(read(FORM)) + noComments(read(CREATE_PAGE)) + noComments(read(EDIT_PAGE));
check("R10 kullanıcı dilinde serbest 'claim' yok",
  !/["'>][^"'<]*\bclaim\b(?!_)[^"'<]*["'<]/i.test(userText), "form/route metninde 'claim'");
check("R11 'Bilgi Kaydı' terminolojisi", /Bilgi Kaydı|Bilgi Kayıtları/.test(read(FORM)));

// ============================================================
console.log("\n[C3D-D-2] Create contract");
// ============================================================
const W = read(WRITE);
check("C01 POST /api/aromaterapi/claims", /fetch\("\/api\/aromaterapi\/claims"/.test(W) && /method:\s*"POST"/.test(W));
check("C02 create reason opsiyonel (tip)", /reason\?:\s*string\s*\|\s*null/.test(W));
check("C03 tenant/actor/id gövdeye KONMAZ (yasak alan referansı yok)",
  !/tenant_id|tenantId|p_tenant_id|actor_user_id|actorUserId|p_actor_user_id/.test(noComments(W)));
const H = read(HOOK);
check("C04 double-submit guard (submitting kontrolü)", /if\s*\(\s*isDemo\s*\|\|\s*submitting/.test(H));
check("C05 required validation (fieldErrors)", /fieldErrors/.test(H) && /preparation_id/.test(H) && /conclusion/.test(H));
check("C06 başarı sonrası detay yönlendirmesi", /bilgi-kayitlari\/\$\{id\}/.test(read(FORM)) || /onCreated/.test(H));
check("C07 warnings görünür (SuccessPanel/Uyarılar)", /Uyarılar|warnings/.test(read(FORM)));

// ============================================================
console.log("\n[C3D-D-3] Update contract + concurrency");
// ============================================================
check("U01 PATCH /api/aromaterapi/claims/[id]", /fetch\(`\/api\/aromaterapi\/claims\/\$\{id\}`/.test(W) && /method:\s*"PATCH"/.test(W));
check("U02 GET ile hydrate (edit)", /fetchKnowledgeRecord/.test(read(EDIT_PAGE)) && /useAromaterapiDetail/.test(read(EDIT_PAGE)));
check("U03 out-of-tenant/eksik 404 ekranı", /notFound/.test(read(EDIT_PAGE)) && /bulunamadı/i.test(read(EDIT_PAGE)));
check("U04 update reason ZORUNLU", /mode === "edit"[\s\S]{0,120}reason/.test(H) && /Gerekçe zorunludur/.test(H));
check("U05 expected_updated_at gönderilir", /expected_updated_at:\s*initial\?\.updated_at/.test(H));
check("U06 scalar patch changed-only", /scalarPatch/.test(H) && /initialCore/.test(H));
check("U07 no-op submit engeli", /AROMA_NOOP/.test(H) && /hasChanges/.test(H));
check("U08 409 STALE conflict UX (sessiz overwrite yok)",
  /stale/.test(W) && /AROMA_STALE_CLAIM/.test(W) && /conflict=\{form\.result\?\.stale/.test(read(FORM)));
check("U09 preparation edit'te değişmez (salt-okunur)", /değiştirilemez/.test(read(FORM)));

// ============================================================
console.log("\n[C3D-D-4] Child preserve/clear/replace semantiği");
// ============================================================
check("D01 touched tracking", /markTouched/.test(H) && /touched/.test(H));
check("D02 update child yalnız touched ise gönderilir (preserve)",
  /if\s*\(\s*touched\.routes\s*\)\s*input\.routes/.test(H) &&
  /if\s*\(\s*touched\.relations\s*\)\s*input\.relations/.test(H));
check("D03 clear=[] / replace=array (map ile tam dizi)",
  /input\.sources\s*=\s*sources\.map/.test(H) && /input\.passages\s*=\s*passages\.map/.test(H));
check("D04 child editörleri her düzenlemede markTouched çağırır",
  (read(CHILD).match(/markTouched\(/g) || []).length >= 10);
check("D05 hydrate false-positive change yok (initial map, touched=false başlangıç)",
  /routes:\s*false,\s*populations:\s*false/.test(H));
check("D06 relations other_claim_id sözleşmesi (a/b istemciden gelmez)",
  /other_claim_id/.test(W) && /other_claim_id/.test(read(CONFIG)) && !/a_claim_id.*:/.test(noComments(W)));
check("D07 child key contract config (RPC allowlist birebir)",
  /CHILD_KEY_CONTRACT/.test(read(CONFIG)) &&
  /["']route_code["']/.test(read(CONFIG)) && /["']other_claim_id["']/.test(read(CONFIG)));

// ============================================================
console.log("\n[C3D-D-5] Demo / güvenlik");
// ============================================================
check("S01 demo mutation engeli (hook + form)", /isDemo/.test(H) && /isDemo/.test(read(FORM)));
check("S02 form demo read-only (FormShell isDemo)", /isDemo=\{isDemo\}/.test(read(FORM)));
check("S03 claimWrite server-only import ETMEZ", !/["']server-only["']/.test(W));
check("S04 browser service_role yok", !/service_role|getServerDb/.test(W + H + read(FORM) + read(CHILD)));
check("S05 ham DB hatası yok (stabil kod → TR mesaj)", /writeMessageForCode/.test(W) && !/error\.message|details|hint/.test(W));
check("S06 claimMutations.ts import edilmez (client)", !/service\/claimMutations/.test(W + H + read(FORM)));

// ============================================================
console.log("\n[C3D-D-6] UX / a11y");
// ============================================================
check("X01 C3D-A form primitives kullanılıyor",
  /AromaterapiFormShell/.test(read(FORM)) && /AromaterapiReasonField/.test(read(FORM)));
check("X02 dirty guard", /useAromaterapiDirtyGuard/.test(read(FORM)));
check("X03 44px + focus-visible (form alanları)",
  /min-h-\[44px\]/.test(read("app/aromaterapi/_components/write/KnowledgeRecordFields.tsx")) &&
  /focus-visible:ring/.test(read("app/aromaterapi/_components/write/KnowledgeRecordFields.tsx")));
check("X04 label↔input (htmlFor)", /htmlFor=\{id\}/.test(read("app/aromaterapi/_components/write/KnowledgeRecordFields.tsx")));
check("X05 picker'lar mevcut C3C read API kullanır (yeni endpoint yok)",
  /fetchPreparationList|fetchSourceList|fetchSourcePassageList|fetchKnowledgeRecordList/.test(read("app/aromaterapi/_components/write/KnowledgeRecordPickers.tsx")));
check("X06 search-as-you-type (minChars + debounce + abort)",
  /minChars/.test(read("app/aromaterapi/_components/write/EntitySearchPicker.tsx")) &&
  /AbortController/.test(read("app/aromaterapi/_components/write/EntitySearchPicker.tsx")));

// ============================================================
console.log("\n[C3D-D-7] Kapsam guard — git değişiklik kümesi");
// ============================================================
let changed = [];
try {
  const out = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  changed = out.split("\n").map((l) => l.slice(3).trim()).filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1].trim() : l)).map((l) => l.replace(/^"(.*)"$/, "$1"));
} catch (e) { bad("SC00 git status alınamadı", String(e)); }
const api = changed.filter((f) => f.startsWith("app/api/"));
const mig = changed.filter((f) => f.startsWith("supabase/migrations/") || f.endsWith(".sql"));
const cm = changed.filter((f) => f.includes("service/claimMutations.ts"));
const pkg = changed.filter((f) => /package(-lock)?\.json|pnpm-lock|yarn\.lock/.test(f));
const allowed = (f) =>
  f.startsWith("app/aromaterapi/bilgi-kayitlari/") ||
  f.startsWith("app/aromaterapi/_components/write/") ||
  f.startsWith("lib/aromaterapi/") ||
  f === "scripts/aromaterapi-c3d-d-claim-write-ui-harness.mjs";
const outside = changed.filter((f) => !allowed(f));
check("SC01 app/api değişikliği = 0", api.length === 0, api.join(","));
check("SC02 migration/SQL = 0", mig.length === 0, mig.join(","));
check("SC03 claimMutations.ts değişmedi = 0", cm.length === 0, cm.join(","));
check("SC04 package/lockfile = 0", pkg.length === 0, pkg.join(","));
check("SC05 kapsam dışı dosya = 0 (yalnız Aromaterapi write UI)", outside.length === 0, outside.join(","));

console.log(`\n──────────── C3D-D HARNESS: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) { console.log("Başarısızlar:\n  - " + failures.join("\n  - ")); process.exit(1); }
console.log("Tüm C3D-D sözleşme kontrolleri geçti.\n");
