"""Tiny XTEST helper for the lab's Xvfb display. Usage: xinput.py click X Y | key KEYSYM"""
import sys, time
from Xlib import X, XK, display
from Xlib.ext import xtest
d = display.Display(':107')
cmd = sys.argv[1]
if cmd == 'click':
    x, y = int(sys.argv[2]), int(sys.argv[3])
    xtest.fake_input(d, X.MotionNotify, x=x, y=y); d.sync(); time.sleep(0.15)
    xtest.fake_input(d, X.ButtonPress, 1); d.sync(); time.sleep(0.08)
    xtest.fake_input(d, X.ButtonRelease, 1); d.sync()
elif cmd == 'key':
    code = d.keysym_to_keycode(XK.string_to_keysym(sys.argv[2]))
    xtest.fake_input(d, X.KeyPress, code); d.sync(); time.sleep(0.05)
    xtest.fake_input(d, X.KeyRelease, code); d.sync()
