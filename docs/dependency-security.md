# docs/dependency-security.md — Tracked Dependency Vulnerabilities

This file tracks known vulnerabilities in the dependency tree that are **not yet resolved**. It exists because `npm audit fix --force` was deliberately not run — that command's suggested fix is a destructive downgrade (see below), not an acceptable automatic remediation. These findings are open, not harmless, and must be re-checked at every recheck point listed at the bottom until they're genuinely resolved (upstream patch, confirmed non-exposure, or a safe alternative).

Last audited: 2026-08-01, via `npm audit --json` against `package-lock.json` on `phase-1-foundation` after M1.1.

## Finding 1 — postcss (3 advisories, high severity overall)

- **Affected package:** `postcss`
- **Installed version:** `8.4.31`
- **Dependency path:** `hurkl-platform` → `next@16.2.12` → `postcss@8.4.31` (transitive; not a direct dependency of this repo — pulled in by Next.js's own build toolchain)
- **Advisories:**
  | Advisory | Title | Severity | CVSS | CWE | Affected range |
  |---|---|---|---|---|---|
  | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output | Moderate | 6.1 | CWE-79 | `<8.5.10` |
  | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | PostCSS: Arbitrary file read and information disclosure via attacker-controlled `sourceMappingURL` in CSS comments | High | 7.5 | CWE-22, CWE-200 | `<=8.5.11` |
  | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | PostCSS: Path Traversal in Previous Source Map Auto-Loading (`sourceMappingURL`) leads to Arbitrary `.map` File Disclosure | High | 7.5 | CWE-22 | `<=8.5.17` |

  Installed `8.4.31` falls inside all three affected ranges.

- **Exposure classification: build-time only, low current practical exposure — but present in the production dependency tree.**
  `postcss` is listed under `next`'s runtime `dependencies` (not a devDependency), so it is physically present in `node_modules` in production installs too. However, its vulnerable code paths — CSS-to-string stringification and `sourceMappingURL`-based source-map auto-loading — run **at build time**, against **our own trusted source files** (currently just `app/globals.css`), not against attacker-controlled input processed live during request handling. This app does not accept user-submitted CSS, custom stylesheets, or CSS-adjacent content from any external party at runtime. **Practical exposure today is low, not zero** — postcss's exact internal invocation surface inside Next.js's bundler (Turbopack/webpack) has not been independently audited by us, and "low today" can change if a future feature (e.g., user-customizable themes/CSS, a CMS-driven stylesheet, or an uploaded `.map` file) is added without revisiting this entry first.

## Finding 2 — sharp (1 advisory, high severity)

- **Affected package:** `sharp`
- **Installed version:** `0.34.5`
- **Dependency path:** `hurkl-platform` → `next@16.2.12` → `sharp@0.34.5` (transitive, optional dependency — Next.js's built-in Image Optimization feature)
- **Advisory:**
  | Advisory | Title | Severity | CWE | Affected range |
  |---|---|---|---|---|
  | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | High | CWE-1395 | `<0.35.0` |

  Installed `0.34.5` falls inside the affected range.

- **Exposure classification: currently an unused feature — zero live exposure today, but a real production risk the moment it's turned on.**
  `sharp` backs Next.js's server-side Image Optimization API (`next/image`, served at `/_next/image` when self-hosted), which resizes/transforms images at request time — including images from remote URLs if `next.config.ts`'s `images.remotePatterns`/`domains` allow external sources. **This app does not use `next/image` anywhere, and `next.config.ts` has no `images` configuration.** Sharp's vulnerable libvips code is present in `node_modules` but is not invoked by anything in this codebase today. This must be re-verified — not assumed still true — before `next/image` (or any other image/content-processing path) is introduced, especially one that could process attacker- or customer-supplied images (e.g., job photos, a Phase 7 A-1 pilot feature).

## Why no automatic fix was applied

`npm audit fix --force`'s suggested remediation for both findings is to install **`next@9.3.3`** — a downgrade of roughly seven major versions from the currently installed `16.2.12`. This would:
- Remove the App Router, Server Components, streaming, and Server Actions support that `ARCHITECTURE.md` §2 and the M1.0 compatibility verification depend on.
- Undo the verified Netlify compatibility from M1.0 (that verification was performed against Next.js 16, not 9).
- Very likely break the build entirely, since this repository's `app/` directory structure doesn't exist in the Next.js 9 era (pre-App-Router).

Applying it would trade three dependency advisories — two of which have low current practical exposure per the classifications above — for a broken, years-obsolete framework version. That is not an acceptable trade, and CLAUDE.md's "do not claim untested work is complete" / "ask before destructive operations" principles apply directly here: a downgrade of this magnitude is a destructive operation that was not requested and would not have been safe to apply silently.

## Required recheck points

These findings stay open and **must be reverified** — not assumed resolved — at each of the following:

1. **Every dependency milestone** — any time `next`, `postcss`, or `sharp` versions change (including routine `npm update`), re-run `npm audit` and update this file.
2. **Before staging deployment** (Phase 1, M1.8) — confirm current status before anything from this repo is reachable at a public/semi-public URL.
3. **Before production deployment** (A-1 pilot going live, Phase 7 onward) — confirm current status before real customer traffic hits this app.
4. **Before enabling untrusted image or content processing** — specifically before adding `next/image` with any `remotePatterns`/`domains` entry, any CSS customization feature, any file upload that gets rendered as CSS/styles, or any equivalent feature that would let a customer, lead, or other non-developer party influence CSS or image content processed by this app. This directly covers the Phase 7 A-1 pilot's planned "job photos" feature — sharp's status must be rechecked specifically before that ships.

Resolution criteria for closing a finding: either an upstream Next.js release bumps its bundled `postcss`/`sharp` past the vulnerable range (verify via `npm ls postcss` / `npm ls sharp` after upgrading `next`), or a documented decision is made that the feature exposing the vulnerable path will not be built. Do not close a finding here without one of those two things actually happening.
