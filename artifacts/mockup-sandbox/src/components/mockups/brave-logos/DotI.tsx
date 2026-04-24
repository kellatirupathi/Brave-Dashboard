export function DotI() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <span className="inline-flex items-baseline font-black tracking-[-0.02em] leading-none text-7xl select-none">
        <span className="text-[hsl(45_95%_60%)]">BRA</span>
        <span className="relative inline-block text-[hsl(45_95%_60%)]">
          V
          <span
            aria-hidden="true"
            className="absolute rounded-full bg-[hsl(0_80%_52%)]"
            style={{ right: "0.06em", top: "-0.22em", width: "0.22em", height: "0.22em" }}
          />
        </span>
        <span className="text-[hsl(45_95%_60%)]">E</span>
      </span>
    </div>
  );
}
