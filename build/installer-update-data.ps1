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

# How much of the live folder this run renamed aside instead of writing over or deleting, and which
# folders inside the LIVE user data it could not finish listing. Together they decide two things at
# the end: whether the backup may be deleted, and which number the installer is handed.
$script:SetAsideCount = 0
$script:UncheckedLiveFolders = New-Object 'System.Collections.Generic.List[string]'

# EXIT CODES - the whole contract, in one place, because build/installer.nsh reads this number and
# nothing else:
#
#   0             the restore finished and nothing had to be set aside. The backup is deleted.
#   3             the restore finished, but something live was renamed aside instead of being
#                 written over: a log that can hold commits, or whatever else was sitting at a log's
#                 or an index's name - a folder, a link - which is set aside rather than removed
#                 because it may be holding the operator's own files. The backup is KEPT one more
#                 cycle so the operator still has both halves, and the next run's redundancy
#                 judgement reclaims it once the live folder holds everything again.
#   4             the restore finished and put everything back, but a folder inside the LIVE user
#                 data could not be listed, so this run cannot say the backup holds nothing the live
#                 folder is still missing. Nothing failed and nothing was set aside; the backup is
#                 simply KEPT until a run can read that folder. A folder in the BACKUP that cannot
#                 be listed is a different answer - there the files really may never have been put
#                 back - and stays a plain failure.
#   anything else the restore did NOT finish. Nothing was deleted and the backup is still there.
#
# NOBACKUP and NODATA are printed on the exit-0 path only - there was no backup for this account, or
# nothing to copy. Neither is a failure.
#
# THE EXIT CODE IS THE ONLY THING THAT LEAVES THIS SCRIPT. Everything printed here - UNCHECKED,
# QUARANTINED, KEPT, DROPPED, SKIPPED, NOBACKUP, NODATA - reaches nobody today: build/installer.nsh
# runs this file with nsExec::ExecToStack, which puts the output on the NSIS stack, and then pops
# the exit code alone; there is no ExecToLog, no DetailPrint, and electron-builder leaves NSIS
# logging out of the build unless nsis.customNsisBinary.debugLogging is set, which package.json
# does not set. Measured in a compiled NSIS installer using this same call shape: the second Pop
# does hand back both printed lines and the exit code survives - so one more Pop is all it would
# take - but until installer.nsh does that, these lines are for the tests and for anyone running
# this script by hand. Do not write a comment, a document or a dialog that assumes an operator or a
# maintainer can read them.

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

# Frees one of this script's own scratch names, and answers whether the name is free afterwards.
#
# It never asks what SHAPE is standing there, and that is the point. The shape that has to be
# stopped - a second name for a file the operator keeps elsewhere, which Copy-Item writes THROUGH -
# is invisible whenever another process holds that file open, because the only way to see a hard
# link from here is $Item.LinkType and PowerShell computes it by opening the file. Measured on this
# host: the same fresh hard link reads LinkType "HardLink" unheld and "" while a handle that denies
# reads is open on its other name. A guard built on it is therefore off exactly when somebody else
# is using the operator's file. The two questions asked here need no attribute at all, and Test-Path
# answered yes for all eleven shapes actually planted at such a name on this host - a hard link with
# a handle held on its other name, and a link whose target is already gone, included - and no only
# for the twelfth, where nothing was there.
#
# Removing the NAME is content-preserving for all of them: a second name leaves the file's other
# name and its bytes untouched, a link leaves whatever it points at untouched, and an empty
# directory holds nothing to lose. A directory with children in it is left exactly alone - those
# files are not this run's work, and Remove-Item -Force on one also asks a question no installer is
# there to answer, which came out as a raw .NET error in the middle of the operator's install log.
# Whatever is still standing afterwards - a name another process is holding - is reported occupied,
# and the caller refuses instead of writing anywhere near it.
function Clear-RestoreScratchName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  $children = @()

  if (Test-Path -LiteralPath $Path -PathType Container) {
    $children = @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue)
  }

  if ($children.Count -eq 0) {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  }

  return (-not (Test-Path -LiteralPath $Path))
}

