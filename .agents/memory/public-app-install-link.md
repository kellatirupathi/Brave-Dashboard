---
name: Public app install link
description: Public-access requirements and security boundary for the BRAVE app QR landing page.
---

The `/get-app` install guide must open without a BRAVE login because its URL is distributed through a QR code. Expose only the download URL and configured QR object path through the public configuration response.

**Why:** A QR scan commonly starts in a fresh browser with no dashboard session. Protecting either the route, its configuration request, or its configured QR image redirects or breaks the intended install flow.

**How to apply:** Keep the exact configured programme QR asset anonymously readable, but require authentication for every unrelated Object Storage path and keep the full programme configuration private.