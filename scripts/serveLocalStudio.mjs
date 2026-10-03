// Studio remains on loopback. Forward only from this machine's Tailscale IPv4.
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const address = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim();
const [first, second] = address.split('.').map(Number);
if (!net.isIPv4(address) || first !== 100 || second < 64 || second > 127) {
    throw new Error('A Tailscale IPv4 address is required; refusing another bind address.');
}

const server = net.createServer(client => {
    const upstream = net.connect({ host: '127.0.0.1', port: 55423 });
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.end());
});
server.listen(55423, address, () => console.log(`Local Studio available on tailnet: http://${address}:55423`));
