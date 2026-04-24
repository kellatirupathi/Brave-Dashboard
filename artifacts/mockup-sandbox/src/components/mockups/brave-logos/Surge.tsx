export function Surge() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <div className="relative">
        <span className="inline-flex items-baseline font-black tracking-[-0.02em] leading-none text-7xl select-none text-[hsl(45_95%_60%)]">
          BRAVE
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 200 40"
          preserveAspectRatio="none"
          className="absolute left-0 right-0"
          style={{ bottom: "-0.42em", height: "0.42em", width: "100%" }}
        >
          <path
            d="M4 32 C 60 28, 110 18, 178 6 L 196 14 L 184 4 L 192 4 L 196 14"
            fill="none"
            stroke="hsl(0 80% 52%)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
