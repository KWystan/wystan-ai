import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabasePublishableKey || '');
