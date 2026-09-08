param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Backup", "Restore")]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$BackupRoot,

  [string]$RoamingAppData = $env:APPDATA,

  # How many un-consumed backups from earlier runs are kept beside the current one.
  [int]$KeptUnrestoredBackupCount = 3
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
#
# The backup is written straight to a lasting place (the installer passes a path under
# %LOCALAPPDATA%), NOT to the installer's temp folder. A restore that stops halfway leaves the files
# it had not put back yet existing nowhere else, and $PLUGINSDIR is gone the moment the installer
# exits - so the backup has to outlive the installer by construction. Copying it somewhere safe
# AFTER the failure was the earlier attempt, and that copy can fail too, which is exactly when it is
# needed. Nothing is copied on failure now: the backup is simply left where it already is.
#
# Deliberately not under %APPDATA%: Get-ShiftMgmtUserDataDirectories reads every %APPDATA%\ShiftMgmt*
# folder as live user data, so a backup parked there would be picked up as a data directory by the
# next update.

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
  # Which databases this backup actually carries. Backup skips a file it cannot read, one at a time,
  # so a backup can hold a -wal/-shm whose own .sqlite never made it in. Restoring such a log next to
  # no database at all leaves a folder SQLite cannot open as the operator's data ("no such table").
  $backupDatabases = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $orphanedSidecars = New-Object 'System.Collections.Generic.List[string]'

  if (-not $OverwriteExisting) {
    foreach ($file in $files) {
      $probeDestination = Join-Path $TargetDirectory $file.FullName.Substring($prefix.Length)

      if ($probeDestination -match '\.sqlite$') {
        [void]$backupDatabases.Add($probeDestination)
        continue
      }

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

      if ($sidecarMatch.Success) {
        if ($liveDatabasesBeforeRestore.Contains($sidecarMatch.Groups['main'].Value)) {
          continue
        }

        if (-not $backupDatabases.Contains($sidecarMatch.Groups['main'].Value)) {
          # No live database and none in the backup either. The log alone restores nothing usable,
          # and finishing quietly would report success over a database that is simply gone.
          $orphanedSidecars.Add($destination)
          continue
        }
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

  # Raised last so that everything the backup CAN put back is already back. The caller keeps the
  # backup when this throws, which is the point: the database it names has to be recovered by hand.
  if ($orphanedSidecars.Count -gt 0) {
    throw ("Incomplete backup: no database to go with " + ($orphanedSidecars -join ", "))
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

# A backup still sitting here means its restore never finished, so it is the only copy of whatever
# that restore had not put back. Renaming it aside - never deleting it - lets this run make its own
# backup without writing over that one.
function Move-UnrestoredBackupAside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [Parameter(Mandatory = $true)]
    [int]$KeptCount
  )

  if (-not (Test-Path -LiteralPath $BackupPath)) {
    return
  }

  $parent = Split-Path -Path $BackupPath -Parent
  $name = Split-Path -Path $BackupPath -Leaf
  $keptPrefix = $name + "-unrestored-"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $asidePath = Join-Path $parent ($keptPrefix + $stamp)
  $suffix = 1

  while (Test-Path -LiteralPath $asidePath) {
    $asidePath = Join-Path $parent ($keptPrefix + $stamp + "-" + $suffix)
    $suffix += 1
  }

  Move-Item -LiteralPath $BackupPath -Destination $asidePath -Force
  Write-Output ("KEPT " + $asidePath)

  # Each one is a full copy of the user's data, so they cannot pile up without limit. Only the
  # oldest beyond the keep count go, and the ones most likely to still matter are the newest.
  $existing = @(
    Get-ChildItem -LiteralPath $parent -Directory -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name.StartsWith($keptPrefix, [System.StringComparison]::OrdinalIgnoreCase) } |
      Sort-Object -Property Name -Descending
  )

  if ($existing.Count -gt $KeptCount) {
    $existing | Select-Object -Skip $KeptCount | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

switch ($Mode) {
  "Backup" {
    Move-UnrestoredBackupAside -BackupPath $BackupRoot -KeptCount $KeptUnrestoredBackupCount
    Backup-ShiftMgmtUserData -SourceRoot $RoamingAppData -TargetRoot $BackupRoot
    exit 0
  }
  "Restore" {
    # No try/catch and nothing copied on failure. The backup already lives somewhere that outlives
    # the installer, so a restore that throws leaves it exactly where the operator is told to look.
    Restore-ShiftMgmtUserData -SourceRoot $BackupRoot -TargetRoot $RoamingAppData
    exit 0
  }
}
