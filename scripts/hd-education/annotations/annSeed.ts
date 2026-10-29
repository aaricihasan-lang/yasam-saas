/**
 * FAZ 8 — Çizim katmanı testleri için SENTETİK tohumlama (ZZ_*; gerçek kişi / gerçek belge YOK).
 * Merkezî kayıt: DB tetikleyicilerinin istediği sırayla (doğrula → hukuk → onay → yayın), b3-ui-e2e ile aynı yol.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { syntheticEducationSnapshotGDefined } from "../private/gCenterFixture";
import { privateArchiveSql } from "../private/pgSchema";

export const ANN_MIGRATION = "20271206000100_hd_education_annotations.sql";
export const ANN_RPCS = ["hd_edu_ann_get", "hd_edu_ann_save", "hd_edu_ann_clear", "hd_edu_ann_owner_list", "hd_edu_ann_owner_get", "hd_edu_ann_owner_delete",
  "hd_edu_ann_owner_trainers", "hd_edu_ann_owner_purge_preview", "hd_edu_ann_owner_purge"];
export const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

/** Özel arşiv + merkezî + çizim katmanı (sırayla, gerçek migration dosyaları). */
export function annotationSql(opts: { withAnnotations?: boolean } = {}): string[] {
  return [...privateArchiveSql(), ...(opts.withAnnotations === false ? [] : [readMig(ANN_MIGRATION)])];
}

type Q = (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export async function seedCentralSubject(q: Q, ownerId: string, o: { name: string; publish: boolean; date?: string; utc?: string; gDefined?: boolean }) {
  const id = randomUUID();
  // Belgelenen yerel saat 03:00 + ofset 561 sn → UTC = tarih + 02:50:39Z (katalog doğrulamasıyla tutarlı olmalı).
  const date = o.date ?? "1869-11-22", utc = o.utc ?? `${date}T02:50:39Z`;
  await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude,
             documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, legal_note, blockers)
           values ($1,$2,'ZZ',$3,'bilim',false,$4,'ZZ Şehir',48.85,2.35,'03:00','ZZ sentetik belge ifadesi','ZZ şehir ortalama saati',561,'Europe/Paris',$5,'VERIFIED','LOW_UNREVIEWED','ZZ',array['AVUKAT-GÖRMEDİ'])`,
    [id, `zz-ann-${id.slice(0, 8)}-${date}`, o.name, date, utc]);
  await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, time_explicit, primary_secondary)
           values ($1,1,'birth_time','https://example.test/zz-belge','ZZ Arşiv','ZZ Doğum Kaydı','ZZ-123',true,'birincil')`, [id]);
  await q(`insert into public.hd_education_publications (subject_id) values ($1)`, [id]);
  const syn = (o.gDefined ? syntheticEducationSnapshotGDefined : syntheticEducationSnapshot)(utc, 48.85, 2.35, 1);
  const chartId = (await q(`insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version, computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, created_by)
           values ($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OK',$15) returning id`,
    [id, JSON.stringify(syn.request_body), syn.request_hash, syn.provider, syn.endpoint, syn.adapter_version, syn.engine_version, syn.contract_version,
      JSON.stringify(syn.computed_result), JSON.stringify(syn.provider_raw), syn.provider_raw_sha256, syn.design_instant_utc, JSON.stringify(syn.time_check), JSON.stringify(syn.boundary_flags), ownerId])).rows[0].id as string;
  if (o.publish) {
    await q(`update public.hd_education_publications set chart_id=$2, chart_verified_by=$3, chart_verified_at=now() where subject_id=$1`, [id, chartId, ownerId]);
    await q(`update public.hd_education_subjects set legal_status='LOW_REVIEWED', legal_reviewed_by=$2, legal_reviewed_at=now(), legal_review_ref='AV-ZZ-ANN', blockers='{}' where id=$1`, [id, ownerId]);
    await q(`update public.hd_education_publications set status='approved', approved_by=$2, approved_at=now(), legal_clearance_ref='HK-ZZ-ANN', updated_by=$2 where subject_id=$1`, [id, ownerId]);
    await q(`update public.hd_education_publications set status='published', updated_by=$2 where subject_id=$1`, [id, ownerId]);
  }
  return { id, chartId };
}

/** Geçerli örnek çizim belgesi (tüm öğe türleri; tuval koordinatları + semantik çapa). */
export function sampleDoc(tag = "a") {
  return {
    v: 1,
    els: [
      { id: `${tag}-pen-1`, t: "pen", c: "red", w: 4, p: [180, 300, 190, 310, 205, 330, 220, 350] },
      { id: `${tag}-arr-1`, t: "arrow", c: "blue", w: 4, x1: 60, y1: 200, x2: 200, y2: 268, a1: null, a2: { k: "h", id: "20-34" } },
      { id: `${tag}-cir-1`, t: "circle", c: "amber", w: 2, x: 220, y: 368, r: 52, f: true, a: { k: "c", id: "G" } },
      { id: `${tag}-bub-1`, t: "bubble", c: "violet", x: 14, y: -18, a: { k: "g", id: 34 }, n: "Sakral → Boğaz bağlantısı: ZZ ders notu\nikinci satır" },
      { id: `${tag}-txt-1`, t: "text", c: "ink", x: 0, y: -40, a: { k: "c", id: "Sacral" }, s: "Yanıt veren güç", z: 18 },
    ],
    notes: `ZZ eğitim notu (${tag}): sakral otorite örneği\nikinci satır`,
  };
}
