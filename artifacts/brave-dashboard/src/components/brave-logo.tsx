// BRAVE wordmark — single source of truth for the BRAVE logo across the app.
// Renders: bold "BRAVE" in Brave Red + a small Ember Amber square accent that
// sits flush on the baseline (like a square full stop). Per the 2026 brand
// guide: red is the brand's voice, amber is the one-element-per-design accent.
// No background — adapts to whatever surface the logo is placed on.
//
// Sizing: pass any text-size class (e.g. text-2xl, text-3xl) on `className`
// and the square scales proportionally because it's sized in `em`.
//
// Dot alignment: the container is plain `inline` (not flex) and the square is
// an `inline-block` with `vertical-align: baseline`. An empty inline-block's
// baseline is its bottom margin edge, so the square's bottom lands exactly on
// the text baseline — flush with the bottom of the caps, regardless of font.

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
      className={`inline-block leading-none select-none whitespace-nowrap ${className}`}
      style={{
        fontFamily: "'Supreme', 'Plus Jakarta Sans', system-ui, sans-serif",
        fontWeight: 800,
        letterSpacing: "-0.02em",
      }}
    >
      <span style={{ color: BRAVE_RED }}>BRAVE</span>
      <span
        aria-hidden="true"
        className="inline-block"
        style={{
          width: "0.24em",
          height: "0.24em",
          marginLeft: "0.07em",
          verticalAlign: "baseline",
          backgroundColor: EMBER_AMBER,
        }}
      />
    </span>
  );
}
