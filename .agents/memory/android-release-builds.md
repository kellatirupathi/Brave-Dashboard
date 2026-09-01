---
name: Android release builds on Replit
description: Non-obvious environment and signing constraints for reproducible BRAVE Android releases.
---

Use a minimal licensed Nix Android SDK composition rather than the default SDK bundle, which pulls emulator system images and can exhaust build time and disk quota. Disable JVM performance counters for native release builds in this container.

**Why:** The full SDK composition spent the execution window building unnecessary emulator images. Native release compilation also triggered a JVM performance-counter SIGBUS, while `-XX:-UsePerfData` allowed the build to complete.

**How to apply:** Keep Android SDK/build-tools versions aligned with the Gradle project. Use Java 21 for the Capacitor app (the former React Native build used Java 17), limit Gradle workers, and clear only regenerable caches/intermediates. Never commit or replace the release keystore; its certificate must remain stable for app updates.

Capacitor plugin subprojects may silently request an older default build-tools version even when the app module targets the installed SDK. On Replit's read-only Android SDK, set the installed build-tools version centrally for every Android subproject. Use the Gradle `bin` distribution and a workspace-local cache when the home cache quota is tight.