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

# How many live write-ahead logs this run renamed aside instead of writing over. It decides two
# things at the end: whether the backup may be deleted, and which number the installer is handed.
$script:QuarantinedLogCount = 0

# EXIT CODES - the whole contract, in one place, because build/installer.nsh reads this number and
# nothing else:
#
#   0             the restore finished and nothing had to be set aside. The backup is deleted.
#   3             the restore finished, but at least one live log was renamed aside instead of being
#                 written over. The backup is KEPT one more cycle so the operator still has both
#                 halves, and the next run's redundancy judgement reclaims it once the live folder
#                 holds everything again.
#   anything else the restore did NOT finish. Nothing was deleted and the backup is still there.
#
# NOBACKUP and NODATA are printed on the exit-0 path only - there was no backup for this account, or
# nothing to copy. Neither is a failure.

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

# This script's own scratch: a staged copy waiting to be renamed into place, and the marker that
# says a group was caught halfway. Never operator data, so it is neither backed up nor restored.
function Test-IsRestoreScratchPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return ($Path -like "*.restore-part") -or ($Path -like "*.restore-incomplete")
}

function Get-RestoreMarkerPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MainPath
  )

  return ($MainPath + ".restore-incomplete")
}

# "The operator's database survived the install" - the only definition of it in this script.
# Test-Path on its own answered yes to a main this script had copied in itself and then died before
# finishing the rest of the group: from the outside a half-restored database is indistinguishable
# from a survivor, and calling it one leaves the old live log sitting beside a body it never
# belonged to, which reads back values neither file ever held.
function Test-LiveMainSurvivedInstall {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MainPath
  )

  if (-not (Test-Path -LiteralPath $MainPath)) {
    return $false
  }

  if (Test-Path -LiteralPath (Get-RestoreMarkerPath -MainPath $MainPath)) {
    return $false
  }

  return $true
}

# Can this exact path be replaced right now? Asked before anything is moved, never after. FileShare
# None is stricter than a rename needs, deliberately: the alternative is discovering halfway through
# a group that one of its three files could not be written, which is the state this whole design
# exists to make impossible. [System.IO.File] is mscorlib, so it cannot fail the way Get-FileHash
# did on the installer's powershell.exe.
function Test-PathIsReplaceable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  $stream = $null

  try {
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )

    return $true
  } catch {
    return $false
  } finally {
    if ($stream) {
      $stream.Dispose()
    }
  }
}

# Renames a live write-ahead log out of the way. It NEVER deletes: a log with anything in it is the
# one artefact that can hold commits the backup body does not have, because SQLite replays a log
# against whatever body sits next to it and the backup body is the same database one checkpoint
# older. The name it lands under - <log>-unrestored-<time> - is deliberately one Get-DatabaseMainPath
# does not recognise, so every later run treats it as an ordinary file and leaves it alone.
function Move-LiveLogAside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LogPath
  )

  $parent = Split-Path -Path $LogPath -Parent
  $name = Split-Path -Path $LogPath -Leaf
  $asidePrefix = $name + "-unrestored-"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $asidePath = Join-Path $parent ($asidePrefix + $stamp)
  $suffix = 1

  while (Test-Path -LiteralPath $asidePath) {
    $asidePath = Join-Path $parent ($asidePrefix + $stamp + "-" + $suffix)
    $suffix += 1
  }

  Move-Item -LiteralPath $LogPath -Destination $asidePath -Force
  $script:QuarantinedLogCount += 1
  Write-Output ("QUARANTINED " + $asidePath)
}

# The single place a database group is created, so both discovery passes produce the same shape and
# "the live main survived" has exactly one definition. The live pass adds no members - it only makes
# a database the backup holds no part of exist as a question that has to be answered.
function Get-OrAddDatabaseGroup {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Groups,

    [Parameter(Mandatory = $true)]
    [string]$MainPath
  )

  $groupKey = $MainPath.ToLowerInvariant()

  if (-not $Groups.ContainsKey($groupKey)) {
    $Groups[$groupKey] = @{
      MainPath = $MainPath
      LiveMainSurvived = (Test-LiveMainSurvivedInstall -MainPath $MainPath)
      BackupHasMain = $false
      BackupFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
      Members = New-Object 'System.Collections.Generic.List[object]'
    }
  }

  return $Groups[$groupKey]
}

