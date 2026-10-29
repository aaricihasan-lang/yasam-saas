// GÖKYÜZÜ ATLASI — astro_horary_questions TENANT BAZLI dışa aktarma / geri yükleme çekirdeği (pg istemcisiyle; YALNIZ sunucu/operatör).
//
// AMAÇ: Uygulama içi tenant yedeği (lib/backup registry) astro_* tablolarını Owner kararıyla DIŞLAR (OWNER_PILOT_EXCLUDED_TABLES,
// "Aşama 5 kararı"). Bu araç o politikayı DEĞİŞTİRMEZ ve hiçbir yedek akışına bağlı DEĞİLDİR; yalnız Owner'ın açıkça çalıştırdığı,
// Horary kayıtlarına özgü bağımsız bir kurtarma yoludur. Tam veritabanı yedeği (Altın Yedek, pg_dump) tabloyu zaten kapsar.
//
// GÜVENCE:
//   * Dışa aktarma yalnız VERİLEN tenant'ın satırlarını alır; her satırın kanonik JSON'u SHA-256 ile mühürlenir + manifest özeti.
//   * Geri yükleme TEK transaction'dır (ya hepsi ya hiçbiri): özet doğrulaması → tenant eşleşmesi → kolon izin listesi →
//     var olan aynı kimlik: içerik AYNIYSA atla (idempotent), FARKLIYSA tümünü geri al (çakışma; sessiz üzerine yazma YOK).
//   * Danışan (client_id) hedef tenant'ta yoksa satır KORUNUR, client_id NULL yazılır ve raporlanır (FK ON DELETE SET NULL anlamı).
//   * Soru metni olduğu gibi taşınır (NULL → NULL; açık izinle saklanmış metin → aynı metin). Sonuç anlık görüntüsü bayt düzeyinde
//     aynı kalır (jsonb eşitliği + satır özeti). Değişmezlik ve kayıt tavanı tetikleyicileri geri yüklemede de çalışır.
//   * Uzman (owner_user_id) korunur; public.users varsa hedefte bulunmayan uzman raporlanır (satır yine yazılır — sahiplik değişmez).
//   * Geri yükleme service_role yetkileriyle (SET LOCAL ROLE service_role) yazar: SELECT + INSERT; UPDATE / DELETE GEREKMEZ.

import crypto from "node:crypto";

