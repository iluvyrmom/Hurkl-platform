import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces two permanent boundaries from this app's build spec, as actual
 * regression tests rather than a one-time manual grep someone has to
 * remember to repeat:
 *
 * 1. "Keep Mason integration API-ready but do not integrate Mason yet" —
 *    lib/api.ts is the intentional integration surface; nothing imports
 *    Mason's code (there isn't any to import — Mason lives in this same
 *    repo's root app/lib, entirely outside apps/a1-dump-estimator).
 * 2. "Do not begin the national marketplace yet" — lib/domain/marketplace.ts
 *    defines future contractor-marketplace contracts as types only. This
 *    test fails the moment anything outside that file imports from it,
 *    which is exactly the signal that marketplace wiring has begun.
 */

const APP_ROOT = join(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(fullPath);
    }
  }
  return out;
}

describe("architecture boundaries", () => {
  const sourceFiles = collectSourceFiles(APP_ROOT);

  it("nothing outside lib/domain/marketplace.ts imports from it — the marketplace stays types-only and unwired", () => {
    const marketplaceFile = join(APP_ROOT, "lib/domain/marketplace.ts");
    const offenders = sourceFiles.filter((file) => {
      if (file === marketplaceFile) return false;
      const content = readFileSync(file, "utf-8");
      return /from\s+["'].*domain\/marketplace["']/.test(content);
    });
    expect(offenders.map((f) => relative(APP_ROOT, f))).toEqual([]);
  });

  it("no source file reaches outside this app into hurkl-platform's root Mason app/lib", () => {
    const offenders = sourceFiles.filter((file) => {
      const content = readFileSync(file, "utf-8");
      // A relative import climbing above this app's root (../../..) would be
      // the only way to reach Mason's code from inside apps/a1-dump-estimator.
      return /from\s+["']\.\.\/\.\.\/\.\.\//.test(content);
    });
    expect(offenders.map((f) => relative(APP_ROOT, f))).toEqual([]);
  });
});
