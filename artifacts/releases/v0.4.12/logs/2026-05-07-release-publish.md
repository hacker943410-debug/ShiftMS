# 2026-05-07 v0.4.12 Release Publish Log

## Commands
- `npm test`: timed out after 5 minutes before completion.
- `npm run release:publish`: first attempt built the installer but failed during GitHub upload because `GH_TOKEN` was not set.
- `$env:GH_TOKEN = (gh auth token).Trim(); npm run release:publish`: completed.

## Result
- Local installer: `release/ShiftMgmt-Setup-0.4.12-x64.exe`
- Local blockmap: `release/ShiftMgmt-Setup-0.4.12-x64.exe.blockmap`
- Local update metadata: `release/latest.yml`
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.12`
- Published assets: installer, blockmap, `latest.yml`, `RELEASE_MANIFEST.json`
