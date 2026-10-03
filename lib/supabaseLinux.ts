import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { assertLocalSupabase, isLocalMode, localSupabaseFetch } from './localMode.js';
dotenv.config({ quiet: true });

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_KEY as string;
assertLocalSupabase();
export const supabase = createClient(supabaseUrl, supabaseKey,
    isLocalMode() ? { global: { fetch: localSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } } : undefined,
);
