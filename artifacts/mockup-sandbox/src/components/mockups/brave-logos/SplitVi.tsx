export function SplitVi() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <span className="inline-flex items-baseline font-black tracking-[-0.02em] leading-none text-7xl select-none text-[hsl(45_95%_60%)]">
        <span>BRA</span>
        <span
          className="relative inline-block"
          style={{ width: "0.78em", height: "1em" }}
          aria-label="Vi"
        >
          <span
            aria-hidden="true"
            className="absolute bg-[hsl(45_95%_60%)] rounded-[0.05em]"
            style={{
              left: "0.04em",
              top: "0.10em",
              width: "0.56em",
              height: "0.13em",
              transformOrigin: "left center",
              transform: "rotate(58deg)",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute bg-[hsl(0_80%_52%)] rounded-[0.05em]"
            style={{
              right: "0.06em",
              top: "0.30em",
              width: "0.13em",
              height: "0.62em",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute rounded-full bg-[hsl(0_80%_52%)]"
            style={{
              right: "0.04em",
              top: "0.06em",
              width: "0.18em",
              height: "0.18em",
            }}
          />
        </span>
        <span>E</span>
      </span>
    </div>
  );
}
