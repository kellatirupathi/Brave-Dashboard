// Types for the virtual modules created by vite-plugin-pwa.
//
// A .d.ts rather than a tsconfig "types" entry, because the plugin's types are
// only needed by src/components/pwa-prompts.tsx and adding them globally would
// widen the surface every file sees.
/// <reference types="vite-plugin-pwa/client" />