# Which folder an enumeration error was raised about. PowerShell puts the name in the error record;
# when it is not there, naming the folder being walked still points the operator somewhere real.
function Add-UnreadableFolderNames {
  param(
    $ErrorRecords,

    [string]$Fallback,

    $Into
  )

  foreach ($errorRecord in @($ErrorRecords)) {
    $name = $null

    if ($errorRecord -and $errorRecord.CategoryInfo) {
      $name = $errorRecord.CategoryInfo.TargetName
    }

    if ([string]::IsNullOrWhiteSpace($name)) {
      $name = $Fallback
    }

    if (-not $Into.Contains($name)) {
      $Into.Add($name)
    }
  }
}

# The only code in this script that writes a database file. A group is three files that mean nothing
# apart - x.sqlite, x.sqlite-wal, x.sqlite-shm - so it goes back as ONE operation.
#
# Copying them one at a time is what made a stopped restore indistinguishable from a survivor: the
# backup's body was already sitting in the live folder next to the old live log, the retry read that
# as "the database survived the install", skipped the group in silence, exited 0 and deleted the
# backup that still held the matching pair.
#
# So there is a phase that touches no live path at all, and only then a commit phase.
#   (a) copy every member to <final>.restore-part - on any failure delete the parts and rethrow, so
#       the next attempt sees exactly the state this one started from;
#   (b) DECIDE what happens to the live sidecars, without doing any of it;
#   (c) prove every final name that (b) is not going to vacate can actually be replaced.
#   (d) write the marker; (e) carry out (b); (f) rename each part onto its final name - one
#       directory, so a rename and not a copy; (g) drop the marker.
# A death anywhere between (d) and (g) leaves the marker behind, and that is precisely what makes
# the next run's Test-LiveMainSurvivedInstall refuse to call the half-flipped main a survivor.
function Restore-DatabaseGroup {
  param(
    [Parameter(Mandatory = $true)]
    $Group
  )

  $walPath = $Group.MainPath + "-wal"
  $shmPath = $Group.MainPath + "-shm"
  $staged = New-Object 'System.Collections.Generic.List[object]'
  $sidecarsToDelete = New-Object 'System.Collections.Generic.List[string]'
  $vacatedPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $logToSetAside = $null

  try {
    # (a) Staging. Nothing written here is a name the app would ever open.
    foreach ($member in $Group.Members) {
      $destinationParent = Split-Path -Path $member.Destination -Parent

      if (-not (Test-Path -LiteralPath $destinationParent)) {
        New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
      }

      $stagedPath = $member.Destination + ".restore-part"

      Copy-Item -LiteralPath $member.Source -Destination $stagedPath -Force
      $staged.Add(@{ Staged = $stagedPath; Final = $member.Destination })
    }

    # (b) The live sidecars, decided and not yet acted on.
    #
    # A -wal with anything in it is set aside whether or not the backup has a log of its own. Not
    # only when the backup lacks one: when the backup HAS one, the rename in (f) would write over
    # the live log, and the live log can easily be the newer of the two. Deleting it - which is what
    # this used to do - was the script throwing away the newest data on the machine and then
    # reporting success.
    #
    # A 0-byte -wal has no header and no frames, so there is nothing in it to lose.
    #
    # A -shm is only a rebuildable index over the log, so a stale one must never sit beside a
    # restored body: it goes when the backup has none, and is replaced by the rename when it has one.
    $liveLog = Get-Item -LiteralPath $walPath -Force -ErrorAction SilentlyContinue

    if ($liveLog) {
      [void]$vacatedPaths.Add($walPath)

      if ($liveLog.Length -gt 0) {
        $logToSetAside = $walPath
      } else {
        $sidecarsToDelete.Add($walPath)
      }
    }

    if ((Test-Path -LiteralPath $shmPath) -and (-not $Group.BackupFiles.Contains($shmPath))) {
      [void]$vacatedPaths.Add($shmPath)
      $sidecarsToDelete.Add($shmPath)
    }

    # (c) Whatever (b) leaves standing has to be replaceable, and it has to be proved BEFORE the
    # first live byte moves. Asking afterwards is how a group ended up half restored. The paths (b)
    # is about to vacate are skipped: failing the whole restore over a live log that was never going
    # to be replaced would refuse a restore that can and should complete.
    foreach ($pair in $staged) {
      if ($vacatedPaths.Contains($pair.Final)) {
        continue
      }

      if (-not (Test-PathIsReplaceable -Path $pair.Final)) {
        throw ("Cannot replace " + $pair.Final + " - the database was left exactly as the install left it")
      }
    }
  } catch {
    foreach ($member in $Group.Members) {
      Remove-Item -LiteralPath ($member.Destination + ".restore-part") -Force -ErrorAction SilentlyContinue
    }

    throw
  }

  # COMMIT. From here to the last line the group is briefly inconsistent on disk, and the marker is
  # what says so out loud.
  $markerPath = Get-RestoreMarkerPath -MainPath $Group.MainPath

  Set-Content -LiteralPath $markerPath -Value $Group.MainPath -Encoding UTF8

  if ($logToSetAside) {
    Move-LiveLogAside -LogPath $logToSetAside
  }

  foreach ($sidecar in $sidecarsToDelete) {
    Remove-Item -LiteralPath $sidecar -Force
  }

  foreach ($pair in $staged) {
    Move-Item -LiteralPath $pair.Staged -Destination $pair.Final -Force
  }

  Remove-Item -LiteralPath $markerPath -Force
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

  # A restore now also visits a live user-data folder the backup never held, so the source can
  # legitimately not exist. Such a folder is then judged with an empty backup file list - which is
  # the point, because an orphan log in there still has to be noticed - instead of being skipped
  # unexamined.
  $sourceExists = Test-Path -LiteralPath $SourceDirectory

  if (-not (Test-Path -LiteralPath $TargetDirectory)) {
    New-Item -ItemType Directory -Force -Path $TargetDirectory | Out-Null
  }

  # A folder this process could not list is not evidence of anything. On a RESTORE that matters:
  # files silently never put back, then the backup deleted and exit 0 - the same shape of hole as a
  # kept backup called redundant on a walk that stopped early. On a BACKUP it stays a silent skip on
  # purpose: a safety copy is allowed to have gaps, and throwing there would abort the operator's
  # install over one folder with an odd ACL.
  $unreadableFolders = New-Object 'System.Collections.Generic.List[string]'

  # Empty folders matter too: imports\pending and imports\approved are watched, so the app expects
  # them to exist even with nothing in them.
  $childDirectories = @()
  $childDirectoryErrors = $null

  if ($sourceExists) {
    $childDirectories = @(
      Get-ChildItem -LiteralPath $SourceDirectory -Recurse -Directory -Force -ErrorAction SilentlyContinue -ErrorVariable childDirectoryErrors |
        Where-Object { -not (Test-IsRestoreScratchPath -Path $_.FullName) }
    )
  }

  if ((-not $OverwriteExisting) -and $childDirectoryErrors -and ($childDirectoryErrors.Count -gt 0)) {
    Add-UnreadableFolderNames -ErrorRecords $childDirectoryErrors -Fallback $SourceDirectory -Into $unreadableFolders
  }

  foreach ($childDirectory in $childDirectories) {
    $relativePath = $childDirectory.FullName.Substring($prefix.Length)
    $destination = Join-Path $TargetDirectory $relativePath

    if (-not (Test-Path -LiteralPath $destination)) {
      New-Item -ItemType Directory -Force -Path $destination | Out-Null
    }
  }

  $files = @()
  $fileErrors = $null

  if ($sourceExists) {
    $files = @(
      Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File -Force -ErrorAction SilentlyContinue -ErrorVariable fileErrors |
        Where-Object { -not (Test-IsRestoreScratchPath -Path $_.FullName) }
    )
  }

  if ((-not $OverwriteExisting) -and $fileErrors -and ($fileErrors.Count -gt 0)) {
    Add-UnreadableFolderNames -ErrorRecords $fileErrors -Fallback $SourceDirectory -Into $unreadableFolders
  }

  # A SQLite database is three files that only mean anything together: x.sqlite, x.sqlite-wal and
  # x.sqlite-shm. Deciding them one file at a time is what produced every database defect here so
  # far, so the whole group is judged once, up front, before a single byte is copied - and then put
  # back in one piece by Restore-DatabaseGroup.
  #
  # Groups are discovered from BOTH sides. Starting from the backup alone meant a database the
  # backup holds no part of formed no group at all, so nobody ever asked the question.
  #
  #   live database survived  -> touch nothing in that group, sidecars included. The backup's log was
  #                              written against a different run of the database and would rewrite
  #                              rows that are already correct.
  #   live database gone,
  #   backup has it           -> restore the group as the backup holds it, setting any live log with
  #                              content aside under a new name first. A log belongs to the database
  #                              it was written against, so it must not be paired with a restored
  #                              body - but it is not unreadable rubbish either. It is the one
  #                              artefact that can hold commits the backup body does not have, and
  #                              deleting it was this script losing the newest data on the machine
  #                              while reporting success.
  #   live database gone,
  #   neither side has it     -> restore nothing, change nothing, fail. Backup skips a file it cannot
  #                              read one at a time, so it can hold a log whose own .sqlite never
  #                              made it in - or nothing of that database at all. Exiting 0 there
  #                              would report a finished restore and delete the backup on the way out.
  $databaseGroups = @{}
  $incompleteDatabases = New-Object 'System.Collections.Generic.List[string]'

  if (-not $OverwriteExisting) {
    foreach ($file in $files) {
      $probeDestination = Join-Path $TargetDirectory $file.FullName.Substring($prefix.Length)
      $probeMain = Get-DatabaseMainPath -Path $probeDestination

      if (-not $probeMain) {
        continue
      }

      $group = Get-OrAddDatabaseGroup -Groups $databaseGroups -MainPath $probeMain

      [void]$group.BackupFiles.Add($probeDestination)
      $group.Members.Add(@{ Source = $file.FullName; Destination = $probeDestination })

      if ($probeDestination -eq $probeMain) {
        $group.BackupHasMain = $true
      }
    }

    $liveScanErrors = $null
    $liveFiles = @(
      Get-ChildItem -LiteralPath $TargetDirectory -Recurse -File -Force -ErrorAction SilentlyContinue -ErrorVariable liveScanErrors |
        Where-Object { -not (Test-IsRestoreScratchPath -Path $_.FullName) }
    )

    if ($liveScanErrors -and ($liveScanErrors.Count -gt 0)) {
      Add-UnreadableFolderNames -ErrorRecords $liveScanErrors -Fallback $TargetDirectory -Into $unreadableFolders
    }

    $livePrefix = Get-RelativePathPrefix -DirectoryPath $TargetDirectory

    foreach ($liveFile in $liveFiles) {
      # Re-projected through Join-Path $TargetDirectory, exactly the way the backup side is, so both
      # passes produce a byte-identical key and merge into ONE group instead of two.
      $liveCandidate = Join-Path $TargetDirectory $liveFile.FullName.Substring($livePrefix.Length)
      $liveMain = Get-DatabaseMainPath -Path $liveCandidate

      if (-not $liveMain) {
        continue
      }

      [void](Get-OrAddDatabaseGroup -Groups $databaseGroups -MainPath $liveMain)
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

      # Read off the group table, not out of the copy loop below. That loop walks BACKUP files, so it
      # could never name a database the backup holds nothing of - which is exactly the case that
      # used to slip through and exit 0.
      if ($group.Action -eq "incomplete") {
        $incompleteDatabases.Add($group.MainPath)
      }
    }
  }

  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($prefix.Length)
    $destination = Join-Path $TargetDirectory $relativePath

    if (-not $OverwriteExisting) {
      $mainPath = Get-DatabaseMainPath -Path $destination

      # The group verdict is read BEFORE the "already there, leave it alone" rule. Asking that
      # question first is what let a live log survive beside a restored database: the log was already
      # at the destination, so the loop skipped it and never reached the database check at all.
      # Database files are not copied here at all any more - whatever the verdict is, it is carried
      # out below, as one operation, or not at all.
      if ($mainPath -and $databaseGroups.ContainsKey($mainPath.ToLowerInvariant())) {
        continue
      }

      if (Test-Path -LiteralPath $destination) {
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

  # Databases last, so every plain file the backup can put back is already back before a group that
  # cannot be completed stops the run.
  if (-not $OverwriteExisting) {
    foreach ($groupKey in @($databaseGroups.Keys)) {
      $group = $databaseGroups[$groupKey]

      if ($group.Action -eq "restore-group") {
        Restore-DatabaseGroup -Group $group
      }
    }
  }

  # Raised last so that everything the backup CAN put back is already back. The caller keeps the
  # backup when this throws, which is the point: whatever they name has to be recovered by hand.
  if ($unreadableFolders.Count -gt 0) {
    throw ("Cannot read every folder that has to be checked before the backup is dropped: " + ($unreadableFolders -join ", "))
  }

  if ($incompleteDatabases.Count -gt 0) {
    throw ("Incomplete database: no .sqlite to go with the logs for " + ($incompleteDatabases -join ", "))
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
    # Nothing to copy. Said out loud for the same reason as NOBACKUP below: "there was nothing here"
    # and "it worked" have looked identical from outside this script for too long. Not a failure.
    Write-Output "NODATA"
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
    # No live folder is examined here, on purpose. A run with no backup to delete cannot commit the
    # mistake the live scan below exists to prevent, and inventing a failure here would fail every
    # update on every machine that simply has no earlier backup.
    Write-Output ("NOBACKUP " + $SourceRoot)
    return
  }

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null

  # The union of both sides, de-duplicated case-insensitively. Walking only the backup's own
  # subfolders left a live-only ShiftMgmt* folder unexamined, so an orphan log sitting in one was
  # never noticed and the backup was deleted anyway. A name only the live side has is handed a
  # source directory that does not exist, which Copy-DirectoryStructure judges with an empty backup
  # file list.
  $directoryNames = New-Object 'System.Collections.Generic.List[string]'
  $seenNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

  foreach ($directory in @(Get-ChildItem -LiteralPath $SourceRoot -Directory)) {
    if ($seenNames.Add($directory.Name)) {
      $directoryNames.Add($directory.Name)
    }
  }

  foreach ($directory in @(Get-ShiftMgmtUserDataDirectories -BasePath $TargetRoot)) {
    if ($seenNames.Add($directory.Name)) {
      $directoryNames.Add($directory.Name)
    }
  }

  foreach ($name in $directoryNames) {
    # Whatever survived the install wins. Never delete the live folder and never overwrite a file
    # that is already there - that is the whole point: an update must leave the database alone.
    Copy-DirectoryStructure `
      -SourceDirectory (Join-Path $SourceRoot $name) `
      -TargetDirectory (Join-Path $TargetRoot $name) `
      -SkipUnreadable $false `
      -OverwriteExisting $false
  }

  # A run that set a log aside could not prove where that log came from, so the operator now holds
  # two halves and a decision. Keeping the backup one more cycle keeps both halves; the next run's
  # redundancy judgement drops it once the live folder holds everything it has.
  if ($script:QuarantinedLogCount -eq 0) {
    Remove-Item -LiteralPath $SourceRoot -Recurse -Force
  }
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

        # Remove-Item's own failure is swallowed just above, so ask the filesystem instead of
        # assuming. A folder still standing here still holds everything it held, and a line saying
        # it was dropped is the one thing that would stop anyone going to look for it.
        if (Test-Path -LiteralPath $_.FullName) {
          Write-Output ("KEPT " + $_.FullName)
        } else {
          Write-Output ("DROPPED " + $_.FullName)
        }
      }
    }
}

