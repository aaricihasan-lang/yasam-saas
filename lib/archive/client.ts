/**
 * lib/archive/client.ts — Premium Word Arşivi yürütücüsü (SAF; tarayıcı — harness sahte uçla test eder).
 *
 * Plan işlerini sunucudan parça parça alır ve ZIP'e yazar (lib/archive/zip). Kurallar:
 *  - Her istek ağ hatası / 5xx / 429'da sınırlı sayıda yeniden denenir (429'da Retry-After beklenir).
 *  - Veri dökümü: okunan kayıt sayısı plandaki sayımla AYNI değilse iş BAŞARISIZ sayılır (eksik arşiv başarılı
 *    gösterilmez). Arşivin içine her zaman BENİOKU.txt + ARŞİV-RAPORU.txt yazılır (başarısız / atlanan işler dahil).
 *  - İptal (AbortSignal): yeni iş başlatılmaz; sonuç "cancelled".
 */
import { ZipWriter, safeFileName } from "./zip";
import { MODULE_LABELS } from "@/lib/backup/registry";
import type { ArchiveJob, ArchivePlanResponse } from "./types";

export type PartResponse = {
  status: number;
  header(name: string): string | null;
  json(): Promise<unknown>;
  bytes(): Promise<Uint8Array>;
  isFile: boolean;
};

export type ArchiveDeps = {
  /** POST /api/settings/archive/part */
  postPart(body: unknown, signal?: AbortSignal): Promise<PartResponse>;
  /** İmzalı dosya bağlantısını indirir. */
  getFile(url: string, signal?: AbortSignal): Promise<Uint8Array>;
  onProgress?(p: ArchiveProgress): void;
  signal?: AbortSignal;
  sleep?(ms: number): Promise<void>;
  now?(): Date;
  retries?: number;
  concurrency?: number;
  /**
   * Cilt sınırı (bayt). Arşiv bu boyuta ulaşınca cilt kapatılır ve `onVolume` ile hemen teslim edilir (tarayıcı belleği
   * ve ZIP'in 4 GB sınırı aşılmaz). Varsayılan 1,5 GiB. Son cilt `parts` olarak döner.
   */
  maxVolumeBytes?: number;
  onVolume?(volume: { index: number; fileName: string; parts: Uint8Array[]; bytes: number }): void | Promise<void>;
};

export const DEFAULT_VOLUME_BYTES = 1.5 * 1024 * 1024 * 1024;

export type ArchiveProgress = {
  done: number;
  total: number;
  current: string;
  ok: number;
  failed: number;
  skipped: number;
  records: number;
  bytes: number;
};

export type JobOutcome = {
  job: ArchiveJob;
  status: "ok" | "failed" | "skipped";
  files: string[];
  rows: number;
  message: string | null;
};

export type ArchiveRunResult = {
  status: "complete" | "partial" | "failed" | "cancelled";
  fileName: string;
  /** Son cildin parçaları (tek ciltli arşivde arşivin tamamı). */
  parts: Uint8Array[];
  /** Toplam cilt sayısı (1 → bölünmemiş arşiv). */
  volumes: number;
  outcomes: JobOutcome[];
  counts: { ok: number; failed: number; skipped: number; records: number; bytes: number; files: number };
  durationMs: number;
};

class PartError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function decodeHeader(v: string | null): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function runArchive(plan: ArchivePlanResponse, deps: ArchiveDeps): Promise<ArchiveRunResult> {
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const sleep = deps.sleep ?? defaultSleep;
  const retries = deps.retries ?? 2;
  const concurrency = Math.max(1, Math.min(4, deps.concurrency ?? 2));
  const root = safeFileName(`Yaşam Arşivi ${plan.created_at.slice(0, 10)}`);
  const maxVolume = Math.max(1, deps.maxVolumeBytes ?? DEFAULT_VOLUME_BYTES);
  let zip = new ZipWriter(now());
  let volume = 1;
  let totalBytes = 0;
  const volumeName = (n: number) => plan.file_name.replace(/\.zip$/i, `-cilt-${n}.zip`);
  // Cilt devri: mevcut cilt boş değilse kapatılır, teslim edilir; sonraki dosyalar yeni cilde yazılır.
  let rotating: Promise<void> = Promise.resolve();
  const rotateIfNeeded = async (incoming: number) => {
    await rotating;
    if (zip.entryCount === 0 || zip.bytesWritten + incoming + 1024 <= maxVolume) return;
    const done = zip;
    const idx = volume;
    zip = new ZipWriter(now());
    volume++;
    done.addText(`${root}/CİLT-${idx}.txt`, `Bu dosya arşivin ${idx}. cildidir. Ciltlerin tamamı aynı klasöre açılabilir; BENİOKU.txt ve ARŞİV-RAPORU.txt son ciltte yer alır.\r\n`);
    const parts = done.finish();
    totalBytes += done.bytesWritten;
    rotating = Promise.resolve(deps.onVolume?.({ index: idx, fileName: volumeName(idx), parts, bytes: done.bytesWritten })).then(() => undefined);
    await rotating;
  };
  const outcomes: JobOutcome[] = [];
  const progress: ArchiveProgress = { done: 0, total: plan.jobs.length, current: "", ok: 0, failed: 0, skipped: 0, records: 0, bytes: 0 };
  const emit = () => deps.onProgress?.({ ...progress });
  let cancelled = false;

