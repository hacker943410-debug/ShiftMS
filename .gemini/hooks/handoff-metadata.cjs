const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const metadataPattern = /<!--\s*GEMINI_HANDOFF_META\s*([\s\S]*?)\s*GEMINI_HANDOFF_META\s*-->/;

function parseMetadata(content) {
  const match = String(content).match(metadataPattern);

  if (!match) {
    throw new Error("GEMINI_HANDOFF_META가 없습니다.");
  }

  return JSON.parse(match[1]);
}

function readMetadata(projectRoot) {
  const handoffPath = path.join(projectRoot, "HANDOFF.md");

  if (!fs.existsSync(handoffPath)) {
    throw new Error("HANDOFF.md가 없습니다.");
  }

  return parseMetadata(fs.readFileSync(handoffPath, "utf8"));
}

function normalizeRelative(projectRoot, requestedPath) {
  const absolutePath = path.resolve(projectRoot, requestedPath);
  const relativePath = path.relative(projectRoot, absolutePath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep).join("/");
}

function normalizeEntry(entry, allowDirectory = false) {
  const normalized = String(entry).replace(/\\/g, "/").replace(/^\.\//, "");

  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("*")) {
    return null;
  }

  if (!allowDirectory && normalized.endsWith("/")) {
    return null;
  }

  return normalized;
}

function validateReadyMetadata(metadata) {
  const errors = [];

  if (metadata.schemaVersion !== 1) errors.push("schemaVersion은 1이어야 합니다.");
  if (metadata.status !== "READY") errors.push("status는 READY여야 합니다.");
  if (metadata.sender !== "Codex" || metadata.recipient !== "Gemini") {
    errors.push("sender/recipient는 Codex/Gemini여야 합니다.");
  }
  if (!/^R\d+$/.test(String(metadata.round || ""))) errors.push("round 형식이 잘못됐습니다.");
  if (!String(metadata.branch || "").trim()) errors.push("branch가 없습니다.");
  if (!/^[0-9a-f]{7,40}$/i.test(String(metadata.baseCommit || ""))) errors.push("baseCommit 형식이 잘못됐습니다.");

  for (const field of ["allowedPaths", "allowedDirtyPaths", "allowedCommands"]) {
    if (!Array.isArray(metadata[field])) errors.push(`${field}는 배열이어야 합니다.`);
  }

  if (Array.isArray(metadata.allowedPaths)) {
    for (const entry of metadata.allowedPaths) {
      if (!normalizeEntry(entry)) errors.push(`allowedPaths 항목이 정확한 파일 경로가 아닙니다: ${entry}`);
    }
  }

  if (Array.isArray(metadata.allowedDirtyPaths)) {
    for (const entry of metadata.allowedDirtyPaths) {
      if (!normalizeEntry(entry, true)) errors.push(`allowedDirtyPaths 항목이 잘못됐습니다: ${entry}`);
    }
  }

  if (Array.isArray(metadata.allowedCommands)) {
    for (const command of metadata.allowedCommands) {
      if (typeof command !== "string" || !command.trim() || command !== command.trim()) {
        errors.push("allowedCommands는 앞뒤 공백 없는 비어 있지 않은 문자열이어야 합니다.");
      }
    }
  }

  return errors;
}

function getGitState(projectRoot) {
  const git = (args) =>
    execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const status = git(["-c", "core.quotePath=false", "status", "--porcelain=v1"]);
  const dirtyPaths = [];

  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const value = line.slice(3).trim();
    for (const candidate of value.split(" -> ")) {
      dirtyPaths.push(candidate.replace(/^"|"$/g, "").replace(/\\/g, "/"));
    }
  }

  return {
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    dirtyPaths
  };
}

function entryMatches(relativePath, entry, allowDirectory = false) {
  const normalized = normalizeEntry(entry, allowDirectory);
  if (!normalized) return false;

  const candidate = relativePath.toLowerCase();
  const expected = normalized.toLowerCase();

  if (allowDirectory && expected.endsWith("/")) {
    return candidate.startsWith(expected);
  }

  return candidate === expected;
}

function validateRepoState(metadata, repoState) {
  const errors = [];

  if (repoState.branch !== metadata.branch) {
    errors.push(`branch 불일치: expected=${metadata.branch}, actual=${repoState.branch}`);
  }

  if (!repoState.head.toLowerCase().startsWith(metadata.baseCommit.toLowerCase())) {
    errors.push(`HEAD 불일치: expected=${metadata.baseCommit}, actual=${repoState.head}`);
  }

  for (const dirtyPath of repoState.dirtyPaths) {
    const allowedByTask = metadata.allowedPaths.some((entry) => entryMatches(dirtyPath, entry));
    const allowedAsBaseline = metadata.allowedDirtyPaths.some((entry) => entryMatches(dirtyPath, entry, true));

    if (!allowedByTask && !allowedAsBaseline) {
      errors.push(`허용하지 않은 기존 변경: ${dirtyPath}`);
    }
  }

  return errors;
}

function validateTerminalResponse(content, requestMetadata) {
  let response;

  try {
    response = parseMetadata(content);
  } catch (error) {
    return [`Gemini 응답 metadata 오류: ${error.message}`];
  }

  const errors = [];

  if (!/^(COMPLETE|BLOCKED)$/.test(String(response.status || ""))) {
    errors.push("응답 status는 COMPLETE 또는 BLOCKED여야 합니다.");
  }
  if (response.sender !== "Gemini" || response.recipient !== "Codex") {
    errors.push("응답 sender/recipient는 Gemini/Codex여야 합니다.");
  }

  for (const field of ["schemaVersion", "round", "branch", "baseCommit"]) {
    if (response[field] !== requestMetadata[field]) {
      errors.push(`응답 ${field}가 원 요청과 다릅니다.`);
    }
  }

  for (const field of ["allowedPaths", "allowedDirtyPaths", "allowedCommands"]) {
    if (!Array.isArray(response[field]) || response[field].length !== 0) {
      errors.push(`응답 ${field}는 빈 배열이어야 합니다.`);
    }
  }

  return errors;
}

module.exports = {
  getGitState,
  normalizeRelative,
  parseMetadata,
  readMetadata,
  validateReadyMetadata,
  validateRepoState,
  validateTerminalResponse
};
