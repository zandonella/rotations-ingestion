"""Print a fresh Riot QR-login link from the lab display and wait until the Riot Client is signed in.
Run: tools/venv/bin/python tools/qr-login.py   (open the printed link on a phone with Riot Mobile)"""
import base64, json, ssl, subprocess, sys, time, urllib.request
from pathlib import Path
import cv2
LAB = Path(__file__).resolve().parent.parent
LOCK = LAB / 'wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile'
PY = str(LAB / 'tools/venv/bin/python')

def api(path):
    _, _, port, pw, _ = LOCK.read_text().strip().split(':')
    req = urllib.request.Request(f'https://127.0.0.1:{port}{path}', headers={
        'Authorization': 'Basic ' + base64.b64encode(f'riot:{pw}'.encode()).decode()})
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=5) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

def signed_in(): return api('/rso-auth/v1/authorization') == 200

def qr_url():
    subprocess.run([PY, str(LAB / 'tools/xinput.py'), 'click', '225', '188']); time.sleep(4)
    subprocess.run(['python3', str(LAB / 'tools/capture-display.py')], check=True)
    img = cv2.imread(str(LAB / 'research/wine-screen.png'))[240:490, 40:295]
    img = cv2.resize(img, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    return cv2.QRCodeDetector().detectAndDecode(img)[0]

if signed_in(): sys.exit(print('Already signed in.'))
last = None
deadline = time.time() + 900
while time.time() < deadline:
    url = qr_url()
    key = url.split('&timestamp')[0] if url else None  # timestamp changes on every redraw
    if key and key != last:
        print(f'\nOpen on your phone (Riot Mobile):\n{url}\n', flush=True); last = key
    for _ in range(12):
        if signed_in(): sys.exit(print('Signed in. Session is persisted (Stay signed in).'))
        time.sleep(5)
print('Timed out after 15 minutes.'); sys.exit(1)
