// Built-in leaderboard banner templates. Each renders as an inline, viewBox-
// scaled SVG (crisp at any width) so the fidelity matches the standalone SVG
// banner art. One editable `content` object drives all four layouts — used both
// for the live preview in Config and on the student leaderboard page.

export type LeaderboardBannerTemplate =
  | "broadcast"
  | "podium"
  | "spotlight"
  | "ribbon";

export type LeaderboardBannerContent = {
  eyebrow: string;
  title: string; // may contain a "\n" to force a 2-line headline
  subtitle: string;
  timeText: string;
  chip1: string;
  chip2: string;
};

export const BANNER_TEMPLATES: {
  id: LeaderboardBannerTemplate;
  label: string;
}[] = [
  { id: "broadcast", label: "Broadcast reveal" },
  { id: "podium", label: "Bold red podium" },
  { id: "spotlight", label: "Gold spotlight" },
  { id: "ribbon", label: "Ribbon celebration" },
];

export const DEFAULT_BANNER_CONTENT: LeaderboardBannerContent = {
  eyebrow: "BRAVE · Season Finale",
  title: "Final\nLeaderboard",
  subtitle: "Every rupee counted. Every team ranked. See where you finished.",
  timeText: "Revealed 10:00 PM IST · 16 July 2026",
  chip1: "Race to ₹2,00,000",
  chip2: "Visible to all teams",
};

const VB_W = 1500;
const VB_H = 500;

function lines(title: string): string[] {
  const parts = (title || "").split("\n").filter((l) => l.trim().length > 0);
  return parts.length ? parts : [title || ""];
}

// SVG wrapper so all templates share the same responsive frame.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      aria-label="Leaderboard banner"
      className="block w-full rounded-xl"
      style={{ display: "block" }}
      fontFamily="'Arial Narrow', Arial, sans-serif"
    >
      {children}
    </svg>
  );
}