# How many bytes are in the file at this path, or -1 for anything that is not a file this process
# can look at: absent, a directory, or unreadable. Asked wherever "is there anything in it" decides
# what happens to operator data, so the not-a-file answer has to be a value the callers can compare
# rather than an exception halfway through a group.
function Get-FileLength {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue

  if ((-not $item) -or $item.PSIsContainer) {
    return -1
  }

  return $item.Length
}

# A file and only a file: not a folder, and not a name that is really pointing at something else -
# a symbolic link, a junction, or a second name for a file the operator keeps somewhere else. It is
# the only shape this script may write over, rename, or delete by name, because for every other
# shape the commands used here act on something other than the name in front of them: Copy-Item
# writes THROUGH a link into whatever it points at, and INSIDE a folder of that name; Move-Item
# -Force buries a file inside such a folder instead of replacing it; and Remove-Item -Force on a
# folder with children asks a question no installer is there to answer (measured: a child
# powershell.exe sat on one for over three minutes).
#
# Two tests rather than one, on purpose. The ReparsePoint attribute is mscorlib and is there on
# every PowerShell; it catches symbolic links and junctions. LinkType is what the FileSystem
# provider adds in PowerShell 5 and is the only way to see a HARD link from here - a hard link
# carries no attribute of its own, so a name that is a second name for the operator's payroll file
# is indistinguishable from an ordinary file without it. Where the property does not exist, or
# cannot be answered because another process holds the file, it reads as nothing and this degrades
# to the attribute test alone - never to something that says "plain file" about a folder or a link.
#
# That degradation is why nothing that WRITES may rest on this answer. The staged name - the one
# place a copy is written - does not ask it at all: Clear-RestoreScratchName frees that name or the
# restore refuses, and neither half needs an attribute to be readable. What is left here decides
# between renaming a live sidecar aside and deleting it, and both of those act on the name alone,
# so a hard link read here as a plain file still loses nothing at the other end.
function Test-ItemIsPlainFile {
  param(
    $Item
  )

  if ((-not $Item) -or $Item.PSIsContainer) {
    return $false
  }

  if (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    return $false
  }

  $linkType = $null

  try {
    $linkType = $Item.LinkType
  } catch {
    $linkType = $null
  }

  return [string]::IsNullOrEmpty($linkType)
}

# "The operator's database survived the install" - the only definition of it in this script.
# Test-Path on its own answered yes to three things that are not a surviving database, and every one
# of them ends the same way: the group is skipped, the run exits 0, and the backup that held the
# only real copy is deleted on the way out.
#
#   - a main this script copied in itself and then died before finishing the rest of the group. From
#     the outside a half-restored database is indistinguishable from a survivor, and calling it one
#     leaves the old live log sitting beside a body it never belonged to, which reads back values
#     neither file ever held. The marker beside the main is what says so out loud.
#   - a DIRECTORY carrying the database's name. Nothing can be read out of one, and every later
#     update reads it as a survivor again.
#   - a 0-byte file where the backup's own copy has something in it. An empty file is what the app
#     creates on its next start once the database is gone, so calling it a survivor throws away the
#     backup that still holds the rows.
#
# All three fail towards restoring from a backup that was about to be deleted anyway.
function Test-LiveMainSurvivedInstall {
  param(
    [Parameter(Mandatory = $true)]
    [string]$MainPath,

    # How many bytes the backup's own copy of this main has, or -1 when the backup holds no copy.
    [long]$BackupMainLength = -1
  )

  if (-not (Test-Path -LiteralPath $MainPath -PathType Leaf)) {
    return $false
  }

  if (Test-Path -LiteralPath (Get-RestoreMarkerPath -MainPath $MainPath)) {
    return $false
  }

  if (($BackupMainLength -gt 0) -and ((Get-FileLength -Path $MainPath) -le 0)) {
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

# The same bytes on both paths. Size first, because it separates almost everything without reading
# either file. Anything that cannot be answered - a path that is not a file, a read that throws -
# answers "not the same", and every caller here treats that as the preserving direction.
function Test-FilesHaveSameContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LeftPath,

    [Parameter(Mandatory = $true)]
    [string]$RightPath
  )

  $leftLength = Get-FileLength -Path $LeftPath

  if (($leftLength -lt 0) -or ($leftLength -ne (Get-FileLength -Path $RightPath))) {
    return $false
  }

  try {
    return ((Get-FileSha256 -Path $LeftPath) -eq (Get-FileSha256 -Path $RightPath))
  } catch {
    return $false
  }
}

