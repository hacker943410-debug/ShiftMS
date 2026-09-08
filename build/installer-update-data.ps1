param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Backup", "Restore")]
  [string]$Mode,

  # Defaulted rather than passed in by the installer on purpose. NSIS resolves $LOCALAPPDATA against
  # the shell var context, and electron-builder's initMultiUser sets that context to `all` for an
  # all-users install - where $LOCALAPPDATA is C:\ProgramData, a folder every local user can read and
  # every local user shares. The backup holds the accounts and the database. Read here instead, from
  # the same process whose %APPDATA% is being backed up, so the copy always lands in the private
  # folder of the very user whose data it is.
  [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA "ShiftMgmt-update-backup"),

  [string]$RoamingAppData = $env:APPDATA
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

# The database a path belongs to: the .sqlite itself, or the .sqlite its -wal/-shm was written for.
# Returns nothing for anything that is not part of a database.
function Get-DatabaseMainPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ($Path -match '\.sqlite$') {
    return $Path
  }

  $sidecarMatch = [regex]::Match($Path, '^(?<main>.+\.sqlite)-(wal|shm)$')

  if ($sidecarMatch.Success) {
    return $sidecarMatch.Groups['main'].Value
  }

  return $null
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

  # A SQLite database is three files that only mean anything together: x.sqlite, x.sqlite-wal and
  # x.sqlite-shm. Deciding them one file at a time is what produced every database defect here so
  # far, so the whole group is judged once, up front, before a single byte is copied.
  #
  #   live database survived  -> touch nothing in that group. The backup's log was written against a
  #                              different run of the database and would rewrite rows that are
  #                              already correct.
  #   live database gone,
  #   backup has it           -> restore the group AS THE BACKUP HOLDS IT, and clear any log left
  #                              lying in the live folder. A log belongs to the database it was
  #                              written against; pairing a live log with a restored database reads
  #                              back values neither of them ever held. A log with no database of
  #                              its own cannot be read anyway, so nothing recoverable is lost.
  #   live database gone,
  #   backup has only logs    -> restore nothing and fail. Backup skips a file it cannot read one
  #                              at a time, so it can hold a log whose own .sqlite never made it in.
  #                              Putting that log back leaves a folder SQLite cannot open, and
  #                              exiting 0 would report it as a finished restore, then delete the
  #                              backup on the way out.
  $databaseGroups = @{}

  if (-not $OverwriteExisting) {
    foreach ($file in $files) {
      $probeDestination = Join-Path $TargetDirectory $file.FullName.Substring($prefix.Length)
      $probeMain = Get-DatabaseMainPath -Path $probeDestination

      if (-not $probeMain) {
        continue
      }

      $groupKey = $probeMain.ToLowerInvariant()

      if (-not $databaseGroups.ContainsKey($groupKey)) {
        $databaseGroups[$groupKey] = @{
          MainPath = $probeMain
          LiveMainSurvived = (Test-Path -LiteralPath $probeMain)
          BackupHasMain = $false
          BackupFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
          Cleared = $false
        }
      }

      $group = $databaseGroups[$groupKey]
      [void]$group.BackupFiles.Add($probeDestination)

      if ($probeDestination -eq $probeMain) {
        $group.BackupHasMain = $true
      }
    }

    foreach ($groupKey in @($databaseGroups.Keys)) {
      $group = $databaseGroups[$groupKey]

      if ($group.LiveMainSurvived) {
        $group.Action = "keep-live"
      } elseif ($group.BackupHasMain) {
        $group.Action = "restore-group"
      } else {
        $group.Action = "incomplete"
      }
    }
  }

  $incompleteDatabases = New-Object 'System.Collections.Generic.List[string]'

  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($prefix.Length)
    $destination = Join-Path $TargetDirectory $relativePath

    # The group verdict is read BEFORE the "already there, leave it alone" rule. Asking that
    # question first is what let a live log survive beside a restored database: the log was already
    # at the destination, so the loop skipped it and never reached the database check at all.
    $group = $null

    if (-not $OverwriteExisting) {
      $mainPath = Get-DatabaseMainPath -Path $destination

      if ($mainPath) {
        $group = $databaseGroups[$mainPath.ToLowerInvariant()]
      }
    }

    if ($group) {
      if ($group.Action -eq "keep-live") {
        continue
      }

      if ($group.Action -eq "incomplete") {
        if (-not $incompleteDatabases.Contains($group.MainPath)) {
          $incompleteDatabases.Add($group.MainPath)
        }

        continue
      }

      if (-not $group.Cleared) {
        foreach ($suffix in @("-wal", "-shm")) {
          $strayLog = $group.MainPath + $suffix

          if ((Test-Path -LiteralPath $strayLog) -and (-not $group.BackupFiles.Contains($strayLog))) {
            Remove-Item -LiteralPath $strayLog -Force
          }
        }

        $group.Cleared = $true
      }
    } elseif ((-not $OverwriteExisting) -and (Test-Path -LiteralPath $destination)) {
      continue
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
  if ($incompleteDatabases.Count -gt 0) {
    throw ("Incomplete backup: no database to go with the logs for " + ($incompleteDatabases -join ", "))
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
    [string]$LiveRoot
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

  # Then drop only the ones that can no longer contribute anything. A kept backup exists to fill in
  # files the live folder is MISSING, so once every file it holds is present live again, it has
  # nothing left to give and can go. Anything holding even one file the live folder does not have
  # is the only copy of that file and is never deleted - not on age, not on a count. Keeping the
  # three newest was the earlier rule and it deleted exactly that: the fourth failed update took
  # the oldest un-recovered data with it, and exited 0.
  Get-ChildItem -LiteralPath $parent -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.StartsWith($keptPrefix, [System.StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
      if (Test-KeptBackupIsRedundant -KeptPath $_.FullName -LiveRoot $LiveRoot) {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Output ("DROPPED " + $_.FullName)
      }
    }
}

# .NET rather than Get-FileHash: the installer runs powershell.exe with whatever module path the
# machine happens to have, and Get-FileHash lives in a module that is not always resolvable there.
# It failed exactly that way on this host, and the catch below then read it as "not identical".
function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)

  try {
    return [System.BitConverter]::ToString($algorithm.ComputeHash($stream))
  } finally {
    $stream.Dispose()
    $algorithm.Dispose()
  }
}

