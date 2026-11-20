/* The Trail: which camps exist, in order. The engine (engine.js) does the walking; each camp is
 * its own module in camps/. A camp that fails to load is simply "not open yet" on the map. */
import { start } from './engine.js?v=a318c6b5';
import { t, loadWords } from './words.js?v=a318c6b5';

await loadWords();                 // before any camp is imported: camps translate their words as they load

// All five, so the map can show what is ahead even before a camp is built.
const NAMES = [
  { id: 'trailhead', name: t('The Trailhead'), sub: t('Reason') },
  { id: 'workshop', name: t('The Workshop'), sub: t('Craft') },
  { id: 'shelter', name: t('The Shelter'), sub: t('Fellowship') },
  { id: 'overlook', name: t('The Overlook'), sub: t('Creed') },
  { id: 'summit', name: t('The Summit'), sub: '' },
];

const camps = [];
for (const { id } of NAMES) {
  try { camps.push((await import(`./camps/${id}.js?v=a318c6b5`)).default); }
  catch (e) { break; }                       // camps open in order: stop at the first one that is not there
}
start(camps, NAMES);

// The register: people who chose to sign it, and their lights on the map. Optional: the trail
// works without it, and it shows nothing when nobody has signed.
try {
  const { mountRegister, drawLights } = await import('./register.js?v=a318c6b5');
  const { lights } = await mountRegister(document.getElementById('register'));
  const paint = () => { try { drawLights(lights); } catch (e) { /* the map still works without lights */ } };
  paint(); document.addEventListener('trail:map', paint);
} catch (e) { /* no register yet */ }