  const request = async (body: unknown): Promise<PartResponse> => {
    let attempt = 0;
    for (;;) {
      if (deps.signal?.aborted) throw new PartError("İptal edildi.", false);
      try {
        const r = await deps.postPart(body, deps.signal);
        if (r.status === 429 || r.status >= 500) {
          const ra = Number(r.header("Retry-After") ?? "0");
          throw new PartError(r.status === 429 ? "Sunucu yoğun (429)." : `Sunucu hatası (${r.status}).`, true, Math.min(30_000, (ra > 0 ? ra : 2) * 1000));
        }
        return r;
      } catch (e) {
        const pe = e instanceof PartError ? e : new PartError("Bağlantı hatası.", !deps.signal?.aborted, 1500);
        if (!pe.retryable || attempt >= retries) throw pe;
        attempt++;
        await sleep(pe.retryAfterMs || 1500 * attempt);
      }
    }
  };

  const errorOf = async (r: PartResponse): Promise<{ error: string; skipped: boolean }> => {
    try {
      const j = (await r.json()) as { error?: unknown; skipped?: unknown };
      return { error: String(j?.error ?? `Hata (${r.status}).`), skipped: j?.skipped === true };
    } catch {
      return { error: `Hata (${r.status}).`, skipped: false };
    }
  };

  const addFile = async (folder: string, name: string, bytes: Uint8Array): Promise<string> => {
    await rotateIfNeeded(bytes.length);
    const path = zip.add(`${root}/${folder}/${name}`, bytes);
    progress.bytes += bytes.length;
    return path;
  };

