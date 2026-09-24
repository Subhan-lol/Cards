"""Thin ctypes wrappers around the Win32 calls the app needs.

Everything here is a no-op (or returns a harmless default) on other platforms,
so the rest of the app can run anywhere in --dry-run mode.
"""

from __future__ import annotations

import ctypes
import os
import sys
from typing import Optional, Tuple

IS_WINDOWS = sys.platform == "win32"

# Virtual-key codes
VK_UP = 0x26
VK_DOWN = 0x28
VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt

WHEEL_DELTA = 120

_INPUT_MOUSE = 0
_INPUT_KEYBOARD = 1
_KEYEVENTF_EXTENDEDKEY = 0x0001
_KEYEVENTF_KEYUP = 0x0002
_MOUSEEVENTF_WHEEL = 0x0800
_EXTENDED_KEYS = {VK_UP, VK_DOWN, VK_VOLUME_MUTE, VK_VOLUME_DOWN, VK_VOLUME_UP}

_ULONG_PTR = ctypes.c_uint64 if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint32


# Fixed-width types so the layout matches Windows on any platform.
class _MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_int32),
        ("dy", ctypes.c_int32),
        ("mouseData", ctypes.c_int32),  # DWORD in the headers, but wheel deltas are signed
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", _ULONG_PTR),
    ]


class _KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_uint16),
        ("wScan", ctypes.c_uint16),
        ("dwFlags", ctypes.c_uint32),
        ("time", ctypes.c_uint32),
        ("dwExtraInfo", _ULONG_PTR),
    ]


class _HARDWAREINPUT(ctypes.Structure):
    _fields_ = [("uMsg", ctypes.c_uint32), ("wParamL", ctypes.c_uint16), ("wParamH", ctypes.c_uint16)]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("mi", _MOUSEINPUT), ("ki", _KEYBDINPUT), ("hi", _HARDWAREINPUT)]


class _INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", ctypes.c_uint32), ("u", _INPUTUNION)]


class _RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_int32), ("top", ctypes.c_int32), ("right", ctypes.c_int32), ("bottom", ctypes.c_int32)]


if IS_WINDOWS:
    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _user32.SendInput.argtypes = (ctypes.c_uint, ctypes.POINTER(_INPUT), ctypes.c_int)
    _user32.SendInput.restype = ctypes.c_uint
    _user32.MapVirtualKeyW.argtypes = (ctypes.c_uint, ctypes.c_uint)
    _user32.MapVirtualKeyW.restype = ctypes.c_uint
    _user32.GetAsyncKeyState.argtypes = (ctypes.c_int,)
    _user32.GetAsyncKeyState.restype = ctypes.c_short
    _user32.GetForegroundWindow.restype = ctypes.c_void_p
    _user32.GetWindowTextW.argtypes = (ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int)
    _user32.GetWindowThreadProcessId.argtypes = (ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32))
    _user32.GetWindowThreadProcessId.restype = ctypes.c_uint32
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _kernel32.GetConsoleWindow.restype = ctypes.c_void_p
    _user32.FindWindowW.argtypes = (ctypes.c_wchar_p, ctypes.c_wchar_p)
    _user32.FindWindowW.restype = ctypes.c_void_p
    _user32.SetWindowPos.argtypes = (
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
    )
    _user32.SystemParametersInfoW.argtypes = (ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_uint)
    if ctypes.sizeof(ctypes.c_void_p) == 8:
        _get_long, _set_long = _user32.GetWindowLongPtrW, _user32.SetWindowLongPtrW
    else:  # 32-bit Python only exports the non-Ptr names
        _get_long, _set_long = _user32.GetWindowLongW, _user32.SetWindowLongW
    _get_long.argtypes = (ctypes.c_void_p, ctypes.c_int)
    _get_long.restype = ctypes.c_ssize_t
    _set_long.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_ssize_t)
    _set_long.restype = ctypes.c_ssize_t


