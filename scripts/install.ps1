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
  # Plain github.com pages and links, not the GitHub API: the API answers only
  # 60 lookups an hour for everyone behind one internet address. Overridable
  # for tests (a local stand-in for GitHub).
  $web = 'https://github.com'
  if ($env:DI_GITHUB) { $web = $env:DI_GITHUB.TrimEnd('/') }
  $headers = @{ 'User-Agent' = 'dynamic-island-installer' }

  if ($env:DI_VERSION) {
    $tag = 'v' + ($env:DI_VERSION -replace '^v', '')
    Write-Host "==> Looking up the $tag release of Dynamic Island"
    try {
      Invoke-WebRequest -Uri "$web/$repo/releases/tag/$tag" -Method Head -Headers $headers -UseBasicParsing | Out-Null
    } catch {
      if ([int]$_.Exception.Response.StatusCode -eq 404) { throw "There's no Dynamic Island release called $tag (see $web/$repo/releases)." }
      throw "Couldn't reach GitHub ($($_.Exception.Message)). Check your internet connection and try again."
    }
  } else {
    Write-Host '==> Looking up the latest release of Dynamic Island'
    # github.com sends .../releases/latest on to that release's page.
    try {
      $req = [Net.WebRequest]::Create("$web/$repo/releases/latest")
      $req.Method = 'HEAD'
      $req.AllowAutoRedirect = $false
      $req.UserAgent = $headers['User-Agent']
      $res = $req.GetResponse()
      $location = $res.Headers['Location']
      $res.Close()
    } catch {
      throw "Couldn't reach GitHub ($($_.Exception.Message)). Check your internet connection and try again."
    }
    if ($location -match '/releases/tag/([^/?#]+)$') { $tag = $Matches[1] } else { throw "Couldn't find the latest release (see $web/$repo/releases)." }
  }
  # Every release names its files the same way.
  $dl = "$web/$repo/releases/download/$tag"
  $name = 'dynamic-island-windows-' + ($tag -replace '^v', '') + '-x64.exe'

  $dir = Join-Path $env:TEMP ('dynamic-island-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir | Out-Null
  try {
    $text = $null
    try {
      $text = (Invoke-WebRequest -Uri "$dl/SHA256SUMS.txt" -Headers $headers -UseBasicParsing).Content
    } catch {
      # Releases before 0.2.0 have none.
      if ([int]$_.Exception.Response.StatusCode -ne 404) { throw "Couldn't download SHA256SUMS.txt ($($_.Exception.Message)). Check your internet connection and try again." }
    }
    $want = $null
    if ($text) {
      if ($text -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($text) }
      $line = ($text -split "`n") | Where-Object { ($_.Trim() -split '\s+')[-1] -in @($name, "*$name") } | Select-Object -First 1
      if (-not $line) { throw "$name is not listed in the release's SHA256SUMS.txt." }
      $want = ($line.Trim() -split '\s+')[0].ToLower()
    }

    $file = Join-Path $dir $name
    Write-Host "==> Downloading $name"
    try {
      Invoke-WebRequest -Uri "$dl/$name" -OutFile $file -Headers $headers -UseBasicParsing
    } catch {
      if ([int]$_.Exception.Response.StatusCode -eq 404) { throw "The $tag release has no $name." }
      throw "Couldn't download $name ($($_.Exception.Message)). Check your internet connection and try again."
    }
    if (-not $want) {
      Write-Host "    This release has no SHA256SUMS.txt, so the download can't be checked."
    } else {
      $got = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLower()
      if ($want -ne $got) { throw "$name doesn't match its checksum (expected $want, got $got). Try again; if it keeps failing, download it from the releases page." }
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
    $code = (Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru).ExitCode
    if ($code -ne 0) {
      # Now and then the installer crashes (code -1073741819, seen on Windows
      # Server 2025); running it again is safe.
      Write-Host "    The installer stopped unexpectedly (code $code), so trying once more."
      Start-Sleep -Seconds 3
      $code = (Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru).ExitCode
    }
    if ($code -ne 0) { throw "The installer stopped with code $code. Download it from $web/$repo/releases and run it yourself." }

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
    Write-Host "==> Done. Dynamic Island $tag is installed ($exe)."
    Write-Host '    Its icon is in the notification area (bottom right; it may be under the ^ arrow).'
  } finally {
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Everything runs from here, so a half-downloaded script never runs halfway.
Install-DynamicIsland
