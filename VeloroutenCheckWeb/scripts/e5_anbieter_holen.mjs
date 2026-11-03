import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const quelle=resolve(process.argv[2]??'../../fgsCheck/fgsCheckWeb/src'),ziel=resolve('src/e5')
const dateien=['daten/anbieter/gemeinsam/bundesBudget.ts','daten/anbieter/gemeinsam/bundesAbruf.ts','daten/anbieter/gemeinsam/gebiet.ts','daten/anbieter/gemeinsam/e6.ts','daten/anbieter/gemeinsam/bav.ts','daten/anbieter/gemeinsam/typen.ts','geo.ts','daten/holen.ts','daten/geoHilfen.ts','daten/anbieter/npvm.ts','daten/anbieter/npvmZuordnung.ts','daten/anbieter/gemeinsam/metadaten.ts','daten/anbieter/gemeinsam/qualitaet.ts','daten/anbieter/gemeinsam/geoAdmin.ts','daten/anbieter/gemeinsam/zuerich.ts','daten/anbieter/gemeinsam/zuerichZuordnung.ts']
const hashes={}
for(const f of dateien){const b=readFileSync(resolve(quelle,f));mkdirSync(dirname(resolve(ziel,f)),{recursive:true});writeFileSync(resolve(ziel,f),b);hashes[f]=createHash('sha256').update(b).digest('hex')}
writeFileSync(resolve(ziel,'herkunft.json'),JSON.stringify({quelle:'fgsCheck/fgsCheckWeb/src',hinweis:'Geprüfte E1b-/E2-Helfer und E6a-Kontextadapter, unverändert übernommen; Anbieterwahl nach tatsächlichem Datenort.',dateien:hashes},null,2)+'\n')
