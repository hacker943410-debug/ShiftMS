param(
  [Parameter(Mandatory = $true)]
  [string]$DatabasePath,

  [string]$OutputDir = "",

  [string[]]$Tables = @(),

  [switch]$IncludeRows,

  [ValidateSet("auto", "16.0", "12.0")]
  [string]$ProviderVersion = "auto"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AccessConnection {
  param(
    [string]$TargetPath,
    [string]$VersionPreference
  )

  $providers =
    if ($VersionPreference -eq "auto") {
      @("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0")
    } else {
      @("Microsoft.ACE.OLEDB.$VersionPreference")
    }

  foreach ($provider in $providers) {
    try {
      $builder = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
      $builder.Provider = $provider
      $builder["Data Source"] = $TargetPath
      $builder["Persist Security Info"] = $false

      $connection = New-Object System.Data.OleDb.OleDbConnection($builder.ConnectionString)
      $connection.Open()

      return [PSCustomObject]@{
        Provider = $provider
        Connection = $connection
      }
    } catch {
      if ($connection) {
        $connection.Dispose()
      }
    }
  }

  throw "사용 가능한 Access OLEDB Provider를 찾지 못했습니다."
}

function Convert-DataTableRows {
  param(
    [System.Data.DataTable]$Table
  )

  $result = @()

  foreach ($row in $Table.Rows) {
    $item = [ordered]@{}

    foreach ($column in $Table.Columns) {
      $value = $row[$column.ColumnName]

      if ($null -eq $value -or $value -is [System.DBNull]) {
        $item[$column.ColumnName] = $null
        continue
      }

      if ($value -is [datetime]) {
        $item[$column.ColumnName] = $value.ToString("o")
        continue
      }

      $item[$column.ColumnName] = $value
    }

    $result += [PSCustomObject]$item
  }

  return $result
}

if (-not (Test-Path -LiteralPath $DatabasePath)) {
  throw "데이터베이스 파일을 찾을 수 없습니다: $DatabasePath"
}

$resolvedDatabasePath = (Resolve-Path -LiteralPath $DatabasePath).Path
$tempDatabasePath = Join-Path ([System.IO.Path]::GetTempPath()) ("shiftmgmt-access-export-" + [guid]::NewGuid().ToString() + ".accdb")
$resolvedTempDatabasePath = $null
$resolvedOutputDir =
  if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    Join-Path $PWD.Path ("artifacts\\access-export\\" + [IO.Path]::GetFileNameWithoutExtension($resolvedDatabasePath))
  } else {
    $OutputDir
  }

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null
$tablesOutputDir = Join-Path $resolvedOutputDir "tables"
New-Item -ItemType Directory -Force -Path $tablesOutputDir | Out-Null

Copy-Item -LiteralPath $resolvedDatabasePath -Destination $tempDatabasePath -Force
$resolvedTempDatabasePath = (Resolve-Path -LiteralPath $tempDatabasePath).Path

$resolved = Resolve-AccessConnection -TargetPath $resolvedTempDatabasePath -VersionPreference $ProviderVersion
$connection = $resolved.Connection

try {
  $allTableNames = @(
    $connection.GetSchema("Tables") |
      Where-Object { $_.TABLE_TYPE -eq "TABLE" -and $_.TABLE_NAME -notlike "MSys*" } |
      Sort-Object TABLE_NAME |
      Select-Object -ExpandProperty TABLE_NAME
  )

  $selectedTables =
    if (@($Tables).Count -gt 0) {
      $missingTables = @($Tables | Where-Object { $_ -notin $allTableNames })

      if (@($missingTables).Count -gt 0) {
        throw "요청한 테이블을 찾을 수 없습니다: $($missingTables -join ', ')"
      }

      @($Tables)
    } else {
      @($allTableNames)
    }

  $tableSummaries = @()

  foreach ($tableName in $selectedTables) {
    $countCommand = $connection.CreateCommand()
    $countCommand.CommandText = "SELECT COUNT(*) FROM [$tableName]"
    $rowCount = [int]$countCommand.ExecuteScalar()

    $schemaRows = $connection.GetOleDbSchemaTable(
      [System.Data.OleDb.OleDbSchemaGuid]::Columns,
      @($null, $null, $tableName, $null)
    ) | Sort-Object ORDINAL_POSITION

    $columns = @(
      foreach ($schemaRow in $schemaRows) {
        [PSCustomObject]@{
          name = [string]$schemaRow.COLUMN_NAME
          dataType = [int]$schemaRow.DATA_TYPE
          isNullable = [bool]$schemaRow.IS_NULLABLE
        }
      }
    )

    $tableSummary = [PSCustomObject]@{
      tableName = $tableName
      rowCount = $rowCount
      columns = $columns
    }

    $tableSummaries += $tableSummary

    if ($IncludeRows) {
      $adapter = New-Object System.Data.OleDb.OleDbDataAdapter("SELECT * FROM [$tableName]", $connection)
      $dataTable = New-Object System.Data.DataTable
      [void]$adapter.Fill($dataTable)
      $rows = Convert-DataTableRows -Table $dataTable
      $rows | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path (Join-Path $tablesOutputDir "$tableName.json")
    }
  }

  $metadata = [PSCustomObject]@{
    databasePath = $resolvedDatabasePath
    tempDatabasePath = $resolvedTempDatabasePath
    provider = $resolved.Provider
    exportedAt = (Get-Date).ToString("o")
    includeRows = [bool]$IncludeRows
    tableCount = @($selectedTables).Count
    tables = $selectedTables
  }

  $metadata | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path (Join-Path $resolvedOutputDir "metadata.json")
  $tableSummaries | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path (Join-Path $resolvedOutputDir "schema-summary.json")

  Write-Output "ACCESS_EXPORT_OK provider=$($resolved.Provider) output=$resolvedOutputDir tables=$(@($selectedTables).Count)"
} finally {
  if ($connection.State -eq "Open") {
    $connection.Close()
  }

  $connection.Dispose()

  if ($resolvedTempDatabasePath -and (Test-Path -LiteralPath $resolvedTempDatabasePath)) {
    Remove-Item -LiteralPath $resolvedTempDatabasePath -Force -ErrorAction SilentlyContinue
  }
}
