"""Minimal Riot RMAN manifest reader + selective file downloader (public patch CDN only).
Usage: rman.py MANIFEST list [regex]
       rman.py MANIFEST get REGEX OUTDIR"""
import re, struct, sys, urllib.request
from pathlib import Path
import zstandard

CDN = 'https://lol.secure.dyn.riotcdn.net/channels/public/bundles/{:016X}.bundle'


class Table:
    def __init__(self, buf, pos):
        self.buf, self.pos = buf, pos
        vt = pos - struct.unpack_from('<i', buf, pos)[0]
        vt_len = struct.unpack_from('<H', buf, vt)[0]
        self.offsets = [struct.unpack_from('<H', buf, vt + 4 + 2 * i)[0] for i in range((vt_len - 4) // 2)]

    def _off(self, i):
        return self.offsets[i] if i < len(self.offsets) else 0

    def scalar(self, i, fmt, default=0):
        o = self._off(i)
        return struct.unpack_from('<' + fmt, self.buf, self.pos + o)[0] if o else default

    def _indirect(self, i):
        o = self._off(i)
        if not o:
            return None
        p = self.pos + o
        return p + struct.unpack_from('<I', self.buf, p)[0]

    def string(self, i):
        p = self._indirect(i)
        if p is None:
            return ''
        n = struct.unpack_from('<I', self.buf, p)[0]
        return self.buf[p + 4:p + 4 + n].decode()

    def vector(self, i):
        p = self._indirect(i)
        if p is None:
            return 0, 0
        return struct.unpack_from('<I', self.buf, p)[0], p + 4

    def tables(self, i):
        n, p = self.vector(i)
        return [Table(self.buf, p + 4 * k + struct.unpack_from('<I', self.buf, p + 4 * k)[0]) for k in range(n)]

    def u64s(self, i):
        n, p = self.vector(i)
        return list(struct.unpack_from(f'<{n}Q', self.buf, p)) if n else []


def load(path):
    raw = Path(path).read_bytes()
    assert raw[:4] == b'RMAN'
    offset, length = struct.unpack_from('<II', raw, 8)
    body = zstandard.ZstdDecompressor().decompress(raw[offset:offset + length], max_output_size=1 << 30)
    root = Table(body, struct.unpack_from('<I', body, 0)[0])
    chunks = {}  # chunk id -> (bundle id, offset in bundle, compressed size, uncompressed size)
    for b in root.tables(0):
        bid, off = b.scalar(0, 'Q'), 0
        for c in b.tables(1):
            csz, usz = c.scalar(1, 'I'), c.scalar(2, 'I')
            chunks[c.scalar(0, 'Q')] = (bid, off, csz, usz)
            off += csz
    dirs = {d.scalar(0, 'Q'): (d.scalar(1, 'Q'), d.string(2)) for d in root.tables(3)}

    def full(did, name):
        parts = [name]
        while did and did in dirs:
            did, dname = dirs[did]
            if dname:
                parts.append(dname)
        return '/'.join(reversed(parts))

    files = [(full(f.scalar(1, 'Q'), f.string(3)), f.scalar(2, 'I'), f.u64s(7)) for f in root.tables(2)]
    return files, chunks


def fetch_range(url, start, length):
    req = urllib.request.Request(url, headers={'Range': f'bytes={start}-{start + length - 1}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


if __name__ == '__main__':
    files, chunks = load(sys.argv[1])
    if sys.argv[2] == 'list':
        pat = re.compile(sys.argv[3] if len(sys.argv) > 3 else '.')
        for name, size, _ in sorted(files):
            if pat.search(name):
                print(f'{size:>12} {name}')
    elif sys.argv[2] == 'get':
        pat, out = re.compile(sys.argv[3]), Path(sys.argv[4])
        dctx = zstandard.ZstdDecompressor()
        for name, size, ids in files:
            if not pat.search(name):
                continue
            dest = out / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('wb') as fh:
                for cid in ids:
                    bid, off, csz, usz = chunks[cid]
                    fh.write(dctx.decompress(fetch_range(CDN.format(bid), off, csz), max_output_size=usz))
            print(f'{size:>12} {name}')