# Two names for the same physical file, or two files that merely look alike? Same size and same
# hash answer the second question and are routinely mistaken for an answer to the first. Every live
# path here is a string built from $LiveRoot, and a junction, a symbolic link, a hard link, subst or
# a mapped drive can make that string land back inside the very backup being judged - where the
# comparison reads one file twice and agrees with itself.
#
# Opening the kept file with FileShare.None and then opening the live path proves they are two
# files: two names for one file cannot both open, because the first handle grants no sharing.
# Resolving link targets instead would catch junctions and symbolic links only; this catches hard
# links, subst and mapped drives with the same three lines. [System.IO.File] is mscorlib, so it
# cannot fail the way Get-FileHash did on the installer's powershell.exe.
#
# It cannot tell "the same file" apart from "another process is holding it open", and that is
# deliberate: both answers land on keep the backup.
function Test-FilesAreSeparateCopies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$KeptFilePath,

    [Parameter(Mandatory = $true)]
    [string]$LiveFilePath
  )

  $keptStream = $null
  $liveStream = $null

  try {
    $keptStream = [System.IO.File]::Open(
      $KeptFilePath,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::None
    )

    $liveStream = [System.IO.File]::Open(
      $LiveFilePath,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )

    return $true
  } catch {
    return $false
  } finally {
    if ($liveStream) {
      $liveStream.Dispose()
    }

    if ($keptStream) {
      $keptStream.Dispose()
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

# True only when the live folder already holds everything this kept backup has - every folder, and
# every file byte for byte in a file of its own. Same path is not enough: a kept backup is also what
# the operator is pointed at to recover by hand, so a file whose CONTENT only exists in here still
# has to survive.
#
# The answer authorises Remove-Item -Recurse -Force on what may be the only copy, so it is built out
# of evidence actually gathered. One walk, and it fails closed on each of three ways that walk can
# stop being evidence: an enumeration that raised anything, a reparse point it silently declined to
# look inside, and a folder it never thought to compare. None of the three covers the others - a
# junction raises no error and carries no denied ACL; a denied ACL carries no reparse attribute; an
# empty folder unique to the backup produces neither.
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

  # -ErrorAction SilentlyContinue on its own turns a folder this process cannot list - a denied ACL,
  # a path past 260 characters, a lock a scanner holds for a moment - into a SHORTER list and no
  # signal at all. Fewer entries seen then reads as "more redundant", which is backwards for a
  # question answered with a deletion. -ErrorVariable is what makes those errors visible; an
  # enumeration that was not complete cannot support any verdict but "keep it". Files AND folders,
  # in one walk: two walks would leave two places a later edit could half-fix, and this function has
  # been half-fixed twice already.
  $enumerationErrors = $null
  $keptEntries = @(
    Get-ChildItem -LiteralPath $KeptPath -Recurse -Force -ErrorAction SilentlyContinue -ErrorVariable enumerationErrors
  )

  if ($enumerationErrors.Count -gt 0) {
    return $false
  }

  foreach ($keptEntry in $keptEntries) {
    $liveEquivalent = Join-Path $LiveRoot $keptEntry.FullName.Substring($prefix.Length)

    # PowerShell 5.1 does not descend into a reparse point and raises NO error while declining, so
    # the gate above cannot see this one: whatever sits behind the link was never enumerated and
    # therefore never compared, and "the live folder holds everything this backup has" would be a
    # claim about files nobody looked at.
    if (($keptEntry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      return $false
    }

    if ($keptEntry.PSIsContainer) {
      # Folders are content. Backup copies empty ones on purpose - imports\pending and
      # imports\approved are watched, so the app expects them to exist with nothing in them - which
      # makes a folder only this backup has something the live side is still missing. -PathType
      # Container so a live FILE of that name cannot pass for the folder.
      if (-not (Test-Path -LiteralPath $liveEquivalent -PathType Container)) {
        return $false
      }

      continue
    }

    if (-not (Test-Path -LiteralPath $liveEquivalent)) {
      return $false
    }

    $liveFile = Get-Item -LiteralPath $liveEquivalent -Force -ErrorAction SilentlyContinue

    # Size first: it separates almost everything without reading either file.
    if (-not $liveFile -or $liveFile.Length -ne $keptEntry.Length) {
      return $false
    }

    # Before the hashing, not after. Identical bytes prove nothing when both reads land on one
    # physical file, and running the probe first also stops this function hashing that file twice.
    if (-not (Test-FilesAreSeparateCopies -KeptFilePath $keptEntry.FullName -LiveFilePath $liveEquivalent)) {
      return $false
    }

    try {
      $keptHash = Get-FileSha256 -Path $keptEntry.FullName
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

    # Finished, but not with nothing to say - see the exit-code contract at the top of this file.
    if ($script:QuarantinedLogCount -gt 0) {
      exit 3
    }

    exit 0
  }
}
