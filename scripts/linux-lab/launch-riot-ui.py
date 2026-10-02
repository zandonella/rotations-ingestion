from pathlib import Path
import os,subprocess
lab=Path('/home/zando/rotations-linux-lab')
lock=lab/'wine/prefix/drive_c/users/zando/AppData/Local/Riot Games/Riot Client/Config/lockfile'
_,pid,port,password,protocol=lock.read_text().strip().split(':')
env=os.environ.copy();env.update(DISPLAY=':107',WINEPREFIX=str(lab/'wine/prefix'),WINEDEBUG='-all',LIBGL_ALWAYS_SOFTWARE='1',TMPDIR=str(lab/'tmp'))
wine=lab/'tools/wine-11.18-amd64-wow64/bin/wine'
args=[str(wine),str(lab/'wine/prefix/drive_c/Riot Games/Riot Client/RiotClientElectron/Riot Client.exe'),f'--appPort={port}',f'--remotingAuthToken={password}',f'--appPid={pid}','--userDataRoot=C:/users/zando/AppData/Local/Riot Games/Riot Client','--logDir=C:/users/zando/AppData/Local/Riot Games/Riot Client/Logs','--enableHardwareAcceleration=false','--no-sandbox','--disable-gpu']
with (lab/'logs/wine-ui-software.log').open('w') as log:
 subprocess.run(args,env=env,stdout=log,stderr=log)
