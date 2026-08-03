/**
 * HD Danışmanlık F0B · Hak Çözümleyici Harness
 * ============================================
 * GERÇEK rightsResolver import edilir. default-deny; effective right override;
 * ürün ayrımı; quotation matrisi; translation izni ↔ çeviri varlığı ayrılığı.
 * Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/rights-resolver-harness.mjs
 */
import {
  evaluateBothProducts,
  evaluateProductRights,
  evaluateQuotation,
  evaluateSectionRights,
  evaluateTranslation,
  resolveEffectiveRights,
} from "@/lib/human-design/consultation/rightsResolver";

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}
const denies = (d, reason) => d.allowed === false && d.reason === reason;

// Temel kaynak şablonları
function src(over = {}) {
  return {
    internal_use_allowed: false,
    expert_delivery_allowed: false,
    private_report_use_allowed: false,
    translation_allowed: false,
    quotation_allowed: false,
    quotation_word_limit: null,
    rights_status: "licensed",
    ...over,
  };
}
function ovr(over = {}) {
  return {
    internal_use_allowed: null,
    expert_delivery_allowed: null,
    private_report_use_allowed: null,
    translation_allowed: null,
    quotation_allowed: null,
    quotation_word_limit: null,
    rights_status: null,
    ...over,
  };
}

// ── Effective: source allow / passage NULL → source aynen ───────────────────
{
  const eff = resolveEffectiveRights(src({ private_report_use_allowed: true }), null);
  check("source allow / override yok → allow", eff.private_report_use_allowed === true);
}
// ── source deny / passage allow override → allow ────────────────────────────
{
  const eff = resolveEffectiveRights(src({ private_report_use_allowed: false }), ovr({ private_report_use_allowed: true }));
  check("source deny / override allow → allow", eff.private_report_use_allowed === true);
}
// ── source allow / passage deny override → deny ─────────────────────────────
{
  const eff = resolveEffectiveRights(src({ private_report_use_allowed: true }), ovr({ private_report_use_allowed: false }));
  check("source allow / override deny → deny", eff.private_report_use_allowed === false);
}
// ── override NULL alan → source devralınır ──────────────────────────────────
{
  const eff = resolveEffectiveRights(src({ expert_delivery_allowed: true }), ovr({}));
  check("override NULL → source devralınır", eff.expert_delivery_allowed === true);
}

// ── Ürün ayrımı ─────────────────────────────────────────────────────────────
check("client_report: private zorunlu (yoksa deny)", denies(evaluateProductRights(src({}), "client_report"), "PRIVATE_REPORT_USE_DENIED"));
check("client_report: private var → allow", evaluateProductRights(src({ private_report_use_allowed: true }), "client_report").allowed === true);
check("expert_guide: internal/expert yoksa deny", denies(evaluateProductRights(src({}), "expert_guide"), "EXPERT_DELIVERY_DENIED"));
check("expert_guide: internal var → allow", evaluateProductRights(src({ internal_use_allowed: true }), "expert_guide").allowed === true);
check("expert_guide: expert_delivery var → allow", evaluateProductRights(src({ expert_delivery_allowed: true }), "expert_guide").allowed === true);

// ── rights_status engeli (fail-closed) ──────────────────────────────────────
for (const status of ["restricted", "permission_pending", "unknown"]) {
  check(`status ${status} → client_report blocked`, denies(evaluateProductRights(src({ private_report_use_allowed: true, rights_status: status }), "client_report"), "RIGHTS_STATUS_BLOCKED"));
  check(`status ${status} → expert_guide blocked`, denies(evaluateProductRights(src({ internal_use_allowed: true, rights_status: status }), "expert_guide"), "RIGHTS_STATUS_BLOCKED"));
}

// ── "both": iki üründe AYRI (rehberde izinli, raporda reddedilebilir) ───────
{
  const eff = src({ expert_delivery_allowed: true, private_report_use_allowed: false });
  const both = evaluateBothProducts(eff);
  check("both: expert_guide allow", both.expert_guide.allowed === true);
  check("both: client_report deny", both.client_report.allowed === false);
}

// ── Translation: AÇIK izin; verified çeviri VARLIĞINDAN bağımsız ────────────
check("translation_allowed=false → deny", denies(evaluateTranslation(src({ translation_allowed: false })), "TRANSLATION_DENIED"));
check("translation_allowed=true → allow", evaluateTranslation(src({ translation_allowed: true })).allowed === true);
// "Çeviri mevcut" simülasyonu hak kararını DEĞİŞTİRMEZ (ayrılık):
const hasVerifiedTranslation = true; // dış gerçeklik — resolver'a girmez
check("çeviri varlığı izni türetmez (false kalır)", hasVerifiedTranslation && evaluateTranslation(src({ translation_allowed: false })).allowed === false);

// ── Quotation matrisi ───────────────────────────────────────────────────────
check("quotation_allowed=false → deny (limit olsa bile)", denies(evaluateQuotation(src({ quotation_allowed: false, quotation_word_limit: 50 }), 10), "QUOTATION_DENIED"));
check("quotation_allowed=true, needed yok → allow", evaluateQuotation(src({ quotation_allowed: true })).allowed === true);
check("quotation_allowed=true, limit=null, needed var → fail-closed", denies(evaluateQuotation(src({ quotation_allowed: true, quotation_word_limit: null }), 10), "QUOTATION_LIMIT_UNKNOWN"));
check("quotation needed<=limit → allow", evaluateQuotation(src({ quotation_allowed: true, quotation_word_limit: 50 }), 50).allowed === true);
check("quotation needed>limit → deny", denies(evaluateQuotation(src({ quotation_allowed: true, quotation_word_limit: 50 }), 51), "QUOTATION_LIMIT_EXCEEDED"));

// ── Bölüm-seviye: TÜM evidence passage'ları geçmeli; boş evidence → deny ────
check("section: evidence yok → NO_RIGHTS_INFO", denies(evaluateSectionRights("client_report", []), "NO_RIGHTS_INFO"));
check(
  "section: bir passage deny → bölüm deny",
  evaluateSectionRights("client_report", [
    { source: src({ private_report_use_allowed: true }) },
    { source: src({ private_report_use_allowed: false }) },
  ]).allowed === false,
);
check(
  "section: hepsi allow → bölüm allow",
  evaluateSectionRights("client_report", [
    { source: src({ private_report_use_allowed: true }) },
    { source: src({ private_report_use_allowed: false }), override: ovr({ private_report_use_allowed: true }) },
  ]).allowed === true,
);

console.log(`\nrights-resolver-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
