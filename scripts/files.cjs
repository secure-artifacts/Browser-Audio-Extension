// Explicit allowlist: never ship build tooling, credentials or test fixtures in the extension.
module.exports = [
  'manifest.json', 'audio-hook.js', 'background.js', 'page-status.js',
  'popup.html', 'popup.css', 'popup.js',
  'icons/16.png', 'icons/32.png', 'icons/48.png', 'icons/128.png',
  '使用说明.txt', '测试记录.txt', '更新说明.txt'
];
