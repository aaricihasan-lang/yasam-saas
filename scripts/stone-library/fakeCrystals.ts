/**
 * Doğaltaş Kütüphanesi F2 — SAHTE kristal sağlayıcısı (yalnız test). Tüm metinler SENTETİK (ZZ_*); gerçek sağlayıcı
 * içeriği / görseli YOK. Şema OpenAPI v2.0.0 biçimindedir. Hata senaryoları yapılandırılabilir.
 */
import sharp from "sharp";

export type Fault = "500" | "timeout" | "429" | "badjson" | "401" | "404";
export type ImageFault = "corrupt" | "wrong_mime" | "too_large" | "404" | "small" | "html";

export type FakeOptions = {
  count: number;
  /** (id|lang) → hata; ilk denemede uygulanır, `faultTimes` kadar tekrarlanır. */
  faults?: Map<string, Fault>;
  faultTimes?: number;
  imageFaults?: Map<string, ImageFault>;
  /** aynı görsel baytlarını paylaşan kimlik çiftleri. */
  duplicateImageOf?: Map<string, string>;
  quotaRemaining?: number;
  /** TR yanıtında İngilizceye düşen kimlikler (ad + açıklama). */
  trFallback?: Set<string>;
  /** Bilinmeyen alan eklenecek kimlikler. */
  extraField?: Set<string>;
  /** İçerik sürümü (kaynak değişikliği senaryosu). */
  revision?: number;
  /** Ad öneki (farklı kaynak / büyük katalog senaryosu). */
  namePrefix?: string;
};

const CHAKRAS = ["Root", "Sacral", "Solar Plexus", "Heart", "Throat", "Third Eye", "Crown"];
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const ELEMENTS = ["Earth", "Water", "Fire", "Air", "Storm"];
const PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const COLORS = ["purple", "green", "blue", "pink", "black", "golden", "multi-colored"];

export function fakeId(i: number): string {
  return `zz-crystal-${String(i).padStart(3, "0")}`;
}

