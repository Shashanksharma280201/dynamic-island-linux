import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { screen } from 'electron'
import type { DragEvents, DragSource } from '../dragSource'

/**
 * The drag watcher the island runs on Windows (PowerShell compiling a little
 * C#). Windows has no "a drag started" notice, but drags of files show the
 * shell's drag image, a window of class SysDragImage, from Explorer and from
 * most apps: while the main mouse button is down, that window showing means a
 * drag. One JSON object a line: {"ready":true}, {"start":true},
 * {"held":true,"alt":false} while the drag goes on, {"end":true}. Reads
 * "nudge" lines: the pointer moves a pixel and back, so the dragging app looks
 * again at what's under it (the ring that just opened there).
 */
export const WIN_DRAG = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class IslandDrag {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  const int SM_SWAPBUTTON = 23, VK_LBUTTON = 1, VK_RBUTTON = 2, VK_MENU = 0x12;
  const uint MOVE = 1, ABSOLUTE = 0x8000, VIRTUALDESK = 0x4000;
  static readonly object say = new object();
  static void Say(string s) { lock (say) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static bool DragImage() { IntPtr w = FindWindowW("SysDragImage", null); return w != IntPtr.Zero && IsWindowVisible(w); }
  static void MoveTo(int x, int y) {
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
    var i = new INPUT[1];
    i[0].type = 0;
    i[0].mi.dx = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
    i[0].mi.dy = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
    i[0].mi.flags = MOVE | ABSOLUTE | VIRTUALDESK;
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }
  static void Nudge() {
    POINT p;
    if (!GetCursorPos(out p)) return;
    MoveTo(p.X + 1, p.Y);
    Thread.Sleep(30);
    MoveTo(p.X, p.Y);
  }
  public static void Run() {
    SetProcessDPIAware();
    var reader = new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) if (line.Trim() == "nudge") Nudge();
      Environment.Exit(0);
    });
    reader.IsBackground = true;
    reader.Start();
    Say("{\"ready\":true}");
    // idle, watching (button down), dragging
    string state = "idle";
    while (true) {
      int button = GetSystemMetrics(SM_SWAPBUTTON) != 0 ? VK_RBUTTON : VK_LBUTTON;
      bool down = Down(button);
      if (!down) {
        if (state == "dragging") Say("{\"end\":true}");
        state = "idle";
      } else if (state == "idle") {
        state = "watching";
      }
      if (state == "watching" && DragImage()) {
        state = "dragging";
        Say("{\"start\":true}");
      }
      if (state == "dragging") Say(Down(VK_MENU) ? "{\"held\":true,\"alt\":true}" : "{\"held\":true,\"alt\":false}");
      Thread.Sleep(state == "idle" ? 50 : 30);
    }
  }
}
'@
[IslandDrag]::Run()
`

/** A line from the watcher, as a drag event, or null. Pure. */
export function winDragLine(line: string): { ready: true } | { start: true } | { held: true; alt: boolean } | { end: true } | null {
  let m: any
  try {
    m = JSON.parse(line)
  } catch {
    return null
  }
  if (m?.ready === true) return { ready: true }
  if (m?.start === true) return { start: true }
  if (m?.held === true) return { held: true, alt: m.alt === true }
  if (m?.end === true) return { end: true }
  return null
}

/** Drags on Windows, from the watcher; the pointer from Electron, in screen units. */
export function winDragSource(e: DragEvents): DragSource {
  let child: ChildProcessWithoutNullStreams | null = null
  let dragging = false
  let ours = false
  let problem: string | null = null
  return {
    get problem() {
      return problem
    },
    start: () =>
      new Promise<boolean>((resolve) => {
        let settled = false
        const done = (ok: boolean, why: string | null = null) => {
          if (settled) return
          settled = true
          problem = why
          resolve(ok)
        }
        let file: string
        try {
          file = join(tmpdir(), `dynamic-island-drag-${createHash('sha1').update(WIN_DRAG).digest('hex').slice(0, 10)}.ps1`)
          writeFileSync(file, '﻿' + WIN_DRAG) // BOM: Windows PowerShell reads it as UTF-8
          child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true })
        } catch {
          return done(false, 'no-helper')
        }
        child.on('error', () => done(false, 'no-helper'))
        child.stdin.on('error', () => {})
        child.on('exit', () => {
          done(false, 'no-helper')
          if (dragging) e.onEnd()
          dragging = false
          child = null
        })
        child.stderr.on('data', (d) => console.error('[island] drag watcher:', String(d).trim().slice(0, 300)))
        // Compiling the C# takes a moment the first time.
        setTimeout(() => done(false, 'no-helper'), 20_000)
        createInterface({ input: child.stdout }).on('line', (line) => {
          const m = winDragLine(line)
          if (!m) return
          if ('ready' in m) return done(true)
          if ('start' in m) {
            // A result dragged out of the island itself: leave it be.
            ours = e.ownDrag()
            if (ours) return
            dragging = true
            return e.onStart()
          }
          if (ours || !dragging) {
            if ('end' in m) ours = false
            return
          }
          if ('held' in m) {
            const p = screen.getCursorScreenPoint()
            return e.onSample({ x: p.x, y: p.y, t: Date.now(), alt: m.alt, down: true })
          }
          dragging = false
          e.onEnd()
        })
      }),
    stop: () => {
      child?.kill()
      child = null
      if (dragging) e.onEnd()
      dragging = false
    },
    nudge: () => {
      if (dragging) child?.stdin.write('nudge\n')
    },
  }
}
