import { supabase } from './supabase.ts';
import { refreshPublicApiWithClient } from './publicApiUpdate.js';
type WarningLogger = { warn(message: string): void };

export async function refreshPublicApi(logger: WarningLogger): Promise<boolean> {
    return refreshPublicApiWithClient(logger, supabase);
}
