param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Backup", "Restore")]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,

  [string]$RoamingAppData = $env:APPDATA,

  # Where a safety copy is parked when Restore cannot finish. Deliberately NOT under %APPDATA%:
  # Get-ShiftMgmtUserDataDirectories treats every %APPDATA%\ShiftMgmt* folder as live user data, so
  # a rescue copy left there would be picked up as a data directory by the next update.
  [string]$RescueRoot = (Join-Path $env:LOCALAPPDATA "ShiftMgmt-update-rescue")
)

$ErrorActionPreference = "Stop"

# An update replaces the app files under Program Files. It must never change what is in
# %APPDATA%\ShiftMgmt - that folder holds shiftmgmt.sqlite, the accounts and the import queue.
#
# This script used to delete the live folder and put a pre-install copy in its place. That is what
# made an update able to move the database backwards, and worse: if the copy back failed halfway
# (a locked file, a full disk, antivirus), the live folder was already gone and the only copy lived
# in the installer's temp folder, which Windows deletes the moment the installer exits. A silent
# auto-update would have taken the operator's data with no message at all.
#
# The backup is now a safety net and nothing more. Restore only puts back what is MISSING; anything
# that survived the install is left exactly as it is.

function Get-ShiftMgmtUserDataDirectories {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath
  )

  if ([string]::IsNullOrWhiteSpace($BasePath) -or -not (Test-Path -LiteralPath $BasePath)) {
    return @()
  }

  $knownNames = @("ShiftMgmt", "ShiftMgmt_V3.4", "shiftmgmt-v3-4")

  return Get-ChildItem -LiteralPath $BasePath -Directory |
    Where-Object {
      $knownNames -contains $_.Name -or
      $_.Name -like "ShiftMgmt*"
    } |
    Sort-Object -Property FullName -Unique
}

function Get-RelativePathPrefix {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DirectoryPath
  )

  $separator = [System.IO.Path]::DirectorySeparatorChar

  if ($DirectoryPath.EndsWith($separator)) {
    return $DirectoryPath
  }

  return $DirectoryPath + $separator
}

function Copy-DirectoryStructure {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDirectory,

    [Parameter(Mandatory = $true)]
    [string]$TargetDirectory,

    [Parameter(Mandatory = $true)]
    [bool]$SkipUnreadable,

    [Parameter(Mandatory = $true)]
    [bool]$OverwriteExisting
  )

  $prefix = Get-RelativePathPrefix -DirectoryPath $SourceDirectory

  if (-not (Test-Path -LiteralPath $TargetDirectory)) {
    New-Item -ItemType Directory -Force -Path $TargetDirectory | Out-Null
  }

  # Empty folders matter too: imports\pending and imports\approved are watched, so the app expects
  # them to exist even with nothing in them.
  $childDirectories = @(
    Get-ChildItem -LiteralPath $SourceDirectory -Recurse -Directory -Force -ErrorAction SilentlyContinue
  )

  foreach ($childDirectory in $childDirectories) {
    $relativePath = $childDirectory.FullName.Substring($prefix.Length)
    $destination = Join-Path $TargetDirectory $relativePath

    if (-not (Test-Path -LiteralPath $destination)) {
      New-Item -ItemType Directory -Force -Path $destination | Out-Null
    }
  }

  $files = @(
    Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File -Force -ErrorAction SilentlyContinue
  )

  # Which databases were already alive BEFORE this restore copied anything. The sidecar rule below
  # has to ask exactly that question. Asking "does the database exist right now" answered yes for a
  # database this very loop had just put back one file earlier - the walk reaches x.sqlite before
  # x.sqlite-wal - so the log was skipped and the restored database came back missing every
  # transaction that had not been checkpointed yet. Approvals live in those transactions.
  $liveDatabasesBeforeRestore = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

  if (-not $OverwriteExisting) {
    foreach ($file in $files) {
      $probeDestination = Join-Path $TargetDirectory $file.FullName.Substring($prefix.Length)
      $probeMatch = [regex]::Match($probeDestination, '^(?<main>.+\.sqlite)-(wal|shm)$')

      if ($probeMatch.Success -and (Test-Path -LiteralPath $probeMatch.Groups['main'].Value)) {
        [void]$liveDatabasesBeforeRestore.Add($probeMatch.Groups['main'].Value)
      }
    }
  }

  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($prefix.Length)
    $destination = Join-Path $TargetDirectory $relativePath

    if ((-not $OverwriteExisting) -and (Test-Path -LiteralPath $destination)) {
      continue
    }

    # SQLite keeps its write-ahead log beside the database. Dropping a backup's -wal/-shm next to a
    # database that survived the install would pair it with a log it never wrote, so those are only
    # brought along when the database itself was missing and is being restored from the same backup.
    if (-not $OverwriteExisting) {
      $sidecarMatch = [regex]::Match($destination, '^(?<main>.+\.sqlite)-(wal|shm)$')

      if ($sidecarMatch.Success -and $liveDatabasesBeforeRestore.Contains($sidecarMatch.Groups['main'].Value)) {
        continue
      }
    }

    $destinationParent = Split-Path -Path $destination -Parent

    if (-not (Test-Path -LiteralPath $destinationParent)) {
      New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    }

    if ($SkipUnreadable) {
      try {
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force -ErrorAction Stop
      } catch {
        # A workbook the operator still has open in Excel must not fail the whole update. The live
        # file is not going anywhere, so a gap in the safety net is survivable.
        Write-Output ("SKIPPED " + $file.FullName)
      }
    } else {
      Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
  }
}

