// Doğaltaş Kütüphanesi · AKTARIM MOTORU (YALNIZ SUNUCU / owner araçları).
//
// İlkeler:
//   • ÖNCE DEFTER: her ücretli çağrıdan önce DB'de kredi ayrılır (stone_library_batch_reserve_call; tavan DB'de zorunlu).
//     Ayrıca isteğe bağlı dış defter (ledger) her denemeyi yazar.
//   • YENİDEN KULLANIM: aynı (uç, dil) için bu kaynakta başarılı ham yanıt varsa ücretli çağrı YAPILMAZ (devam / tekrar aktarım).
//   • SINIRLI DENEME: 429 → Retry-After ≤ 5 sn ise 1 kez; 5xx / zaman aşımı / ağ → paket sonunda en çok 1 tur; 401/403 → DUR.
//   • KOTA TABANI: sağlayıcının kalan kotası `quotaFloor` + kalan plan altına inerse yeni çağrı yapılmaz.
//   • Metin değiştirilmez; her şey owner RPC'leriyle (DB'de owner doğrulamalı) ve paket + ham kayıt bağıyla yazılır.
//   • Hiçbir şey yayımlanmaz: taşlar 'draft', kayıtlar / facet'ler / görseller 'pending' başlar.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCrystalImage, getCrystals, isAllowedCrystalImageUrl, type CrystalsConfig, type CrystalsFetch, type CrystalsLang, type QuotaHeaders } from "./roxyCrystalsClient";
import { parseBirthstone, parseCatalogPage, planCrystal, type CrystalPlan } from "./roxyNormalize";
import { imageStoragePath, processImage } from "./imageProcess";
import { ownerRpc, StoneLibraryRpcError } from "./ownerRpc";

export type LedgerEntry = {
  seq: number; kind: "api" | "image" | "reuse"; endpoint: string; lang: string | null; startedAt: string; finishedAt: string;
  status: number | null; outcome: string; attempt: number; creditCounted: number; quota: QuotaHeaders | null; requestId: string;
};

export type RunnerOptions = {
  db: SupabaseClient;
  actor: string;
  sourceId: string;
  licenseGrantId: string | null;
  client: CrystalsConfig;
  imageFetch?: CrystalsFetch;
  langs?: CrystalsLang[];
  includeVocabLists?: boolean;
  includeBirthstones?: boolean;
  includeImages?: boolean;
  /** Bu paket için DB kredi tavanı (ücretli çağrı + deneme). */
  creditCap: number;
  /** Bu çalıştırmada dış sınır (gece izni gibi) — kalan izin. */
  allowanceRemaining: number;
  /** Sağlayıcı kalan kotasının altına inilmeyecek taban (Atlas / HD payı). */
  quotaFloor: number;
  termsSha256: string;
  paidPeriodNote?: string;
  /** Mevcut başarılı ham yanıtı yeniden kullanmak yerine yeniden çek (kaynak değişikliği kontrolü). */
  forceRefetch?: boolean;
  sleep?: (ms: number) => Promise<void>;
  ledger?: (e: LedgerEntry) => void;
  log?: (msg: string) => void;
  /** Test: belirli sayıda çağrıdan sonra süreci "kes" (kısmi aktarım senaryosu). */
  abortAfterCalls?: number;
  /** Süre bütçesi (ms). Aşılınca yeni çağrı başlatılmaz; paket 'stopped' olur ve sonra kaldığı yerden devam edilir. */
  deadlineMs?: number;
};

export type RunnerSummary = {
  batchId: string; status: "completed" | "stopped" | "failed";
  stopReason: string | null;
  catalogTotal: number | null; catalogIds: string[];
  paidCalls: number; reusedResponses: number; failedCalls: number; retries: number;
  imageDownloads: number; imagesStored: number; imagesSkippedExisting: number; imageFailures: { id: string; reason: string }[];
  imagesDisabledReason: string | null;
  stonesCreated: number; stonesExisting: number; stonesAdopted: number; stonesSkipped: { id: string; reason: string }[];
  recordsWritten: number; facetsWritten: number; issues: Record<string, string[]>; unknownKeys: string[];
  quotaFirst: QuotaHeaders | null; quotaLast: QuotaHeaders | null;
  vocabLists: { colors: string[] | null; planets: string[] | null };
  details: Map<string, { en: unknown; tr: unknown }>;
};

