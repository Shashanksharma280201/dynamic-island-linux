# Installs (or updates) Dynamic Island from its latest GitHub release, on
# Windows 10 or 11. Run it in PowerShell with:
#
#   irm https://raw.githubusercontent.com/shashanksharma280201/dynamic-island-linux/main/scripts/install.ps1 | iex
#
# It downloads the installer, checks it against the release's SHA256SUMS.txt,
# installs it for your account (no administrator needed) and starts it.
#
# Options, as environment variables set before running it:
#   $env:DI_VERSION = 'v0.2.0'   install that release instead of the latest
#   $env:DI_NO_LAUNCH = '1'      install only, don't start it
#
# To remove it later: open the island's menu and choose Uninstall Dynamic
# Island..., or Settings > Apps > Installed apps > Dynamic Island > Uninstall.

function Install-DynamicIsland {
  $ErrorActionPreference = 'Stop'
  # The progress bar makes downloads many times slower in Windows PowerShell.
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = 'shashanksharma280201/dynamic-island-linux'
  if ($env:DI_REPO) { $repo = $env:DI_REPO }
  $headers = @{ 'User-Agent' = 'dynamic-island-installer'; 'Accept' = 'application/vnd.github+json' }

  # Overridable for tests (a local stand-in for GitHub).
  $base = 'https://api.github.com'
  if ($env:DI_API) { $base = $env:DI_API }
  $which = 'latest'
  $api = "$base/repos/$repo/releases/latest"
  if ($env:DI_VERSION) {
    $which = $env:DI_VERSION
    $api = "$base/repos/$repo/releases/tags/$($env:DI_VERSION)"
  }
  Write-Host "==> Looking up the $which release of Dynamic Island"
  try {
    $release = Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing
  } catch {
    throw "Couldn't reach GitHub to find the $which release: $($_.Exception.Message)"
  }

  $asset = $release.assets | Where-Object { $_.name -like 'dynamic-island-windows-*.exe' } | Select-Object -First 1
  if (-not $asset) { $asset = $release.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1 }
  if (-not $asset) { throw "The $($release.tag_name) release has no Windows installer." }

  $dir = Join-Path $env:TEMP ('dynamic-island-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir | Out-Null
  try {
    $file = Join-Path $dir $asset.name
    Write-Host "==> Downloading $($asset.name) ($([math]::Round($asset.size / 1MB)) MB)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -UseBasicParsing

    $sums = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
    if (-not $sums) {
      Write-Host "    This release has no SHA256SUMS.txt, so the download can't be checked."
    } else {
      $text = (Invoke-WebRequest -Uri $sums.browser_download_url -UseBasicParsing).Content
      if ($text -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($text) }
      $line = ($text -split "`n") | Where-Object { $_.Trim() -match ('[ *]' + [regex]::Escape($asset.name) + '$') } | Select-Object -First 1
      if (-not $line) { throw "$($asset.name) is not listed in the release's SHA256SUMS.txt." }
      $want = ($line.Trim() -split '\s+')[0].ToLower()
      $got = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
      if ($want -ne $got) { throw "$($asset.name) doesn't match its checksum (expected $want, got $got). Try again; if it keeps failing, download it from the releases page." }
      Write-Host '    Checksum OK.'
    }

    # Close the island if it's running, so the new version replaces it cleanly.
    $running = Get-Process -Name 'DynamicIsland', 'dynamic-island-linux' -ErrorAction SilentlyContinue
    if ($running) {
      Write-Host '==> Closing the running island'
      $running | Stop-Process -Force
      Start-Sleep -Seconds 1
    }

    Write-Host '==> Installing'
    $p = Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "The installer stopped with code $($p.ExitCode)." }

    # Where it went: Installed apps knows (the installer can hand off to a second
    # process, so give it a moment).
    $exe = $null
    for ($i = 0; $i -lt 60 -and -not $exe; $i++) {
      $entry = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Get-ItemProperty | Where-Object { $_.DisplayName -like 'Dynamic Island*' } | Select-Object -First 1
      if ($entry) {
        $folder = Split-Path ([regex]::Match($entry.UninstallString, '"([^"]+)"').Groups[1].Value)
        $exe = Get-ChildItem -Path $folder -Filter '*.exe' -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -notlike 'Uninstall*' } | Select-Object -First 1 -ExpandProperty FullName
      }
      if (-not $exe) { Start-Sleep -Seconds 1 }
    }
    if (-not $exe) { throw "Installed, but couldn't find the app afterwards. Open Dynamic Island from the Start menu." }

    if (-not $env:DI_NO_LAUNCH) {
      Write-Host '==> Starting Dynamic Island'
      Start-Process -FilePath $exe
    }
    Write-Host "==> Done. Dynamic Island $($release.tag_name) is installed ($exe)."
    Write-Host '    Its icon is in the notification area (bottom right; it may be under the ^ arrow).'
  } finally {
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Everything runs from here, so a half-downloaded script never runs halfway.
Install-DynamicIsland
