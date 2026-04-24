export function Monogram() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center rounded-2xl bg-[hsl(0_80%_45%)] shadow-lg shadow-black/40"
          style={{ width: "5rem", height: "5rem" }}
        >
          <span className="relative font-black text-[hsl(45_95%_60%)] leading-none text-5xl">
            B
            <span
              aria-hidden="true"
              className="absolute rounded-full bg-[hsl(45_95%_60%)]"
              style={{ right: "-0.18em", top: "-0.12em", width: "0.22em", height: "0.22em" }}
            />
          </span>
        </div>
        <span className="inline-flex items-baseline font-black tracking-[-0.02em] leading-none text-6xl select-none text-[hsl(45_95%_60%)]">
          BRAVE
        </span>
      </div>
    </div>
  );
}
