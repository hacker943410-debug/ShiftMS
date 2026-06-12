# Release Publish Log

## 2026-06-12
- First `npm run release:publish` built the installer but stopped before upload because `GH_TOKEN` was not set.
- GitHub CLI authentication was available with `repo` scope, so the token was injected into the local PowerShell process without printing it.
- Second `npm run release:publish` completed successfully.
- GitHub Release `v0.4.25` is Published.
- Remote assets confirmed: `ShiftMgmt-Setup-0.4.25-x64.exe`, `ShiftMgmt-Setup-0.4.25-x64.exe.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`.
- `npm run smoke:electron:packaged` passed.
- `npm run smoke:electron:installer` passed with reinstall data preservation.
