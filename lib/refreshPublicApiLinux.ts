import { isLocalMode } from './localMode.js';
import { supabase } from './supabaseLinux.ts';
import { refreshPublicApiWithClient } from './publicApiUpdate.js';
type WarningLogger = { warn(message: string): void };

export async function refreshPublicApi(logger: WarningLogger): Promise<boolean> {
    return refreshPublicApiWithClient(logger, supabase, !isLocalMode());
}
