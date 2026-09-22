import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid, parseRange, resolveTargetExpert } from "@/lib/admin/stats/statsRequest";
import { makeMetric, deriveUsed, classifyUsageWindow, type MetricValue, type StatsEnvelope } from "@/lib/admin/stats/contract";
import {
  MODULE_USAGE_REGISTRY,
  MODULE_USAGE_KEYS,
  INSTRUMENTED_USAGE_MODULES,
  FULLY_COVERED_USAGE_MODULES,
} from "@/lib/admin/stats/moduleUsageRegistry";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";

export const runtime = "nodejs";

type ModuleMatrixRow = {
  key: string;
  label: string;
  allowed: boolean;
  hasDurableTrace: boolean;
  existingRecordCount: MetricValue<number>;
  usageEventCount: MetricValue<number>;
  lastUsageAt: MetricValue<string>;
  /** true=kullanıldı, false=kullanılmadı, null=ölçülemez (0 gibi gösterilmez). */
  used: boolean | null;
  allowedButUnused: boolean | null;
  note?: string;
};

/**
 * GET /api/admin/expert-stats/modules?userId=<uuid>&from=<iso>&to=<iso>
 *
 * FAZ 1 / İP-2 — ÇALIŞMA ALANI (scope=workspace) modül matrisi. KARAR 2 ayrımları:
 *   - allowed             : module_permissions (kişiye özel izin) — measured
 *   - existingRecordCount : tenant'a ait mevcut kayıt sayısı — derived (İŞLEM SAYISI DEĞİL)
 *   - usageEventCount     : başarılı anlamlı işlem olayları — measured (yalnız enstrümante modüllerde);
 *                           enstrümante olmayan modülde 0 DEĞİL "unavailable" (ölçülmüyor)
 *   - used / allowedButUnused: yalnız ölçüm destekliyorsa true/false; aksi halde null
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!isUuid(userId)) {
    return NextResponse.json({ ok: false, error: "Geçerli userId gerekli." }, { status: 400 });
  }
  const parsed = parseRange(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const range = parsed.range;

  const target = await resolveTargetExpert(db, userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }
  const measuredAt = new Date().toISOString();

  // İP-2C: usage_events özet (tenant) — DB'de gruplanır (expert_usage_summary RPC).
  // RPC HATA verirse: enstrümante modüllerin sayısı measured=0 GÖSTERİLMEZ → unavailable.
  const usageByModule = new Map<string, { count: number; last: string | null }>();
  const { data: usageRows, error: usageErr } = await db.rpc("expert_usage_summary", {
    p_tenant_id: target.tenantId,
    p_from: range.from,
    p_to: range.to,
  });
  const usageMeasurementAvailable = !usageErr && Array.isArray(usageRows);
  if (usageMeasurementAvailable) {
    for (const r of usageRows as Record<string, unknown>[]) {
      usageByModule.set(String(r.module_key), {
        count: Number(r.event_count ?? 0),
        last: r.last_occurred != null ? String(r.last_occurred) : null,
      });
    }
  }

  // İP-4/İ4: usage_events ölçüm BAŞLANGICI = tablodaki en eski occurred_at (global). Yoksa
  // (hiç olay yok) → ölçüm başlamamış/veri yok → measurementStartDate NULL + usageEventCount
  // unavailable (başlangıç öncesi "0 kullanım" olarak GÖSTERİLMEZ; tarih UYDURULMAZ).
  let usageMeasurementStart: string | null = null;
  let usageStartKnown = false;
  if (usageMeasurementAvailable) {
    const { data: startRow, error: startErr } = await db
      .from("expert_usage_events")
      .select("occurred_at")
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!startErr) {
      usageStartKnown = true; // sorgu başarılı: tablo boşsa start null (ölçüm henüz veri üretmedi)
      usageMeasurementStart = startRow?.occurred_at != null ? String(startRow.occurred_at) : null;
    }
  }

  // İP-2B: existingRecordCount — her modülün kayıt tablo(ları)nda tenant head-count.
  // Hataya dayanıklı: bir tablo/kolon yoksa o modül record-count = unavailable.
  const recordCounts = await Promise.all(
    MODULE_USAGE_KEYS.map(async (key) => {
      const desc = MODULE_USAGE_REGISTRY[key];
      if (!desc.hasDurableTrace || desc.recordSources.length === 0) {
        return { key, count: null as number | null, failed: false };
      }
      let total = 0;
      let failed = false;
      for (const src of desc.recordSources) {
        const { count, error } = await db
          .from(src.table)
          .select("*", { count: "exact", head: true })
          .eq(src.tenantColumn, target.tenantId);
        if (error) {
          failed = true;
          break;
        }
        total += count ?? 0;
      }
      return { key, count: failed ? null : total, failed };
    }),
  );
  const recordCountByModule = new Map(recordCounts.map((r) => [r.key, r]));

  const rows: ModuleMatrixRow[] = MODULE_USAGE_KEYS.map((key) => {
    const desc = MODULE_USAGE_REGISTRY[key];
    const allowed = resolveModuleAccess(target.role, target.modulePermissions, key);

    // existingRecordCount
    const rc = recordCountByModule.get(key)!;
    const existingRecordCount: MetricValue<number> = desc.hasDurableTrace
      ? rc.count == null
        ? makeMetric<number>(null, "workspace", "unavailable", "record", { measuredAt, note: "kayıt tablosu okunamadı" })
        : makeMetric<number>(rc.count, "workspace", "derived", "record", {
            measuredAt,
            note: "tenant kayıt sayısı (işlem sayısı değil)",
          })
      : makeMetric<number>(null, "workspace", "unavailable", "record", {
          measuredAt,
          note: "kalıcı per-tenant kayıt yok (stateless/hub/always-on)",
        });

    // usageEventCount — measured YALNIZ: enstrümante + RPC başarılı + ölçüm başlamış (global
    // en az 1 olay). Aksi halde (enstrümante değil / RPC hatası / ölçüm henüz veri üretmedi)
    // "unavailable" — measured=0 GÖSTERİLMEZ (başlangıç öncesi "0 kullanım" olarak sunulmaz).
    const instrumented = INSTRUMENTED_USAGE_MODULES.has(key);
    const usage = usageByModule.get(key);
    let usageEventCount: MetricValue<number>;
    let lastUsageAt: MetricValue<string>;
    if (!instrumented) {
      usageEventCount = makeMetric<number>(null, "workspace", "unavailable", "event", {
        measuredAt,
        note: "bu modül için işlem olayı henüz enstrümante edilmedi (0 değil, ölçülmüyor)",
      });
      lastUsageAt = makeMetric<string>(null, "workspace", "unavailable", "timestamp", { measuredAt });
    } else if (!usageMeasurementAvailable) {
      usageEventCount = makeMetric<number>(null, "workspace", "unavailable", "event", {
        measuredAt,
        note: "usage ölçümü geçici okunamadı (RPC hatası) — 0 değil",
      });
      lastUsageAt = makeMetric<string>(null, "workspace", "unavailable", "timestamp", { measuredAt });
    } else {
      // Ölçüm mevcut. usageStartKnown false ise (MIN sorgusu hatası) start=null → unavailable.
      // İstenen tarih aralığını ölçüm başlangıcına göre sınıflandır (İ1: başlangıç öncesi
      // measured=0 ÜRETME; aralık başlangıcı kesiyorsa kısmi/approximate).
      const start = usageStartKnown ? usageMeasurementStart : null;
      const cls = classifyUsageWindow(start, range.from, range.to);
      if (cls === "unavailable") {
        usageEventCount = makeMetric<number>(null, "workspace", "unavailable", "event", {
          measuredAt,
          measurementStartDate: start,
          note: start == null
            ? "usage ölçümü henüz başlamadı/veri yok — başlangıç öncesi 0 gösterilmez (tarih uydurulmaz)"
            : "istenen aralık ölçüm başlangıcından (measurementStartDate) ÖNCE bitiyor — measured=0 gösterilmez",
        });
        lastUsageAt = makeMetric<string>(null, "workspace", "unavailable", "timestamp", { measuredAt, measurementStartDate: start });
      } else {
        usageEventCount = makeMetric<number>(usage?.count ?? 0, "workspace", cls, "event", {
          measuredAt,
          measurementStartDate: start,
          note: cls === "approximate"
            ? "yalnız ölçüm başlangıcından (measurementStartDate) itibaren ölçülür; öncesi KAPSANMAZ (kısmi)"
            : "aralık tamamen ölçüm başlangıcı sonrasında (gerçek sayım; 0 = gerçek sıfır)",
        });
        lastUsageAt = makeMetric<string>(usage?.last ?? null, "workspace", usage?.last ? "measured" : "unavailable", "timestamp", {
          measuredAt,
          measurementStartDate: start,
        });
      }
    }

    // used / allowedButUnused — SAF karar (deriveUsed). NEGATİF sonuç yalnız modül TAM KAPSAMLI
    // ise (FULLY_COVERED_USAGE_MODULES; şu an BOŞ) üretilir → kısmi enstrümantasyonda kayıt=0∧olay=0
    // tek başına used=false/allowedButUnused=true VERMEZ. approximate (kısmi pencere) sıfır da
    // negatif kanıt sayılmaz (yalnız pozitif >0 true'ya katkı verir).
    const evtForUsed =
      usageEventCount.value != null && usageEventCount.value > 0
        ? usageEventCount.value
        : usageEventCount.status === "measured"
          ? usageEventCount.value
          : null;
    const used = deriveUsed(existingRecordCount.value, evtForUsed, FULLY_COVERED_USAGE_MODULES.has(key));
    const allowedButUnused = used === false ? allowed : null;

    return {
      key,
      label: desc.label,
      allowed,
      hasDurableTrace: desc.hasDurableTrace,
      existingRecordCount,
      usageEventCount,
      lastUsageAt,
      used,
      allowedButUnused,
      note: desc.note,
    };
  });

  const payload: StatsEnvelope<{
    userId: string;
    tenantId: string;
    isDemo: boolean;
    range: typeof range;
    allowedMetric: MetricValue<number>;
    modules: ModuleMatrixRow[];
  }> = {
    ok: true,
    contractVersion: 1,
    data: {
      userId,
      tenantId: target.tenantId,
      isDemo: target.isDemo,
      range,
      allowedMetric: makeMetric(rows.filter((r) => r.allowed).length, "user", "measured", "count", {
        measuredAt,
        note: "module_permissions izinli modül sayısı",
      }),
      modules: rows,
    },
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
