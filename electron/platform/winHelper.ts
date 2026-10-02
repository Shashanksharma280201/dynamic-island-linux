/**
 * The PowerShell helper the island runs on Windows. It reads commands on
 * stdin and writes one JSON object per line: {"media":…} whenever what's
 * playing changes, {"sys":…} when asked. Media comes from Windows' media
 * sessions (GlobalSystemMediaTransportControls: any app in the media
 * overlay), volume from Core Audio, brightness from WMI, Wi-Fi and
 * Bluetooth from the radio API. Every part fails on its own (null).
 */
export const WIN_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $t.Wait(5000)
  $t.Result
}
function Say($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int j();
  int GetMasterVolumeLevelScalar(out float level);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int p, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class IslandAudio {
  static IAudioEndpointVolume Vol() {
    var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume v; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v));
    return v;
  }
  public static float GetVolume() { float x; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out x)); return x; }
  public static void SetVolume(float x) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(x, Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
'@

$mgr = $null
try {
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { }
$radioType = $null
try { $radioType = [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] } catch { }

$lastKey = ''
$lastArt = ''
$lastTrack = ''
function Media() {
  if (-not $mgr) { return $null }
  $s = $mgr.GetCurrentSession()
  if (-not $s) { return $null }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $i = $s.GetPlaybackInfo()
  $t = $s.GetTimelineProperties()
  $track = "$($p.Title)|$($p.Artist)"
  if ($track -ne $script:lastTrack) {
    $script:lastTrack = $track
    $script:lastArt = ''
    try {
      if ($p.Thumbnail) {
        $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
        $ms = New-Object System.IO.MemoryStream
        $net.CopyTo($ms)
        if ($ms.Length -lt 2000000) { $script:lastArt = 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray()) }
      }
    } catch { }
  }
  return @{
    app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; art = $script:lastArt
    status = [string]$i.PlaybackStatus; length = $t.EndTime.TotalSeconds; position = $t.Position.TotalSeconds
    canSeek = [bool]$i.Controls.IsPlaybackPositionEnabled; shuffle = $i.IsShuffleActive; repeat = [string]$i.AutoRepeatMode
  }
}

function Radio([string]$kind) {
  if (-not $radioType) { return $null }
  try {
    $radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    foreach ($r in $radios) { if ([string]$r.Kind -eq $kind) { return $r } }
  } catch { }
  return $null
}

function Sys() {
  $o = @{ volume = $null; muted = $null; brightness = $null; wifi = $null; bluetooth = $null }
  try { $o.volume = [int][Math]::Round([IslandAudio]::GetVolume() * 100); $o.muted = [IslandAudio]::GetMute() } catch { }
  try { $o.brightness = [int](Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch { }
  foreach ($k in @('WiFi', 'Bluetooth')) {
    $r = Radio $k
    if ($r) { $o[$(if ($k -eq 'WiFi') { 'wifi' } else { 'bluetooth' })] = ([string]$r.State -eq 'On') }
  }
  return $o
}

function Run([string]$line) {
  $w = $line.Trim().Split(' ')
  switch ($w[0]) {
    'sys' { Say @{ sys = (Sys) } }
    'vol' { try { [IslandAudio]::SetVolume([float]$w[1] / 100) } catch { } }
    'mute' { try { [IslandAudio]::SetMute(-not [IslandAudio]::GetMute()) } catch { } }
    'bright' {
      try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$w[1] } | Out-Null } catch { }
    }
    { $_ -eq 'wifi' -or $_ -eq 'bt' } {
      $r = Radio $(if ($w[0] -eq 'wifi') { 'WiFi' } else { 'Bluetooth' })
      if ($r) { try { $null = Await ($r.SetStateAsync($(if ($w[1] -eq 'on') { 'On' } else { 'Off' }))) ([Windows.Devices.Radios.RadioAccessStatus]) } catch { } }
    }
    'media' {
      if (-not $mgr) { return }
      $s = $mgr.GetCurrentSession()
      if (-not $s) { return }
      try {
        switch ($w[1]) {
          'playpause' { $op = $s.TryTogglePlayPauseAsync() }
          'next' { $op = $s.TrySkipNextAsync() }
          'previous' { $op = $s.TrySkipPreviousAsync() }
          'seek' { $op = $s.TryChangePlaybackPositionAsync([long]([double]$w[2] * 10000000)) }
          'shuffle' { $op = $s.TryChangeShuffleActiveAsync(-not $s.GetPlaybackInfo().IsShuffleActive) }
          'loop' {
            $m = [string]$s.GetPlaybackInfo().AutoRepeatMode
            $next = if ($m -eq 'None') { 'List' } elseif ($m -eq 'List') { 'Track' } else { 'None' }
            $op = $s.TryChangeAutoRepeatModeAsync($next)
          }
        }
        if ($op) { $null = Await $op ([bool]) }
      } catch { }
      $script:lastKey = ''
    }
  }
}

Say @{ ready = $true }
$reader = [Console]::In
$pending = $reader.ReadLineAsync()
while ($true) {
  if ($pending.Wait(1000)) {
    $line = $pending.Result
    if ($null -eq $line) { break }
    try { Run $line } catch { }
    $pending = $reader.ReadLineAsync()
  }
  try {
    $m = Media
    $key = ($m | ConvertTo-Json -Compress -Depth 3)
    # Position moves on its own: only a jump, or anything else changing, is news.
    $stable = if ($m) { "$($m.app)|$($m.title)|$($m.artist)|$($m.status)|$($m.shuffle)|$($m.repeat)|$([int]($m.position / 5))" } else { 'none' }
    if ($stable -ne $script:lastKey) { $script:lastKey = $stable; Say @{ media = $m } }
  } catch { }
}
`
