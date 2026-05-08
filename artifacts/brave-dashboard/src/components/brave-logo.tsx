// BRAVE wordmark — single source of truth for the BRAVE logo across the app.
// Renders: ultra-heavy condensed "BRAVE" in Brave Red + a small Ember Amber
// square accent at the end. Per the 2026 brand guide:
//   - Word: BRAVE in all caps, Bebas Neue (ultra-heavy condensed display)
//   - Letter spacing: very tight / negative tracking
//   - Red is the brand's voice, amber is the one-per-design accent
//   - No background — adapts to whatever surface it's placed on
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
        fontFamily: "var(--font-brave-display)",
        letterSpacing: "-0.04em",
        fontWeight: 400, // Bebas Neue is already display-weight; avoid synthetic bolding.
      }}
    >
      <span style={{ color: BRAVE_RED }}>BRAVE</span>
      <span
        aria-hidden="true"
        className="inline-block ml-[0.06em] mb-[0.08em]"
        style={{
          width: "0.22em",
          height: "0.22em",
          backgroundColor: EMBER_AMBER,
        }}
      />
    </span>
  );
}
