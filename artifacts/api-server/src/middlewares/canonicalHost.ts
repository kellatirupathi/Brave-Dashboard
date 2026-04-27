import type { Request, Response, NextFunction } from "express";

// In production, force every request to land on the canonical custom domain
// so that Forms-Gamma SSO callbacks (and any straggling links to the
// .replit.app or .replit.dev hostnames) end up on dashboard.brave.niatindia.com.
// Disabled outside production so local dev and Replit preview keep working.
const CANONICAL_HOST = process.env.CANONICAL_HOST || "dashboard.brave.niatindia.com";

export function canonicalHost(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  const host = req.headers["x-forwarded-host"]?.toString() || req.headers.host || "";
  if (!host) {
    next();
    return;
  }
  // Only redirect Replit-hosted preview/deploy URLs. Leave anything else
  // (custom domain, internal health checks) untouched.
  const isReplit = /\.replit\.(app|dev)$/i.test(host);
  if (!isReplit) {
    next();
    return;
  }
  const proto = (req.headers["x-forwarded-proto"]?.toString() || "https").split(",")[0].trim();
  const target = `https://${CANONICAL_HOST}${req.originalUrl}`;
  void proto;
  res.redirect(308, target);
}
