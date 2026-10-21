"use strict";

let user32 = null;
let koffi = null;

if (process.platform === "win32") {
  try {
    koffi = require("koffi");
    const lib = koffi.load("user32.dll");

    const RECT = koffi.struct("RECT", {
      left: "long",
      top: "long",
      right: "long",
      bottom: "long"
    });

    const POINT = koffi.struct("POINT", {
      x: "long",
      y: "long"
    });

    user32 = {
      GetWindowThreadProcessId: lib.func("uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *lpdwProcessId)"),
      GetClientRect: lib.func("bool __stdcall GetClientRect(uintptr_t hWnd, _Out_ RECT *lpRect)"),
      ClientToScreen: lib.func("bool __stdcall ClientToScreen(uintptr_t hWnd, _Inout_ POINT *lpPoint)")
    };
  } catch (_) {
    user32 = null;
  }
}

/**
 * Resolves the OS Process ID (PID) for a given node-screenshots Window object.
 */
function getWindowPid(win) {
  if (typeof win.pid === "function") {
    try {
      return win.pid();
    } catch (_) {}
  }
  if (user32) {
    try {
      const pidOut = [0];
      user32.GetWindowThreadProcessId(Number(win.id()), pidOut);
      return pidOut[0] || null;
    } catch (_) {}
  }
  return null;
}

/**
 * Computes the pixel offset from the captured window top-left to its client area top-left.
 * When origin === "window", returns { offsetX: 0, offsetY: 0 }.
 * When origin === "client", offsets past the title bar and window frame on Windows.
 */
function getClientOffset(win, origin) {
  if (origin === "window" || !win) {
    return { offsetX: 0, offsetY: 0 };
  }

  if (user32) {
    try {
      const hwnd = Number(win.id());
      const rect = {};
      const pt = { x: 0, y: 0 };
      if (user32.GetClientRect(hwnd, rect) && user32.ClientToScreen(hwnd, pt)) {
        const offsetX = Math.max(0, pt.x - win.x());
        const offsetY = Math.max(0, pt.y - win.y());
        return { offsetX, offsetY };
      }
    } catch (_) {}
  }

  return { offsetX: 0, offsetY: 0 };
}

/**
 * Normalizes process names so "app.exe" and "app" match reliably across platforms.
 */
function matchesProcessName(appName, query) {
  if (!appName || !query) return false;
  const cleanApp = String(appName).trim().toLowerCase();
  const cleanQuery = String(query).trim().toLowerCase();
  const stemApp = cleanApp.replace(/\.exe$/i, "");
  const stemQuery = cleanQuery.replace(/\.exe$/i, "");

  return (
    cleanApp === cleanQuery ||
    stemApp === stemQuery ||
    cleanApp.includes(stemQuery)
  );
}

module.exports = {
  getWindowPid,
  getClientOffset,
  matchesProcessName
};