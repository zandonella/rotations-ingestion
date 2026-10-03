import fs from 'node:fs';
try {
    const pid = Number(fs.readFileSync('data/run/production-run.pid', 'utf8').trim());
    if (!Number.isSafeInteger(pid) || pid < 2) throw new Error('Invalid production PID.');
    const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
    if (!args.includes('scripts/runProductionDirect.sh')) throw new Error('PID is not a production runner.');
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (Number(fields[2]) !== pid) throw new Error('Production runner has no isolated process group.');
    process.kill(-pid, 'SIGTERM');
} catch (error) {
    if (!['ENOENT', 'ESRCH'].includes(error.code)) { console.error(error.message); process.exitCode = 1; }
}
