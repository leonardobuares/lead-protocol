// Faithful "production install" smoke test for @leadsolutions/lead-protocol.
//
// `npm link` reflects your on-disk folder: it ignores the `files` allowlist and
// the dependency split, so it can pass while a real install fails. This script
// exercises the real publish path instead: it builds, packs the exact tarball
// npm would publish, installs that tarball into a throwaway consumer project
// (so `files` and the real `dependencies` are exercised), then runs
// init / validate / status against it. Everything is removed at the end.
//
// One command: `npm run test:pack`.
//
// Note: installing the tarball downloads `dependencies` from the registry, so
// this needs network access (just like a real `npm install` / `npx`).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, "..");
const q = (p) => `"${p}"`;

function listRelativeEntries(root, current = root) {
  const entries = [];
  for (const item of readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, item.name);
    entries.push(path.relative(root, absolute));
    if (item.isDirectory()) entries.push(...listRelativeEntries(root, absolute));
  }
  return entries;
}

function run(label, cmd, opts = {}) {
  console.log(`\n[test-pack] ${label}\n[test-pack] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function capture(label, cmd, opts = {}) {
  console.log(`\n[test-pack] ${label}\n[test-pack] $ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", ...opts });
}

const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "lp-testpack-")));

function runExpectFail(label, cmd, opts = {}) {
  console.log(`\n[test-pack] ${label} (expected to fail)\n[test-pack] $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
  } catch {
    console.log(`[test-pack] OK: failed as expected`);
    return;
  }
  throw new Error(`${label}: command succeeded but was expected to fail`);
}


try {
  // 1. Fresh build (tsup + template sync via onSuccess).
  run("Building", "npm run build", { cwd: pkgRoot });

  // 2. Pack the exact publish artifact straight into the temp dir.
  console.log("\n[test-pack] Packing tarball");
  const tgzName = execSync(`npm pack --pack-destination ${q(tmp)}`, {
    cwd: pkgRoot,
    encoding: "utf-8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  const tgz = path.join(tmp, tgzName);
  console.log(`[test-pack] tarball: ${tgz}`);
  const tarEntries = capture("Inspecting packed sentinel boundary", `tar -tzf ${q(tgz)}`);
  if (tarEntries.split(/\r?\n/).some(entry => entry.split("/").includes(".lead-protocol-source"))) {
    throw new Error("source sentinel leaked into tarball");
  }
  console.log("[test-pack] OK: source sentinel absent from tarball");

  // 3. Install the tarball into a throwaway consumer (real files allowlist + deps).
  writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "lp-testpack-consumer", private: true }, null, 2),
  );
  run(
    "Installing tarball (downloads dependencies from the registry)",
    `npm install ${q(tgz)}`,
    { cwd: tmp },
  );

  const installed = path.join(tmp, "node_modules", "@leadsolutions", "lead-protocol");
  const bin = path.join(installed, "dist", "index.js");
  if (!existsSync(bin)) throw new Error(`installed bin not found: ${bin}`);

  // Templates must have shipped inside the installed package (the thing the
  // `files` allowlist controls and `npm link` cannot prove).
  const shipped = path.join(installed, "dist", "templates", ".agents", "CORE_RULES.md");
  if (!existsSync(shipped)) {
    throw new Error(`templates missing from installed package: ${shipped}`);
  }
  console.log("[test-pack] OK: dist/templates shipped inside the installed package");

  const shippedTemplates = path.join(installed, "dist", "templates");
  const expectedSeed = readFileSync(path.resolve(pkgRoot, "..", "INDEX.md"));
  // Reviewed generic seed content: changing the distributed map requires review
  // of the actual rows, not merely retaining a marker or matching a live source.
  assert.equal(createHash("sha256").update(expectedSeed.toString("utf8").replace(/\r\n/g, "\n")).digest("hex"),
    "6bfeca63ea15daa399d41e29e5fbf4d426e2b2440afbd18f5b4e09e11d8571d5");
  assert.deepEqual(readFileSync(path.join(shippedTemplates, "INDEX.md")), expectedSeed);
  console.log("[test-pack] OK: exact reviewed generic INDEX seed shipped");

  console.log("[test-pack] Running pristine project-history fixtures against the packed runtime");
  execFileSync(process.execPath, ["--test", path.join(pkgRoot, "test", "project-seeds.test.mjs")], {
    stdio: "inherit", env: { ...process.env, LEAD_PROTOCOL_TEST_BIN: bin },
  });
  const excludedCacheArtifacts = listRelativeEntries(shippedTemplates).filter((relative) => {
    const segments = relative.split(path.sep);
    return (
      segments.includes(".lead-protocol-source") ||
      segments.includes("__pycache__") ||
      segments.includes(".pytest_cache") ||
      /\.(pyc|pyo)$/i.test(segments.at(-1))
    );
  });
  if (excludedCacheArtifacts.length > 0) {
    throw new Error(`excluded cache artifacts shipped in package: ${excludedCacheArtifacts.join(", ")}`);
  }
  console.log("[test-pack] OK: installed scaffold contains no Python cache artifacts");

  // 4. Run init / validate / status in a clean target dir.
  const target = path.join(tmp, "project");
  mkdirSync(target);
  run("init --yes", `node ${q(bin)} init --yes`, { cwd: target });

  assert.deepEqual(readFileSync(path.join(target, "INDEX.md")), expectedSeed);
  console.log("[test-pack] Running INDEX fixtures against the packed runtime");
  execFileSync(process.execPath, ["--test", path.join(pkgRoot, "test", "init-index.test.mjs")], {
    stdio: "inherit", env: { ...process.env, LP_INDEX_BIN: bin },
  });

  for (const file of ["CLAUDE.md", "AGENTS.md"]) {
    const text = readFileSync(path.join(target, file), "utf-8");
    if (!text.includes("<lead-protocol>")) {
      throw new Error(`${file} is missing the <lead-protocol> block`);
    }
  }
  if (!existsSync(path.join(target, ".agents", "CORE_RULES.md"))) {
    throw new Error(".agents/ was not created by init");
  }
  const initializedAttributes = path.join(target, ".agents", ".gitattributes");
  if (readFileSync(initializedAttributes, "utf8") !== readFileSync(path.join(shippedTemplates, ".agents", ".gitattributes"), "utf8")) {
    throw new Error("init did not preserve shipped merge attributes");
  }
  console.log("[test-pack] OK: init installed the shipped merge attributes");
  const installedManifestPath = path.join(target, ".agents", "manifest.json");
  if (!existsSync(installedManifestPath)) throw new Error(".agents/manifest.json was not created by init");
  const installedManifest = JSON.parse(readFileSync(installedManifestPath, "utf8"));
  const installedPackage = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"));
  if (installedManifest.manifest_version !== 1 || installedManifest.product_version !== installedPackage.version) {
    throw new Error(`installed manifest does not identify product ${installedPackage.version}`);
  }
  const protocolRules = readFileSync(path.join(target, ".agents", "PROTOCOL_RULES.md"), "utf8");
  const kernelVersion = protocolRules.match(/^>\s*Version:\s*(\d+\.\d+\.\d+)\s*\|/m)?.[1];
  if (!kernelVersion || installedManifest.kernel_version !== kernelVersion) {
    throw new Error(`installed manifest kernel ${installedManifest.kernel_version} does not match PROTOCOL_RULES ${kernelVersion ?? "missing"}`);
  }
  console.log(`[test-pack] OK: installed manifest identifies product ${installedPackage.version} and kernel ${kernelVersion}`);

  for (const relativePath of [
    path.join(".agents", "PROJECT_RULES.md"),
    path.join(".agents", "modules", "git-substrate.md"),
  ]) {
    const text = readFileSync(path.join(target, relativePath), "utf-8");
    if (!text.includes("`<agent-slug>/<description>`")) {
      throw new Error(`${relativePath} is missing the agent-neutral branch convention`);
    }
    if (text.includes("`claude/*`") || text.includes("`claude/<description>`")) {
      throw new Error(`${relativePath} still uses a vendor-specific generic branch default`);
    }
  }
  console.log("[test-pack] OK: installed scaffold uses agent-neutral branch guidance");

  const gitModule = readFileSync(
    path.join(target, ".agents", "modules", "git-substrate.md"), "utf8",
  ).replace(/\r\n/g, "\n");
  if (!/^> Version: 1\.4\.0\s*\|/m.test(gitModule)) {
    throw new Error("installed git-substrate module must be version 1.4.0");
  }
  const isolation = gitModule.match(/^## §M-git-7\b([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]
    .replace(/[`*]/g, "").replace(/\s+/g, " ");
  for (const contract of [
    /Git repository.*explicit common.*<integration-base>/i,
    /concurrent writer.*<agent-slug>.*AGENTS_MAP\.md.*PROJECT_RULES\.md.*§J8/i,
    /distinct branch.*distinct working directory.*worktree.*clone/i,
    /different branches.*shared checkout.*do not isolate.*filesystem edits/i,
    /default branch.*integration-only.*only when.*policy.*protection.*PR.*exceptions/i,
    /one writer.*serial handoffs.*non-Git projects.*no mandatory overhead/i,
    /planning.*checkpoint.*review.*implementation.*same branch\/worktree.*serial.*prior writer pauses.*reviewed state remains stable.*generated files.*test runs.*coordinated/i,
    /Never require.*per agent.*tool.*checkpoint.*task.*identities differ/i,
    /optional detached.*fixed-commit review worktree.*implementation continues concurrently/i,
    /not locks.*do not make acquisition atomic.*no global presence.*control plane/i,
    /active_sessions\.md.*different branches.*not automatically.*synchronized/i,
    /#5.*append-only merge\/integrity.*#19.*file locks.*neither/i,
    /share Git objects\/refs.*isolate uncommitted directory state/i,
    /external files.*services.*ports.*credentials.*storage.*shared/i,
    /cleanup.*status.*no hard reset.*broad clean.*forced removal/i,
  ]) {
    if (!isolation || !contract.test(isolation)) {
      throw new Error(`installed scaffold missing concurrent isolation contract: ${contract}`);
    }
  }
  for (const writer of ["a", "b"]) {
    for (const command of [
      `git worktree add -b "<branch-${writer}>" "<directory-${writer}>" "<integration-base>"`,
      `git clone "<repository-url>" "<clone-${writer}>"`,
      `git -C "<clone-${writer}>" switch -c "<branch-${writer}>" "<integration-base>"`,
    ]) {
      if (!isolation.includes(command)) throw new Error(`installed scaffold missing example: ${command}`);
    }
  }
  console.log("[test-pack] OK: installed git-substrate 1.4.0 includes concurrent isolation and serial opt-outs");

  console.log("[test-pack] OK: init created .agents/ and tagged CLAUDE.md / AGENTS.md");

  // Materialize the minimum project configuration required by the canonical
  // boot gate before exercising the session lifecycle.
  const projectRules = path.join(target, ".agents", "PROJECT_RULES.md");
  writeFileSync(
    projectRules,
    readFileSync(projectRules, "utf-8")
      .replace("# PROJECT_RULES.md — [Project Name]", "# PROJECT_RULES.md — Package smoke")
      .replace("- **Name:** [Project Name]", "- **Name:** Package smoke")
      .replace(/- \*\*Active substrate:\*\*.*$/m, "- **Active substrate:** local")
      .replace(/- \*\*Active modules:\*\*.*$/m, "- **Active modules:** none"),
  );

  run("validate", `node ${q(bin)} validate`, { cwd: target });
  // Invoke the installed artifact directly, with native paths and no shell.
  function assertStatus(cwd, project, productVersion, expectedKernel) {
    const invoke = (...args) => {
      const output = execFileSync(process.execPath, [bin, "status", ...args], {
        cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      });
      assert.doesNotMatch(output, /\x1b/, "no ANSI escapes in no-color output");
      return output.replace(/\r\n/g, "\n");
    };
    assert.deepEqual(JSON.parse(invoke("--json")), {
      project,
      productVersion,
      kernelVersion: expectedKernel,
      protocolVersion: expectedKernel,
      activeSessions: 0,
      pairs: [],
      recentDecisions: [],
    });
    const human = invoke();
    const lines = human.split("\n");
    const first = lines.findIndex((line) => line.trim() !== "");
    assert.equal(lines[first], `Lead Protocol ${productVersion} — ${project}`);
    assert.equal(lines[first + 1], `  Kernel: ${expectedKernel} (technical detail)`);
    assert.doesNotMatch(human, /Product Version|Kernel Version|Protocol Version/);
    assert.match(human, /No sessions recorded yet/);
    assert.match(human, /No decisions recorded yet/);
    assert.match(human, /Active Sessions:\s+0/);
  }
  assertStatus(target, "Package smoke", installedPackage.version, kernelVersion);

  // A consumer scaffold can differ from the CLI that happens to inspect it.
  const differentProduct = installedPackage.version === "7.8.9" ? "7.8.10" : "7.8.9";
  writeFileSync(installedManifestPath, JSON.stringify({ ...installedManifest, product_version: differentProduct }));
  assertStatus(target, "Package smoke", differentProduct, kernelVersion);
  writeFileSync(installedManifestPath, JSON.stringify(installedManifest));
  const pristineCheckpoints = readdirSync(path.join(target, ".agents", "checkpoints")).filter((name) => name !== ".gitkeep");
  if (pristineCheckpoints.length !== 0) {
    throw new Error(`fresh install inherited ${pristineCheckpoints.length} checkpoint(s)`);
  }
  const pristineSessionFiles = readdirSync(path.join(target, ".agents", "sessions"));
  if (pristineSessionFiles.length !== 1 || pristineSessionFiles[0] !== "active_sessions.md") {
    throw new Error(`fresh install inherited unexpected session artifacts: ${pristineSessionFiles.join(", ")}`);
  }
  console.log("[test-pack] OK: fresh install contains no source-repository sessions, decisions, or checkpoints");

  const legacyTarget = path.join(tmp, "legacy-project");
  mkdirSync(legacyTarget);
  execFileSync(process.execPath, [bin, "init", "--yes"], { cwd: legacyTarget, stdio: "pipe" });
  const legacyManifestPath = path.join(legacyTarget, ".agents", "manifest.json");
  rmSync(legacyManifestPath);
  assertStatus(legacyTarget, "Unknown Project", "unknown", kernelVersion);
  console.log("[test-pack] OK: legacy status preserves complete JSON and human hierarchy");

  for (const invalidManifest of ["{ invalid", JSON.stringify({ ...installedManifest, product_version: "invalid" })]) {
    writeFileSync(legacyManifestPath, invalidManifest);
    assertStatus(legacyTarget, "Unknown Project", "unknown", kernelVersion);
  }
  writeFileSync(path.join(legacyTarget, ".agents", "PROTOCOL_RULES.md"), "> Version: invalid | Updated: 2026-06-01\r\n");
  assertStatus(legacyTarget, "Unknown Project", "unknown", "unknown");
  console.log("[test-pack] OK: pristine, differing-product, legacy, and invalid-manifest status contracts");

  // 5. Legacy consumers without INDEX still boot; discovery is on demand.
  rmSync(path.join(target, "INDEX.md"));
  // Exercise the exact installed lifecycle binary without rebuilding.
  run(
    "session open",
    `node ${q(bin)} session open --actor judge --agent codex --signature "[Codex / GPT-5]" --topic "Package lifecycle smoke" --json`,
    { cwd: target },
  );
  const checkpointBody = path.join(target, "checkpoint-body.md");
  writeFileSync(checkpointBody, "Package smoke checkpoint body.\n");
  run(
    "checkpoint",
    `node ${q(bin)} checkpoint --actor judge --agent codex --title package-smoke --file ${q(checkpointBody)} --json`,
    { cwd: target },
  );
  run(
    "session close",
    `node ${q(bin)} session close --actor judge --agent codex --journal not-significant --status stable --last-action "Package lifecycle verified." --pending-step None --confirm-checklist --json`,
    { cwd: target },
  );
  const receipts = path.join(target, ".agents", "local", "judge", "codex", "receipts");
  if (!existsSync(receipts)) throw new Error("lifecycle receipts directory was not created");
  const resumed = JSON.parse(capture(
    "second session open / resume",
    `node ${q(bin)} session open --actor judge --agent codex --signature "[Codex / GPT-5]" --topic "Resume from prior handoff" --json`,
    { cwd: target },
  ));
  if (resumed.previousHandoff?.status !== "STABLE" || resumed.previousHandoff?.last_action !== "Package lifecycle verified.") {
    throw new Error("second session did not receive the terminal handoff from the first session");
  }
  run(
    "second session close",
    `node ${q(bin)} session close --actor judge --agent codex --journal not-significant --status stable --last-action "Two-session resume verified." --pending-step None --confirm-checklist --json`,
    { cwd: target },
  );
  assert.equal(existsSync(path.join(target, "INDEX.md")), false);
  console.log("[test-pack] OK: installed lifecycle completed a two-session resume flow without INDEX");


  // Run the preservation/path regression suite against the installed binary
  // and installed updater entrypoint, not the source checkout's build.
  for (const entry of ["lib/updater.js", "lib/session-lifecycle.js"]) {
    if (!existsSync(path.join(installed, "dist", entry))) throw new Error(`missing entrypoint: ${entry}`);
  }
  run("packed init/update safety and preservation regressions", `node --test ${q(path.join(pkgRoot, "test", "updater.test.mjs"))}`, {
    cwd: tmp,
    env: { ...process.env, LEAD_PROTOCOL_TEST_BIN: bin },
  });

  run("packed first-run instruction and consumer contracts", `node --test ${q(path.join(pkgRoot, "test", "first-run.test.mjs"))}`, {
    cwd: tmp,
    env: { ...process.env, LEAD_PROTOCOL_TEST_BIN: bin },
  });

  // Evidence is exercised through the installed tarball, never a source import.
  const evidenceLib = await import(pathToFileURL(path.join(installed, "dist/lib/execution-evidence.js")).href);
  const schemasDir = path.join(target, ".agents/schemas");
  const examples = [...protocolRules.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map(m => JSON.parse(m[1])).filter(v => v.execution_evidence);
  if (examples.length !== 2) throw new Error("shipped close/checkpoint examples missing");
  for (const example of examples) evidenceLib.validateEvidence(example.execution_evidence, schemasDir);
  console.log("[test-pack] OK: both illustrative examples validate against the shipped schema");
  const evidenceFile = path.join(target, "execution-evidence.json");
  const evidence = { checks: [{ command: "installed lifecycle fixture", cwd: target, result: "not_run", reason: "Illustrative roundtrip payload; not a claim of separate command execution" }], environment: { runtime: process.version, cwd: target } };
  writeFileSync(evidenceFile, JSON.stringify(evidence));
  const opened = JSON.parse(capture("evidence session open", `node ${q(bin)} session open --actor judge --agent codex --topic "Evidence roundtrip" --json`, { cwd: target }));
  const quotedBody = ['Legacy freeform examples', '````markdown', '## Execution Evidence', '```json', '{"execution_evidence":{}}', '```', '````', '~~~~', '## Execution Evidence', 'placeholder', '~~~~'].join("\r\n");
  const quotedFile = path.join(target, "quoted-body.md");
  writeFileSync(quotedFile, quotedBody);
  const schemaFile = path.join(schemasDir, "execution-evidence.schema.json");
  const schemaBytes = readFileSync(schemaFile);
  rmSync(schemaFile);
  const quotedArgs = [bin, "checkpoint", "--actor", "judge", "--agent", "codex", "--title", "quoted-example", "--file", quotedFile, "--json"];
  const quotedProcess = spawnSync(process.execPath, quotedArgs, { cwd: target, encoding: "utf8" });
  if (quotedProcess.status !== 0) throw new Error(`installed CLI rejected legacy fences: ${quotedProcess.stderr}`);
  const quotedCheckpoint = JSON.parse(quotedProcess.stdout);
  const quotedSaved = readFileSync(quotedCheckpoint.checkpoint, "utf8");
  const expectedQuoted = `# Checkpoint — quoted-example\n\n> Timestamp: ${quotedCheckpoint.timestamp}\n> Agent: ${opened.pair.signature}\n> Actor: judge\n> Session: \`${opened.sessionId}\`\n\n${quotedBody}\n`;
  if (quotedSaved !== expectedQuoted || evidenceLib.parseEvidenceMarkdown(quotedSaved, schemasDir) !== undefined) throw new Error("installed CLI changed legacy body or extracted fake evidence");
  writeFileSync(schemaFile, schemaBytes);
  const stateSnapshot = () => listRelativeEntries(path.join(target, ".agents")).filter(name => !statSync(path.join(target, ".agents", name)).isDirectory()).map(name => [name, readFileSync(path.join(target, ".agents", name)).toString("base64")]);
  const beforeMalformed = JSON.stringify(stateSnapshot());
  writeFileSync(quotedFile, quotedBody + "\n## Execution Evidence\nmissing JSON");
  const malformedProcess = spawnSync(process.execPath, quotedArgs, { cwd: target, encoding: "utf8" });
  if (malformedProcess.status === 0 || !/Malformed execution evidence/.test(malformedProcess.stderr)) throw new Error("installed CLI accepted malformed real section");
  if (JSON.stringify(stateSnapshot()) !== beforeMalformed) throw new Error("malformed real section mutated installed project state");
  console.log("[test-pack] OK: schema-free fenced legacy bytes preserved; malformed real section refused without state change");
  for (const [label, body] of [
    ["open-backtick", "````markdown\nlegacy"],
    ["open-tilde", "~~~~markdown\nlegacy"],
    ["trim-backtick", "    ````markdown\nlegacy"],
    ["trim-tilde", "\t~~~~markdown\nlegacy"],
    ["trim-duplicate", '   ## Execution Evidence\n\n```json\n{"execution_evidence":{}}\n```'],
  ]) {
    writeFileSync(quotedFile, body);
    const before = JSON.stringify(stateSnapshot());
    const args = [...quotedArgs];
    args[args.indexOf("quoted-example")] = label;
    const rejected = spawnSync(process.execPath, [...args, "--evidence", evidenceFile], { cwd: target, encoding: "utf8" });
    if (rejected.status === 0) {
      const saved = readFileSync(JSON.parse(rejected.stdout).checkpoint, "utf8");
      console.log("UNSAFE INSTALLED WRITER SUCCESS", label, "parsed:", evidenceLib.parseEvidenceMarkdown(saved, schemasDir));
      throw new Error("installed writer accepted unsafe explicit evidence composition");
    }
    if (!/evidence/i.test(rejected.stderr) || JSON.stringify(stateSnapshot()) !== before) throw new Error("unsafe composition refusal changed installed state");
    const legacy = spawnSync(process.execPath, args, { cwd: target, encoding: "utf8" });
    if (legacy.status !== 0) throw new Error(`legacy composition refused: ${legacy.stderr}`);
    const checkpoint = JSON.parse(legacy.stdout);
    const expected = `# Checkpoint — ${label}\n\n> Timestamp: ${checkpoint.timestamp}\n> Agent: ${opened.pair.signature}\n> Actor: judge\n> Session: \`${opened.sessionId}\`\n\n${body.trim()}\n`;
    if (readFileSync(checkpoint.checkpoint, "utf8") !== expected) throw new Error("legacy composition bytes changed");
  }
  console.log("[test-pack] OK: unsafe explicit composition refused without mutation; legacy omission bytes preserved");
  let embeddedCases = 0;
  for (const [label, newline] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
    const body = ("Narrative\n" + evidenceLib.renderEvidenceMarkdown(evidence)).replace(/\n/g, newline);
    const hidden = ('    ```\nordinary text\n' + evidenceLib.renderEvidenceMarkdown(evidence)).replace(/\n/g, newline);
    if (evidenceLib.renderEvidenceMarkdown(evidenceLib.parseEvidenceMarkdown(hidden, schemasDir)) !== evidenceLib.renderEvidenceMarkdown(evidence)) throw new Error("embedded fixture must be parseable before trimming");
    const args = [...quotedArgs];
    args[args.indexOf("quoted-example")] = `embedded-${label.toLowerCase()}`;
    for (const [input, extra] of [[hidden, []], [body, ["--evidence", evidenceFile]]]) {
      writeFileSync(quotedFile, input);
      const before = JSON.stringify(stateSnapshot());
      const entries = JSON.stringify(listRelativeEntries(path.join(target, ".agents")));
      const rejected = spawnSync(process.execPath, [...args, ...extra], { cwd: target, encoding: "utf8" });
      if (rejected.status === 0 || !/evidence/i.test(rejected.stderr)) throw new Error(`installed CLI accepted hidden or duplicate embedded evidence (${label})`);
      if (JSON.stringify(stateSnapshot()) !== before || JSON.stringify(listRelativeEntries(path.join(target, ".agents"))) !== entries) throw new Error("embedded evidence refusal mutated installed state");
      embeddedCases++;
    }
    writeFileSync(quotedFile, body);
    const created = spawnSync(process.execPath, args, { cwd: target, encoding: "utf8" });
    if (created.status !== 0) throw new Error(created.stderr);
    const saved = readFileSync(JSON.parse(created.stdout).checkpoint, "utf8");
    if (evidenceLib.renderEvidenceMarkdown(evidenceLib.parseEvidenceMarkdown(saved, schemasDir)) !== evidenceLib.renderEvidenceMarkdown(evidence) || saved.split("## Execution Evidence").length - 1 !== 1 || !saved.endsWith(body.trim() + "\n")) throw new Error("installed embedded artifact lost or duplicated evidence");
    embeddedCases++;
  }
  console.log(`[test-pack] OK: ${embeddedCases} embedded evidence cases passed (LF/CRLF exact three-backtick refusal, duplicate refusal, saved artifact roundtrip); all refusal state bytes and entries unchanged`);
  // Quoted examples must also coexist with explicitly supplied real evidence.
  writeFileSync(checkpointBody, quotedBody);
  const checkpoint = JSON.parse(capture("evidence checkpoint", `node ${q(bin)} checkpoint --actor judge --agent codex --title evidence-roundtrip --file ${q(checkpointBody)} --evidence ${q(evidenceFile)} --json`, { cwd: target }));
  const parsedCheckpoint = evidenceLib.parseEvidenceMarkdown(readFileSync(checkpoint.checkpoint, "utf8"), schemasDir);
  if (evidenceLib.renderEvidenceMarkdown(parsedCheckpoint) !== evidenceLib.renderEvidenceMarkdown(evidence)) throw new Error("installed checkpoint lost evidence");
  const registry = path.join(target, ".agents/sessions/active_sessions.md");
  const handoffPath = path.join(target, ".agents/local/judge/codex/handoff.md");
  const beforeInvalid = [readFileSync(registry, "utf8"), readFileSync(handoffPath, "utf8"), readdirSync(receipts).join(",")];
  writeFileSync(evidenceFile, '{"checks":[{"command":"test","result":"blocked","reason":" "}]}');
  const closeArgs = [bin, "session", "close", "--actor", "judge", "--agent", "codex", "--journal", "not-significant", "--status", "stable", "--last-action", "Evidence roundtrip verified", "--pending-step", "None", "--confirm-checklist", "--evidence", evidenceFile, "--json"];
  const rejected = spawnSync(process.execPath, closeArgs, { cwd: target, encoding: "utf8" });
  if (rejected.status === 0 || !/execution evidence/i.test(rejected.stderr)) throw new Error("installed CLI accepted invalid evidence");
  if (JSON.stringify(beforeInvalid) !== JSON.stringify([readFileSync(registry, "utf8"), readFileSync(handoffPath, "utf8"), readdirSync(receipts).join(",")])) throw new Error("invalid installed close mutated state");
  writeFileSync(evidenceFile, JSON.stringify(evidence));
  const closedProcess = spawnSync(process.execPath, closeArgs, { cwd: target, encoding: "utf8" });
  if (closedProcess.status !== 0) throw new Error(closedProcess.stderr);
  const closed = JSON.parse(closedProcess.stdout);
  const saved = JSON.parse(readFileSync(path.join(receipts, `${opened.sessionId}-close.json`), "utf8"));
  if (JSON.stringify(saved) !== JSON.stringify(closed) || JSON.stringify(evidenceLib.parseCloseReceiptEvidence(saved, schemasDir)) !== JSON.stringify(evidence)) throw new Error("installed close receipt lost evidence");
  if (!readFileSync(handoffPath, "utf8").includes(path.basename(checkpoint.checkpoint))) throw new Error("installed handoff lost checkpoint reference");
  console.log("[test-pack] OK: installed evidence roundtrip, invalid-input preservation, receipt and handoff references");

  run("packed validator parity without Git and local merge regressions",
    `node --test --test-name-pattern="successor|union|JSONL|mutable sessions" ${q(path.join(pkgRoot, "test", "validate.test.mjs"))} ${q(path.join(pkgRoot, "test", "git-merge.test.mjs"))}`, {
      cwd: tmp,
      env: { ...process.env, LEAD_PROTOCOL_TEST_BIN: bin },
    });

  // 5. Structural integrity checks (§P3 append-at-tail invariants):
  // corrupt each state file the way real-world merges and bad appends do,
  // expect `validate` to fail, restore, and expect it to pass again.
  const stateFile = (...segments) => path.join(target, ".agents", ...segments);
  const corruptions = [
    {
      label: "conflict markers in decisions.jsonl",
      file: stateFile("decisions.jsonl"),
      corrupt: (text) =>
        `<<<<<<< HEAD\n${text}=======\n{"other":"side"}\n>>>>>>> feature\n`,
    },
    {
      label: "missing final newline in LESSONS.md",
      file: stateFile("LESSONS.md"),
      corrupt: (text) => text.replace(/\n+$/, ""),
    },
    {
      label: "duplicated top-level header in JOURNAL.md",
      file: stateFile("JOURNAL.md"),
      corrupt: (text) => `${text}\n# JOURNAL.md (duplicated by a bad merge)\n`,
    },
  ];
  for (const { label, file, corrupt } of corruptions) {
    const original = readFileSync(file, "utf-8");
    writeFileSync(file, corrupt(original));
    runExpectFail(`validate with ${label}`, `node ${q(bin)} validate`, { cwd: target });
    writeFileSync(file, original);
  }
  run("validate after restoring state files", `node ${q(bin)} validate`, { cwd: target });

  console.log("\n[test-pack] PASS: the locally packed artifact installs and runs like production.");
} catch (err) {
  process.exitCode = 1;
  console.error(`\n[test-pack] FAIL: ${err.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[test-pack] cleaned up ${tmp}`);
}
