const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = require('../scripts/files.cjs');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
test('release branding and version identifiers remain consistent', () => {
  assert.equal(manifest.name, '浏览器拉线助手');
  const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.ok(!/测试版|实验版/.test(popup));
  assert.equal(require('../package.json').version, manifest.version);
  assert.equal(require('../package-lock.json').version, manifest.version);
  const hook = fs.readFileSync(path.join(root, 'audio-hook.js'), 'utf8');
  assert.ok(hook.includes(`const version = "${manifest.version}";`));
});
test('package has only reviewed extension files', () => {
  assert.equal(files.length, 14);
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(!files.some(file => file.includes('tests/') || file.includes('.env') || file.endsWith('.exe')));
});
test('manifest permissions remain limited to local storage and ordinary web scripting', () => {
  assert.deepEqual(manifest.permissions, ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.update_url, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});
test('all manifest icons are packaged and have matching dimensions', () => {
  for (const [size, file] of Object.entries(manifest.icons)) {
    const b = fs.readFileSync(path.join(root, file));
    assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(b.readUInt32BE(16), Number(size)); assert.equal(b.readUInt32BE(20), Number(size));
  }
});