  const runJob = async (job: ArchiveJob): Promise<JobOutcome> => {
    const out: JobOutcome = { job, status: "ok", files: [], rows: 0, message: null };
    const body = { options: plan.options, job };
    if (job.kind === "data") {
      let state: string | null = null;
      const errors: string[] = [];
      for (let guard = 0; guard < 100_000; guard++) {
        const r = await request({ ...body, state });
        if (!r.isFile) {
          const j = (await r.json()) as { ok?: boolean; empty?: boolean; next?: string | null; error?: string; errors?: string[] };
          if (!j?.ok) {
            out.status = "failed";
            out.message = String(j?.error ?? `Hata (${r.status}).`);
            return out;
          }
          for (const e of j.errors ?? []) errors.push(e);
          state = j.next ?? null;
        } else {
          const name = decodeHeader(r.header("X-Archive-File-Name")) || `${job.label}.docx`;
          out.files.push(await addFile(job.folder, name, await r.bytes()));
          out.rows += Number(r.header("X-Archive-Rows") ?? "0") || 0;
          const errs = decodeHeader(r.header("X-Archive-Errors"));
          if (errs) errors.push(errs);
          state = r.header("X-Archive-Next") || null;
        }
        if (!state) break;
      }
      progress.records += out.rows;
      if (errors.length > 0 || out.rows !== job.expected) {
        out.status = "failed";
        out.message = [`${out.rows} / ${job.expected} kayıt arşivlendi`, ...errors].join(" · ");
      }
      return out;
    }
    if (job.kind === "media") {
      let total = 1;
      let rejected = 0;
      for (let index = 0; index < total && index < 10_000; index++) {
        const r = await request({ ...body, index });
        if (r.isFile) {
          total = Number(r.header("X-Archive-Media-Total") ?? "1") || 1;
          rejected = Number(r.header("X-Archive-Media-Rejected") ?? "0") || 0;
          const name = decodeHeader(r.header("X-Archive-File-Name")) || `${job.label} (${index + 1})`;
          out.files.push(await addFile(job.folder, name, await r.bytes()));
          continue;
        }
        const j = (await r.json()) as { ok?: boolean; empty?: boolean; url?: string; file_name?: string; total?: number; rejected?: number; error?: string };
        if (typeof j?.total === "number") total = j.total;
        if (typeof j?.rejected === "number") rejected = j.rejected;
        if (!j?.ok) {
          out.status = "failed";
          out.message = String(j?.error ?? `Hata (${r.status}).`);
          return out;
        }
        if (j.empty || !j.url) break;
        let got = false;
        let lastErr = "Görsel indirilemedi.";
        for (let attempt = 0; attempt <= retries && !got; attempt++) {
          try {
            out.files.push(await addFile(job.folder, j.file_name || `${job.label} (${index + 1})`, await deps.getFile(j.url, deps.signal)));
            got = true;
          } catch (e) {
            lastErr = (e as Error)?.message || lastErr;
            if (deps.signal?.aborted) break;
            await sleep(1000 * (attempt + 1));
          }
        }
        if (!got) {
          out.status = "failed";
          out.message = lastErr;
          return out;
        }
      }
      if (rejected > 0) {
        out.status = "failed";
        out.message = `${rejected} görsel bağlantısı bu hesaba ait olarak doğrulanamadı ve arşive alınmadı (kayıt JSON yedekte).`;
      }
      return out;
    }
    const r = await request(body);
    if (job.kind === "file") {
      if (r.isFile || r.status !== 200) {
        const e = await errorOf(r);
        out.status = "failed";
        out.message = e.error;
        return out;
      }
      const j = (await r.json()) as { ok?: boolean; url?: string; file_name?: string; error?: string };
      if (!j?.ok || !j.url) {
        out.status = "failed";
        out.message = String(j?.error ?? "Dosya bağlantısı alınamadı.");
        return out;
      }
      let lastErr = "Dosya indirilemedi.";
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const bytes = await deps.getFile(j.url, deps.signal);
          out.files.push(await addFile(job.folder, j.file_name || job.label, bytes));
          return out;
        } catch (e) {
          lastErr = (e as Error)?.message || lastErr;
          if (deps.signal?.aborted) break;
          await sleep(1000 * (attempt + 1));
        }
      }
      out.status = "failed";
      out.message = lastErr;
      return out;
    }
    if (!r.isFile) {
      const e = await errorOf(r);
      out.status = e.skipped ? "skipped" : "failed";
      out.message = e.error;
      return out;
    }
    const name = decodeHeader(r.header("X-Archive-File-Name")) || `${job.label}.docx`;
    out.files.push(await addFile(job.folder, name, await r.bytes()));
    const note = decodeHeader(r.header("X-Archive-Note"));
    if (note) out.message = note;
    return out;
  };

  const queue = [...plan.jobs];
  const worker = async () => {
    for (;;) {
      if (deps.signal?.aborted) {
        cancelled = true;
        return;
      }
      const job = queue.shift();
      if (!job) return;
      progress.current = job.label;
      emit();
      let o: JobOutcome;
      try {
        o = await runJob(job);
      } catch (e) {
        if (deps.signal?.aborted) cancelled = true;
        o = { job, status: "failed", files: [], rows: 0, message: (e as Error)?.message || "Bilinmeyen hata." };
      }
      outcomes.push(o);
      progress.done++;
      if (o.status === "ok") progress.ok++;
      else if (o.status === "failed") progress.failed++;
      else progress.skipped++;
      emit();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (queue.length > 0) cancelled = true;

  const failed = outcomes.filter((o) => o.status === "failed").length;
  const ok = outcomes.filter((o) => o.status === "ok").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  // Kullanıcıya ait içerik cihaz / yetki nedeniyle dışarıda kaldıysa (plan.restricted veya atlanan iş) arşiv TAMAMLANDI
  // gösterilmez → EKSİK (gerekçe BENİOKU / ARŞİV-RAPORU'nda).
  const restricted = (plan.restricted?.length ?? 0) > 0 || skipped > 0;
  const status: ArchiveRunResult["status"] = cancelled
    ? "cancelled"
    : failed === 0 && !restricted
      ? "complete"
      : ok === 0 && failed > 0
        ? "failed"
        : "partial";
  const endedAt = now();
  zip.addText(`${root}/BENİOKU.txt`, readme(plan, status, endedAt));
  zip.addText(`${root}/ARŞİV-RAPORU.txt`, runReport(plan, outcomes, status, queue.length));
  await rotating;
  const parts = zip.finish();
  totalBytes += zip.bytesWritten;
  return {
    status,
    fileName: volume > 1 ? volumeName(volume) : plan.file_name,
    parts,
    volumes: volume,
    outcomes,
    counts: {
      ok,
      failed,
      skipped,
      records: progress.records,
      bytes: totalBytes,
      files: outcomes.reduce((s, o) => s + o.files.length, 0),
    },
    durationMs: endedAt.getTime() - started,
  };
}

const STATUS_TR: Record<ArchiveRunResult["status"], string> = {
  complete: "TAMAMLANDI — planlanan her parça arşive yazıldı.",
  partial: "EKSİK — bazı parçalar alınamadı veya cihaz / yetki nedeniyle dışarıda kaldı; ayrıntı ARŞİV-RAPORU.txt dosyasında.",
  failed: "BAŞARISIZ — hiçbir parça alınamadı.",
  cancelled: "İPTAL EDİLDİ — arşiv yarım kaldı; yalnız alınan parçalar içeridedir.",
};

function readme(plan: ArchivePlanResponse, status: ArchiveRunResult["status"], at: Date): string {
  const o = plan.options;
  const lines = [
    "YAŞAM SİSTEMİ — PREMIUM WORD ARŞİVİ",
    "",
    `Durum: ${STATUS_TR[status]}`,
    `Oluşturma: ${at.toISOString()} (UTC)`,
    "",
    "BU ARŞİV NEDİR?",
    "- Word arşivi: kayıtlarınızın ve hazır analiz raporlarınızın Yaşam Sistemi dışında okunabilen kopyasıdır.",
    "- Geri yüklenemez. Hesaba geri yüklemek için Ayarlar > Sistem Yedeği (JSON) dosyasını kullanın.",
    "- Fotoğraf ve ekler (seçildiyse) ayrı dosyalar olarak 'Fotoğraf ve Ekler' klasöründedir; Word'e gömülmez.",
    "",
    "KAPSAM",
    `- Modüller: ${o.modules.map((m) => MODULE_LABELS[m] ?? m).join(", ")}`,
    `- Danışan seçimi: ${o.clientIds ? `${o.clientIds.length} danışan (yalnız danışana bağlı kayıtlar)` : "tümü"}`,
    `- Kayıt tarihi aralığı: ${o.dateFrom || o.dateTo ? `${o.dateFrom ?? "başlangıç"} – ${o.dateTo ?? "bugün"} (Europe/Istanbul)` : "tümü"}`,
    `- İçerik: ${[
      o.include.data && "kayıt dökümü (Word)",
      o.include.dossiers && "danışan dosyaları",
      o.include.reports && "hazır analiz raporları",
      o.include.files && "fotoğraf ve ekler",
      o.include.sensitive && "hassas bölümler (anamnez, beslenme, iç notlar, ücretlendirme)",
    ]
      .filter(Boolean)
      .join(", ")}`,
    "",
    "KAYIT SAYILARI (veri dökümü planı)",
    ...plan.summary.map((s) => `- ${s.label}: ${s.records} kayıt`),
    "",
    "KAPSAM DIŞI KALANLAR",
    ...(plan.excluded.length ? plan.excluded.map((e) => `- ${e.scope}: ${e.reason}`) : ["- yok"]),
  ];
  if (plan.restricted?.length) {
    lines.push(
      "",
      "SİZE AİT OLUP BU ARŞİVE ALINAMAYAN İÇERİK (arşiv bu nedenle EKSİK sayılır)",
      ...plan.restricted.map((e) => `- ${e.scope}: ${e.reason}`),
    );
  }
  if (plan.warnings.length) lines.push("", "UYARILAR", ...plan.warnings.map((w) => `- ${w}`));
  return lines.join("\r\n") + "\r\n";
}

function runReport(plan: ArchivePlanResponse, outcomes: JobOutcome[], status: ArchiveRunResult["status"], notStarted: number): string {
  const by = (s: JobOutcome["status"]) => outcomes.filter((o) => o.status === s);
  const lines = [
    "ARŞİV RAPORU",
    `Durum: ${STATUS_TR[status]}`,
    `Planlanan parça: ${plan.jobs.length} · başarılı: ${by("ok").length} · başarısız: ${by("failed").length} · atlanan: ${by("skipped").length}${notStarted ? ` · başlatılmayan: ${notStarted}` : ""}`,
    "",
  ];
  const failed = by("failed");
  if (failed.length) lines.push("BAŞARISIZ PARÇALAR", ...failed.map((o) => `- ${o.job.label}: ${o.message ?? "hata"}`), "");
  const skipped = by("skipped");
  if (skipped.length) lines.push("ATLANAN PARÇALAR", ...skipped.map((o) => `- ${o.job.label}: ${o.message ?? ""}`), "");
  const notes = by("ok").filter((o) => o.message);
  if (notes.length) lines.push("NOTLAR", ...notes.map((o) => `- ${o.job.label}: ${o.message}`), "");
  lines.push("BAŞARILI PARÇALAR", ...by("ok").map((o) => `- ${o.job.label}${o.job.kind === "data" ? ` (${o.rows} kayıt, ${o.files.length} dosya)` : ""}`));
  return lines.join("\r\n") + "\r\n";
}
