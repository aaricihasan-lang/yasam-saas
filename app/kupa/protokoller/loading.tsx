/** Protokol listesi iskeleti. */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#faf6f0] px-0 py-3 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-4 h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
