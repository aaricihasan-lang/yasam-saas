/**
 * Doğaltaş Kütüphanesi F6 — KAYNAK, LİSANS BELGESİ VE GÖRSEL İZNİ KAYDI (owner bilgisayarından, elle; tekrar çalıştırılabilir).
 *
 * Neden: f6-offline-import.ts önceden kayıtlı bir kaynak (STONE_LIBRARY_SOURCE_ID) ve görsel izni (STONE_LIBRARY_LICENSE_GRANT_ID)
 * ister; bu kayıtların owner ekranı yoktur. Bu betik onları owner RPC'leriyle, owner'ın DOLDURDUĞU girdi dosyasından kurar.
 *
 * VARSAYILAN DEĞER YOK: girdi dosyasındaki her alan owner tarafından açıkça doldurulur. `null` = "henüz doğrulanmadı" → DURUR.
 * Bilerek boş bırakılan alan için "YOK" yazılır. Dosya özetleri (SHA-256) betik tarafından dosyanın kendisinden hesaplanır.
 *
 * Kipler:
 *   --sablon <yol>            boş girdi şablonu yazar (tüm kararlar null). Hiçbir yere bağlanmaz.
 *   --input <yol>             DENEME (varsayılan): girdiyi doğrular; DB bilgisi varsa YALNIZ OKUYARAK plan çıkarır, hiçbir şey yazmaz.
 *   --input <yol> --write --confirm-write --target-host <host>
 *                             planı uygular. Hedef host, NEXT_PUBLIC_SUPABASE_URL host'u ile aynı olmalı (yanlış veritabanı koruması).
 *
 * Tekrar çalıştırma: kaynak source_key ile, belge (kaynak + SHA-256) ile, izin (kaynak + kapsam + belge SHA-256) ile bulunur.
 * Mevcut kayıt girdiyle aynıysa atlanır; FARKLIYSA hiçbir şey değiştirilmez ve DURUR (güncelleme bu betiğin işi değildir).
 * Kısmi hata (ör. kaynak oluştu, izin oluşmadı) → aynı komut yeniden çalıştırılır; oluşanlar atlanır.
 *
 * Ortam: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + STONE_LIBRARY_OWNER_ID (owner DB'de her RPC'de yeniden doğrulanır).
 * Çıktı: kimlikler, SHA-256 özetleri ve plan adımları. Anahtar / bağlantı bilgisi yazdırılmaz.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ownerRpc } from "../../lib/stone-library/import/ownerRpc";

const NONE = "YOK";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

type Json = Record<string, unknown>;
type Approval = { onaylayan: string; tarih: string; aciklama: string };

export type SourceInput = {
  source_key: string; kind: string; real_name: string; provider_code: string | null; license_type: string; license_ref: string | null;
  license_terms_url: string | null; license_terms_file: string; license_accepted_at: string | null; license_valid_until: string | null;
  commercial_use_ok: boolean; image_rights: string; status: string; notes: string | null;
};
export type DocInput = { anahtar: string; doc_kind: string; title: string; url: string | null; captured_at: string; dosya: string; note: string | null };
export type GrantInput = {
  belge: string; scope: string; granted_on: string; grantor_label: string; commercial_display: boolean; storage_allowed: boolean;
  post_subscription_rights: boolean; attribution_required: boolean; attribution_text: string | null; modification_allowed: boolean;
  redistribution_limit: string; max_resolution: string | null; valid_until: string | null; notes: string | null;
  kanit_durumu: "verified" | "owner_verification_pending";
};
export type SetupPlan = {
  source: SourceInput & { license_terms_sha256: string };
  docs: (DocInput & { content_sha256: string })[];
  grant: (GrantInput & { document_sha256: string }) | null;
  approvals: Approval[];
};

/** Boş şablon: her karar null. Yalnız yapı ve kurallar. */
export function blankTemplate(): Json {
  const appr = { onaylayan: null, tarih: null, aciklama: null };
  return {
    _aciklama: [
      "null = henüz doğrulanmadı (betik DURUR). Bilerek boş bırakılan alana \"YOK\" yazın. Varsayılan değer yoktur.",
      "Dosya yolları Git deposu DIŞINDA olmalı; SHA-256 betik tarafından dosyadan hesaplanır. 'sha256_beklenen' doluysa eşleşmesi zorunludur.",
      "kind: api|trainer_archive|licensed_course|owner · license_type: api_terms|written_contract|purchased_archive|owner_content|other",
      "image_rights: none|hotlink_ok|rehost_ok · status: draft|active|suspended (aktarım için active) · doc_kind: terms_snapshot|contract|permission_letter|correspondence|other",
      "gorsel_izni.scope: crystal_images|crystal_text|other · kanit_durumu: verified|owner_verification_pending · görsel izni yoksa gorsel_izni: \"YOK\"",
    ],
    kaynak: {
      source_key: null, kind: null, real_name: null, provider_code: null, license_type: null, license_ref: null, license_terms_url: null,
      license_terms_file: null, license_terms_sha256_beklenen: null, license_accepted_at: null, license_valid_until: null,
      commercial_use_ok: null, image_rights: null, status: null, notes: null, owner_onayi: appr,
    },
    belgeler: [{ anahtar: null, doc_kind: null, title: null, url: null, captured_at: null, dosya: null, sha256_beklenen: null, note: null }],
    gorsel_izni: {
      belge: null, scope: null, granted_on: null, grantor_label: null, commercial_display: null, storage_allowed: null,
      post_subscription_rights: null, attribution_required: null, attribution_text: null, modification_allowed: null,
      redistribution_limit: null, max_resolution: null, valid_until: null, notes: null, kanit_durumu: null, owner_onayi: appr,
    },
  };
}