class StopRun extends Error {
  constructor(public reason: string) { super(reason); }
}

export async function runCrystalImport(o: RunnerOptions): Promise<RunnerSummary> {
  const db = o.db;
  const langs = o.langs ?? ["en", "tr"];
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => undefined);
  let seq = 0;
  const S: RunnerSummary = {
    batchId: "", status: "completed", stopReason: null, catalogTotal: null, catalogIds: [],
    paidCalls: 0, reusedResponses: 0, failedCalls: 0, retries: 0,
    imageDownloads: 0, imagesStored: 0, imagesSkippedExisting: 0, imageFailures: [], imagesDisabledReason: null,
    stonesCreated: 0, stonesExisting: 0, stonesAdopted: 0, stonesSkipped: [], recordsWritten: 0, facetsWritten: 0, issues: {}, unknownKeys: [],
    quotaFirst: null, quotaLast: null, vocabLists: { colors: null, planets: null }, details: new Map(),
  };
  const cap = Math.max(0, Math.min(o.creditCap, o.allowanceRemaining));
  const issue = (id: string, m: string) => { (S.issues[id] ??= []).push(m); };
  const startedAtMs = Date.now();
  let includeImages = !!o.includeImages && !!o.licenseGrantId;

  // Görsel izni BAŞTA doğrulanır: geçersizse dosya hiç indirilmez / depoya yüklenmez.
  if (includeImages) {
    const lic = await ownerRpc<{ grants?: { id: string; source_id: string; scope: string; evidence_status: string; storage_allowed: boolean }[] }>(
      db, "stone_library_owner_licenses", { p_actor: o.actor });
    const g = (lic?.grants ?? []).find((x) => x.id === o.licenseGrantId);
    if (!g || g.source_id !== o.sourceId || g.scope !== "crystal_images" || g.evidence_status === "revoked" || !g.storage_allowed) {
      includeImages = false;
      S.imagesDisabledReason = "license_grant_invalid";
    }
  }

  S.batchId = await ownerRpc<string>(db, "stone_library_batch_open", {
    p_actor: o.actor,
    p_data: { source_id: o.sourceId, kind: "api_import", dry_run: false, langs, credit_cap: cap, calls_planned: 0, terms_sha256: o.termsSha256,
      paid_period_note: o.paidPeriodNote ?? null, note: "F2 kristal aktarımı" },
  });
  try {
    await ownerRpc(db, "stone_library_batch_set_status", { p_actor: o.actor, p_batch_id: S.batchId, p_status: "running", p_note: null });
  } catch (e) {
    // Aynı kaynakta çalışan başka paket var (ör. iki sekme): bu paket yetim 'planned' kalmaz.
    await ownerRpc(db, "stone_library_batch_recover", { p_actor: o.actor, p_batch_id: S.batchId, p_note: "baska_paket_calisiyor" }).catch(() => undefined);
    S.status = "stopped";
    S.stopReason = e instanceof StoneLibraryRpcError && e.code === "23505" ? "batch_already_running" : "start_failed";
    return S;
  }
  if (S.imagesDisabledReason) {
    await ownerRpc(db, "stone_library_batch_log", { p_actor: o.actor, p_batch_id: S.batchId, p_level: "warn", p_kind: "images_disabled", p_external_id: null, p_message: S.imagesDisabledReason }).catch(() => undefined);
  }
  const blog = (level: "info" | "warn" | "error", kind: string, ext: string | null, msg: string | null) =>
    ownerRpc(db, "stone_library_batch_log", { p_actor: o.actor, p_batch_id: S.batchId, p_level: level, p_kind: kind, p_external_id: ext, p_message: msg }).catch(() => undefined);

  type Fetched = { ok: boolean; json: unknown; rawId: string | null; status: number | null; reused: boolean };
  const plannedRemaining = { n: 0 };
  /** Bu pakette başarıyla alınmış yanıtlar: aynı (uç, dil) paket içinde İKİNCİ KEZ ücretli çağrılmaz (forceRefetch dahil). */
  const inBatch = new Map<string, Fetched>();

  /** Tek API isteği: yeniden kullanım → rezervasyon → çağrı → ham kayıt → kota. */
  async function api(path: string, query: Record<string, string>, extId: string | null): Promise<Fetched> {
    const lang = query.lang ?? null;
    const endpoint = path + (query.limit ? `?limit=${query.limit}${query.offset ? `&offset=${query.offset}` : ""}` : "");
    const memo = inBatch.get(`${endpoint}|${lang ?? "-"}`);
    if (memo) return memo;
    if (!o.forceRefetch) {
      const reuse = await ownerRpc<{ raw_id: string; payload: unknown } | null>(db, "stone_library_owner_raw_get", {
        p_actor: o.actor, p_source_id: o.sourceId, p_endpoint: endpoint.replace(/[?&=]/g, "_"), p_lang: lang,
      });
      if (reuse && reuse.payload !== undefined) {
        S.reusedResponses++;
        const t = new Date().toISOString();
        o.ledger?.({ seq: ++seq, kind: "reuse", endpoint, lang, startedAt: t, finishedAt: t, status: 200, outcome: "reused_raw", attempt: 0, creditCounted: 0, quota: null, requestId: `${S.batchId}:${seq}` });
        return { ok: true, json: reuse.payload, rawId: reuse.raw_id, status: 200, reused: true };
      }
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (o.abortAfterCalls != null && S.paidCalls >= o.abortAfterCalls) throw new StopRun("simulated_interrupt");
      if (o.deadlineMs != null && Date.now() - startedAtMs > o.deadlineMs) throw new StopRun("time_budget");
      if (S.quotaLast?.remaining != null && S.quotaLast.remaining - plannedRemaining.n < o.quotaFloor) throw new StopRun("quota_floor");
      try {
        await ownerRpc(db, "stone_library_batch_reserve_call", { p_actor: o.actor, p_batch_id: S.batchId, p_external_id: extId });
      } catch (e) {
        if (e instanceof StoneLibraryRpcError && e.code === "SL065") throw new StopRun("credit_cap");
        throw e;
      }
      S.paidCalls++;
      const startedAt = new Date().toISOString();
      const r = await getCrystals(o.client, path, query);
      const finishedAt = new Date().toISOString();
      if (r.quota.remaining != null) {
        if (!S.quotaFirst) S.quotaFirst = r.quota;
        S.quotaLast = r.quota;
        await ownerRpc(db, "stone_library_batch_quota", { p_actor: o.actor, p_batch_id: S.batchId, p_limit: r.quota.limit, p_before: (S.quotaFirst.remaining ?? 0) + 1, p_after: r.quota.remaining }).catch(() => undefined);
      }
      let rawId: string | null = null;
      // 200 + bozuk JSON "başarılı ham yanıt" olarak SAKLANMAZ (yoksa devamda çöp veri yeniden kullanılırdı).
      if (r.status != null && !(r.ok === false && r.kind === "malformed_json")) {
        rawId = await ownerRpc<string>(db, "stone_library_raw_put", {
          p_actor: o.actor, p_batch_id: S.batchId, p_external_id: extId, p_lang: lang, p_endpoint: endpoint.replace(/[?&=]/g, "_"),
          p_http_status: r.status, p_payload: r.ok ? r.json : (r.json ?? { _error: r.kind }),
        });
      }
      const outcome = r.ok ? "ok" : r.kind === "http" ? `http_${r.status}` : r.kind;
      o.ledger?.({ seq: ++seq, kind: "api", endpoint, lang, startedAt, finishedAt, status: r.status, outcome, attempt, creditCounted: 1, quota: r.quota.remaining != null ? r.quota : null, requestId: `${S.batchId}:${seq}` });
      if (r.ok) {
        const got: Fetched = { ok: true, json: r.json, rawId, status: r.status, reused: false };
        inBatch.set(`${endpoint}|${lang ?? "-"}`, got);
        return got;
      }
      S.failedCalls++;
      await blog("error", r.kind === "http" ? `http_${r.status}` : r.kind, extId, `${endpoint} ${lang ?? ""}`.trim());
      if (r.status === 401 || r.status === 403) throw new StopRun(`auth_${r.status}`);
      if (r.status === 429 && attempt === 1 && (r.retryAfterMs ?? 2000) <= 5000) {
        S.retries++;
        await sleep(r.retryAfterMs ?? 2000);
        continue;
      }
      return { ok: false, json: r.json, rawId, status: r.status, reused: false };
    }
    return { ok: false, json: null, rawId: null, status: 429, reused: false };
  }

  const failedDetails: { id: string; lang: CrystalsLang }[] = [];
  const createdWithoutEn = new Set<string>();
  try {
    // 1) Katalog (EN önce: kimlik + EN adlar), sonra TR liste (TR adlar) — sayfalı.
    const ids: string[] = [];
    for (const lang of langs) {
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const q: Record<string, string> = { lang, limit: "100" };
        if (offset) q.offset = String(offset);
        const f = await api("/crystals", q, null);
        if (!f.ok) { if (lang === langs[0]) throw new StopRun("catalog_failed"); break; }
        const p = parseCatalogPage(f.json);
        if (lang === langs[0]) { S.catalogTotal = p.total; for (const id of p.ids) if (!ids.includes(id)) ids.push(id); }
        offset += p.ids.length;
        if (p.ids.length === 0 || p.total == null || offset >= p.total) break;
      }
    }
    S.catalogIds = ids;
    plannedRemaining.n = ids.length * langs.length + (o.includeBirthstones ? 12 : 0) + (o.includeVocabLists ? 2 : 0);
    await ownerRpc(db, "stone_library_batch_log", { p_actor: o.actor, p_batch_id: S.batchId, p_level: "info", p_kind: "catalog", p_external_id: null,
      p_message: `total=${S.catalogTotal} ids=${ids.length}` });

    // 2) Sözlük karşılaştırması için renk / gezegen listeleri.
    if (o.includeVocabLists) {
      for (const [path, key] of [["/crystals/colors", "colors"], ["/crystals/planets", "planets"]] as const) {
        const f = await api(path, { lang: "en" }, null);
        plannedRemaining.n--;
        const arr = f.ok && f.json && typeof f.json === "object" ? (f.json as Record<string, unknown>)[key] : null;
        S.vocabLists[key] = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : null;
      }
    }

    // 3) Taş detayları (EN → TR) + yazım + görsel.
    for (const id of ids) {
      const got: Partial<Record<CrystalsLang, Fetched>> = {};
      for (const lang of langs) {
        got[lang] = await api(`/crystals/${id}`, { lang }, id);
        plannedRemaining.n--;
        if (!got[lang]!.ok) failedDetails.push({ id, lang });
      }
      await persistCrystal(id, got.en, got.tr);
    }

    // 4) Başarısız detaylar için sınırlı ikinci tur (en çok 1 kez).
    if (failedDetails.length) {
      const again = [...failedDetails];
      failedDetails.length = 0;
      const byId = new Map<string, CrystalsLang[]>();
      for (const f of again) byId.set(f.id, [...(byId.get(f.id) ?? []), f.lang]);
      for (const [id, ls] of byId) {
        S.retries += ls.length;
        const got: Partial<Record<CrystalsLang, Fetched>> = {};
        for (const lang of langs) got[lang] = await api(`/crystals/${id}`, { lang }, id);
        for (const lang of ls) if (!got[lang]!.ok) failedDetails.push({ id, lang });
        await persistCrystal(id, got.en, got.tr);
      }
    }

    // 5) Doğum taşı ayları (bir taşın birden çok ayla ilişkisi).
    if (o.includeBirthstones) {
      for (let m = 1; m <= 12; m++) {
        const f = await api(`/crystals/birthstone/${m}`, { lang: "en" }, null);
        plannedRemaining.n--;
        if (!f.ok) continue;
        const b = parseBirthstone(f.json);
        for (const ext of b.ids) {
          const stone = await ownerRpc<string | null>(db, "stone_library_owner_external_lookup", { p_actor: o.actor, p_source_id: o.sourceId, p_external_id: ext });
          if (!stone) { issue(ext, "birthstone_unknown_stone"); continue; }
          await ownerRpc(db, "stone_library_facet_add", { p_actor: o.actor, p_data: { stone_id: stone, source_id: o.sourceId, facet: "birth_month", value_num: b.month ?? m, batch_id: S.batchId, raw_id: f.rawId } });
          S.facetsWritten++;
        }
      }
    }
    for (const f of failedDetails) issue(f.id, `detail_failed:${f.lang}`);
    await ownerRpc(db, "stone_library_batch_set_status", { p_actor: o.actor, p_batch_id: S.batchId, p_status: "completed", p_note: null });
    S.status = "completed";
  } catch (e) {
    const reason = e instanceof StopRun ? e.reason : e instanceof StoneLibraryRpcError ? `rpc_${e.code}` : "error";
    S.stopReason = reason;
    log(`aktarım durdu: ${reason}`);
    await blog(e instanceof StopRun ? "warn" : "error", "stopped", null, reason);
    try {
      await ownerRpc(db, "stone_library_batch_set_status", { p_actor: o.actor, p_batch_id: S.batchId, p_status: "stop_requested", p_note: reason });
      await ownerRpc(db, "stone_library_batch_set_status", { p_actor: o.actor, p_batch_id: S.batchId, p_status: e instanceof StopRun ? "stopped" : "failed", p_note: reason });
    } catch { /* durum zaten bitmiş olabilir */ }
    S.status = e instanceof StopRun ? "stopped" : "failed";
  }
  return S;

  // ── yazım ────────────────────────────────────────────────────────────────────────────────────
  async function persistCrystal(id: string, en: Fetched | undefined, tr: Fetched | undefined): Promise<void> {
    const plan: CrystalPlan | null = planCrystal(en?.ok ? en.json : null, tr?.ok ? tr.json : null);
    S.details.set(id, { en: en?.ok ? en.json : null, tr: tr?.ok ? tr.json : null });
    if (!plan) { S.stonesSkipped.push({ id, reason: "no_valid_detail" }); return; }
    for (const k of plan.unknownKeys) if (!S.unknownKeys.includes(k)) S.unknownKeys.push(k);
    for (const m of plan.issues) issue(id, m);
    let stoneId = await ownerRpc<string | null>(db, "stone_library_owner_external_lookup", { p_actor: o.actor, p_source_id: o.sourceId, p_external_id: id });
    if (!stoneId) {
      let slug = plan.slug;
      for (let n = 2; n <= 6 && !stoneId; n++) {
        try {
          stoneId = await ownerRpc<string>(db, "stone_library_stone_save", { p_actor: o.actor, p_stone_id: null, p_data: { slug, name_tr: plan.nameTr ?? id, name_en: plan.nameEn } });
          S.stonesCreated++;
          if (!plan.nameEn) createdWithoutEn.add(stoneId);
        } catch (e) {
          const code = e instanceof StoneLibraryRpcError ? e.code : "";
          if (code === "23505") { slug = `${plan.slug}-${n}`; continue; }
          if (code === "SL026") {
            // Yalnız HİÇBİR kaynağa bağlı olmayan (sahipsiz) kart benimsenir; aksi hâlde owner eşleme kuyruğu.
            const orphan = (await ownerRpc<string | null>(db, "stone_library_owner_find_orphan", { p_actor: o.actor, p_name: plan.nameTr ?? id }))
              ?? (plan.nameEn ? await ownerRpc<string | null>(db, "stone_library_owner_find_orphan", { p_actor: o.actor, p_name: plan.nameEn }) : null);
            if (orphan) { stoneId = orphan; S.stonesAdopted++; await blog("info", "adopted_orphan_card", id, plan.nameTr); break; }
            S.stonesSkipped.push({ id, reason: "name_conflict" }); await blog("warn", "name_conflict", id, plan.nameTr); return;
          }
          throw e;
        }
      }
      if (!stoneId) { S.stonesSkipped.push({ id, reason: "slug_exhausted" }); return; }
      try {
        await ownerRpc(db, "stone_library_external_id_link", { p_actor: o.actor, p_source_id: o.sourceId, p_external_id: id, p_stone_id: stoneId, p_batch_id: S.batchId });
      } catch (e) {
        // F3: kartın adı sağlayıcı adıyla AYNEN aynı değilse (ör. benimsenen sahipsiz kart) bağlanmaz; owner eşleme kuyruğuna kalır.
        if (e instanceof StoneLibraryRpcError && e.code === "SL039") {
          S.stonesSkipped.push({ id, reason: "name_conflict" }); await blog("warn", "name_conflict", id, plan.nameTr); return;
        }
        throw e;
      }
    } else {
      S.stonesExisting++;
    }
    if (plan.nameTrSuspect) await blog("warn", "tr_name_missing", id, plan.nameTr);
    for (const r of plan.records) {
      const rawId = r.lang === "en" ? en?.rawId : tr?.rawId;
      await ownerRpc<string>(db, "stone_library_record_add_flagged", { p_actor: o.actor, p_data: {
        stone_id: stoneId, source_id: o.sourceId, field_key: r.field, lang: r.lang, content: r.content, origin: "source", batch_id: S.batchId,
        raw_id: rawId ?? null, health_sensitive: r.health }, p_flags: r.flags });
      S.recordsWritten++;
    }
    for (const f of plan.facets) {
      const rawId = f.lang === "tr" ? tr?.rawId : en?.rawId ?? tr?.rawId;
      const data: Record<string, unknown> = { stone_id: stoneId, source_id: o.sourceId, facet: f.facet, batch_id: S.batchId, raw_id: rawId ?? null, health_sensitive: f.health };
      if (f.lang) data.lang = f.lang;
      if (f.value_key != null) data.value_key = f.value_key;
      if (f.value_text != null) data.value_text = f.value_text;
      if (f.value_num != null) data.value_num = f.value_num;
      if (f.pair_external_id != null) data.pair_external_id = f.pair_external_id;
      try {
        await ownerRpc<string>(db, "stone_library_facet_add_flagged", { p_actor: o.actor, p_data: data, p_flags: f.flags });
        S.facetsWritten++;
      } catch (e) {
        if (e instanceof StoneLibraryRpcError && (e.code === "SL041" || e.code === "23514")) { issue(id, `facet_rejected:${f.facet}:${e.code}`); continue; }
        throw e;
      }
    }
    // İlk turda EN detay gelmemişse ve sonradan geldiyse kartın İngilizce adı tamamlanır (owner adı ezilmez).
    if (plan.nameEn && createdWithoutEn.has(stoneId)) {
      try {
        await ownerRpc(db, "stone_library_stone_save", { p_actor: o.actor, p_stone_id: stoneId, p_data: { name_en: plan.nameEn } });
        createdWithoutEn.delete(stoneId);
      } catch (e) {
        if (!(e instanceof StoneLibraryRpcError)) throw e;
        issue(id, `name_en_not_set:${e.code}`);
      }
    }
    if (includeImages) await importImage(id, stoneId, plan.imageUrl);
  }

  async function importImage(extId: string, stoneId: string, url: string | null): Promise<void> {
    if (!url) { S.imageFailures.push({ id: extId, reason: "no_image_url" }); return; }
    if (!isAllowedCrystalImageUrl(url)) { S.imageFailures.push({ id: extId, reason: "url_not_allowed" }); return; }
    const existing = await ownerRpc<{ variant: string; deleted_at: string | null }[]>(db, "stone_library_owner_images", { p_actor: o.actor, p_stone_id: stoneId });
    if ((existing ?? []).some((i) => i.variant === "original" && !i.deleted_at)) { S.imagesSkippedExisting++; return; }
    if (o.deadlineMs != null && Date.now() - startedAtMs > o.deadlineMs) throw new StopRun("time_budget");
    // Görsel indirmenin sağlayıcı kotasına etkisi kesin ölçülemedi → TEMKİNLİ: her indirme DB kredi tavanından düşer.
    try {
      await ownerRpc(db, "stone_library_batch_reserve_call", { p_actor: o.actor, p_batch_id: S.batchId, p_external_id: extId });
    } catch (e) {
      if (e instanceof StoneLibraryRpcError && e.code === "SL065") throw new StopRun("credit_cap");
      throw e;
    }
    const startedAt = new Date().toISOString();
    const r = await fetchCrystalImage(url, { fetchImpl: o.imageFetch });
    S.imageDownloads++;
    o.ledger?.({ seq: ++seq, kind: "image", endpoint: `/img/crystals/${extId}`, lang: null, startedAt, finishedAt: new Date().toISOString(),
      status: r.status, outcome: r.ok ? "ok" : r.reason, attempt: 1, creditCounted: 1, quota: r.ok && r.quota.remaining != null ? r.quota : null, requestId: `${S.batchId}:${seq}` });
    if (!r.ok) { S.imageFailures.push({ id: extId, reason: r.reason }); await blog("warn", "image_failed", extId, r.reason); return; }
    const chk = await processImage(r.bytes, r.contentType);
    if (!chk.ok) { S.imageFailures.push({ id: extId, reason: chk.reason }); await blog("warn", "image_rejected", extId, chk.reason); return; }
    const bucket = db.storage.from("stone-library-images");
    const register = async (variant: "original" | "optimized", v: typeof chk.original, derivedFrom: string | null) => {
      const path = imageStoragePath(variant, o.sourceId, v);
      const up = await bucket.upload(path, v.bytes, { contentType: v.mime, upsert: false });
      if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new StopRun(`storage_${variant}`);
      return ownerRpc<string>(db, "stone_library_image_register", { p_actor: o.actor, p_data: {
        stone_id: stoneId, source_id: o.sourceId, license_grant_id: o.licenseGrantId, external_id: extId, variant, derived_from_id: derivedFrom,
        source_url: variant === "original" ? url : null, storage_path: path, mime: v.mime, bytes: v.bytes.length, width: v.width, height: v.height,
        sha256: v.sha256, batch_id: S.batchId, quality_flags: chk.flags } });
    };
    try {
      const origId = await register("original", chk.original, null);
      await register("optimized", chk.optimized, origId);
      S.imagesStored++;
    } catch (e) {
      if (e instanceof StoneLibraryRpcError && e.code === "SL087") { S.imageFailures.push({ id: extId, reason: "image_changed_needs_review" }); return; }
      if (e instanceof StoneLibraryRpcError && (e.code === "SL086" || e.code === "SL088")) {
        S.imageFailures.push({ id: extId, reason: e.code === "SL086" ? "license_not_valid" : "resolution_over_license" });
        await blog("warn", "image_rejected", extId, e.code);
        return;
      }
      throw e;
    }
  }
}
