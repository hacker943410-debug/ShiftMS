#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  getGitState,
  normalizeRelative,
  readMetadata,
  validateReadyMetadata,
  validateRepoState,
  validateTerminalResponse
} = require("./handoff-metadata.cjs");

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

function evaluateWriteRequest(input, projectRoot, injectedRepoState) {
  const toolName = String(input.tool_name || "");
  if (!/^(write_file|replace)$/.test(toolName)) return {};

  let metadata;
  try {
    metadata = readMetadata(projectRoot);
  } catch (error) {
    return deny(`Gemini 파일 쓰기 차단: ${error.message}`);
  }

  const metadataErrors = validateReadyMetadata(metadata);
  if (metadataErrors.length > 0) {
    return deny(`Gemini 파일 쓰기 차단: ${metadataErrors.join(" ")}`);
  }

  const requestedPath = String(input.tool_input?.file_path || "");
  const relativePath = normalizeRelative(projectRoot, requestedPath);

  if (!relativePath) {
    return deny("Gemini 파일 쓰기 차단: 프로젝트 루트 자체나 루트 밖 경로는 수정할 수 없습니다.");
  }

  const allowed = metadata.allowedPaths.some(
    (entry) => String(entry).replace(/\\/g, "/").toLowerCase() === relativePath.toLowerCase()
  );
  if (!allowed) {
    return deny(`Gemini 범위 밖 변경 차단: ${relativePath}는 HANDOFF allowedPaths에 없습니다.`);
  }

  if (relativePath.toLowerCase() === "handoff.md") {
    if (toolName !== "write_file") {
      return deny("HANDOFF.md는 terminal COMPLETE/BLOCKED 응답으로 한 번만 전체 교체할 수 있습니다.");
    }

    const responseErrors = validateTerminalResponse(String(input.tool_input?.content || ""), metadata);
    if (responseErrors.length > 0) {
      return deny(`HANDOFF 응답 변조 차단: ${responseErrors.join(" ")}`);
    }

    const responseMetadata = require("./handoff-metadata.cjs").parseMetadata(input.tool_input.content);
    if (responseMetadata.status === "BLOCKED") return {};
  }

  let repoState;
  try {
    repoState = injectedRepoState || getGitState(projectRoot);
  } catch (error) {
    return deny(`Gemini 작업 트리 확인 실패: ${error.message}`);
  }

  const repoErrors = validateRepoState(metadata, repoState);
  if (repoErrors.length > 0) {
    return deny(`Gemini 작업 트리 불일치: ${repoErrors.join(" ")}`);
  }

  return {};
}

function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  process.stdout.write(`${JSON.stringify(evaluateWriteRequest(readInput(), projectRoot))}\n`);
}

if (require.main === module) main();

module.exports = { evaluateWriteRequest };