// A pill-chip drawn in SVG. Width auto-estimated from text length.
function Chip({
  x,
  y,
  text,
  filled,
}: {
  x: number;
  y: number;
  text: string;
  filled?: boolean;
}) {
  const w = Math.max(150, 26 + text.length * 10.5);
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={38}
        rx={19}
        fill={filled ? "rgba(229,52,42,0.20)" : "rgba(255,255,255,0.08)"}
        stroke={filled ? "rgba(229,52,42,0.5)" : "rgba(255,255,255,0.16)"}
      />
      <text
        x={x + 18}
        y={y + 25}
        fontSize={19}
        fontWeight={600}
        fill={filled ? "#ffd0cb" : "#e7e9f2"}
        fontFamily="Arial, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

export function LeaderboardBannerTemplateView({
  template,
  content,
}: {
  template: LeaderboardBannerTemplate;
  content: LeaderboardBannerContent;
}) {
  const c = content;
  const L = lines(c.title);
  const l1 = L[0] ?? "";
  const l2 = L[1] ?? "";

  // ── Broadcast reveal ───────────────────────────────────────────────
  if (template === "broadcast") {
    return (
      <Frame>
        <defs>
          <radialGradient id="lbA-bg" cx="14%" cy="20%" r="110%">
            <stop offset="0" stopColor="#24263a" />
            <stop offset="45%" stopColor="#121320" />
            <stop offset="100%" stopColor="#0c0d15" />
          </radialGradient>
          <linearGradient id="lbA-foil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#ffe9c2" />
            <stop offset="100%" stopColor="#f4b740" />
          </linearGradient>
          <linearGradient id="lbA-hot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff5c4d" />
            <stop offset="100%" stopColor="rgba(229,52,42,0.15)" />
          </linearGradient>
          <linearGradient id="lbA-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e5342a" />
            <stop offset="100%" stopColor="rgba(229,52,42,0.15)" />
          </linearGradient>
          <linearGradient id="lbA-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd479" />
            <stop offset="100%" stopColor="rgba(244,183,64,0.15)" />
          </linearGradient>
          <linearGradient id="lbA-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="35%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="65%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <rect width={VB_W} height={VB_H} rx={16} fill="url(#lbA-bg)" />
        <g stroke="#ffffff" strokeOpacity={0.04}>
          {[150, 300, 450, 600, 750, 900, 1050, 1200, 1350].map((x) => (
            <line key={x} x1={x} y1={0} x2={x} y2={500} />
          ))}
        </g>
        {/* ascending bars */}
        <g>
          <rect
            x={905}
            y={322}
            width={42}
            height={108}
            rx={6}
            fill="url(#lbA-red)"
          />
          <rect
            x={963}
            y={270}
            width={42}
            height={160}
            rx={6}
            fill="url(#lbA-hot)"
          />
          <rect
            x={1021}
            y={292}
            width={42}
            height={138}
            rx={6}
            fill="url(#lbA-red)"
          />
          <rect
            x={1079}
            y={214}
            width={42}
            height={216}
            rx={6}
            fill="url(#lbA-hot)"
          />
          <rect
            x={1137}
            y={238}
            width={42}
            height={192}
            rx={6}
            fill="url(#lbA-red)"
          />
          <rect
            x={1195}
            y={150}
            width={42}
            height={280}
            rx={6}
            fill="url(#lbA-hot)"
          />
          <rect
            x={1253}
            y={176}
            width={42}
            height={254}
            rx={6}
            fill="url(#lbA-gold)"
          />
          <rect
            x={1311}
            y={96}
            width={42}
            height={334}
            rx={6}
            fill="url(#lbA-gold)"
          />
          <text
            x={1332}
            y={78}
            fontSize={34}
            fill="#ffd479"
            textAnchor="middle"
          >
            ★
          </text>
        </g>
        {/* confetti */}
        <g>
          {[
            [930, 70, "#f4b740", 0.8, 20],
            [1010, 110, "#6366f1", 0.7, -30],
            [1100, 60, "#ffffff", 0.7, 40],
            [1180, 100, "#e5342a", 0.8, 15],
            [1260, 70, "#f4b740", 0.8, -20],
            [1340, 120, "#6366f1", 0.7, 35],
            [965, 150, "#ffffff", 0.6, 10],
            [1150, 160, "#f4b740", 0.7, -25],
          ].map((p, i) => (
            <rect
              key={i}
              x={p[0] as number}
              y={p[1] as number}
              width={6}
              height={6}
              fill={p[2] as string}
              opacity={p[3] as number}
              transform={`rotate(${p[4]} ${(p[0] as number) + 3} ${(p[1] as number) + 3})`}
            />
          ))}
        </g>
        {/* headline */}
        <circle cx={97} cy={112} r={6} fill="#e5342a" />
        <text
          x={116}
          y={119}
          fontSize={24}
          letterSpacing={6}
          fill="#f4b740"
          fontWeight={700}
          fontFamily="Arial, sans-serif"
        >
          {c.eyebrow.toUpperCase()}
        </text>
        <text
          x={84}
          y={270}
          fontFamily="'Arial Narrow', Impact, Arial"
          fontSize={150}
          fontWeight={800}
          letterSpacing={1}
          fill="url(#lbA-foil)"
        >
          {l1.toUpperCase()}
        </text>
        {l2 ? (
          <text
            x={86}
            y={368}
            fontFamily="'Arial Narrow', Impact, Arial"
            fontSize={92}
            fontWeight={800}
            letterSpacing={3}
            fill="url(#lbA-foil)"
          >
            {l2.toUpperCase()}
          </text>
        ) : null}
        <g>
          {/* live time chip */}
          <rect
            x={86}
            y={400}
            width={Math.max(260, 40 + c.timeText.length * 9)}
            height={38}
            rx={19}
            fill="rgba(229,52,42,0.20)"
            stroke="rgba(229,52,42,0.5)"
          />
          <circle cx={108} cy={419} r={4} fill="#ff5c4d" />
          <text
            x={124}
            y={425}
            fontSize={19}
            fontWeight={600}
            fill="#ffd0cb"
            fontFamily="Arial, sans-serif"
          >
            {c.timeText}
          </text>
        </g>
        <Chip x={86} y={450} text={c.chip1} />
        <Chip
          x={86 + Math.max(150, 26 + c.chip1.length * 10.5) + 12}
          y={450}
          text={c.chip2}
        />
        <rect width={VB_W} height={VB_H} rx={16} fill="url(#lbA-shine)" />
      </Frame>
    );
  }

  // ── Bold red podium ────────────────────────────────────────────────
  if (template === "podium") {
    return (
      <Frame>
        <defs>
          <linearGradient id="lbB-red" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e5342a" />
            <stop offset="55%" stopColor="#b21e18" />
            <stop offset="100%" stopColor="#7d1410" />
          </linearGradient>
          <radialGradient id="lbB-glow" cx="82%" cy="50%" r="34%">
            <stop offset="0" stopColor="rgba(255,212,121,0.38)" />
            <stop offset="100%" stopColor="rgba(255,212,121,0)" />
          </radialGradient>
          <linearGradient id="lbB-step" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe6a8" />
            <stop offset="100%" stopColor="#e0a02c" />
          </linearGradient>
          <clipPath id="lbB-clip">
            <rect width={VB_W} height={VB_H} rx={16} />
          </clipPath>
        </defs>
        <g clipPath="url(#lbB-clip)">
          <rect width={VB_W} height={VB_H} fill="url(#lbB-red)" />
          <rect width={VB_W} height={VB_H} fill="url(#lbB-glow)" />
          <g stroke="#ffffff" strokeOpacity={0.08} strokeWidth={26}>
            {[740, 820, 900, 980, 1060].map((x) => (
              <line key={x} x1={x} y1={-20} x2={x - 120} y2={520} />
            ))}
          </g>
          {/* podium 2 | 1 | 3 */}
          <g>
            <rect
              x={1092}
              y={250}
              width={96}
              height={160}
              fill="url(#lbB-step)"
            />
            <rect x={1092} y={250} width={96} height={5} fill="#fff2cf" />
            <text
              x={1140}
              y={345}
              fontSize={58}
              fontWeight={800}
              fill="#7d1410"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
            >
              2
            </text>
            <rect
              x={1196}
              y={170}
              width={104}
              height={240}
              fill="url(#lbB-step)"
            />
            <rect x={1196} y={170} width={104} height={5} fill="#fff2cf" />
            <text
              x={1248}
              y={150}
              fontSize={60}
              fill="#7d1410"
              textAnchor="middle"
              fontFamily="Georgia, serif"
            >
              ♛
            </text>
            <text
              x={1248}
              y={315}
              fontSize={66}
              fontWeight={800}
              fill="#7d1410"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
            >
              1
            </text>
            <rect
              x={1308}
              y={298}
              width={96}
              height={112}
              fill="url(#lbB-step)"
            />
            <rect x={1308} y={298} width={96} height={5} fill="#fff2cf" />
            <text
              x={1356}
              y={372}
              fontSize={52}
              fontWeight={800}
              fill="#7d1410"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
            >
              3
            </text>
          </g>
          {/* headline */}
          <text
            x={90}
            y={122}
            fontFamily="Arial, sans-serif"
            fontSize={24}
            letterSpacing={6}
            fill="#ffd479"
            fontWeight={800}
          >
            {c.eyebrow.toUpperCase()}
          </text>
          <text
            x={84}
            y={266}
            fontFamily="'Arial Narrow', Impact, Arial"
            fontSize={120}
            fontWeight={800}
            fill="#ffffff"
          >
            {l1.toUpperCase()}
          </text>
          {l2 ? (
            <text
              x={84}
              y={382}
              fontFamily="'Arial Narrow', Impact, Arial"
              fontSize={120}
              fontWeight={800}
              fill="#ffd479"
            >
              {l2.toUpperCase()}
            </text>
          ) : null}
          <text
            x={88}
            y={420}
            fontFamily="Arial, sans-serif"
            fontSize={20}
            fill="#ffe4e0"
          >
            {c.subtitle}
          </text>
          <rect
            x={86}
            y={440}
            width={Math.max(340, 44 + c.timeText.length * 9)}
            height={38}
            rx={10}
            fill="rgba(0,0,0,0.28)"
            stroke="rgba(255,255,255,0.22)"
          />
          <text
            x={104}
            y={465}
            fontFamily="Arial, sans-serif"
            fontSize={19}
            fontWeight={700}
            fill="#ffffff"
          >
            🗓 {c.timeText}
          </text>
        </g>
      </Frame>
    );
  }

  // ── Gold spotlight ─────────────────────────────────────────────────
  if (template === "spotlight") {
    return (
      <Frame>
        <defs>
          <linearGradient id="lbC-foil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#ffe9c2" />
            <stop offset="100%" stopColor="#f4b740" />
          </linearGradient>
          <radialGradient id="lbC-glow" cx="78%" cy="50%" r="55%">
            <stop offset="0" stopColor="rgba(244,183,64,0.30)" />
            <stop offset="100%" stopColor="rgba(244,183,64,0)" />
          </radialGradient>
          <radialGradient id="lbC-ring" cx="80%" cy="50%" r="30%">
            <stop offset="70%" stopColor="rgba(244,183,64,0)" />
            <stop offset="72%" stopColor="rgba(244,183,64,0.35)" />
            <stop offset="74%" stopColor="rgba(244,183,64,0)" />
          </radialGradient>
        </defs>
        <rect width={VB_W} height={VB_H} rx={16} fill="#101119" />
        <rect width={VB_W} height={VB_H} rx={16} fill="url(#lbC-glow)" />
        <rect width={VB_W} height={VB_H} rx={16} fill="url(#lbC-ring)" />
        {/* big soft trophy on the right */}
        <text
          x={1200}
          y={340}
          fontSize={300}
          fill="#f4b740"
          fillOpacity={0.12}
          textAnchor="middle"
          fontFamily="Georgia, serif"
        >
          🏆
        </text>
        {/* sparkles */}
        {[
          [1120, 120, 16],
          [1310, 200, 22],
          [1240, 380, 14],
          [1380, 300, 18],
        ].map((s, i) => (
          <text
            key={i}
            x={s[0]}
            y={s[1]}
            fontSize={s[2]}
            fill="#ffe9c2"
            fillOpacity={0.8}
            textAnchor="middle"
          >
            ✦
          </text>
        ))}
        {/* headline */}
        <circle cx={97} cy={132} r={6} fill="#e5342a" />
        <text
          x={116}
          y={139}
          fontSize={24}
          letterSpacing={6}
          fill="#f4b740"
          fontWeight={700}
          fontFamily="Arial, sans-serif"
        >
          {c.eyebrow.toUpperCase()}
        </text>
        <text
          x={84}
          y={290}
          fontFamily="'Arial Narrow', Impact, Arial"
          fontSize={150}
          fontWeight={800}
          letterSpacing={1}
          fill="url(#lbC-foil)"
        >
          {l1.toUpperCase()}
        </text>
        {l2 ? (
          <text
            x={86}
            y={388}
            fontFamily="'Arial Narrow', Impact, Arial"
            fontSize={92}
            fontWeight={800}
            letterSpacing={3}
            fill="url(#lbC-foil)"
          >
            {l2.toUpperCase()}
          </text>
        ) : null}
        <text
          x={88}
          y={432}
          fontSize={20}
          fill="#d7d9e6"
          fontFamily="Arial, sans-serif"
        >
          {c.subtitle}
        </text>
        <Chip x={86} y={452} text={c.chip1} />
        <Chip
          x={86 + Math.max(150, 26 + c.chip1.length * 10.5) + 12}
          y={452}
          text={c.chip2}
        />
      </Frame>
    );
  }

  // ── Ribbon celebration ─────────────────────────────────────────────
  return (
    <Frame>
      <defs>
        <linearGradient id="lbD-bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4f1315" />
          <stop offset="55%" stopColor="#7d1410" />
          <stop offset="100%" stopColor="#b21e18" />
        </linearGradient>
        <linearGradient id="lbD-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6a8" />
          <stop offset="100%" stopColor="#e0a02c" />
        </linearGradient>
        <clipPath id="lbD-clip">
          <rect width={VB_W} height={VB_H} rx={16} />
        </clipPath>
      </defs>
      <g clipPath="url(#lbD-clip)">
        <rect width={VB_W} height={VB_H} fill="url(#lbD-bg)" />
        {/* gold ribbon streaks */}
        <g stroke="#f4b740" strokeOpacity={0.22} strokeWidth={3}>
          {Array.from({ length: 22 }).map((_, i) => (
            <line
              key={i}
              x1={-40 + i * 80}
              y1={-20}
              x2={-40 + i * 80 - 300}
              y2={520}
            />
          ))}
        </g>
        {/* award ribbons on the right */}
        <g transform="translate(1300 130)">
          <circle cx={0} cy={0} r={62} fill="url(#lbD-ribbon)" />
          <circle cx={0} cy={0} r={48} fill="#7d1410" />
          <text
            x={0}
            y={16}
            fontSize={44}
            fill="#ffd479"
            textAnchor="middle"
            fontFamily="Georgia, serif"
          >
            ★
          </text>
          <path d="M -34 44 L -60 150 L -14 118 Z" fill="#e0a02c" />
          <path d="M 34 44 L 60 150 L 14 118 Z" fill="#b8871f" />
        </g>
        {/* headline */}
        <text
          x={90}
          y={122}
          fontFamily="Arial, sans-serif"
          fontSize={24}
          letterSpacing={6}
          fill="#ffd479"
          fontWeight={800}
        >
          {c.eyebrow.toUpperCase()}
        </text>
        <text
          x={84}
          y={266}
          fontFamily="'Arial Narrow', Impact, Arial"
          fontSize={120}
          fontWeight={800}
          fill="#ffffff"
        >
          {l1.toUpperCase()}
        </text>
        {l2 ? (
          <text
            x={84}
            y={382}
            fontFamily="'Arial Narrow', Impact, Arial"
            fontSize={120}
            fontWeight={800}
            fill="#ffd479"
          >
            {l2.toUpperCase()}
          </text>
        ) : null}
        {/* trophy time pill + subtitle */}
        <rect
          x={86}
          y={410}
          width={Math.max(340, 44 + c.timeText.length * 9)}
          height={38}
          rx={10}
          fill="rgba(0,0,0,0.25)"
        />
        <text
          x={104}
          y={435}
          fontFamily="Arial, sans-serif"
          fontSize={19}
          fontWeight={700}
          fill="#ffffff"
        >
          🏆 {c.timeText}
        </text>
        <text
          x={88}
          y={478}
          fontFamily="Arial, sans-serif"
          fontSize={19}
          fill="#ffe4e0"
        >
          {c.subtitle}
        </text>
      </g>
    </Frame>
  );
}
