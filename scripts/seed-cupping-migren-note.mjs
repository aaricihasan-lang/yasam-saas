/**
 * Seed: MİGREN — ilk gerçek KULLANICI NOTU ("Hacamat Notlarım").
 *
 * ÖN KOŞUL: 20261001000000_cupping_topic_notes.sql production'a UYGULANMIŞ olmalı
 *   (cupping_topic_notes + cupping_topic_note_points). Tablo yoksa script BLOCKED verir.
 *
 * İDEMPOTENT: aynı (topic, source_label, note) zaten varsa tekrar EKLEMEZ.
 * Yalnız TEK Migren user note'u. Formal source/citation'a DOKUNMAZ. tenant = admin master.
 *
 * Canonical eşleşme (kesin olanlar; "kulak altı"→HCP006 ZORLA map YOK, "tarama" canonical DEĞİL):
 *   HCP029 Boyun Altı, HCP026 Kafa Bölgesi / Genel.
 *
 * Kullanım (proje kökünde, migration apply SONRASI):
 *   node scripts/seed-cupping-migren-note.mjs --dry-run
 *   node scripts/seed-cupping-migren-note.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const T = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const DRY_RUN = process.argv.includes("--dry-run");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local) gerekli.");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const NOTE = {
  source_label: "Hacamat Notlarım",
  note:
    "Migren için ilk başta kafa hacamatı yapmayın. İlk önce tarama hacamatı, sonra kulak altlarında boyun hizasından uygulayın; ardından kafadan yapın.",
  point_codes: ["HCP029", "HCP026"],
};

async function run() {
  console.log(`\n════════ MİGREN user note seed ${DRY_RUN ? "(DRY-RUN)" : "(LIVE)"} ════════`);

  // Ön koşul: not tablosu var mı? (head-count eksik tabloda hata vermez → gerçek select ile probe)
  const probe = await db.from("cupping_topic_notes").select("id").limit(1);
  if (probe.error) {
    console.error("💥 BLOCKED: cupping_topic_notes tablosu yok — önce 20261001000000_cupping_topic_notes.sql APPLY et.");
    console.error("   detay:", probe.error.message.slice(0, 120));
    process.exit(2);
  }

  const { data: topics, error: te } = await db
    .from("cupping_topics").select("id,title").eq("tenant_id", T).eq("title", "Migren");
  if (te) throw new Error(te.message);
  if (!topics?.length) { console.error("💥 BLOCKED: Migren topic yok."); process.exit(2); }
  const topicId = topics[0].id;

  const { data: pts } = await db
    .from("cupping_points").select("id,code").eq("tenant_id", T).in("code", NOTE.point_codes);
  const pointIds = (pts ?? []).map((p) => p.id);
  console.log(`✅ Migren topic ${topicId}; eşleşen nokta: ${(pts ?? []).map((p) => p.code).join(", ")}`);

  // İdempotent: aynı source_label + note var mı?
  const { data: existing } = await db
    .from("cupping_topic_notes").select("id,note,source_label")
    .eq("tenant_id", T).eq("topic_id", topicId).eq("source_label", NOTE.source_label);
  const dup = (existing ?? []).find((n) => (n.note ?? "").trim() === NOTE.note.trim());
  if (dup) { console.log(`= zaten var (${dup.id}) — tekrar eklenmedi. ✅`); return report(topicId); }

  if (DRY_RUN) { console.log(`[dry] +note "${NOTE.source_label}" + ${pointIds.length} nokta`); return; }

  const { data: created, error: ce } = await db
    .from("cupping_topic_notes")
    .insert({ tenant_id: T, topic_id: topicId, note: NOTE.note, source_label: NOTE.source_label, sort_order: 0, is_active: true })
    .select("id").single();
  if (ce) throw new Error("note insert: " + ce.message);
  const noteId = created.id;

  if (pointIds.length) {
    const rows = pointIds.map((pid, i) => ({ tenant_id: T, topic_note_id: noteId, point_id: pid, sort_order: i }));
    const { error: pe } = await db.from("cupping_topic_note_points").insert(rows);
    if (pe) {
      await db.from("cupping_topic_notes").delete().eq("tenant_id", T).eq("id", noteId);
      throw new Error("note_points insert (rolled back): " + pe.message);
    }
  }
  console.log(`✅ +note ${noteId} + ${pointIds.length} bölge.`);
  return report(topicId);
}

async function report(topicId) {
  const { count: nc } = await db.from("cupping_topic_notes").select("*", { count: "exact", head: true }).eq("tenant_id", T).eq("topic_id", topicId);
  const { count: pc } = await db.from("cupping_topic_note_points").select("*", { count: "exact", head: true }).eq("tenant_id", T);
  console.log(`\n📊 Migren notes = ${nc} · note_points = ${pc}`);
  console.log("🏁 done.");
}

run().catch((e) => { console.error("\n💥 FATAL:", e.message); process.exit(1); });
