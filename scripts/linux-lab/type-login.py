"""Type Riot credentials into the lab's sign-in window without echoing them.
Run in YOUR terminal:  ~/rotations-linux-lab/tools/venv/bin/python ~/rotations-linux-lab/tools/type-login.py
Credentials go straight from your keyboard to the X display; nothing is printed or saved."""
import getpass, time
from Xlib import X, XK, display
from Xlib.ext import xtest
d = display.Display(':107')
SHIFT = d.keysym_to_keycode(XK.XK_Shift_L)

def click(x, y):
    xtest.fake_input(d, X.MotionNotify, x=x, y=y); d.sync(); time.sleep(0.2)
    xtest.fake_input(d, X.ButtonPress, 1); d.sync(); time.sleep(0.08)
    xtest.fake_input(d, X.ButtonRelease, 1); d.sync(); time.sleep(0.3)

def press(code, shift=False):
    if shift: xtest.fake_input(d, X.KeyPress, SHIFT)
    xtest.fake_input(d, X.KeyPress, code); xtest.fake_input(d, X.KeyRelease, code)
    if shift: xtest.fake_input(d, X.KeyRelease, SHIFT)
    d.sync(); time.sleep(0.03)

CTRL = d.keysym_to_keycode(XK.XK_Control_L)
def clear_field():
    xtest.fake_input(d, X.KeyPress, CTRL); press(d.keysym_to_keycode(ord('a'))); xtest.fake_input(d, X.KeyRelease, CTRL)
    press(d.keysym_to_keycode(XK.XK_BackSpace)); time.sleep(0.2)

def type_text(text):
    for ch in text:
        sym = ord(ch) if ord(ch) < 256 else 0x01000000 + ord(ch)  # Latin-1 keysyms equal code points
        codes = list(d.keysym_to_keycodes(sym))
        if not codes: raise SystemExit('A character could not be typed on this keymap; nothing more was sent.')
        code, index = codes[0]
        press(code, shift=index % 2 == 1)

user = input('Riot username: ')
pw = getpass.getpass('Riot password (hidden): ')
click(110, 188); time.sleep(2)                    # Sign-in tab; let the tab animation finish
click(167, 258); clear_field(); type_text(user)   # username field
click(167, 311); clear_field(); type_text(pw)     # password field
del pw
time.sleep(0.5); click(167, 622)                  # arrow (submit) button
print('Submitted. If Riot asks for a captcha or a 2FA code, tell Claude.')
