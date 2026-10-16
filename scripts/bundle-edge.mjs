import { rolldown } from 'rolldown';
import { mkdir } from 'node:fs/promises';
for(const name of ['community','push-dispatch']) {
 const directory='.runtime/supabase-migration/'+name;
 await mkdir(directory,{recursive:true});
 const bundle=await rolldown({input:'supabase/functions/'+name+'/index.ts',external:id=>id.startsWith('npm:')});
 await bundle.write({file:directory+'/index.ts',format:'esm'});
 await bundle.close();
 console.log('Dashboard upload: '+directory+'/index.ts');
}
