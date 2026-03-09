import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://djvdkhugqsqqzpdbsgpi.supabase.co'
const supabaseKey = 'sb_publishable_6qgPFci-BBnUqXninjyf4g_XqlGxvu9'

const supabase = createClient(supabaseUrl, supabaseKey)

console.log("Connexion à Supabase réussie")