# Renames whatever is sitting at a live sidecar's name out of the way. It NEVER deletes. A log with
# anything in it is the one artefact that can hold commits the backup body does not have, because
# SQLite replays a log against whatever body sits next to it and the backup body is the same
# database one checkpoint older. Anything that is not a plain file arrives here for a different
# reason and gets the same answer: a folder or a link at a sidecar's name may be holding the
# operator's own files, and leaving it standing hands the app a database it cannot open. Renaming
# is the one operation that is safe for every one of those shapes.
# The name it lands under - <name>-unrestored-<time> - is deliberately one Get-DatabaseMainPath does
# not recognise, so every later run treats it as an ordinary file and leaves it alone.
function Move-LiveSidecarAside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SidecarPath
  )

  $parent = Split-Path -Path $SidecarPath -Parent
  $name = Split-Path -Path $SidecarPath -Leaf
  $asidePrefix = $name + "-unrestored-"
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $asidePath = Join-Path $parent ($asidePrefix + $stamp)
  $suffix = 1

  while (Test-Path -LiteralPath $asidePath) {
    $asidePath = Join-Path $parent ($asidePrefix + $stamp + "-" + $suffix)
    $suffix += 1
  }

  Move-Item -LiteralPath $SidecarPath -Destination $asidePath -Force
  $script:SetAsideCount += 1
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
      # Answered once in the verdict pass, not here: judging a 0-byte live main needs the backup's
      # own copy of it, and that member may not have been discovered yet. Nothing reads this field
      # before the verdict pass, and nothing has written to the live folder by then either.
      LiveMainSurvived = $false
      BackupHasMain = $false
      Members = New-Object 'System.Collections.Generic.List[object]'
    }
  }

  return $Groups[$groupKey]
}

