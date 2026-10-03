export function parseLeagueLockfile(lockfileContent) {
    const match =
        /^LeagueClient:(\d+):(\d+):(.+):https$/.exec(lockfileContent.trim());

    if (!match) {
        throw new Error('League client lockfile has an unexpected format.');
    }

    return {
        processId: Number(match[1]),
        port: Number(match[2]),
        password: match[3],
    };
}
