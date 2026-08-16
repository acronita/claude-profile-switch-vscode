#!/usr/bin/env node
// Fails the build if a runtime dependency is ever introduced, or if any
// devDependency stops being pinned to an exact version.
//
// This runs before `vsce package`, so a .vsix can never be produced with
// third-party code bundled into it.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const problems = [];

const runtimeDeps = Object.keys(pkg.dependencies || {});
if (runtimeDeps.length > 0) {
  problems.push(
    `Runtime dependencies are not allowed. Found: ${runtimeDeps.join(", ")}`,
  );
}

const exact = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
for (const [name, range] of Object.entries(pkg.devDependencies || {})) {
  if (!exact.test(range)) {
    problems.push(
      `devDependency "${name}" must be pinned to an exact version, got "${range}".`,
    );
  }
}

if (!fs.existsSync(path.join(__dirname, "..", "package-lock.json"))) {
  problems.push("package-lock.json is missing; commit it so installs are reproducible.");
}

if (problems.length > 0) {
  console.error("Supply-chain check failed:\n");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Supply-chain check passed: 0 runtime dependencies, ${
    Object.keys(pkg.devDependencies || {}).length
  } pinned devDependencies.`,
);
