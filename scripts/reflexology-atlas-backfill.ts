/**
 * reflexology-atlas-backfill.ts
 *
 * PRODUCTION BACKFILL ARACI (§10) — legacy `{taban,yan}` atlas belgelerini
 * canonical `{taban,yan_ic,yan_dis}` şekline dönüştürür. SQL DDL migration YOK;
 * yalnız `reflexology_atlas.document` JSONB'sinin idempotent dönüşümü.
 *
 * TEK KAYNAK: dönüşüm mantığı `normalizeAtlasDocument` (runtime ile AYNI). Bu script
 * yalnız DB okur/yazar + rapor üretir.
 *
 * VARSAYILAN: DRY-RUN (yazma YOK). Yazmak için:  --apply
 *
 * Rapor: tenant sayısı · legacy belge sayısı · region before/after · duplicate ·
 *        değişen/değişmeyen · başarısız.
 *
 * KULLANIM:
 *   npx tsx scripts/reflexology-atlas-backfill.ts            # dry-run
 *   npx tsx scripts/reflexology-atlas-backfill.ts --apply    # yaz (AŞAMA 3 onayıyla)
 *
 * ENV: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { normalizeAtlasDocument, countLegacyYanEntries } from "@/lib/refleksoloji/atlasNormalize";

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Belgedeki TÜM bucket'ların (taban/yan/yan_ic/yan_dis × sol/sag) ham region sayımı. */
function rawRegionStats(doc: unknown): { count: number; ids: string[] } {
  const ids: string[] = [];
  if (doc && typeof doc === "object") {
    for (const [key, entry] of Object.entries(doc as Record<string, unknown>)) {
      if (key === "_meta" || !entry || typeof entry !== "object") continue;
      for (const bucketKey of ["taban", "yan", "yan_ic", "yan_dis"] as const) {
        const bucket = (entry as Record<string, unknown>)[bucketKey];
        if (!bucket || typeof bucket !== "object") continue;
        for (const foot of ["sol", "sag"] as const) {
          const list = (bucket as Record<string, unknown>)[foot];
          if (Array.isArray(list)) {
            for (const r of list) {
              const id = (r as { id?: unknown })?.id;
              if (typeof id === "string") ids.push(id);
            }
          }
        }
      }
    }
  }
  return { count: ids.length, ids };
}

type Row = { tenant_id: string; document: unknown };

async function main() {
  console.log(`\nRefleksoloji Atlas Backfill — ${APPLY ? "APPLY (YAZMA)" : "DRY-RUN (yazma YOK)"}\n`);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("EKSIK ENV: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("reflexology_atlas")
    .select("tenant_id, document");
  if (error) {
    console.error("DB okuma hatası:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Row[];

  let legacyDocs = 0;
  let changed = 0;
  let unchanged = 0;
  let failures = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  let totalDuplicatesDropped = 0;

  for (const row of rows) {
    try {
      const before = rawRegionStats(row.document);
      const legacyYan = countLegacyYanEntries(row.document);
      if (legacyYan > 0) legacyDocs += 1;

      const normalized = normalizeAtlasDocument(row.document);
      const after = rawRegionStats(normalized);

      // dedup düşen = before uniq'ten sonraki fark (aynı id iki bucket'ta ise 1'e iner)
      const beforeUniq = new Set(before.ids).size;
      const dup = before.count - beforeUniq;
      totalDuplicatesDropped += dup;
      totalBefore += beforeUniq;
      totalAfter += after.count;

      // KAYIPSIZLIK invariantı: normalize sonrası benzersiz region sayısı = önce benzersiz
      if (after.count !== beforeUniq) {
        failures += 1;
        console.log(`  ⚠️  ${row.tenant_id}: region sayısı uyuşmuyor (before uniq=${beforeUniq}, after=${after.count}) — YAZILMADI`);
        continue;
      }

      const isChanged = JSON.stringify(normalized) !== JSON.stringify(row.document);
      if (!isChanged) {
        unchanged += 1;
        continue;
      }
      changed += 1;

      if (APPLY) {
        const { error: upErr } = await db
          .from("reflexology_atlas")
          .update({ document: normalized, updated_at: new Date().toISOString() })
          .eq("tenant_id", row.tenant_id);
        if (upErr) {
          failures += 1;
          console.log(`  ❌ ${row.tenant_id}: yazma hatası ${upErr.message}`);
        } else {
          console.log(`  ✅ ${row.tenant_id}: yazıldı (legacyYan=${legacyYan}, region=${after.count}, dup=${dup})`);
        }
      } else {
        console.log(`  • ${row.tenant_id}: DEĞİŞECEK (legacyYan=${legacyYan}, region=${after.count}, dup=${dup})`);
      }
    } catch (e) {
      failures += 1;
      console.log(`  ❌ ${row.tenant_id}: istisna ${(e as Error).message}`);
    }
  }

  console.log("\n──────── ÖZET ────────");
  console.log(`Tenant sayısı        : ${rows.length}`);
  console.log(`Legacy belge sayısı  : ${legacyDocs}`);
  console.log(`Region before (uniq) : ${totalBefore}`);
  console.log(`Region after         : ${totalAfter}`);
  console.log(`Duplicate düşen      : ${totalDuplicatesDropped}`);
  console.log(`Değişecek/yazıldı    : ${changed}`);
  console.log(`Değişmeyen           : ${unchanged}`);
  console.log(`Başarısız            : ${failures}`);
  console.log(`Mod                  : ${APPLY ? "APPLY" : "DRY-RUN"}`);

  if (totalBefore !== totalAfter) {
    console.error("\n⚠️  KAYIPSIZLIK İHLALİ: before uniq != after — YAZMA ÖNERİLMEZ.");
    process.exit(1);
  }
  if (failures > 0) process.exit(1);
  console.log("\n✅ Backfill tamam (kayıpsız). " + (APPLY ? "" : "Yazmak için --apply (AŞAMA 3 onayı)."));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
