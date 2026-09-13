// byUS小序
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const files = require('./files.cjs');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.ok(manifest.background && manifest.action, 'Not a browser extension');
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, 'v' + manifest.version, 'Tag and manifest version must match');
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  // Refuse unexpected leftovers instead of deleting user data or packing stale files.
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(dist, path.join(dir, e.name)).split(path.sep).join('/')]);
  assert.ok(walk(dist).every(file => files.includes(file)), 'Unexpected files in dist; inspect before building');
}
for (const file of files) {
  const source = path.join(root, file);
  assert.ok(!fs.lstatSync(source).isSymbolicLink(), 'Do not package symlinks');
  const bytes = fs.readFileSync(source);
  if (!file.endsWith('.png')) {
    const text = bytes.toString('utf8');
    assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN .*PRIVATE KEY-----)/.test(text), 'Possible credential in package');
    if (file.endsWith('.js')) new vm.Script(text, { filename: file });
  }
  const destination = path.join(dist, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
console.log(`Built extension v${manifest.version}: ${files.length} allowlisted files; no runtime dependencies.`);