export const TABLE = "astro_horary_questions";
export const FORMAT = "yasam-horary-records-backup";
export const FORMAT_VERSION = 1;
/** Geri yüklemede yazılan kolonlar (tablo şemasıyla birebir; fazlası / eksiği reddedilir). */
export const COLUMNS = [
  "id", "tenant_id", "owner_user_id", "client_id", "title", "question_text", "question_local_date", "question_local_time", "timezone",
  "utc_offset_seconds", "dst_choice", "question_utc", "location_id", "location_label", "latitude", "longitude", "quesited_house", "school",
  "methodology_version", "orb_variant", "snapshot_schema", "result_snapshot", "is_demo", "save_request_id", "created_at", "updated_at",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kanonik JSON (anahtarlar sıralı) — özet kararlılığı için. */
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Satırı DB'den taşınabilir biçimde okur (zaman: ISO metin; tarih / saat: metin; jsonb: nesne). */
const SELECT = `SELECT id::text, tenant_id::text, owner_user_id::text, client_id::text, title, question_text, question_local_date::text,
  question_local_time::text, timezone, utc_offset_seconds, dst_choice, to_char(question_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS question_utc,
  location_id, location_label, latitude, longitude, quesited_house, school, methodology_version, orb_variant, snapshot_schema, result_snapshot, is_demo,
  save_request_id::text, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
  FROM public.${TABLE}`;

export async function readRows(client, where, params) {
  const r = await client.query(`${SELECT} WHERE ${where} ORDER BY created_at, id`, params);
  return r.rows;
}

/** Dışa aktarma: yalnız `tenantId`. Dönen nesne JSON olarak yazılır; satır özetleri + manifest özeti içerir. */
export async function exportTenant(client, tenantId, { now = new Date() } = {}) {
  if (!UUID_RE.test(String(tenantId))) throw new Error("HORARY_BACKUP_TENANT_INVALID");
  const rows = await readRows(client, "tenant_id = $1", [tenantId]);
  const records = rows.map((row) => ({ row, sha256: sha256(canonical(row)) }));
  const manifest = sha256(records.map((r) => r.sha256).join("\n"));
  return { format: FORMAT, version: FORMAT_VERSION, table: TABLE, tenantId, exportedAt: now.toISOString(), count: records.length, manifest, records };
}

function validateFile(file, targetTenantId) {
  if (!file || file.format !== FORMAT || file.version !== FORMAT_VERSION || file.table !== TABLE) throw new Error("HORARY_BACKUP_FORMAT");
  if (!UUID_RE.test(String(targetTenantId)) || file.tenantId !== targetTenantId) throw new Error("HORARY_BACKUP_TENANT_MISMATCH");
  if (!Array.isArray(file.records) || file.records.length !== file.count) throw new Error("HORARY_BACKUP_COUNT");
  for (const r of file.records) {
    const keys = Object.keys(r.row ?? {}).sort();
    if (keys.join(",") !== [...COLUMNS].sort().join(",")) throw new Error("HORARY_BACKUP_COLUMNS");
    if (r.row.tenant_id !== targetTenantId) throw new Error("HORARY_BACKUP_TENANT_MISMATCH");
    if (sha256(canonical(r.row)) !== r.sha256) throw new Error("HORARY_BACKUP_ROW_HASH");
  }
  if (sha256(file.records.map((r) => r.sha256).join("\n")) !== file.manifest) throw new Error("HORARY_BACKUP_MANIFEST");
}

/**
 * Geri yükleme (tek transaction). Hata → ROLLBACK ve fırlatır (hiçbir satır yazılmaz).
 * Dönen rapor: { inserted, skippedIdentical, clientNulled: [id], missingOwners: [uuid], dryRun }.
 */
export async function restoreTenant(client, file, targetTenantId, { dryRun = false } = {}) {
  validateFile(file, targetTenantId);
  const report = { inserted: 0, skippedIdentical: 0, clientNulled: [], missingOwners: [], dryRun };
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const hasUsers = (await client.query("SELECT to_regclass('public.users') IS NOT NULL AS ok")).rows[0].ok;
    for (const { row } of file.records) {
      // Danışan hedef tenant'ta yoksa beklenen satırda client_id NULL (FK ON DELETE SET NULL anlamı); karşılaştırma bu satırla.
      let clientId = row.client_id;
      if (clientId) {
        const c = await client.query("SELECT 1 FROM public.clients WHERE tenant_id = $1 AND id = $2", [row.tenant_id, clientId]);
        if (!c.rowCount) clientId = null;
      }
      const expected = { ...row, client_id: clientId };
      const existing = await readRows(client, "id = $1", [row.id]);
      if (existing.length) {
        if (canonical(existing[0]) === canonical(expected)) {
          report.skippedIdentical++;
          continue;
        }
        throw new Error(`HORARY_BACKUP_CONFLICT:${row.id}`);
      }
      const dup = await client.query(`SELECT 1 FROM public.${TABLE} WHERE tenant_id = $1 AND save_request_id = $2`, [row.tenant_id, row.save_request_id]);
      if (dup.rowCount) throw new Error(`HORARY_BACKUP_CONFLICT:${row.id}`);
      if (row.client_id && !clientId) report.clientNulled.push(row.id);
      if (hasUsers && !report.missingOwners.includes(row.owner_user_id)) {
        const u = await client.query("SELECT 1 FROM public.users WHERE id = $1", [row.owner_user_id]);
        if (!u.rowCount) report.missingOwners.push(row.owner_user_id);
      }
      const vals = COLUMNS.map((c) => (c === "client_id" ? clientId : c === "result_snapshot" ? JSON.stringify(row[c]) : row[c]));
      await client.query(`INSERT INTO public.${TABLE} (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map((c, i) => (c === "result_snapshot" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ")})`, vals);
      report.inserted++;
    }
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return report;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