function Backup-ShiftMgmtUserData {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,

    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
  )

  $directories = Get-ShiftMgmtUserDataDirectories -BasePath $SourceRoot

  if ($directories.Count -eq 0) {
    return
  }

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

  foreach ($directory in $directories) {
    $targetPath = Join-Path $TargetRoot $directory.Name

    if (Test-Path -LiteralPath $targetPath) {
      Remove-Item -LiteralPath $targetPath -Recurse -Force
    }

    Copy-DirectoryStructure `
      -SourceDirectory $directory.FullName `
      -TargetDirectory $targetPath `
      -SkipUnreadable $true `
      -OverwriteExisting $true
  }
}

function Restore-ShiftMgmtUserData {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,

    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
  )

  if (-not (Test-Path -LiteralPath $SourceRoot)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  $directories = Get-ChildItem -LiteralPath $SourceRoot -Directory

  foreach ($directory in $directories) {
    $targetPath = Join-Path $TargetRoot $directory.Name

    # Whatever survived the install wins. Never delete the live folder and never overwrite a file
    # that is already there - that is the whole point: an update must leave the database alone.
    Copy-DirectoryStructure `
      -SourceDirectory $directory.FullName `
      -TargetDirectory $targetPath `
      -SkipUnreadable $false `
      -OverwriteExisting $false
  }

  Remove-Item -LiteralPath $SourceRoot -Recurse -Force
}

function Save-FailedRestoreCopy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,

    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
  )

  if ([string]::IsNullOrWhiteSpace($TargetRoot) -or -not (Test-Path -LiteralPath $SourceRoot)) {
    return
  }

  $destination = Join-Path $TargetRoot (Get-Date -Format "yyyyMMdd-HHmmss")

  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  # The backup root's own contents, not the root folder itself - copying the folder into an
  # existing destination would bury the data one level deeper than the operator is told to look.
  Copy-Item -Path (Join-Path $SourceRoot "*") -Destination $destination -Recurse -Force
  Write-Output ("RESCUE " + $destination)
}

switch ($Mode) {
  "Backup" {
    Backup-ShiftMgmtUserData -SourceRoot $RoamingAppData -TargetRoot $BackupRoot
    exit 0
  }
  "Restore" {
    try {
      Restore-ShiftMgmtUserData -SourceRoot $BackupRoot -TargetRoot $RoamingAppData
    } catch {
      # The backup lives in the installer's temp folder, which Windows deletes the moment the
      # installer exits. If the restore stops halfway, the files it had not put back yet exist
      # nowhere else - so park a copy somewhere that outlives the installer before failing.
      Save-FailedRestoreCopy -SourceRoot $BackupRoot -TargetRoot $RescueRoot
      throw
    }

    exit 0
  }
}