const sha256File = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

/** Girdiyi doğrular; hata listesi boşsa plan döner. repoRoot altındaki dosyalar reddedilir. */
export function validateInput(raw: unknown, repoRoot: string): { errors: string[]; plan: SetupPlan | null } {
  const errors: string[] = [];
  const root = path.resolve(repoRoot).toLowerCase();
  const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
  if (!isObj(raw)) return { errors: ["girdi bir JSON nesnesi değil"], plan: null };

  const req = (o: Json, p: string, k: string, check: (v: unknown) => boolean, rule: string, nullable = false): unknown => {
    if (!(k in o) || o[k] === null || o[k] === undefined || o[k] === "") { errors.push(`${p}.${k}: doldurulmadı (null)`); return undefined; }
    if (o[k] === NONE) { if (nullable) return null; errors.push(`${p}.${k}: "YOK" bu alanda kullanılamaz`); return undefined; }
    if (!check(o[k])) { errors.push(`${p}.${k}: geçersiz (${rule})`); return undefined; }
    return o[k];
  };
  const str = (max: number) => (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const oneOf = (...xs: string[]) => (v: unknown) => typeof v === "string" && xs.includes(v);
  const bool = (v: unknown) => typeof v === "boolean";
  const date = (v: unknown) => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
  const ts = (v: unknown) => typeof v === "string" && TS_RE.test(v) && !Number.isNaN(Date.parse(v));
  const url = (v: unknown) => typeof v === "string" && /^https:\/\/[^\s]+$/.test(v) && v.length <= 2000;
  const file = (p: string, k: string, o: Json, expectKey: string): string | undefined => {
    const f = req(o, p, k, str(1000), "dosya yolu") as string | undefined;
    if (!f) return undefined;
    const abs = path.resolve(f);
    if (abs.toLowerCase().startsWith(root)) { errors.push(`${p}.${k}: dosya Git deposu içinde olamaz`); return undefined; }
    if (!existsSync(abs)) { errors.push(`${p}.${k}: dosya yok`); return undefined; }
    const h = sha256File(abs);
    const exp = o[expectKey];
    if (exp !== null && exp !== undefined && exp !== NONE && String(exp).toLowerCase() !== h) errors.push(`${p}.${expectKey}: dosya özeti beklenenle eşleşmiyor`);
    return h;
  };
  const approval = (o: Json, p: string): Approval | undefined => {
    const a = o.owner_onayi;
    if (!isObj(a)) { errors.push(`${p}.owner_onayi: doldurulmadı`); return undefined; }
    const onaylayan = req(a, `${p}.owner_onayi`, "onaylayan", str(200), "metin") as string;
    const tarih = req(a, `${p}.owner_onayi`, "tarih", date, "YYYY-AA-GG") as string;
    const aciklama = req(a, `${p}.owner_onayi`, "aciklama", str(2000), "metin") as string;
    return onaylayan && tarih && aciklama ? { onaylayan, tarih, aciklama } : undefined;
  };

  const approvals: Approval[] = [];
  const k = raw.kaynak;
  let source: SetupPlan["source"] | undefined;
  if (!isObj(k)) errors.push("kaynak: doldurulmadı");
  else {
    const P = "kaynak";
    const s = {
      source_key: req(k, P, "source_key", (v) => typeof v === "string" && /^[a-z0-9][a-z0-9_-]{1,62}$/.test(v), "küçük harf/rakam/-/_"),
      kind: req(k, P, "kind", oneOf("api", "trainer_archive", "licensed_course", "owner"), "liste"),
      real_name: req(k, P, "real_name", str(200), "metin"),
      provider_code: req(k, P, "provider_code", (v) => typeof v === "string" && /^[a-z0-9_-]{1,40}$/.test(v), "kod", true),
      license_type: req(k, P, "license_type", oneOf("api_terms", "written_contract", "purchased_archive", "owner_content", "other"), "liste"),
      license_ref: req(k, P, "license_ref", str(500), "metin", true),
      license_terms_url: req(k, P, "license_terms_url", url, "https adresi", true),
      license_terms_file: undefined as unknown,
      license_accepted_at: req(k, P, "license_accepted_at", ts, "tarih/zaman", true),
      license_valid_until: req(k, P, "license_valid_until", ts, "tarih/zaman", true),
      commercial_use_ok: req(k, P, "commercial_use_ok", bool, "true/false"),
      image_rights: req(k, P, "image_rights", oneOf("none", "hotlink_ok", "rehost_ok"), "liste"),
      status: req(k, P, "status", oneOf("draft", "active", "suspended"), "liste"),
      notes: req(k, P, "notes", str(2000), "metin", true),
    };
    s.license_terms_file = req(k, P, "license_terms_file", str(1000), "dosya yolu");
    const termsSha = file(P, "license_terms_file", k, "license_terms_sha256_beklenen");
    if (s.provider_code === "roxy" && k.display_mode === "real") errors.push("kaynak: Roxy gerçek adla gösterilemez");
    if ("display_mode" in k || "display_alias" in k) errors.push("kaynak: görünürlük bu betikle ayarlanmaz (yeni kaynak gizli başlar)");
    const a = approval(k, P); if (a) approvals.push(a);
    if (termsSha && Object.values(s).every((v) => v !== undefined)) source = { ...(s as unknown as SourceInput), license_terms_sha256: termsSha };
  }

  const docs: SetupPlan["docs"] = [];
  if (!Array.isArray(raw.belgeler) || raw.belgeler.length === 0) errors.push("belgeler: en az bir belge gerekli");
  else raw.belgeler.forEach((d, i) => {
    const P = `belgeler[${i}]`;
    if (!isObj(d)) { errors.push(`${P}: nesne değil`); return; }
    const x = {
      anahtar: req(d, P, "anahtar", (v) => typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v), "kısa anahtar"),
      doc_kind: req(d, P, "doc_kind", oneOf("terms_snapshot", "contract", "permission_letter", "correspondence", "other"), "liste"),
      title: req(d, P, "title", str(300), "metin"),
      url: req(d, P, "url", url, "https adresi", true),
      captured_at: req(d, P, "captured_at", ts, "tarih/zaman"),
      dosya: req(d, P, "dosya", str(1000), "dosya yolu"),
      note: req(d, P, "note", str(2000), "metin", true),
    };
    const h = x.dosya ? file(P, "dosya", d, "sha256_beklenen") : undefined;
    if (h && Object.values(x).every((v) => v !== undefined)) docs.push({ ...(x as unknown as DocInput), content_sha256: h });
  });
  const keys = docs.map((d) => d.anahtar);
  if (new Set(keys).size !== keys.length) errors.push("belgeler: anahtarlar tekil olmalı");
  const shas = docs.map((d) => d.content_sha256);
  if (new Set(shas).size !== shas.length) errors.push("belgeler: aynı dosya iki kez verilmiş");

  let grant: SetupPlan["grant"] | undefined;
  const g = raw.gorsel_izni;
  if (g === NONE) grant = null;
  else if (!isObj(g)) errors.push("gorsel_izni: doldurulmadı (izin yoksa \"YOK\")");
  else {
    const P = "gorsel_izni";
    const x = {
      belge: req(g, P, "belge", str(40), "belge anahtarı"),
      scope: req(g, P, "scope", oneOf("crystal_images", "crystal_text", "other"), "liste"),
      granted_on: req(g, P, "granted_on", date, "YYYY-AA-GG"),
      grantor_label: req(g, P, "grantor_label", str(300), "metin"),
      commercial_display: req(g, P, "commercial_display", bool, "true/false"),
      storage_allowed: req(g, P, "storage_allowed", bool, "true/false"),
      post_subscription_rights: req(g, P, "post_subscription_rights", bool, "true/false"),
      attribution_required: req(g, P, "attribution_required", bool, "true/false"),
      attribution_text: req(g, P, "attribution_text", str(500), "metin", true),
      modification_allowed: req(g, P, "modification_allowed", bool, "true/false"),
      redistribution_limit: req(g, P, "redistribution_limit", str(1000), "metin"),
      max_resolution: req(g, P, "max_resolution", (v) => typeof v === "string" && /^\d{1,5}x\d{1,5}$/.test(v), "GENİŞLİKxYÜKSEKLİK", true),
      valid_until: req(g, P, "valid_until", date, "YYYY-AA-GG", true),
      notes: req(g, P, "notes", str(2000), "metin", true),
      kanit_durumu: req(g, P, "kanit_durumu", oneOf("verified", "owner_verification_pending"), "liste"),
    };
    if (x.attribution_required === true && x.attribution_text === null) errors.push(`${P}: atıf zorunluysa atıf metni gerekli`);
    const doc = docs.find((d) => d.anahtar === x.belge);
    if (x.belge && !doc) errors.push(`${P}.belge: belgeler listesinde yok`);
    const a = approval(g, P); if (a) approvals.push(a);
    if (doc && Object.values(x).every((v) => v !== undefined)) grant = { ...(x as unknown as GrantInput), document_sha256: doc.content_sha256 };
  }
  if (errors.length || !source || grant === undefined) return { errors: errors.length ? errors : ["girdi eksik"], plan: null };
  return { errors, plan: { source, docs, grant, approvals } };
}