def _send(*inputs: _INPUT) -> None:
    if not IS_WINDOWS:
        return
    arr = (_INPUT * len(inputs))(*inputs)
    sent = _user32.SendInput(len(inputs), arr, ctypes.sizeof(_INPUT))
    if sent != len(inputs):
        raise OSError(ctypes.get_last_error(), "SendInput was blocked (is a higher-privilege window focused?)")


def _key(vk: int, up: bool) -> _INPUT:
    flags = _KEYEVENTF_KEYUP if up else 0
    if vk in _EXTENDED_KEYS:
        flags |= _KEYEVENTF_EXTENDEDKEY
    scan = _user32.MapVirtualKeyW(vk, 0) if IS_WINDOWS else 0
    return _INPUT(type=_INPUT_KEYBOARD, ki=_KEYBDINPUT(wVk=vk, wScan=scan, dwFlags=flags))


def press_key(vk: int, times: int = 1) -> None:
    for _ in range(times):
        _send(_key(vk, False), _key(vk, True))


def scroll_wheel(notches: float) -> None:
    """Positive scrolls up (towards the previous item), negative scrolls down."""
    delta = int(round(notches * WHEEL_DELTA))
    _send(_INPUT(type=_INPUT_MOUSE, mi=_MOUSEINPUT(mouseData=delta, dwFlags=_MOUSEEVENTF_WHEEL)))


def key_down(vk: int) -> bool:
    return IS_WINDOWS and bool(_user32.GetAsyncKeyState(vk) & 0x8000)


def foreground_is_own(title: str) -> bool:
    """True if the focused window is this app's preview or console window."""
    if not IS_WINDOWS:
        return False
    hwnd = _user32.GetForegroundWindow()
    if not hwnd:
        return False
    pid = ctypes.c_uint32()
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if pid.value == os.getpid() or hwnd == _kernel32.GetConsoleWindow():
        return True
    # Windows Terminal hosts the console in its own process; match its title instead.
    buf = ctypes.create_unicode_buffer(512)
    _user32.GetWindowTextW(hwnd, buf, len(buf))
    return title in buf.value


def work_area() -> Optional[Tuple[int, int, int, int]]:
    """Desktop area not covered by the taskbar: (left, top, right, bottom)."""
    if not IS_WINDOWS:
        return None
    rect = _RECT()
    if not _user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):  # SPI_GETWORKAREA
        return None
    return rect.left, rect.top, rect.right, rect.bottom


def make_overlay(title: str, topmost: bool = True) -> bool:
    """Keep a window on top and stop it from stealing keyboard focus when clicked.

    That way the browser playing the reels stays focused while the preview is visible.
    """
    if not IS_WINDOWS:
        return False
    hwnd = _user32.FindWindowW(None, title)
    if not hwnd:
        return False
    GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_APPWINDOW = -20, 0x08000000, 0x00040000
    style = _get_long(hwnd, GWL_EXSTYLE)
    # APPWINDOW keeps the taskbar button that NOACTIVATE would otherwise hide.
    _set_long(hwnd, GWL_EXSTYLE, style | WS_EX_NOACTIVATE | WS_EX_APPWINDOW)
    SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE, SWP_FRAMECHANGED = 0x1, 0x2, 0x10, 0x20
    insert_after = ctypes.c_void_p(-1 if topmost else -2)  # HWND_TOPMOST / HWND_NOTOPMOST
    _user32.SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_FRAMECHANGED)
    return True


class Hotkeys:
    """Polls global Ctrl+Alt+<key> shortcuts (works while any window is focused)."""

    def __init__(self, **bindings: str):
        self._bindings = {name: ord(key.upper()) for name, key in bindings.items()}
        self._was_down = {name: False for name in bindings}

    def poll(self) -> set:
        fired = set()
        if not IS_WINDOWS:
            return fired
        mods = key_down(VK_CONTROL) and key_down(VK_MENU)
        for name, vk in self._bindings.items():
            down = mods and key_down(vk)
            if down and not self._was_down[name]:
                fired.add(name)
            self._was_down[name] = down
        return fired