export function createFakeCrystals(opts: FakeOptions) {
  const calls: { url: string; lang: string | null; kind: "api" | "image" }[] = [];
  const faultsUsed = new Map<string, number>();
  let remaining = opts.quotaRemaining ?? 50000;
  const rev = opts.revision ?? 1;
  const ids = Array.from({ length: opts.count }, (_, i) => fakeId(i + 1));
  const imageCache = new Map<string, Buffer>();

  function detail(i: number, lang: "tr" | "en") {
    const id = fakeId(i);
    const tr = lang === "tr" && !opts.trFallback?.has(id);
    const pre = opts.namePrefix ?? "ZZ";
    const nameEn = `${pre} Crystal ${i}`;
    const nameTr = i % 10 === 0 ? nameEn : `${pre} Kristal ${i}`; // her 10. taşın Türkçe adı yok
    const o: Record<string, unknown> = {
      name: tr ? nameTr : nameEn,
      id,
      imageUrl: `https://roxyapi.com/img/crystals/${id}.jpg`,
      description: tr ? `ZZ sentetik açıklama ${i} ve bu taş için bir deneme metni (sürüm ${rev}).` : `ZZ synthetic description ${i} and this is a test text for the stone (revision ${rev}).`,
      meaning: {
        spiritual: tr ? `ZZ ruhsal anlam ${i} ile ilgili bir metin olarak yazıldı.` : `ZZ spiritual meaning ${i} is written as a text for the stone.`,
        emotional: tr ? `ZZ duygusal anlam ${i} için örnek bir cümle.` : `ZZ emotional meaning ${i} for the stone and its energy.`,
        physical: i % 7 === 0 ? null : (tr ? `ZZ fiziksel etki ${i}: baş ağrısını hafifletir ve etkilidir.` : `ZZ physical effect ${i}: relieves headache and supports the immune system.`),
      },
      chakras: [CHAKRAS[i % 7], CHAKRAS[(i + 3) % 7]],
      zodiacSigns: [SIGNS[i % 12]],
      planet: i === 13 ? "Chiron" : PLANETS[i % PLANETS.length],
      elements: [ELEMENTS[i % 5]],
      colors: [COLORS[i % COLORS.length]],
      hardness: 1 + (i % 9) + (i % 2 ? 0.5 : 0),
      numericalVibration: (i % 9) + 1,
      keywords: tr ? [`ZZ Huzur ${i}`, i % 5 === 0 ? `ZZ Calm ${i}` : `ZZ Denge ${i}`] : [`ZZ Calm ${i}`, `ZZ Balance ${i}`],
      birthMonth: i % 12 === 0 ? null : (i % 12),
      affirmation: tr ? `ZZ olumlama ${i}.` : `ZZ affirmation ${i}.`,
      pairsWith: [fakeId(((i % opts.count) + 1)), fakeId((((i + 1) % opts.count) + 1))].filter((x) => x !== id),
    };
    if (i % 11 === 0 && lang === "en") (o.meaning as Record<string, unknown>).spiritual = (o.meaning as Record<string, string | null>).physical ?? "ZZ dup.";
    if (opts.extraField?.has(id)) o.zzExtraField = "ZZ beklenmeyen alan";
    return o;
  }

  async function image(id: string): Promise<{ status: number; body: Buffer; type: string }> {
    const f = opts.imageFaults?.get(id);
    if (f === "404") return { status: 404, body: Buffer.from("not found"), type: "text/plain" };
    if (f === "html") return { status: 200, body: Buffer.from("<html>no</html>"), type: "image/jpeg" };
    if (f === "too_large") return { status: 200, body: Buffer.alloc(2 * 1024 * 1024 + 10, 0xff), type: "image/jpeg" };
    const src = opts.duplicateImageOf?.get(id) ?? id;
    let buf = imageCache.get(src);
    if (!buf) {
      const n = Number(src.slice(-3)) || 1;
      const size = f === "small" ? 200 : 300;
      buf = await sharp({ create: { width: size, height: size, channels: 3, background: { r: (n * 37) % 256, g: (n * 91) % 256, b: (n * 53 + rev) % 256 } } })
        .jpeg({ quality: 80 }).toBuffer();
      if (f !== "small") imageCache.set(src, buf);
    }
    if (f === "corrupt") return { status: 200, body: buf.subarray(0, Math.floor(buf.length / 3)), type: "image/jpeg" };
    if (f === "wrong_mime") return { status: 200, body: buf, type: "image/png" };
    return { status: 200, body: buf, type: "image/jpeg" };
  }

  const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

  async function handler(input: string, init?: RequestInit): Promise<Response> {
    const u = new URL(input);
    if (u.pathname.startsWith("/img/crystals/")) {
      calls.push({ url: input, lang: null, kind: "image" });
      const id = u.pathname.replace("/img/crystals/", "").replace(/\.jpg$/, "");
      if (!ids.includes(id)) return new Response("nf", { status: 404 });
      const r = await image(id);
      return new Response(new Uint8Array(r.body), { status: r.status, headers: { "content-type": r.type, "content-length": String(r.body.length) } });
    }
    const key = (init?.headers as Record<string, string> | undefined)?.["X-API-Key"];
    const lang = u.searchParams.get("lang");
    calls.push({ url: input, lang, kind: "api" });
    if (!key) return json(401, { error: "missing key", code: "unauthorized" });
    const path = u.pathname.replace(/^\/api\/v2/, "");
    const m = /^\/crystals\/([a-z0-9-]+)$/.exec(path);
    const faultKey = m ? `${m[1]}|${lang}` : `${path}|${lang}`;
    const fault = opts.faults?.get(faultKey);
    const used = faultsUsed.get(faultKey) ?? 0;
    remaining--;
    const q = { "x-ratelimit-limit": "50000", "x-ratelimit-remaining": String(remaining), "x-ratelimit-used": String(50000 - remaining), "x-ratelimit-reset": "1793491200" };
    if (fault && used < (opts.faultTimes ?? 1)) {
      faultsUsed.set(faultKey, used + 1);
      if (fault === "timeout") await new Promise((_r, rej) => { const s = init?.signal; s?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
      if (fault === "500") return json(500, { error: "internal", code: "internal_error" }, q);
      if (fault === "429") { remaining++; return json(429, { error: "slow down", code: "rate_limited" }, { ...q, "retry-after": "1" }); }
      if (fault === "401") return json(401, { error: "bad key", code: "unauthorized" }, q);
      if (fault === "404") return json(404, { error: "not found", code: "not_found" }, q);
      if (fault === "badjson") return new Response("{not json", { status: 200, headers: { "content-type": "application/json", ...q } });
    }
    if (path === "/crystals") {
      const limit = Number(u.searchParams.get("limit") ?? 20);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const page = ids.slice(offset, offset + limit).map((id, k) => {
        const d = detail(offset + k + 1, lang === "tr" ? "tr" : "en");
        return { name: d.name, id, imageUrl: d.imageUrl, colors: d.colors, chakras: d.chakras };
      });
      return json(200, { total: ids.length, limit, offset, crystals: page }, q);
    }
    if (path === "/crystals/colors") return json(200, { count: COLORS.length, colors: COLORS }, q);
    if (path === "/crystals/planets") return json(200, { count: PLANETS.length + 1, planets: [...PLANETS, "Chiron"] }, q);
    const bm = /^\/crystals\/birthstone\/(\d+)$/.exec(path);
    if (bm) {
      const month = Number(bm[1]);
      const list = ids.filter((_, k) => (k + 1) % 12 === month % 12).slice(0, 3).map((id) => ({ name: id, id }));
      return json(200, { month, monthName: `M${month}`, total: list.length, crystals: list }, q);
    }
    if (m) {
      const i = ids.indexOf(m[1]);
      if (i < 0) return json(404, { error: "not found", code: "not_found" }, q);
      return json(200, detail(i + 1, lang === "tr" ? "tr" : "en"), q);
    }
    return json(404, { error: "not found", code: "not_found" }, q);
  }

  return { handler, calls, ids, get remaining() { return remaining; } };
}
