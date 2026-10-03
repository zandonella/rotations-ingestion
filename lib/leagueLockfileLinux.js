export function parseLeagueLockfile(lockfileContent) {
    const match =
        /^LeagueClient:(\d+):(\d+):(.+):https$/.exec(lockfileContent.trim());

    if (!match) {
        throw new Error('League client lockfile has an unexpected format.');
    }

    const port = Number(match[2]);
    if (port < 1 || port > 65535 || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
        throw new Error('League client lockfile has invalid process or port values.');
    }

    return {
        processId: Number(match[1]),
        port,
        password: match[3],
    };
}
