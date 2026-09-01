---
name: Android release builds on Replit
description: Non-obvious environment and signing constraints for reproducible BRAVE Android releases.
---

Use a minimal licensed Nix Android SDK composition rather than the default SDK bundle, which pulls emulator system images and can exhaust build time and disk quota. Disable JVM performance counters for native release builds in this container.

**Why:** The full SDK composition spent the execution window building unnecessary emulator images. Native release compilation also triggered a JVM performance-counter SIGBUS, while `-XX:-UsePerfData` allowed the build to complete.

**How to apply:** Keep Android SDK/build-tools/NDK/CMake versions aligned with the Gradle project, use Java 17, limit Gradle workers when storage is tight, and clear only regenerable caches/intermediates. Never commit or replace the release keystore; its certificate must remain stable for app updates.

For nested npm mobile artifacts, a lockfile whose `resolved` URLs point at the public registry can be rewritten by the workspace firewall to an invalid tarball path.

**Why:** Clean installs failed repeatedly even though package metadata was available through the firewall; npm replaced only the lockfile URL host and dropped the firewall registry's required path prefix.

**How to apply:** Keep the committed lockfile unchanged. For a clean restore, temporarily remove `resolved` fields from a copy of the lockfile so npm resolves packages through the configured firewall registry, run the install, then restore the original lockfile.