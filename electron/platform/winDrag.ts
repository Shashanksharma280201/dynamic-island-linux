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
 * C#). Windows has no "a drag started" notice, so with the main mouse button
 * down it looks for either sign of one:
 * - the shell's drag image (a window of class SysDragImage) showing, as it
 *   does for files dragged from Explorer and most apps, though only over
 *   windows that draw it;
 * - the pointer gone past the drag distance while a hidden window holds the
 *   mouse: OLE's DoDragDrop, which every file drag goes through, captures it
 *   that way for the whole drag, whatever is under the pointer.
 * One JSON object a line: {"ready":true}, {"start":true,"by":"image"|"capture"},
 * {"held":true,"alt":false} while the drag goes on, {"end":true}; with
 * DI_DRAG_DEBUG set, {"debug":"..."} lines say what it saw (and with
 * DI_DRAG_SIGNAL=capture it goes by the mouse alone, for tests). Reads "nudge"
 * lines: the pointer moves a pixel and back, so the dragging app looks again
 * at what's under it (the ring that just opened there).
 */
export const WIN_DRAG = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class IslandDrag {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string title);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, StringBuilder name, int size);
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO { public int cbSize; public uint flags; public IntPtr active; public IntPtr focus; public IntPtr capture; public IntPtr menuOwner; public IntPtr moveSize; public IntPtr caret; public RECT caretRect; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  const int SM_SWAPBUTTON = 23, VK_LBUTTON = 1, VK_RBUTTON = 2, VK_MENU = 0x12;
  const int SM_CXDRAG = 68, SM_CYDRAG = 69;
  // Moving or sizing a window, or in a menu: the mouse is held, but not for a drag.
  const uint NOT_A_DRAG = 0x2 | 0x4 | 0x8 | 0x10;
  const uint MOVE = 1, ABSOLUTE = 0x8000, VIRTUALDESK = 0x4000;
  static readonly bool debug = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("DI_DRAG_DEBUG"));
  static readonly bool byImage = Environment.GetEnvironmentVariable("DI_DRAG_SIGNAL") != "capture";
  static readonly object say = new object();
  static void Say(string s) { lock (say) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static bool DragImage() { IntPtr w = FindWindowW("SysDragImage", null); return w != IntPtr.Zero && IsWindowVisible(w); }
  static string ClassOf(IntPtr h) {
    if (h == IntPtr.Zero) return "";
    var s = new StringBuilder(256);
    return GetClassNameW(h, s, s.Capacity) > 0 ? s.ToString() : "";
  }
  // The window holding the mouse in a thread (0: the foreground one's), unless it's moving a window or in a menu.
  static IntPtr Capture(uint thread) {
    var g = new GUITHREADINFO();
    g.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(thread, ref g) || (g.flags & NOT_A_DRAG) != 0) return IntPtr.Zero;
    return g.capture;
  }
  // DoDragDrop holds the mouse with a hidden window of OLE's own (the clipboard window) until the drop.
  static bool OleDrag(uint pressThread) {
    foreach (uint t in new uint[] { 0, pressThread }) {
      IntPtr c = Capture(t);
      if (c != IntPtr.Zero && (!IsWindowVisible(c) || ClassOf(c) == "CLIPBRDWNDCLASS")) return true;
    }
    return false;
  }
  static string Seen(uint pressThread) {
    IntPtr f = Capture(0), p = Capture(pressThread);
    return "capture " + (ClassOf(f) == "" ? "-" : ClassOf(f)) + (f != IntPtr.Zero && IsWindowVisible(f) ? " (shown)" : "") + " / " + (ClassOf(p) == "" ? "-" : ClassOf(p)) + (p != IntPtr.Zero && IsWindowVisible(p) ? " (shown)" : "") + (DragImage() ? ", drag image" : "");
  }
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
    POINT press = new POINT();
    uint pressThread = 0;
    string said = "";
    while (true) {
      int button = GetSystemMetrics(SM_SWAPBUTTON) != 0 ? VK_RBUTTON : VK_LBUTTON;
      bool down = Down(button);
      if (!down) {
        if (state == "dragging") Say("{\"end\":true}");
        state = "idle";
      } else if (state == "idle") {
        state = "watching";
        // Where it was pressed, and the thread of the window there (the one that may start a drag).
        GetCursorPos(out press);
        IntPtr under = WindowFromPoint(press);
        pressThread = under == IntPtr.Zero ? 0 : GetWindowThreadProcessId(under, IntPtr.Zero);
        said = "";
      }
      if (state == "watching") {
        POINT now;
        GetCursorPos(out now);
        bool moved = Math.Abs(now.X - press.X) >= GetSystemMetrics(SM_CXDRAG) || Math.Abs(now.Y - press.Y) >= GetSystemMetrics(SM_CYDRAG);
        string by = byImage && DragImage() ? "image" : (moved && OleDrag(pressThread) ? "capture" : null);
        if (debug && moved) {
          string seen = Seen(pressThread);
          if (seen != said) {
            said = seen;
            Say("{\"debug\":\"" + seen.Replace("\\", "/").Replace("\"", "'") + "\"}");
          }
        }
        if (by != null) {
          state = "dragging";
          Say("{\"start\":true,\"by\":\"" + by + "\"}");
        }
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
          if (process.env.DI_DRAG_DEBUG) console.log('[island] drag watcher said:', line)
          const m = winDragLine(line)
          if (!m) return
          if ('ready' in m) {
            console.log('[island] drag watcher ready')
            return done(true)
          }
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
