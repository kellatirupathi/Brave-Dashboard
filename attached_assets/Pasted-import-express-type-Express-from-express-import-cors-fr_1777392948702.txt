import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { authMiddleware } from "./middlewares/authMiddleware";
import { canonicalHost } from "./middlewares/canonicalHost";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// We sit behind the Replit workspace proxy (and behind a deploy ingress in
// production), which adds the X-Forwarded-For header. Trusting the first hop
// makes `req.ip` reflect the real client IP, which is what express-rate-limit
// and audit logging key off. Without this, express-rate-limit raises
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and could fall back to a single shared
// key for every proxied request.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(canonicalHost);

// Security headers. Disable CSP here — the dashboard is served by Vite (dev)
// or a static host (prod) and supplies its own CSP. Cross-origin-resource-policy
// is loosened so the API can be embedded by the same-origin dashboard iframe
// in the Replit workspace preview.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS allowlist. Same-origin requests (the normal dashboard ↔ API path
// through the workspace proxy) bypass CORS entirely, so this only matters
// for genuinely cross-origin callers. Configure extra origins via either
// CORS_ALLOWED_ORIGINS or FRONTEND_ORIGINS (comma-separated; both are
// accepted so deploy configs that set either one work). Replit workspace +
// deploy domains are always allowed via the pattern list below.
const extraOrigins = [
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(","),
  ...(process.env.FRONTEND_ORIGINS ?? "").split(","),
]
  .map((s) => s.trim())
  .filter(Boolean);
const replitDomain = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null;
const allowedOriginExact = new Set<string>([
  ...(replitDomain ? [replitDomain] : []),
  ...extraOrigins,
]);
const allowedOriginPatterns: RegExp[] = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/0\.0\.0\.0(?::\d+)?$/,
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.repl\.co$/,
];
function isOriginAllowed(origin: string): boolean {
  if (allowedOriginExact.has(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return allowedOriginPatterns.some((re) =>
      re.source.startsWith("^") ? re.test(origin) : re.test(host),
    );
  } catch {
    return false;
  }
}
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // Same-origin requests (no Origin header) → always allowed.
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      logger.warn({ origin }, "CORS: rejected origin");
      cb(new Error("CORS: origin not allowed"));
    },
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limits. The defaults are generous so normal admin usage (paging,
// roster bulk imports, etc.) is unaffected. Disabled in test runs so the
// vitest suites can hammer the same endpoint repeatedly. We rely on
// express-rate-limit's default keyGenerator (which uses `req.ip` plus
// the IPv6-safe `ipKeyGenerator` helper) instead of rolling our own.
const rateLimitDisabled =
  process.env.NODE_ENV === "test" || process.env.RATE_LIMIT_DISABLED === "true";

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled,
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled,
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    rateLimitDisabled || req.method === "GET" || req.method === "HEAD",
});

app.use("/api/auth", authLimiter);
app.use("/api/dev", authLimiter);
app.use("/api/admin", writeLimiter);
app.use("/api", generalLimiter);

app.use(authMiddleware);

app.use("/api", router);

export default app;
