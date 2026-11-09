/**
 * lib/archive/server/plan.ts — Premium Word Arşivi planı (YALNIZ SUNUCU).
 *
 * Plan, arşive girecek her şeyi (veri parçaları, danışan dosyaları, hazır raporlar, dosyalar) iş listesi olarak
 * çıkarır; kapsam dışı kalanları GEREKÇESİYLE listeler. Yalnız okuma yapar (DB'ye yazmaz).
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getRegistryEntry, MODULE_LABELS } from "@/lib/backup/registry";
import { isAstrologyModuleEnabled } from "@/lib/astrology/config";
import { reportFileDate } from "@/lib/time/reportTime";
import { safeFileName } from "../zip";
import {
  DATA_FOLDER,
  DOSSIER_FOLDER,
  FILES_FOLDER,
  REPORTS_FOLDER,
  istanbulDayStartIso,
  moduleFolder,
  nextDay,
} from "../scope";
import { ARCHIVE_MAX_JOBS, ARCHIVE_PLAN_VERSION, type ArchiveFileSource, type ArchiveJob, type ArchiveOptions, type ArchivePlanResponse } from "../types";
import { planModuleData, tableScope } from "./data";
import { archiveFileName, FILE_SOURCES, listFileRows } from "./files";
import { extractMedia, MEDIA_NOT_ARCHIVED, MEDIA_SOURCES, mediaFolderLabel, mediaModuleOf } from "./media";
import type { ArchiveCtx } from "./reports";

assertServerOnly("lib/archive/server/plan");

type Row = Record<string, unknown>;
/** Kullanılan sorgu kurucusu alt kümesi (Supabase tiplerinin derin örneklemesinden kaçınmak için gevşek arayüz). */
type LooseQuery = {
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: readonly unknown[]): LooseQuery;
  not(column: string, op: string, value: unknown): LooseQuery;
  gte(column: string, value: string): LooseQuery;
  lt(column: string, value: string): LooseQuery;
  gt(column: string, value: string): LooseQuery;
  order(column: string, opts: { ascending: boolean }): LooseQuery;
  limit(n: number): PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>;
};

export class ArchiveTooLargeError extends Error {}

/** Tenant'ın satırlarını keyset ile okur (yalnız seçili kolonlar). */
async function listRows(
  db: SupabaseClient,
  table: string,
  columns: string,
  scope: (q: LooseQuery) => LooseQuery,
  max: number,
): Promise<{ rows: Row[]; error: string | null }> {
  const out: Row[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < 10_000; guard++) {
    let q = scope(db.from(table).select(columns) as unknown as LooseQuery);
    if (after) q = q.gt("id", after);
    const res = await q.order("id", { ascending: true }).limit(1000);
    if (res.error) return { rows: out, error: res.error.message ?? "okunamadı" };
    const rows = res.data ?? [];
    if (rows.length === 0) return { rows: out, error: null };
    out.push(...rows);
    if (out.length > max) throw new ArchiveTooLargeError("Seçilen kapsam çok büyük; lütfen modül, danışan veya tarih aralığını daraltın.");
    after = String(rows[rows.length - 1].id);
  }
  return { rows: out, error: "sayfalama sınırı" };
}

function dateScope(q: LooseQuery, opts: ArchiveOptions, column = "created_at"): LooseQuery {
  let out = q;
  if (opts.dateFrom) out = out.gte(column, istanbulDayStartIso(opts.dateFrom));
  if (opts.dateTo) out = out.lt(column, istanbulDayStartIso(nextDay(opts.dateTo)));
  return out;
}

function personName(r: Row): string {
  return [r.ad, r.soyad].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() || `Danışan ${String(r.id).slice(0, 8)}`;
}

