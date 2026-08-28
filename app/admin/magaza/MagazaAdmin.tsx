"use client";

import { useState } from "react";
import ProductsPanel from "./components/ProductsPanel";
import CategoriesPanel from "./components/CategoriesPanel";
import SettingsPanel from "./components/SettingsPanel";

type Tab = "products" | "categories" | "settings";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "products", label: "Ürünler" },
  { key: "categories", label: "Kategoriler" },
  { key: "settings", label: "Ayarlar" },
];

export default function MagazaAdmin() {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f5ef_0%,#f4f6f1_100%)] text-stone-900">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700/80">
              Doğal Pazar Yönetimi
            </span>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
              Yaşam Sistemi Doğal Pazar
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Doğal ve bütüncül yaşam ürünlerinizi buradan yönetin.
            </p>
          </div>
          <a
            href="/magaza"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-soft"
          >
            Vitrini Gör ↗
          </a>
        </header>

        <nav className="mt-6 flex gap-1 rounded-2xl border border-stone-200/70 bg-white/70 p-1.5 backdrop-blur sm:w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "rounded-xl px-5 py-2 text-sm font-semibold transition-colors " +
                (tab === t.key
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-100")
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="mt-6">
          {tab === "products" ? <ProductsPanel /> : null}
          {tab === "categories" ? <CategoriesPanel /> : null}
          {tab === "settings" ? <SettingsPanel /> : null}
        </section>
      </div>
    </main>
  );
}
