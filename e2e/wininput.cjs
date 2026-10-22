// Real pointer input on Windows for tests (SendInput), like xtest.cjs on X11:
//   node e2e/wininput.cjs gesture TOKEN...   down | up | wait:MS | move:X:Y[:STEPS]
//   node e2e/wininput.cjs classes           the visible top-level windows' classes
// X and Y are physical screen pixels. Prints "step N TOKEN" after each.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PS = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class Gesture {
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, System.Text.StringBuilder s, int n);
  /** The classes of the visible top-level windows. */
  public static void Classes() {
    var seen = new System.Collections.Generic.SortedSet<string>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h)) { var b = new System.Text.StringBuilder(256); GetClassNameW(h, b, 256); seen.Add(b.ToString()); }
      return true;
    }, IntPtr.Zero);
    Console.WriteLine(string.Join(" ", seen));
  }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  static void Send(uint flags, int x, int y) {
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
    var i = new INPUT[1];
    i[0].mi.dx = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
    i[0].mi.dy = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
    i[0].mi.flags = flags | 0x8000 | 0x4000;
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Run(string[] tokens) {
    SetProcessDPIAware();
    POINT p; GetCursorPos(out p);
    int x = p.X, y = p.Y, n = 0;
    foreach (var tok in tokens) {
      var w = tok.Split(':');
      if (w[0] == "down") Send(0x0002 | 0x0001, x, y);
      else if (w[0] == "up") Send(0x0004 | 0x0001, x, y);
      else if (w[0] == "wait") Thread.Sleep(int.Parse(w[1]));
      else if (w[0] == "move") {
        int tx = int.Parse(w[1]), ty = int.Parse(w[2]), steps = w.Length > 3 ? int.Parse(w[3]) : 1;
        for (int k = 1; k <= steps; k++) {
          Send(0x0001, x + (tx - x) * k / steps, y + (ty - y) * k / steps);
          if (steps > 1) Thread.Sleep(25);
        }
        x = tx; y = ty;
      }
      Thread.Sleep(20);
      Console.WriteLine("step " + (++n) + " " + tok);
      Console.Out.Flush();
    }
  }
}
'@
if ($args[0] -eq 'classes') { [Gesture]::Classes() } else { [Gesture]::Run($args) }
`

const file = path.join(os.tmpdir(), 'island-wininput.ps1')
fs.writeFileSync(file, '﻿' + PS)
const [cmd, ...tokens] = process.argv.slice(2)
if (cmd !== 'gesture' && cmd !== 'classes') {
  console.error('usage: node e2e/wininput.cjs gesture TOKEN... | classes')
  process.exit(2)
}
const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...(cmd === 'classes' ? ['classes'] : tokens)], { stdio: 'inherit', windowsHide: true })
p.on('exit', (code) => process.exit(code ?? 1))
