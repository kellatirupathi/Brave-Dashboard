---
name: App usage metrics
description: Product-telemetry definitions for distinguishing BRAVE native-app activity from web activity.
---

Use page-view platform attribution to compare native app and web usage. Historical records without a platform value are unknown and must not be backfilled as web. Report all-time distinct native users as “Ever opened the app,” never as installs.

**Why:** A dashboard can observe that a signed-in user opened the native app, but it cannot observe an installation that was never launched or detect an uninstall. Download counts are also not installation counts.

**How to apply:** Calculate app share only from views with a known app/web platform. Date-range user and screen metrics may be filtered to 7, 30, or 90 days; the ever-opened metric and tracking start remain all-time.