# True only when the live folder already holds every file this kept backup has, byte for byte.
# Same path is not enough: a kept backup is also what the operator is pointed at to recover by hand,
# so a file whose CONTENT only exists in here still has to survive. Size is checked first because it
# separates almost everything without reading either file.
function Test-KeptBackupIsRedundant {
  param(
    [Parameter(Mandatory = $true)]
    [string]$KeptPath,

    [Parameter(Mandatory = $true)]
    [string]$LiveRoot
  )

  if ([string]::IsNullOrWhiteSpace($LiveRoot) -or -not (Test-Path -LiteralPath $LiveRoot)) {
    return $false
  }

  $prefix = Get-RelativePathPrefix -DirectoryPath $KeptPath
  $keptFiles = @(
    Get-ChildItem -LiteralPath $KeptPath -Recurse -File -Force -ErrorAction SilentlyContinue
  )

  foreach ($keptFile in $keptFiles) {
    $liveEquivalent = Join-Path $LiveRoot $keptFile.FullName.Substring($prefix.Length)

    if (-not (Test-Path -LiteralPath $liveEquivalent)) {
      return $false
    }

    $liveFile = Get-Item -LiteralPath $liveEquivalent -Force -ErrorAction SilentlyContinue

    if (-not $liveFile -or $liveFile.Length -ne $keptFile.Length) {
      return $false
    }

    try {
      $keptHash = Get-FileSha256 -Path $keptFile.FullName
      $liveHash = Get-FileSha256 -Path $liveEquivalent
    } catch {
      # Could not read one of them to be sure. Keeping a backup costs disk; dropping one that still
      # held the only copy of something costs the operator's data.
      return $false
    }

    if ($keptHash -ne $liveHash) {
      return $false
    }
  }

  return $true
}

switch ($Mode) {
  "Backup" {
    Move-UnrestoredBackupAside -BackupPath $BackupRoot -LiveRoot $RoamingAppData
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
