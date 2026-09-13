const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const files = require('./files.cjs');
const root = path.resolve(__dirname, '..');
const archives = fs.readdirSync(root).filter(name => /^Browser-Audio-Extension-v\d+\.\d+\.\d+\.zip$/.test(name));
assert.equal(archives.length, 1, 'Exactly one release ZIP expected');
const archive = path.join(root, archives[0]);
const names = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(name => !name.endsWith('/'));
assert.deepEqual(names.sort(), [...files].sort(), 'ZIP must have the manifest at root and only release files');
for (const file of files) {
  const packaged = execFileSync('unzip', ['-p', archive, file]);
  assert.ok(packaged.equals(fs.readFileSync(path.join(root, file))), 'ZIP contents mismatch: ' + file);
}
console.log('Verified ZIP structure and every file against source.');
