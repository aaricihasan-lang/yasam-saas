export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-2 sm:p-3.5">
      <div className="mx-auto w-full max-w-4xl animate-pulse space-y-3" aria-busy="true">
        <div className="h-8 w-48 rounded-lg bg-slate-200" />
        <div className="h-36 rounded-[22px] bg-white/80" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl bg-white/80" />
        ))}
      </div>
    </main>
  );
}
