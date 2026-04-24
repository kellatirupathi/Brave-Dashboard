export function SparkV() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_60%_18%)]">
      <span className="inline-flex items-baseline font-black tracking-[-0.02em] leading-none text-7xl select-none text-[hsl(45_95%_60%)]">
        <span>BRA</span>
        <span className="relative inline-block">
          V
          {/* tiny spark inside the V cradle */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="absolute"
            style={{
              left: "50%",
              top: "0.35em",
              transform: "translateX(-50%)",
              width: "0.32em",
              height: "0.32em",
              fill: "hsl(0 80% 52%)",
            }}
          >
            <path d="M12 1.5l2.6 6.9 6.9 2.6-6.9 2.6L12 20.5l-2.6-6.9L2.5 11l6.9-2.6L12 1.5z" />
          </svg>
        </span>
        <span>E</span>
      </span>
    </div>
  );
}
