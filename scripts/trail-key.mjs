#!/usr/bin/env node
/* The Trail: make the key that runs are sealed to, and keep it as files.
 *
 *   node scripts/trail-key.mjs                    asks for a passphrase, writes the files, fills in trail/config.json
 *   node scripts/trail-key.mjs --out <folder>     where the files go (default ~/Documents/wemiller-trail-key)
 *   node scripts/trail-key.mjs --check            say which key the files and the site agree on; makes nothing
 *
 * What it writes (the folder is private to you; nothing in it belongs in the repository):
 *   trail-key-backup.json     the private key, locked with your passphrase. This is the file the
 *                             reading desk (/trail/desk/) restores from, in any browser, on any device.
 *   trail-stewards-file.json  the same private key locked a second way, for the people you trust.
 *   share-1.txt … share-4.txt one for each of them. Any three, with the stewards' file, open it.
 *   trail-public.json         the public half. Not secret: it can only seal, never open.
 *
 * The public half (and nothing else) is copied into trail/config.json, which opens sending.
 * The passphrase is typed here, never passed on the command line, and never written anywhere. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportPrivateKey, importPrivateKey, splitToShares, fingerprint } from '../trail/seal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const OUT = path.resolve((arg('--out') || path.join(os.homedir(), 'Documents', 'wemiller-trail-key')).replace(/^~(?=\/)/, os.homedir()));
const CONFIG = path.join(ROOT, 'trail', 'config.json'), REPO = 'blaineam/blaineam.github.io';
const file = (name) => path.join(OUT, name);

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(question); };      // show the question, not what is typed
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}
function setConfig(publicKey, keyId) {
  const text = fs.readFileSync(CONFIG, 'utf8'), cfg = JSON.parse(text);
  cfg.publicKey = publicKey; cfg.keyId = keyId; if (!cfg.repo) cfg.repo = REPO;
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
}

if (argv.includes('--check')) {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  console.log(`site (trail/config.json): ${cfg.keyId || 'no key yet'}`);
  for (const n of ['trail-public.json', 'trail-key-backup.json', 'trail-stewards-file.json']) {
    if (!fs.existsSync(file(n))) { console.log(`${n}: not in ${OUT}`); continue; }
    const j = JSON.parse(fs.readFileSync(file(n), 'utf8')), kid = j.keyId || j.kid || (j.publicKey ? await fingerprint(j.publicKey) : '?');
    console.log(`${n}: ${kid}${cfg.keyId && kid !== cfg.keyId ? '   ← does NOT match the site' : ''}`);
  }
  process.exit(0);
}

if (!process.stdin.isTTY) { console.log('Run this in a terminal of your own: it has to ask you for a passphrase.'); process.exit(1); }
for (const n of ['trail-key-backup.json', 'trail-stewards-file.json', 'trail-public.json']) {
  if (fs.existsSync(file(n))) { console.log(`${file(n)} already exists. A new key would orphan every run sealed to the old one, so nothing was changed.\nMove the old files away first if you really mean to start again, or use --out for another folder.`); process.exit(1); }
}
const current = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
if (current.publicKey) { console.log(`trail/config.json already has a key (${current.keyId}). Runs sealed to it could not be opened with a new one, so nothing was changed.`); process.exit(1); }

console.log(`This makes the trail's key and saves it in:\n  ${OUT}\n`);
console.log('Choose a passphrase of at least 12 characters (several unrelated words is best).\nIt locks the backup file. Nobody can reset it, so put it in your password manager.\n');
const pass = await ask('Passphrase: ', true), again = await ask('Once more:  ', true);
if (pass !== again) { console.log('Those two were not the same. Nothing was made.'); process.exit(1); }
if (pass.length < 12) { console.log('That is shorter than 12 characters. Nothing was made.'); process.exit(1); }

console.log('\nMaking a key (this takes a little while)…');
const pair = await generateKeyPair();
console.log('Locking the backup with your passphrase…');
const backup = await exportPrivateKey(pair.privateKey, pass);
const secret = crypto.getRandomValues(new Uint8Array(32));
const stewards = await exportPrivateKey(pair.privateKey, secret);
const split = splitToShares(secret, { shares: 4, threshold: 3 }); secret.fill(0);
await importPrivateKey(backup, pass);                    // prove the backup opens before anything is written

fs.mkdirSync(OUT, { recursive: true, mode: 0o700 });
const put = (name, text) => fs.writeFileSync(file(name), text, { mode: 0o600, flag: 'wx' });
put('trail-key-backup.json', JSON.stringify(backup, null, 2) + '\n');
put('trail-stewards-file.json', JSON.stringify({ ...stewards, shares: { set: split.set, threshold: split.threshold, of: split.shares } }, null, 2) + '\n');
split.texts.forEach((text, i) => put(`share-${i + 1}.txt`, text + '\n'));
put('trail-public.json', JSON.stringify({ publicKey: pair.publicJwk, keyId: pair.kid }, null, 2) + '\n');
put('README.txt', `The Trail: key files, made ${new Date().toISOString().slice(0, 10)}. Key id ${pair.kid}.

trail-key-backup.json      Your private key, locked with your passphrase. To read runs in any
                           browser: open wemiller.com/trail/desk/, under "The key" pick this file,
                           type the passphrase and press "Restore the key". Keep a second copy somewhere
                           that is not this computer.
trail-stewards-file.json   The same key, locked for the four people you trust.
share-1.txt … share-4.txt  One for each of them. Any three, together with the stewards' file,
                           open it without your passphrase. Give each person one share and the
                           stewards' file; do not keep the shares together anywhere but here.
trail-public.json          The public half. Not secret.

Never put this folder in a repository or a shared drive.
`);
setConfig(pair.publicJwk, pair.kid);

console.log(`\nDone. Key id: ${pair.kid}\n\nSaved in ${OUT}:\n  trail-key-backup.json, trail-stewards-file.json, share-1.txt … share-4.txt, trail-public.json, README.txt\n`);
console.log('trail/config.json now has the public half, so sending opens once that file is pushed.\nNothing private was written inside the repository.');
