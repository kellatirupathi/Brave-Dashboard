export function Stamp() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <div
        className="relative flex items-center justify-center rounded-full bg-[hsl(0_80%_45%)] border-4 border-[hsl(45_95%_60%)] shadow-2xl shadow-black/40"
        style={{ width: "16rem", height: "16rem" }}
      >
        <div className="absolute inset-3 rounded-full border border-[hsl(45_95%_60%)]/40" />
        <div className="text-center leading-none">
          <span className="block text-[hsl(45_95%_60%)] font-black tracking-[-0.02em] text-5xl">
            BRA<span className="relative inline-block">V<span
              aria-hidden="true"
              className="absolute rounded-full bg-[hsl(45_95%_60%)]"
              style={{ right: "0.06em", top: "-0.22em", width: "0.22em", height: "0.22em" }}
            /></span>E
          </span>
          <span className="block mt-3 text-[hsl(45_95%_60%)]/85 text-[10px] font-bold uppercase tracking-[0.4em]">
            Boost · Build · Earn
          </span>
        </div>
      </div>
    </div>
  );
}
