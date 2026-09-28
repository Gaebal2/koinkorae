import { rolldown } from 'rolldown';
import { mkdir } from 'node:fs/promises';
await mkdir('.runtime/supabase-migration/community',{recursive:true});
const bundle=await rolldown({input:'supabase/functions/community/index.ts',external:id=>id.startsWith('npm:')});
await bundle.write({file:'.runtime/supabase-migration/community/index.ts',format:'esm'});
await bundle.close();
console.log('Dashboard upload: .runtime/supabase-migration/community/index.ts');