export async function buildArchivePlan(ctx: ArchiveCtx, opts: ArchiveOptions, now: Date = new Date()): Promise<ArchivePlanResponse> {
  const { db, tenantId, userId } = ctx;
  const jobs: ArchiveJob[] = [];
  const excluded: ArchivePlanResponse["excluded"] = [];
  /** Kullanıcıya ait olup cihaz / yetki nedeniyle alınamayan içerik → arşiv EKSİK sayılır. */
  const restricted: ArchivePlanResponse["excluded"] = [];
  const warnings: string[] = [];
  const summary: ArchivePlanResponse["summary"] = [];
  const perm = (k: Parameters<typeof hasModulePermissionForProfile>[1]) => hasModulePermissionForProfile(ctx.profile, k);
  const has = (m: string) => opts.modules.includes(m);
  const push = (j: ArchiveJob) => {
    jobs.push(j);
    if (jobs.length > ARCHIVE_MAX_JOBS) throw new ArchiveTooLargeError(`Arşiv ${ARCHIVE_MAX_JOBS} parça sınırını aşıyor; lütfen kapsamı daraltın.`);
  };

  // Danışan adları (klasörler) — seçili danışanlar veya tenant'ın tümü.
  const clientNames = new Map<string, string>();
  const needClients = has("clients") || opts.clientIds !== null || opts.include.files || opts.include.reports;
  if (needClients) {
    const r = await listRows(db, "clients", "id, ad, soyad", (q) => {
      let x = q.eq("tenant_id", tenantId);
      if (opts.clientIds) x = x.in("id", opts.clientIds);
      return x;
    }, 200_000);
    if (r.error) warnings.push(`Danışan adları okunamadı (${r.error}); klasörlerde kısa kimlik kullanılır.`);
    for (const c of r.rows) clientNames.set(String(c.id), safeFileName(personName(c)));
    if (opts.clientIds && r.rows.length !== opts.clientIds.length) warnings.push("Seçilen danışanlardan bazıları bu hesapta bulunamadı; yalnız bulunanlar arşivlenir.");
  }
  const clientFolder = (id: unknown) => clientNames.get(String(id)) ?? `Danışan ${String(id ?? "").slice(0, 8) || "bağsız"}`;

  // 1) Kayıt dökümü (Word) — modül bazında parçalı
  if (opts.include.data) {
    for (const m of opts.modules) {
      const p = await planModuleData(db, tenantId, userId, m, opts);
      const label = MODULE_LABELS[m] ?? m;
      summary.push({ module: m, label, records: p.records, tables: p.tables.filter((t) => !t.skip).map((t) => ({ label: t.label, records: t.expected ?? 0 })) });
      for (const t of p.tables) {
        if (t.skip) excluded.push({ scope: `${label} › ${t.label}`, reason: t.skip });
        if (t.error) warnings.push(`${label} › ${t.label}: sayım okunamadı (${t.error}) — bu bölüm eksik olabilir.`);
      }
      if (p.records > 0 || p.tables.some((t) => t.error)) {
        push({ kind: "data", module: m, label: `${label} — kayıt dökümü`, folder: `${DATA_FOLDER}/${moduleFolder(m)}`, expected: p.records });
      }
    }
  }

  // 2) Danışan dosyaları (Danışan Yolculuğu Tam Rapor üreticisi)
  if (opts.include.dossiers) {
    if (!has("clients")) {
      excluded.push({ scope: "Danışan dosyaları", reason: "Danışan Yolculuğu modülü seçilmedi" });
    } else {
      for (const [id, name] of clientNames) push({ kind: "client_dossier", clientId: id, label: `Danışan dosyası — ${name}`, folder: `${DOSSIER_FOLDER}/${name}` });
      if (opts.dateFrom || opts.dateTo) warnings.push("Danışan dosyaları seçilen tarih aralığındaki kayıtlarla (Danışan Yolculuğu tarih aralığı raporu) üretilir.");
    }
  }

  // 3) Hazır analiz raporları
  if (opts.include.reports) {
    // Numeroloji: TÜM kayıtlı analizler (danışana bağlı → danışan klasörü; bağsız → "Danışan bağı olmayan").
    // Numeroloji modülünün kendi Word üreticisi; danışan seçiliyken yalnız seçili danışanlara bağlı kayıtlar.
    if (has("numerology")) {
      if (!perm("numerology")) {
        restricted.push({ scope: "Numeroloji hazır raporları", reason: "Numeroloji modülü yetkiniz kapalı (kayıtlar Kayıt Dökümü'nde var)" });
      } else {
        const r = await listRows(db, "numerology_records", "id, client_id, name, surname, created_at", (q) => {
          let x = dateScope(q.eq("tenant_id", tenantId), opts);
          if (opts.clientIds) x = x.in("client_id", opts.clientIds);
          return x;
        }, ARCHIVE_MAX_JOBS);
        if (r.error) warnings.push(`Numeroloji kayıtları listelenemedi (${r.error}).`);
        for (const n of r.rows) {
          const who = [n.name, n.surname].filter(Boolean).join(" ") || "kayıt";
          const linked = n.client_id ? String(n.client_id) : null;
          push({
            kind: "numerology_record",
            clientId: linked,
            recordId: String(n.id),
            label: `Numeroloji — ${who}`,
            folder: `${REPORTS_FOLDER}/Numeroloji/${linked ? clientFolder(linked) : "Danışan bağı olmayan"}`,
          });
        }
        excluded.push({ scope: "Numeroloji — Zamanlama & Gelişim bölümü", reason: "bugüne göre yeniden hesaplanan bölüm; arşiv yalnız kayıtlı analizi içerir" });
      }
    }
    // Human Design profesyonel raporlar + İlişki raporları
    if (has("human_design")) {
      if (ctx.isAndroid) {
        restricted.push({ scope: "Human Design Word raporları", reason: "Android cihazda HD Word üretilmez (HD kuralı); tam arşiv için bilgisayardan alın" });
      } else if (!perm("human_design")) {
        restricted.push({ scope: "Human Design hazır raporları", reason: "Human Design modülü yetkiniz kapalı (kayıtlar Kayıt Dökümü'nde var)" });
      } else {
        let hdClientIds: string[] | null = null;
        const hdClientJourney = new Map<string, string>();
        const hc = await listRows(db, "human_design_clients", "id, journey_client_id", (q) => {
          let x = q.eq("tenant_id", tenantId);
          if (opts.clientIds) x = x.in("journey_client_id", opts.clientIds);
          return x;
        }, 200_000);
        for (const h of hc.rows) if (h.journey_client_id) hdClientJourney.set(String(h.id), String(h.journey_client_id));
        if (opts.clientIds) hdClientIds = hc.rows.map((h) => String(h.id));
        if (!hdClientIds || hdClientIds.length > 0) {
          const reps = await listRows(db, "human_design_reports", "id, client_id, title, created_at", (q) => {
            let x = dateScope(q.eq("tenant_id", tenantId).eq("report_kind", "canonical"), opts);
            if (hdClientIds) x = x.in("client_id", hdClientIds);
            return x;
          }, ARCHIVE_MAX_JOBS);
          if (reps.error) warnings.push(`HD raporları listelenemedi (${reps.error}).`);
          for (const r of reps.rows) {
            const journey = hdClientJourney.get(String(r.client_id));
            const sub = journey ? clientFolder(journey) : "Danışan Yolculuğu bağı olmayan";
            push({ kind: "hd_report", reportId: String(r.id), label: `HD raporu — ${String(r.title ?? "").trim() || sub}`, folder: `${REPORTS_FOLDER}/Human Design/${sub}` });
          }
          const rel = await listRows(db, "human_design_relation_reports", "id, analysis_id, created_at", (q) => dateScope(q.eq("tenant_id", tenantId), opts), ARCHIVE_MAX_JOBS);
          if (rel.error && !/relation|does not exist|42P01|PGRST205/i.test(rel.error)) warnings.push(`HD İlişki raporları listelenemedi (${rel.error}).`);
          let relRows = rel.rows;
          if (hdClientIds) {
            // Danışan seçimi: yalnız seçili danışanların (HD danışanı üzerinden) katıldığı analizlerin raporları.
            const allowed = new Set<string>();
            for (let i = 0; i < hdClientIds.length; i += 100) {
              const pr = (await db
                .from("human_design_relation_participants")
                .select("analysis_id")
                .eq("tenant_id", tenantId)
                .in("client_id", hdClientIds.slice(i, i + 100))) as { data: Row[] | null; error: unknown };
              for (const x of pr.data ?? []) allowed.add(String(x.analysis_id));
            }
            relRows = relRows.filter((r) => allowed.has(String(r.analysis_id)));
          }
          for (const r of relRows) push({ kind: "hd_relation_report", reportId: String(r.id), label: "HD İlişki raporu", folder: `${REPORTS_FOLDER}/Human Design İlişki Analizleri` });
        }
      }
    }
    // Gökyüzü Atlası kayıtlı analizler (yalnız oturumdaki uzmanın)
    if (has("astrology")) {
      if (!isAstrologyModuleEnabled()) {
        excluded.push({ scope: "Gökyüzü Atlası raporları", reason: "modül bu ortamda kapalı" });
      } else {
        const r = await listRows(db, "astro_analyses", "id, client_id, title, created_at", (q) => {
          let x = dateScope(q.eq("tenant_id", tenantId).eq("owner_user_id", userId), opts);
          if (opts.clientIds) x = x.in("client_id", opts.clientIds);
          return x;
        }, ARCHIVE_MAX_JOBS);
        if (r.error) warnings.push(`Gökyüzü Atlası analizleri listelenemedi (${r.error}).`);
        for (const a of r.rows) {
          const sub = a.client_id ? clientFolder(a.client_id) : "Danışan bağı olmayan";
          push({ kind: "astro_report", analysisId: String(a.id), label: `Atlas — ${String(a.title ?? "analiz")}`, folder: `${REPORTS_FOLDER}/Gökyüzü Atlası/${sub}` });
        }
      }
    }
  }

  // 4) Fotoğraf ve ek dosyalar (ayrı dosya)
  if (opts.include.files) {
    for (const source of Object.keys(FILE_SOURCES) as ArchiveFileSource[]) {
      const src = FILE_SOURCES[source];
      if (!has(src.module)) continue;
      if (opts.clientIds && !src.clientLinked) {
        excluded.push({ scope: src.label, reason: "danışana bağlı olmayan dosya (danışan seçimi yapıldı)" });
        continue;
      }
      const r = await listFileRows(db, tenantId, source, opts, ARCHIVE_MAX_JOBS);
      if (r.error) warnings.push(`${src.label} listelenemedi (${r.error}).`);
      if (r.truncated) throw new ArchiveTooLargeError("Dosya sayısı arşiv sınırını aşıyor; lütfen kapsamı daraltın.");
      r.rows.forEach((row, index) => {
        const folder = src.clientLinked ? `${FILES_FOLDER}/${clientFolder(row.client_id)}/${src.label}` : `${FILES_FOLDER}/${src.label}`;
        push({ kind: "file", source, rowId: String(row.id), index, label: archiveFileName(source, row), folder });
      });
    }
    // Kayda bağlı kullanıcı görselleri (taş kataloğu, Şifa Rehberi, HD harita, Kişisel Ofis, profil, stok / aromaterapi).
    for (const def of Object.values(MEDIA_SOURCES)) {
      const e = getRegistryEntry(def.table);
      if (!e || !has(mediaModuleOf(def.table))) continue;
      if (opts.clientIds && def.table !== "clients") {
        excluded.push({ scope: def.label, reason: "danışana bağlı olmayan görsel (danışan seçimi yapıldı)" });
        continue;
      }
      const sc = await tableScope(db, e, opts, new Map());
      if (sc.skip !== null) {
        excluded.push({ scope: def.label, reason: sc.skip });
        continue;
      }
      const cols = def.inlineOnly ? "id" : ["id", ...def.columns].join(", ");
      const owner = e.ownerScope && "column" in e.ownerScope ? e.ownerScope.column : null;
      const narrow = (q: LooseQuery): LooseQuery => {
        let x = q;
        if (owner) x = x.eq(owner, userId);
        if (def.table === "clients" && opts.clientIds) x = x.in("id", opts.clientIds);
        for (const f of sc.filters) x = f.op === "in" ? x.in(f.column, f.values) : f.op === "gte" ? x.gte(f.column, f.value) : x.lt(f.column, f.value);
        if (def.columns.length === 1) x = x.not(def.columns[0], "is", null);
        return x;
      };
      let rows: Row[] = [];
      let listError: string | null = null;
      if (typeof e.tenantScope === "object") {
        // child_of (ör. Şifa Rehberi bölümleri): yalnız BU tenant'ın ebeveynlerine bağlı satırlar okunur.
        const scope = e.tenantScope;
        const parents = await listRows(db, scope.parent, "id", (q) => q.eq("tenant_id", tenantId), 200_000);
        listError = parents.error;
        const ids = parents.rows.map((x) => String(x.id));
        for (let k = 0; k < ids.length && !listError; k += 100) {
          const part = await listRows(db, def.table, cols, (q) => narrow(q.in(scope.fk, ids.slice(k, k + 100))), ARCHIVE_MAX_JOBS);
          listError = part.error;
          rows.push(...part.rows);
        }
      } else {
        const r = await listRows(db, def.table, cols, (q) => narrow(q.eq("tenant_id", tenantId)), ARCHIVE_MAX_JOBS);
        listError = r.error;
        rows = r.rows;
      }
      if (listError) {
        warnings.push(`${def.label} listelenemedi (${listError}) — bu görseller eksik olabilir.`);
        continue;
      }
      for (const row of rows) {
        if (!def.inlineOnly && extractMedia(def, row, tenantId).items.length === 0) continue;
        const folder =
          def.table === "clients"
            ? `${FILES_FOLDER}/${clientFolder(row.id)}/Profil fotoğrafı`
            : `${FILES_FOLDER}/${safeFileName(mediaFolderLabel(def.table))}`;
        push({ kind: "media", table: def.table, rowId: String(row.id), label: `${def.label} — ${String(row.id).slice(0, 8)}`, folder });
      }
    }
    for (const n of MEDIA_NOT_ARCHIVED) excluded.push(n);
  } else {
    excluded.push({ scope: "Fotoğraf ve ek dosyalar", reason: "seçilmedi" });
  }

  return {
    ok: true,
    version: ARCHIVE_PLAN_VERSION,
    archive_id: randomUUID(),
    created_at: now.toISOString(),
    file_name: `yasam-arsiv-${reportFileDate(undefined, now)}.zip`,
    options: opts,
    jobs,
    summary,
    excluded,
    restricted,
    warnings,
  };
}