// ── DB (yalnız owner RPC'leri) ──────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
export type Step = { adim: string; durum: "olustur" | "atla" | "dogrula" | "CAKISMA"; ayrinti?: string };
export type SetupResult = { ok: boolean; steps: Step[]; source_id: string | null; document_ids: Record<string, string>; grant_id: string | null; grant_status: string | null };

const SOURCE_FIELDS = ["kind", "real_name", "provider_code", "license_type", "license_ref", "license_terms_url", "license_terms_sha256",
  "license_accepted_at", "license_valid_until", "commercial_use_ok", "image_rights", "status", "notes"] as const;
const GRANT_FIELDS = ["granted_on", "grantor_label", "commercial_display", "storage_allowed", "post_subscription_rights", "attribution_required",
  "attribution_text", "modification_allowed", "redistribution_limit", "max_resolution", "valid_until", "notes"] as const;
const same = (a: unknown, b: unknown) => {
  if ((a ?? null) === null || (b ?? null) === null) return (a ?? null) === (b ?? null);
  if (typeof a === "string" && typeof b === "string" && TS_RE.test(a) && TS_RE.test(b)) return Date.parse(a) === Date.parse(b);
  return a === b;
};
const diff = (row: Row, want: Row, fields: readonly string[]) => fields.filter((f) => !same(row[f], want[f]));

