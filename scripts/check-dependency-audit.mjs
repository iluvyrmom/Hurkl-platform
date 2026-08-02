#!/usr/bin/env node
/**
 * Dependency-security audit REPORTING, not fixing. Never runs
 * `npm audit fix --force` — see docs/dependency-security.md for why.
 *
 * Compares `npm audit --json` against the tracked baseline in
 * docs/dependency-audit-baseline.json (advisories recorded in
 * docs/dependency-security.md). Exits 0 when only known, tracked findings
 * are present. Exits 1 and prints exactly what's new — by GHSA advisory ID
 * — when something beyond the baseline shows up, so CI surfaces genuinely
 * new risk without re-failing forever on the three findings already being
 * tracked deliberately.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const baselinePath = path.join(repoRoot, "docs", "dependency-audit-baseline.json");

function loadBaseline() {
  const raw = readFileSync(baselinePath, "utf8");
  const parsed = JSON.parse(raw);
  return new Set(parsed.knownAdvisories);
}

function runNpmAudit() {
  try {
    const out = execFileSync("npm", ["audit", "--json"], {
      encoding: "utf8",
      cwd: repoRoot,
    });
    return JSON.parse(out);
  } catch (error) {
    // npm audit exits non-zero whenever any vulnerability is found; the
    // JSON report is still on stdout in that case.
    if (error.stdout) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

function extractAdvisoryIds(auditReport) {
  const ids = new Set();
  const vulnerabilities = auditReport.vulnerabilities ?? {};
  for (const entry of Object.values(vulnerabilities)) {
    for (const via of entry.via ?? []) {
      if (typeof via === "object" && via !== null && typeof via.url === "string") {
        const match = via.url.match(/advisories\/(GHSA-[a-z0-9-]+)/i);
        if (match) ids.add(match[1]);
      }
    }
  }
  return ids;
}

const baseline = loadBaseline();
const report = runNpmAudit();
const found = extractAdvisoryIds(report);

const known = [...found].filter((id) => baseline.has(id)).sort();
const unknown = [...found].filter((id) => !baseline.has(id)).sort();
const missing = [...baseline].filter((id) => !found.has(id)).sort();

console.log(`Dependency audit report — compared against ${path.relative(repoRoot, baselinePath)}`);
console.log(
  `Total high/critical severity count from npm audit: ${report.metadata?.vulnerabilities?.high ?? 0} high, ${report.metadata?.vulnerabilities?.critical ?? 0} critical`,
);
console.log(
  `\nKnown, tracked findings still present (see docs/dependency-security.md): ${known.length}`,
);
for (const id of known) console.log(`  - ${id}`);

if (missing.length > 0) {
  console.log(
    `\nTracked findings NOT currently detected (may be resolved — verify and update docs/dependency-security.md + the baseline file if so): ${missing.length}`,
  );
  for (const id of missing) console.log(`  - ${id}`);
}

if (unknown.length > 0) {
  console.log(`\nNEW findings NOT in the tracked baseline: ${unknown.length}`);
  for (const id of unknown) {
    console.log(`  - ${id} — investigate and update docs/dependency-security.md before merging`);
  }
  process.exit(1);
}

console.log("\nNo new findings beyond the tracked baseline.");
process.exit(0);
