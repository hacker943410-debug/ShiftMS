#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { readMetadata, validateReadyMetadata } = require("./handoff-metadata.cjs");

function readInput() {
  try {
    const input = fs.readFileSync(0, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(input || "{}");
  } catch {
    return {};
  }
}

function deny(reason) {
  return { decision: "deny", reason };
}

const permanentlyForbidden = [
  /\bgit\s+(?:commit|push|clean|checkout|switch|restore)\b/i,
  /\bgit\s+reset\b/i,
  /\b(?:release:publish|release:package|release:verify-package|package:win)\b/i,
  /\belectron-builder\b/i,
  /\bnpm\s+(?:install|i|uninstall|remove|update)\b/i,
  /\b(?:apply_patch|sed\s+-i|perl\s+-p?i|tee)\b/i,
  /\b(?:writeFileSync|writeFile|appendFile|unlinkSync|rmSync|renameSync)\b/i,
  /(?:^|[\s;&|])(?:Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item)\b/i,
  /(?:^|[\s;&|])(?:rm|mv|cp|del|erase|rmdir|mkdir)\b/i,
  /(?:^|[^<])>{1,2}(?![=&])/m
];

function evaluateShellRequest(input, projectRoot) {
  if (String(input.tool_name || "") !== "run_shell_command") return {};

  const rawCommand = input.tool_input?.command;
  const command = (Array.isArray(rawCommand) ? rawCommand.join("\n") : String(rawCommand || "")).trim();
  if (!command) return deny("빈 shell 명령은 허용하지 않습니다.");

  let metadata;
  try {
    metadata = readMetadata(projectRoot);
  } catch (error) {
    return deny(`Gemini shell 명령 차단: ${error.message}`);
  }

  const metadataErrors = validateReadyMetadata(metadata);
  if (metadataErrors.length > 0) {
    return deny(`Gemini shell 명령 차단: ${metadataErrors.join(" ")}`);
  }

  if (permanentlyForbidden.some((pattern) => pattern.test(command))) {
    return deny("Gemini coding lane에서 파일 변경, Git 변경, 의존성, 패키징 또는 게시 shell 명령은 금지됩니다.");
  }

  if (!metadata.allowedCommands.includes(command)) {
    return deny(`Gemini shell 명령 차단: HANDOFF allowedCommands에 없는 명령입니다: ${command}`);
  }

  return {};
}

function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  process.stdout.write(`${JSON.stringify(evaluateShellRequest(readInput(), projectRoot))}\n`);
}

if (require.main === module) main();

module.exports = { evaluateShellRequest };