export async function runSourceSetup(db: SupabaseClient, ownerId: string, plan: SetupPlan, write: boolean): Promise<SetupResult> {
  const steps: Step[] = [];
  const res: SetupResult = { ok: false, steps, source_id: null, document_ids: {}, grant_id: null, grant_status: null };
  const S = plan.source;
  const srcWant: Row = { ...S };
  const ov = await ownerRpc<{ sources?: Row[] }>(db, "stone_library_owner_overview", { p_actor: ownerId });
  const existing = (ov?.sources ?? []).find((r) => r.source_key === S.source_key && !r.deleted_at);
  let sourceId: string | null = existing ? String(existing.id) : null;

  if (existing) {
    const d = diff(existing, srcWant, SOURCE_FIELDS);
    if (d.length) { steps.push({ adim: "kaynak", durum: "CAKISMA", ayrinti: `farklı alanlar: ${d.join(", ")}` }); return res; }
    steps.push({ adim: "kaynak", durum: "atla", ayrinti: "aynı kayıt mevcut" });
  } else {
    steps.push({ adim: "kaynak", durum: "olustur", ayrinti: `gizli görünürlük; durum '${S.status}'` });
    if (write) {
      const { status, ...rest } = S;
      const create: Row = { ...rest }; delete create.license_terms_file;
      sourceId = await ownerRpc<string>(db, "stone_library_source_save", { p_actor: ownerId, p_source_id: null, p_data: create });
      if (status !== "draft") await ownerRpc(db, "stone_library_source_save", { p_actor: ownerId, p_source_id: sourceId, p_data: { status } });
    }
  }
  res.source_id = sourceId;

  const lic = sourceId ? await ownerRpc<{ grants?: Row[]; documents?: Row[] }>(db, "stone_library_owner_licenses", { p_actor: ownerId }) : { grants: [], documents: [] };
  const docsHere = (lic?.documents ?? []).filter((r) => r.source_id === sourceId && !r.deleted_at);
  for (const d of plan.docs) {
    const ex = docsHere.find((r) => r.content_sha256 === d.content_sha256);
    if (ex) {
      const dd = diff(ex, { doc_kind: d.doc_kind, title: d.title, url: d.url, note: d.note }, ["doc_kind", "title", "url", "note"]);
      if (dd.length) { steps.push({ adim: `belge:${d.anahtar}`, durum: "CAKISMA", ayrinti: `farklı alanlar: ${dd.join(", ")}` }); return res; }
      steps.push({ adim: `belge:${d.anahtar}`, durum: "atla", ayrinti: "aynı özetli belge mevcut" });
      res.document_ids[d.anahtar] = String(ex.id);
      continue;
    }
    steps.push({ adim: `belge:${d.anahtar}`, durum: "olustur", ayrinti: `sha256 ${d.content_sha256.slice(0, 16)}…` });
    if (write) {
      res.document_ids[d.anahtar] = await ownerRpc<string>(db, "stone_library_document_add", { p_actor: ownerId, p_source_id: sourceId, p_data: {
        doc_kind: d.doc_kind, title: d.title, url: d.url, content_sha256: d.content_sha256, captured_at: d.captured_at, note: d.note } });
    }
  }

  if (plan.grant) {
    const G = plan.grant;
    const want: Row = { ...G };
    const ex = (lic?.grants ?? []).find((r) => r.source_id === sourceId && r.scope === G.scope && r.document_sha256 === G.document_sha256 && r.evidence_status !== "revoked");
    let grantId: string | null = ex ? String(ex.id) : null;
    let status = ex ? String(ex.evidence_status) : null;
    if (ex) {
      const d = diff(ex, want, GRANT_FIELDS);
      if (d.length) { steps.push({ adim: "gorsel_izni", durum: "CAKISMA", ayrinti: `farklı alanlar: ${d.join(", ")}` }); return res; }
      steps.push({ adim: "gorsel_izni", durum: "atla", ayrinti: `mevcut (${status})` });
    } else {
      steps.push({ adim: "gorsel_izni", durum: "olustur", ayrinti: `kapsam ${G.scope}` });
      if (write) {
        const { belge, document_sha256, scope, ...rest } = G;
        const data: Row = { ...rest }; delete data.kanit_durumu;
        grantId = await ownerRpc<string>(db, "stone_library_license_grant_save", { p_actor: ownerId, p_grant_id: null, p_data: {
          ...data, source_id: sourceId, scope, document_id: res.document_ids[belge], document_sha256 } });
        status = "owner_verification_pending";
      }
    }
    if (G.kanit_durumu === "verified" && status !== "verified") {
      steps.push({ adim: "gorsel_izni:dogrula", durum: "dogrula", ayrinti: "owner onayıyla 'verified'" });
      if (write) {
        const a = plan.approvals[plan.approvals.length - 1];
        await ownerRpc(db, "stone_library_license_grant_set_status", { p_actor: ownerId, p_grant_id: grantId, p_status: "verified",
          p_note: `Owner onayı: ${a.onaylayan}, ${a.tarih} — ${a.aciklama}`.slice(0, 2000) });
        status = "verified";
      }
    } else if (G.kanit_durumu === "owner_verification_pending" && status === "verified") {
      steps.push({ adim: "gorsel_izni:dogrula", durum: "CAKISMA", ayrinti: "kayıt doğrulanmış; betik doğrulamayı geri almaz" });
      return res;
    }
    res.grant_id = grantId; res.grant_status = status;
  }
  res.ok = true;
  return res;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const repoRoot = path.resolve(__dirname, "../..");
  const sablon = arg("--sablon");
  if (sablon) {
    if (path.resolve(sablon).toLowerCase().startsWith(repoRoot.toLowerCase())) return console.log("Şablon Git deposu dışına yazılmalı. DURDU.");
    if (existsSync(sablon)) return console.log("Şablon yolu zaten var (üzerine yazılmaz). DURDU.");
    writeFileSync(sablon, JSON.stringify(blankTemplate(), null, 2) + "\n", "utf8");
    return console.log(`Boş şablon yazıldı: ${sablon}`);
  }
  const input = arg("--input");
  if (!input || !existsSync(input)) return console.log("--input <girdi.json> gerekli. DURDU.");
  if (path.resolve(input).toLowerCase().startsWith(repoRoot.toLowerCase())) return console.log("Girdi Git deposu içinde olamaz. DURDU.");
  const write = process.argv.includes("--write");
  if (write && !process.argv.includes("--confirm-write")) return console.log("--write için --confirm-write da gerekli. DURDU.");

  const { errors, plan } = validateInput(JSON.parse(readFileSync(input, "utf8")), repoRoot);
  if (!plan) { console.log(`GİRDİ GEÇERSİZ (${errors.length}):`); for (const e of errors) console.log(`  - ${e}`); process.exitCode = 2; return; }
  console.log("Girdi geçerli.");
  console.log(`  kaynak: ${plan.source.source_key} · şartlar SHA-256 ${plan.source.license_terms_sha256}`);
  for (const d of plan.docs) console.log(`  belge ${d.anahtar}: SHA-256 ${d.content_sha256}`);
  console.log(`  görsel izni: ${plan.grant ? `${plan.grant.scope}, hedef durum ${plan.grant.kanit_durumu}` : "YOK"}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const owner = process.env.STONE_LIBRARY_OWNER_ID ?? "";
  if (!url || !key || !UUID_RE.test(owner)) {
    if (write) return console.log("Yazma için NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ve STONE_LIBRARY_OWNER_ID gerekli. DURDU.");
    return console.log("DB bilgisi verilmedi: yalnız girdi doğrulandı (çevrimdışı deneme). Hiçbir şey yazılmadı.");
  }
  const host = new URL(url).host;
  if (write && arg("--target-host") !== host) return console.log(`--target-host hedef host ile aynı olmalı (hedef: ${host}). DURDU.`);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const r = await runSourceSetup(db, owner, plan, write);
  console.log(`${write ? "UYGULAMA" : "DENEME (yazma yok)"} — hedef ${host}`);
  for (const s of r.steps) console.log(`  ${s.durum.padEnd(8)} ${s.adim}${s.ayrinti ? ` — ${s.ayrinti}` : ""}`);
  if (!r.ok) { console.log("DURDU: çakışma var; hiçbir değişiklik yapılmadı (önceki adımlar yalnız 'atla' ise)."); process.exitCode = 3; return; }
  if (write) {
    console.log("Aktarım için:");
    console.log(`  STONE_LIBRARY_SOURCE_ID=${r.source_id}`);
    if (r.grant_id) console.log(`  STONE_LIBRARY_LICENSE_GRANT_ID=${r.grant_id}   (durum: ${r.grant_status})`);
    console.log(`  STONE_LIBRARY_TERMS_SHA256=${plan.source.license_terms_sha256}`);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(`HATA: ${(e as Error).message}`); process.exitCode = 1; });
}
