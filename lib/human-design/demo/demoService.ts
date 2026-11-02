/**
 * Human Design — DEMO HESABI salt okunur görünüm servisi (D3, owner kararı 2026-11-02).
 *
 * Demo hesabının (users.is_demo_account=true) kendi HD verisi yoktur; gerçek HD uçları DEĞİŞMEDİ (demo yazamaz, ücretli
 * hesap yapamaz). Bu servis yalnız depoda duran ÖNCEDEN HAZIRLANMIŞ sentetik örneği (fixture.generated.ts) sunar:
 *   • Örnek, scripts/hd-demo/build-demo-fixture.ts ile üretilir: 5 sentetik kişi için tek seferlik gerçek RoxyAPI yanıtları
 *     (owner onayı, 12 çağrı) üretimin kendi doğrulayıcılarından + bağımsız yerel motor / efemeris denetiminden geçti; yanıt
 *     biçimleri GERÇEK okuma servislerinin çıktısıdır. Lisanslı sağlayıcı açıklama metinleri ayıklandı (yerine demo notu).
 *   • Bu modül VERİTABANI, HD motoru, sağlayıcı istemcisi ya da ağ İÇE AKTARMAZ (statik test denetler) → demo isteği hiçbir
 *     tenant verisine dokunamaz ve ücretli sağlayıcıya ulaşamaz.
 *   • Yazma / değişiklik / rapor / yeni hesaplama → 403 DEMO_READONLY. Örnekte olmayan okuma → 404 (uydurma yanıt yok).
 */
import HD_DEMO_FIXTURE_JSON from "./fixture.generated";
import { hdSearchTokens } from "@/lib/human-design/api/hdAnalysisList";
import { normalizeHdPersonName } from "@/lib/human-design/api/hdIdentity";

export type HdDemoResponse = { status: number; body: Record<string, unknown> };

type AnalysisRow = { name: string } & Record<string, unknown>;
type Fixture = {
  people: { key: string; name: string; clientId: string; chartId: string }[];
  relationIds: string[];
  analysisRows: AnalysisRow[];
  responses: Record<string, { status: number; body: Record<string, unknown> }>;
};
let parsed: Fixture | null = null;
/** Örnek ilk istekte bir kez ayrıştırılır (yanıtlar her seferinde kopyalanır → paylaşılan nesne değişmez). */
function fx(): Fixture {
  parsed ??= JSON.parse(HD_DEMO_FIXTURE_JSON) as Fixture;
  return parsed;
}

export const HD_DEMO_READONLY_CODE = "DEMO_READONLY";
export const HD_DEMO_READONLY_MESSAGE =
  "Demo hesabında Human Design salt okunurdur: kayıt, değişiklik, rapor oluşturma ve yeni hesaplama yapılmaz. Hazır örnek analizleri inceleyebilirsiniz.";

const readonly = (): HdDemoResponse => ({ status: 403, body: { ok: false, code: HD_DEMO_READONLY_CODE, error: HD_DEMO_READONLY_MESSAGE } });
const notFound = (): HdDemoResponse => ({ status: 404, body: { ok: false, code: "NOT_FOUND", error: "Kayıt bulunamadı." } });
const clone = <T>(v: T): T => structuredClone(v);

/** Örnekteki kimlikler (test + istemci yönlendirme denetimi için). */
export function hdDemoSampleIds(): { clientIds: string[]; chartIds: string[]; relationIds: string[] } {
  const f = fx();
  return { clientIds: f.people.map((p) => p.clientId), chartIds: f.people.map((p) => p.chartId), relationIds: [...f.relationIds] };
}

/** İzin verilen sorgu parametreleri (uç başına). Bilinmeyen parametre içeren istek örnekte yoktur → 404. */
const QUERY_KEYS: Record<string, readonly string[]> = {
  charts: ["id", "client_id", "scope"],
  "charts/system-reading": ["id"],
  clients: ["id"],
  relations: ["client_id"],
  "journey-clients": ["search"],
};

function lookup(method: string, path: string, query: Record<string, string>): HdDemoResponse | null {
  const qs = Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join("&");
  const hit = fx().responses[`${method} ${path}${qs ? `?${qs}` : ""}`];
  return hit ? { status: hit.status, body: clone(hit.body) } : null;
}

function analyses(sp: URLSearchParams): HdDemoResponse {
  // Gerçek uçla aynı sözleşme (listHdAnalysisGroups): Türkçe ad araması, sayfa 1–50 (varsayılan 20).
  const num = (k: string, d: number) => {
    const v = Number(sp.get(k));
    return sp.get(k) !== null && Number.isFinite(v) ? v : d;
  };
  const limit = Math.max(1, Math.min(50, Math.floor(num("limit", 20))));
  const offset = Math.max(0, Math.floor(num("offset", 0)));
  const tokens = hdSearchTokens(sp.get("q") ?? "");
  const rows = fx().analysisRows.filter((r) => {
    if (tokens.length === 0) return true;
    const n = normalizeHdPersonName(r.name);
    return tokens.every((t) => n.includes(t));
  });
  return { status: 200, body: { ok: true, rows: clone(rows.slice(offset, offset + limit)), total: rows.length, offset, limit } };
}

/**
 * Demo isteğini yanıtlar. `path` = /api/hd/demo/ sonrasındaki kanonik HD API yolu (ör. "charts", "relations/<id>").
 * İzin listesi DIŞINDAKİ her şey: GET → 404, yazma yöntemleri → 403 DEMO_READONLY.
 */
export function handleHdDemoRequest(method: string, path: string, sp: URLSearchParams, body: unknown): HdDemoResponse {
  const m = method.toUpperCase();
  const p = path.split("/").filter(Boolean).join("/");
  if (m === "GET") {
    if (p === "access") return { status: 200, body: { ok: true, demo: true, readOnly: true } };
    if (p === "analyses") return analyses(sp);
    // Silme önizlemesi silme akışına aittir → salt okunur.
    if (sp.has("delete_preview")) return readonly();
    // Danışan seçiciden yeni HD başlatma demoda yoktur; arama her zaman boş döner (gerçek tenant verisi okunmaz).
    if (p === "journey-clients") return lookup("GET", "journey-clients", {}) ?? notFound();
    const allowed = QUERY_KEYS[p] ?? [];
    const query: Record<string, string> = {};
    for (const [k, v] of sp.entries()) {
      if (!allowed.includes(k)) return notFound();
      query[k] = v.trim().toLowerCase();
    }
    return lookup("GET", p, query) ?? notFound();
  }
  if (m === "POST" && p === "charts/variables/saved") {
    // Kayıtlı Dört Ok / PHS sonucu (gerçek uçta da salt okunur POST). Yalnız örnek analizler.
    const id = body && typeof body === "object" ? (body as Record<string, unknown>).chart_id : undefined;
    const chartId = typeof id === "string" ? id.trim().toLowerCase() : "";
    return lookup("POST", p, { chart_id: chartId }) ?? notFound();
  }
  return readonly();
}