# The backup file a member of this group would be restored FROM, or nothing when the backup holds
# no such member. Both discovery passes key a member by where it would LAND, so this one lookup
# answers "does the backup have this database's log / body, and where is it".
function Get-GroupMemberSource {
  param(
    [Parameter(Mandatory = $true)]
    $Group,

    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  foreach ($member in $Group.Members) {
    if ($member.Destination -eq $Destination) {
      return $member.Source
    }
  }

  return $null
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

# The one place a live sidecar's fate is decided, asked the same way for the -wal and for the -shm.
# They used to be two hand-written branches eight lines apart, and that is exactly how they drifted:
# a guard added to the first was left off the second, so a folder at the -wal name was skipped
# entirely - the restore reported success and deleted the backup, leaving the app a database it
# cannot open - while a folder at the -shm name walked into Remove-Item and came back as a raw .NET
# error in the middle of the operator's install log. One function, one loop, no third place to
# forget.
#
# Nothing here writes anything. It answers with a word and the caller carries it out:
#
#   none       nothing is at that name.
#   set-aside  something is there that must be neither written over nor deleted. A log with content
#              is the one artefact that can hold commits the backup body does not have. Anything
#              that is not a plain file is here for the other reason: it may be holding the
#              operator's own files, and it must not be left standing at a name the app is about to
#              open either.
#   drop       a leftover that provably carries nothing: a 0-byte log (no header, no frames), or an
#              index. A -shm is only a rebuildable view over the log, so a live one that is not
#              already the copy about to be restored is stale whether or not the backup holds a
#              copy of it, and a stale index must never sit beside a restored body.
#   leave      the live file IS the copy this same install made minutes ago, byte for byte.
#              Replacing it with a copy of itself changes nothing on disk, so the group is restored
#              AROUND it: not staged, not renamed, not deleted - and therefore never required to be
#              replaceable, which is the whole point. Setting it aside instead left the operator a
#              duplicate nobody removes, a dialog about nothing, and one full-size backup kept for
#              good; putting it under the replaceability gate instead turned a completed restore
#              into a refusal - and no database at all - over nothing worse than a read-only bit.
#
# "leave" and "drop" are both asked of BOTH sidecars, and that is the fix for the way this drifted
# the first time. "leave" used to be reachable only for the -wal, and the -shm's own last answer was
# "the backup holds a copy, so rename over it" - which put a read-only or briefly held live index
# through the replaceability gate and refused the WHOLE restore, leaving no database at all. That is
# word for word the refusal the -wal's justification above exists to prevent, and an index is the
# safer of the two to relax about: it carries no commits by definition, and the run was going to
# overwrite it anyway. So it gets the same two answers instead of a branch of its own.
function Get-LiveSidecarDisposition {
  param(
    [Parameter(Mandatory = $true)]
    $Group,

    [Parameter(Mandatory = $true)]
    [string]$SidecarPath,

    # The only difference between the two sidecars, so it is the only thing this parameter says.
    [Parameter(Mandatory = $true)]
    [bool]$CanHoldCommits
  )

  $live = Get-Item -LiteralPath $SidecarPath -Force -ErrorAction SilentlyContinue

  if (-not $live) {
    return "none"
  }

  if (-not (Test-ItemIsPlainFile -Item $live)) {
    return "set-aside"
  }

  $backupSource = Get-GroupMemberSource -Group $Group -Destination $SidecarPath

  # A log with nothing in it has no header and no frames, so there is nothing in it to weigh against
  # the backup's copy. A log only: an empty index is still an index and is answered below.
  if ($CanHoldCommits -and ($live.Length -eq 0)) {
    return "drop"
  }

  if (($null -ne $backupSource) -and
      (Test-FilesHaveSameContent -LeftPath $SidecarPath -RightPath $backupSource)) {
    return "leave"
  }

  if ($CanHoldCommits) {
    return "set-aside"
  }

  return "drop"
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
#   (a) DECIDE what happens to each live sidecar, without doing any of it. FIRST, because one of the
#       answers is "leave it exactly as it is", and that answer also means the backup's own copy of
#       it is never staged, never flipped, and never has to be proved replaceable;
#   (b) copy every member (a) did not exempt to <final>.restore-part - on any failure delete the
#       parts and rethrow, so the next attempt sees exactly the state this one started from;
#   (c) prove every final name that (a) is not going to vacate can actually be replaced.
#   (d) write the marker; (e) carry out (a); (f) rename each part onto its final name - one
#       directory, so a rename and not a copy; (g) drop the marker.
# A death anywhere between (d) and (g) leaves the marker behind, and that is precisely what makes
# the next run's Test-LiveMainSurvivedInstall refuse to call the half-flipped main a survivor.
function Restore-DatabaseGroup {
  param(
    [Parameter(Mandatory = $true)]
    $Group
  )

  $staged = New-Object 'System.Collections.Generic.List[object]'
  $sidecarsToDelete = New-Object 'System.Collections.Generic.List[string]'
  $sidecarsToSetAside = New-Object 'System.Collections.Generic.List[string]'
  $vacatedPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $leftAlonePaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

  # (a) The live sidecars, decided and not yet acted on - both of them, through one function and one
  # loop. A -wal can hold commits and a -shm cannot; everything else about them is the same
  # question, and asking it in two hand-written places is what let one of the two be fixed alone.
  foreach ($sidecar in @(
      @{ Path = ($Group.MainPath + "-wal"); CanHoldCommits = $true },
      @{ Path = ($Group.MainPath + "-shm"); CanHoldCommits = $false }
    )) {
    $disposition = Get-LiveSidecarDisposition `
      -Group $Group `
      -SidecarPath $sidecar.Path `
      -CanHoldCommits $sidecar.CanHoldCommits

    if ($disposition -eq "set-aside") {
      [void]$vacatedPaths.Add($sidecar.Path)
      $sidecarsToSetAside.Add($sidecar.Path)
    } elseif ($disposition -eq "drop") {
      [void]$vacatedPaths.Add($sidecar.Path)
      $sidecarsToDelete.Add($sidecar.Path)
    } elseif ($disposition -eq "leave") {
      [void]$leftAlonePaths.Add($sidecar.Path)
    }
  }

  try {
    # (b) Staging. Nothing written here is a name the app would ever open.
    foreach ($member in $Group.Members) {
      # The live file at this name IS this copy, byte for byte. Staging it would only produce a
      # rename onto itself - and a rename that has to be proved possible first, which is how a
      # read-only bit on a file nobody needed to touch came to refuse a whole restore.
      if ($leftAlonePaths.Contains($member.Destination)) {
        continue
      }

      $destinationParent = Split-Path -Path $member.Destination -Parent

      if (-not (Test-Path -LiteralPath $destinationParent)) {
        New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
      }

      $stagedPath = $member.Destination + ".restore-part"

      # This name is scratch this run creates and renames away, so nothing should ever already be
      # standing at it. Whatever is, is cleared by NAME first and the copy below then creates a new
      # file - never one written into something that was already there. Copy-Item onto a DIRECTORY
      # of that name copies the file INSIDE it, and the flip in (f) would then rename that directory
      # onto the database's own name: a folder called shiftmgmt.sqlite with the body buried in it,
      # reported as a finished restore, backup deleted. Onto a LINK it writes straight through into
      # whatever the operator pointed it at, destroying that file with no message and leaving the
      # database's name a reparse point, which the size check after the flip cannot see (both sides
      # of it read 0). Telling WHICH of those is standing there needs an attribute that is not
      # always readable, so this does not ask: it frees the name, or it refuses.
      if (-not (Clear-RestoreScratchName -Path $stagedPath)) {
        throw (
          "Cannot stage " + $member.Destination +
          " - something that is not this update's own file is in the way at " + $stagedPath
        )
      }

      Copy-Item -LiteralPath $member.Source -Destination $stagedPath -Force
      $staged.Add(@{ Staged = $stagedPath; Final = $member.Destination })
    }

    # (c) Whatever (a) leaves standing has to be replaceable, and it has to be proved BEFORE the
    # first live byte moves. Asking afterwards is how a group ended up half restored. The paths (a)
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
    # The same rule the staging step above uses, so a name this run could not free and a name it
    # did create are cleared by one rule rather than by two that can drift apart. Everything a
    # refusal leaves behind is cleared here, which is what lets the next update finish without
    # anybody's help.
    foreach ($member in $Group.Members) {
      [void](Clear-RestoreScratchName -Path ($member.Destination + ".restore-part"))
    }

    throw
  }

  # COMMIT. From here to the last line the group is briefly inconsistent on disk, and the marker is
  # what says so out loud.
  $markerPath = Get-RestoreMarkerPath -MainPath $Group.MainPath

  # The marker is scratch this run owns, exactly like the staged copies above, so its name is FREED
  # before anything is written to it - never written to whatever happens to stand there. Set-Content
  # writes THROUGH a second name into the file body it shares, so a hard link at this name turned an
  # unrelated operator file into the database path string, and the run still finished with exit 0 and
  # deleted the backup. Measured on the version that wrote it without asking. Clearing the name is
  # content-preserving for every shape that could hold operator data - a second name leaves the file
  # under its own name, a link leaves its target, an empty directory holds nothing - and a directory
  # with children is left alone, which makes the name unfree and refuses the group below.
  if (-not (Clear-RestoreScratchName -Path $markerPath)) {
    throw ("Cannot mark the restore of " + $Group.MainPath + " - something is in the way at " + $markerPath)
  }

  Set-Content -LiteralPath $markerPath -Value $Group.MainPath -Encoding UTF8

  foreach ($sidecar in $sidecarsToSetAside) {
    Move-LiveSidecarAside -SidecarPath $sidecar
  }

  foreach ($sidecar in $sidecarsToDelete) {
    # Only ever a plain file: (a) sends every other shape to the set-aside list above, so this
    # cannot be the Remove-Item that sat on a folder for minutes with nobody to answer its prompt.
    Remove-Item -LiteralPath $sidecar -Force
  }

  foreach ($pair in $staged) {
    $stagedLength = Get-FileLength -Path $pair.Staged

    Move-Item -LiteralPath $pair.Staged -Destination $pair.Final -Force

    # What actually landed, asked rather than assumed. Move-Item -Force onto a name that is a
    # DIRECTORY moves the file inside it instead of replacing it, and a directory left standing
    # where the database belongs is a total loss this run would otherwise report as success.
    # Throwing here leaves the marker in place, which is precisely the recovery the marker exists
    # for: the next run refuses to call that main a survivor and restores the group again.
    #
    # DELIBERATELY UNTESTED, and here anyway. No test pins these three lines and none can without
    # racing the script, so this note is the only thing standing between them and a later edit that
    # deletes them with the whole suite green. Every disk state that could make this fire is
    # refused earlier: a folder or a link at the staged name by the check in (b), a folder or a
    # link at a final name by (c), and the one final name (c) skips is a sidecar (e) has just
    # emptied. Measured before this note was written: thirty-six shapes planted at the database's
    # name, at the staged name and at the log's name, run against this file and against a copy with
    # the throw below deleted, produced the same exit code and the same files on disk in all
    # thirty-six. What is left is the window between (c) and this rename - the third line of
    # defence, which is exactly the kind that is only ever needed on somebody else's PC.
    if (($stagedLength -lt 0) -or ((Get-FileLength -Path $pair.Final) -ne $stagedLength)) {
      throw ("Restored " + $pair.Final + " is not the file that was staged for it - the half-finished marker is left in place for the next run")
    }
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
  #
  # This list is the BACKUP side only, and it is the only one that fails the run. A folder in the
  # backup that cannot be listed means files may never have been put back; a folder in the LIVE
  # tree that cannot be listed means one question about what is already there went unanswered,
  # which is collected in $script:UncheckedLiveFolders and answered with exit 4 - finished, backup
  # kept. Failing the whole restore over the live side told the operator that a restore which had
  # put everything back had not finished, on every update, for as long as that folder stayed
  # unreadable.
  #
  # Exit 4 is the answer only while every question the copy loop below still gets answered. That
  # loop asks Test-Path of each destination it carries, and a folder that refuses that question
  # too - a deny on the folder and everything under it - makes it throw at the FIRST such entry,
  # so the files that sort after it are not put back either and the run fails. A folder that only
  # refuses to be listed still answers about a named child, and then the fill-in reaches inside it
  # and exit 4 stands. Both shapes measured, and the throw is not new - d322c5a aborts the same
  # way. What was new was documentation saying the live side can never fail the run.
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
  #   neither side has it,
  #   some log has content    -> restore nothing, change nothing, fail. Backup skips a file it cannot
  #                              read one at a time, so it can hold a log whose own .sqlite never
  #                              made it in - or nothing of that database at all. Exiting 0 there
  #                              would report a finished restore and delete the backup on the way out.
  #   live database gone,
  #   neither side has it,
  #   no log has content      -> nothing to restore and nothing to lose. The leftover is a -shm or an
  #                              empty -wal, neither of which can hold a commit; it is left where it
  #                              is and the update finishes normally.
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
      $alreadyNamed = $script:UncheckedLiveFolders.Count

      Add-UnreadableFolderNames -ErrorRecords $liveScanErrors -Fallback $TargetDirectory -Into $script:UncheckedLiveFolders

      # Said out loud, once per folder - and nowhere else. There is no installer log: the header's
      # exit-code contract has the measurement, but the short version is that installer.nsh throws
      # this output away, so on exit 4 this folder is named to nobody. The operator's dialog cannot
      # carry the path either, because the only process that knows it is this one. Kept because the
      # exit code cannot say WHICH folder and because the tests read it, not because anyone reads it
      # during an update.
      for ($index = $alreadyNamed; $index -lt $script:UncheckedLiveFolders.Count; $index += 1) {
        Write-Output ("UNCHECKED " + $script:UncheckedLiveFolders[$index])
      }
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
      $backupMainLength = -1

      if ($group.BackupHasMain) {
        $backupMainSource = Get-GroupMemberSource -Group $group -Destination $group.MainPath

        if ($backupMainSource) {
          $backupMainLength = Get-FileLength -Path $backupMainSource
        }
      }

      $group.LiveMainSurvived = (
        Test-LiveMainSurvivedInstall -MainPath $group.MainPath -BackupMainLength $backupMainLength
      )

      # Is there anything in this group left to recover at all? Only a -wal with something in it
      # can hold commits. A -shm is a rebuildable index over the log - this script deletes a stale
      # one a few lines below, and the maintainer guide says it carries nothing - and a 0-byte -wal
      # has no header and no frames. So a leftover of those two kinds with no .sqlite anywhere is
      # litter, not a half-saved database, and refusing the whole update over it stops a restore
      # that had nothing to put back in the first place. Both sides are asked, because either can
      # be the one holding the log.
      $walWithContent = (Get-FileLength -Path ($group.MainPath + "-wal")) -gt 0

      if (-not $walWithContent) {
        $backupWalSource = Get-GroupMemberSource -Group $group -Destination ($group.MainPath + "-wal")

        if ($backupWalSource) {
          $walWithContent = (Get-FileLength -Path $backupWalSource) -gt 0
        }
      }

      if ($group.LiveMainSurvived) {
        $group.Action = "keep-live"
      } elseif ($group.BackupHasMain) {
        $group.Action = "restore-group"
      } elseif ($walWithContent) {
        $group.Action = "incomplete"
      } elseif (Test-Path -LiteralPath (Get-RestoreMarkerPath -MainPath $group.MainPath)) {
        # A marker beside a body-less database is not litter - it is this script's own note that a
        # restore of THIS group was interrupted part way through, and that the database it was
        # putting back is somewhere else.
        #
        # Without this branch a real update cycle ends in a silent, unrecoverable-looking success.
        # Measured: a commit-phase failure leaves the marker and the staged parts with no body; the
        # NEXT update's Backup then sets the good backup aside as "-unrestored-" and makes a fresh
        # backup of the body-less live folder; and the Restore after it saw no body on either side
        # and no log with anything in it, called that nothing-to-restore, deleted the one remaining
        # backup and exited 0. The operator's database was still recoverable by hand from the set
        # aside copy, but nothing said so and the app was free to initialise an empty database over
        # the top. Exit codes across the real cycle were 1 -> 0 -> 0 where the baseline gave 1 -> 0 -> 1.
        #
        # So the marker outranks the "nothing here can hold commits" reading: refuse, keep every
        # backup, and say which database it was. A retry that CAN put the body back never reaches
        # here - BackupHasMain is asked first, two branches up.
        $group.Action = "incomplete"
      } else {
        # No body on either side, no log with anything in it, and no interrupted restore of our own
        # to account for. Nothing is restored - the copy loop skips every file of a group - and
        # nothing live is touched: a stale sidecar is left exactly where it is. Deleting a live file
        # this run was never asked to delete is the bigger risk of the two, and the app rebuilds or
        # removes its own sidecars when it starts.
        $group.Action = "nothing-to-restore"
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
  # The live side does not come through here - see $script:UncheckedLiveFolders and exit 4.
  if ($unreadableFolders.Count -gt 0) {
    throw ("Cannot read every folder in the backup that has to be put back: " + ($unreadableFolders -join ", "))
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

  # A run that set something aside could not prove where it came from, so the operator now holds
  # two halves and a decision. Keeping the backup one more cycle keeps both halves; the next run's
  # redundancy judgement drops it once the live folder holds everything it has.
  #
  # A run that could not list part of the live tree keeps it for a different reason: it cannot say
  # what is already there, so it cannot say this backup has nothing left to give. Both are finished
  # restores, and neither deletes.
  if (($script:SetAsideCount -eq 0) -and ($script:UncheckedLiveFolders.Count -eq 0)) {
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

      # And the same alias question the file branch asks below, in the only form a folder can be
      # asked it: Test-Path follows a junction without a word, so a live path that IS a link can
      # report the folder present by looking straight into the backup being judged. The file
      # branch's two-handle probe cannot be used here - a directory has no such handle - so a
      # link is refused outright. A junction ABOVE this folder is caught by the file probe as soon
      # as the backup holds any file at all; a backup holding no files at all is folder names and
      # nothing else, and this is the check that keeps those.
      $liveEquivalentItem = Get-Item -LiteralPath $liveEquivalent -Force -ErrorAction SilentlyContinue

      if ((-not $liveEquivalentItem) -or
          (($liveEquivalentItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
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
    # Something set aside is the one the operator may have to act on, so it is reported first when
    # both are true; either way the backup was kept.
    if ($script:SetAsideCount -gt 0) {
      exit 3
    }

    if ($script:UncheckedLiveFolders.Count -gt 0) {
      exit 4
    }

    exit 0
  }
}
