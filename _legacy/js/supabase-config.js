import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://supabase.com/dashboard/project/iycgzdxjwjwbcntkbzpy'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5Y2d6ZHhqd2p3YmNudGtienB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTcwNjIsImV4cCI6MjA3MzA5MzA2Mn0.EAq3Tb-yR0KzwWvb-3BgJ3ZQCjO4ARl_UI3R5ckubCU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
