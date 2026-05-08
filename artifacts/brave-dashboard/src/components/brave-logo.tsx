// BRAVE wordmark — single source of truth for the BRAVE logo across the app.
// Renders: bold "BRAVE" in Brave Red + a small Ember Amber square accent at
// the end. Per the 2026 brand guide: red is the brand's voice, amber is the
// one-element-per-design accent. No background — adapts to whatever surface
// the logo is placed on.
//
// Sizing: pass any text-size class (e.g. text-2xl, text-3xl) on `className`
// and the square scales proportionally because it's sized in `em`.

const BRAVE_RED = "#C0392B";
const EMBER_AMBER = "#EF9F27";

type BraveLogoProps = {
  className?: string;
  testId?: string;
};

export function BraveLogo({ className = "", testId }: BraveLogoProps) {
  return (
    <span
      data-testid={testId ?? "brave-logo"}
      aria-label="BRAVE"
      className={`inline-flex items-end leading-none select-none ${className}`}
      style={{
        fontFamily: "'Supreme', 'Plus Jakarta Sans', system-ui, sans-serif",
        fontWeight: 800,
        letterSpacing: "-0.02em",
      }}
    >
      <span style={{ color: BRAVE_RED }}>BRAVE</span>
      <span
        aria-hidden="true"
        className="inline-block ml-[0.06em] mb-[0.05em]"
        style={{
          width: "0.22em",
          height: "0.22em",
          backgroundColor: EMBER_AMBER,
        }}
      />
    </span>
  );
}
