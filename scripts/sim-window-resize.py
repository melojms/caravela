"""Resize the Vega Virtual Device's XWayland window, e.g. to 1920x1080 for
sharp README screenshots without the on-screen remote.

Usage: GDK_BACKEND=x11 python3 scripts/sim-window-resize.py <window id, hex> <width> <height>
"""
import sys

import gi

gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gdk, GdkX11  # noqa: E402

display = GdkX11.X11Display.get_default()
window = GdkX11.X11Window.foreign_new_for_display(display, int(sys.argv[1], 16))
window.resize(int(sys.argv[2]), int(sys.argv[3]))
Gdk.flush()
