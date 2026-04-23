import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveReleasePublishContext } = require("./lib/release-publish-helpers.cjs");

const projectRoot = process.cwd();
const githubOwner = "hacker943410-debug";
const githubRepo = "ShiftMgmt_V3.4";

const buildApiUrl = (suffix) => `https://api.github.com${suffix}`;

const createGitHubHeaders = (token, additional = {}) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "ShiftMgmt-Release-Publisher",
  ...additional
});

const resolveUploadUrl = (template, fileName) => {
  const baseUrl = template.split("{", 1)[0];
  return `${baseUrl}?name=${encodeURIComponent(fileName)}`;
};

const findAssetByName = (assets, fileName) =>
  Array.isArray(assets) ? assets.find((asset) => asset.name === fileName) : undefined;

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  const context = resolveReleasePublishContext(projectRoot);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          version: context.version,
          tagName: context.tagName,
          releaseDocPath: path.relative(projectRoot, context.releaseDocPath),
          releaseManifestPath: path.relative(projectRoot, context.releaseManifestPath)
        },
        null,
        2
      )
    );
    return;
  }

  const token = process.env.GH_TOKEN?.trim();

  if (!token) {
    throw new Error("GH_TOKEN 환경 변수가 필요합니다.");
  }

  const releaseResponse = await fetch(
    buildApiUrl(`/repos/${githubOwner}/${githubRepo}/releases/tags/${context.tagName}`),
    {
      headers: createGitHubHeaders(token)
    }
  );

  if (!releaseResponse.ok) {
    throw new Error(`GitHub Release 조회 실패 (${releaseResponse.status})`);
  }

  const release = await releaseResponse.json();
  const existingAsset = findAssetByName(release.assets, context.releaseManifestAssetName);

  if (existingAsset?.id) {
    const deleteResponse = await fetch(
      buildApiUrl(`/repos/${githubOwner}/${githubRepo}/releases/assets/${existingAsset.id}`),
      {
        method: "DELETE",
        headers: createGitHubHeaders(token)
      }
    );

    if (!deleteResponse.ok) {
      throw new Error(`기존 릴리즈 매니페스트 삭제 실패 (${deleteResponse.status})`);
    }
  }

  const updateReleaseResponse = await fetch(
    buildApiUrl(`/repos/${githubOwner}/${githubRepo}/releases/${release.id}`),
    {
      method: "PATCH",
      headers: createGitHubHeaders(token, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        body: context.releaseBody,
        name: context.tagName,
        tag_name: context.tagName
      })
    }
  );

  if (!updateReleaseResponse.ok) {
    throw new Error(`GitHub Release 본문 갱신 실패 (${updateReleaseResponse.status})`);
  }

  const uploadResponse = await fetch(
    resolveUploadUrl(release.upload_url, context.releaseManifestAssetName),
    {
      method: "POST",
      headers: createGitHubHeaders(token, {
        "Content-Type": "application/json"
      }),
      body: context.releaseManifestText
    }
  );

  if (!uploadResponse.ok) {
    throw new Error(`릴리즈 매니페스트 업로드 실패 (${uploadResponse.status})`);
  }

  const publishReleaseResponse = await fetch(
    buildApiUrl(`/repos/${githubOwner}/${githubRepo}/releases/${release.id}`),
    {
      method: "PATCH",
      headers: createGitHubHeaders(token, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        draft: false,
        prerelease: false
      })
    }
  );

  if (!publishReleaseResponse.ok) {
    throw new Error(`GitHub Release 공개 게시 실패 (${publishReleaseResponse.status})`);
  }

  console.log(
    `RELEASE_PUBLISHED version=${context.version} asset=${context.releaseManifestAssetName}`
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
