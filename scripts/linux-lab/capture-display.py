from pathlib import Path
import struct,zlib
root=Path('/home/zando/rotations-linux-lab')
xwd=(root/'wine/Xvfb_screen0').read_bytes()
h=struct.unpack('>25I',xwd[:100]); _,_,_,depth,w,ht,_,order,_,_,_,bpp,stride,_,rm,gm,bm,_,_,colors,*_=h
assert bpp==32 and order==0 and (rm,gm,bm)==(0xff0000,0xff00,0xff), (depth,bpp,order,rm,gm,bm)
offset=h[0]+colors*12
rows=[]
for y in range(ht):
 src=xwd[offset+y*stride:offset+y*stride+w*4]; row=bytearray(w*3)
 row[0::3]=src[2::4];row[1::3]=src[1::4];row[2::3]=src[0::4];rows.append(b'\0'+row)
def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',w,ht,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
(root/'research/wine-screen.png').write_bytes(png)
