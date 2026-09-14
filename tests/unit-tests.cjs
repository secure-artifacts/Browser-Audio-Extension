const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const currentVersion = require('../manifest.json').version;
const source = fs.readFileSync(path.resolve(__dirname, '../audio-hook.js'), 'utf8');
const normalized = value => JSON.parse(JSON.stringify(value));
const quiet = value => {
  assert.equal(value.echoCancellation.exact, 'remote-only');
  for (const key of ['autoGainControl', 'noiseSuppression']) assert.equal(value[key].exact, false);
};
function fixture() {
  let call, applyCall, reject;
  class Track {
    constructor(kind = 'audio') { this.kind = kind; this.readyState = 'live'; this.enabled = true; this.muted = false; this.settings = { echoCancellation: 'remote-only', autoGainControl: false, noiseSuppression: false }; }
    getSettings() { return this.settings; }
    applyConstraints(c) { applyCall = c; return Promise.resolve(); }
    clone() { return new Track(this.kind); }
  }
  const track = new Track();
  class Stream {
    constructor(audio = [track]) { this.audio = audio; }
    getAudioTracks() { return this.audio; }
    clone() { return new Stream(this.audio.map(t => t.clone())); }
  }
  const stream = new Stream();
  class Devices {
    getUserMedia(c) { call = c; return reject ? Promise.reject(reject) : Promise.resolve(stream); }
  }
  const navigator = { mediaDevices: new Devices(), webkitGetUserMedia(c, success, fail) {
    call = c; if (reject) fail(reject); else success(stream);
  } };
  const context = vm.createContext({ navigator, MediaDevices: Devices, MediaStreamTrack: Track, MediaStream: Stream });
  vm.runInContext(source, context);
  return { context, navigator, stream, track, Track, snapshot: () => vm.runInContext('globalThis[Symbol.for("byUSXiaoxu.audioCompat.diagnostic")]()', context), get call() { return call; },
    get applyCall() { return applyCall; }, reject(error) { reject = error; } };
}
test('audio:true requests remote-only cancellation without AGC/NS and preserves stream', async () => {
  const f = fixture(); assert.equal(await f.navigator.mediaDevices.getUserMedia({ audio: true }), f.stream); quiet(f.call.audio);
});
test('does not mutate frozen source, video or device choice', async () => {
  const f = fixture(); const device = Object.freeze({ exact: 'chosen-virtual-input' });
  const video = Object.freeze({ width: { ideal: 1280 } });
  const audio = Object.freeze({ deviceId: device, channelCount: 2, echoCancellation: true });
  const input = Object.freeze({ audio, video });
  await f.navigator.mediaDevices.getUserMedia(input);
  assert.equal(input.audio.echoCancellation, true); assert.equal(f.call.video, video);
  assert.equal(f.call.audio.deviceId, device); assert.equal(f.call.audio.channelCount, 2); quiet(f.call.audio);
});
test('advanced constraints cannot override remote-only cancellation', async () => {
  const f = fixture(); const c = { audio: { advanced: [{ echoCancellation: true, sampleRate: 48000 }, { channelCount: 1 }] } };
  await f.navigator.mediaDevices.getUserMedia(c);
  assert.equal(f.call.audio.advanced[0].echoCancellation.exact, 'remote-only');
  assert.equal(c.audio.advanced[0].echoCancellation, true); assert.equal(f.call.audio.advanced[0].sampleRate, 48000);
});
test('video-only and audio:false requests pass through unchanged', async () => {
  const f = fixture();
  for (const c of [{ video: true }, { audio: false, video: true }, undefined, null]) {
    await f.navigator.mediaDevices.getUserMedia(c); assert.equal(f.call, c);
  }
});
test('native errors propagate without retry or fake success', async () => {
  const f = fixture(); const error = new Error('NotAllowedError'); f.reject(error);
  await assert.rejects(f.navigator.mediaDevices.getUserMedia({ audio: true }), value => value === error);
});
test('unsupported remote-only never silently falls back to cancellation disabled', async () => {
  const f = fixture(); const error = new Error('Unsupported echoCancellation'); error.name = 'OverconstrainedError'; f.reject(error);
  await assert.rejects(f.navigator.mediaDevices.getUserMedia({ audio: true }), value => value === error);
  quiet(f.call.audio);
  assert.equal(f.snapshot().error, 'OverconstrainedError');
});
test('explicit false/true/all or remote-only requests are normalized without mutation', async () => {
  for (const value of [false, true, 'all', 'remote-only', { exact: false }]) {
    const f = fixture(); const constraints = { audio: { echoCancellation: value } };
    await f.navigator.mediaDevices.getUserMedia(constraints);
    quiet(f.call.audio); assert.equal(constraints.audio.echoCancellation, value);
  }
});
test('microphone track applyConstraints is protected, including empty constraints', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  await f.track.applyConstraints({ echoCancellation: true, sampleRate: 48000 });
  quiet(f.applyCall); assert.equal(f.applyCall.sampleRate, 48000);
  await f.track.applyConstraints(); quiet(f.applyCall);
});
test('video and untracked screen-share audio are untouched', async () => {
  const f = fixture(); const c = { noiseSuppression: true };
  await new f.Track('video').applyConstraints(c); assert.equal(f.applyCall, c);
  await new f.Track('audio').applyConstraints(c); assert.equal(f.applyCall, c);
});
test('cloned microphone tracks remain protected', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  await f.track.clone().applyConstraints({ autoGainControl: true }); quiet(f.applyCall);
});
test('legacy capture callback and errors are preserved', () => {
  const f = fixture(); let result;
  f.navigator.webkitGetUserMedia({ audio: true }, stream => { result = stream; });
  assert.equal(result, f.stream); quiet(f.call.audio);
  const error = new Error('Permission denied'); f.reject(error);
  f.navigator.webkitGetUserMedia({ audio: true }, () => assert.fail(), actual => assert.equal(actual, error));
});
test('duplicate injection is idempotent', () => {
  const f = fixture(); const original = f.navigator.mediaDevices.getUserMedia;
  vm.runInContext(source, f.context); assert.equal(f.navigator.mediaDevices.getUserMedia, original);
});
test('insecure contexts without media APIs do not break page loading', () => {
  vm.runInNewContext(source, { navigator: {} });
});
test('locked native API does not break page loading', () => {
  const navigator = { mediaDevices: {} };
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => {}, writable: false, configurable: false });
  vm.runInNewContext(source, { navigator });
});

const background = fs.readFileSync(path.resolve(__dirname, '../background.js'), 'utf8');
const statusSource = fs.readFileSync(path.resolve(__dirname, '../page-status.js'), 'utf8');
async function workerFixture(saved = {}) {
  let scripts = [], listener, failRegister = false, failSave = false;
  const storage = { ...saved };
  const chrome = {
    scripting: {
      getRegisteredContentScripts: async () => scripts,
      registerContentScripts: async s => { if (failRegister) throw new Error(); scripts = s; },
      unregisterContentScripts: async () => { scripts = []; }
    },
    storage: { local: {
      setAccessLevel: async () => {}, get: async () => storage,
      set: async obj => { if (failSave) throw new Error(); Object.assign(storage, obj); }
    } },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    tabs: { query: async () => [] },
    runtime: { id: 'test', getURL: name => 'chrome-extension://test/' + name, getManifest: () => ({ version: currentVersion }),
      onMessage: { addListener: value => { listener = value; } } }
  };
  const context = vm.createContext({ chrome });
  context.importScripts = () => vm.runInContext(statusSource, context);
  vm.runInContext(background, context);
  const send = message => new Promise(resolve => listener(message, { id: 'test', url: chrome.runtime.getURL('popup.html') }, resolve));
  await send({ type: 'status' });
  return { send, storage, chrome, get scripts() { return scripts; },
    failRegister: () => { failRegister = true; }, failSave: () => { failSave = true; },
    untrusted: () => listener({ type: 'set', enabled: false }, { id: 'test', url: 'https://example.com' }, () => assert.fail()) };
}
test('first install defaults ON and registers early MAIN scripts for all ordinary sites', async () => {
  const w = await workerFixture(); assert.equal(w.storage.enabled, true);
  assert.deepEqual(normalized(w.scripts[0].matches), ['http://*/*', 'https://*/*']);
  assert.equal(w.scripts[0].runAt, 'document_start'); assert.equal(w.scripts[0].world, 'MAIN');
  assert.equal(w.scripts[0].allFrames, true); assert.equal(w.scripts[0].persistAcrossSessions, true);
});
test('saved OFF survives worker restart', async () => {
  const w = await workerFixture({ enabled: false }); assert.equal(w.scripts.length, 0);
  assert.equal((await w.send({ type: 'status' })).enabled, false);
});
test('toggle serializes and persists ON/OFF', async () => {
  const w = await workerFixture();
  const values = await Promise.all([w.send({ type: 'set', enabled: false }), w.send({ type: 'set', enabled: true })]);
  assert.equal(values[0].enabled, false); assert.equal(values[1].enabled, true); assert.equal(w.storage.enabled, true);
});
test('registration failure is reported and not saved as success', async () => {
  const w = await workerFixture({ enabled: false }); w.failRegister();
  assert.equal((await w.send({ type: 'set', enabled: true })).ok, false); assert.equal(w.storage.enabled, false);
});
test('storage failure rolls back script registration', async () => {
  const w = await workerFixture(); w.failSave();
  assert.equal((await w.send({ type: 'set', enabled: false })).ok, false);
  assert.equal(w.scripts.length, 1); assert.equal(w.storage.enabled, true);
});
test('web page cannot change settings through runtime messages', async () => {
  const w = await workerFixture(); assert.equal(w.untrusted(), undefined); assert.equal(w.storage.enabled, true);
});

test('inherited video/device constraints survive conversion', async () => {
  const f = fixture();
  const audio = Object.create(Object.freeze({ deviceId: { exact: 'selected' }, echoCancellation: true }));
  const c = Object.create({ video: { width: 640 } }); c.audio = audio;
  await f.navigator.mediaDevices.getUserMedia(c);
  assert.equal(f.call.video.width, 640); assert.equal(f.call.audio.deviceId.exact, 'selected'); quiet(f.call.audio);
});
test('whole stream clones remain tracked', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  const copy = f.stream.clone(); await copy.getAudioTracks()[0].applyConstraints({ echoCancellation: true }); quiet(f.applyCall);
});
test('native diagnostic has only non-identifying summary fields', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  f.track.settings.deviceId = 'DO-NOT-EXPOSE';
  const s = f.snapshot(); assert.equal(s.live, 1); assert.equal(s.processing, 0); assert.equal(s.unknown, 0);
  assert.equal(JSON.stringify(s).includes('DO-NOT-EXPOSE'), false);
});
test('native settings remain authoritative even when page overwrites getSettings', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  f.track.settings.echoCancellation = true;
  f.Track.prototype.getSettings = () => ({ echoCancellation: 'remote-only', autoGainControl: false, noiseSuppression: false });
  assert.equal(f.snapshot().processing, 1);
});
test('missing browser settings never report remote-only verified', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  delete f.track.settings.autoGainControl; assert.equal(f.snapshot().unknown, 1);
});
test('disabled, broad, and unknown echo modes cannot report target settings', async () => {
  for (const value of [false, true, 'all', 'unexpected-mode']) {
    const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
    f.track.settings.echoCancellation = value;
    assert.equal(f.snapshot().processing, 1);
  }
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({audio:true});
  delete f.track.settings.echoCancellation;
  assert.equal(f.snapshot().unknown, 1);
});
test('stopped tracks are removed from live diagnosis', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  f.track.readyState = 'ended'; assert.equal(f.snapshot().live, 0);
});
test('disabled or muted tracks are not reported as transmitting', async () => {
  const f = fixture(); await f.navigator.mediaDevices.getUserMedia({ audio: true });
  f.track.enabled = false; assert.equal(f.snapshot().muted, 1);
});
test('capture failures produce sanitized diagnostic and clear on successful retry', async () => {
  const f = fixture(); const error = new Error('private device details'); error.name = 'OverconstrainedError'; f.reject(error);
  await assert.rejects(f.navigator.mediaDevices.getUserMedia({ audio: true }));
  assert.equal(f.snapshot().error, 'OverconstrainedError'); assert.equal(JSON.stringify(f.snapshot()).includes('private'), false);
  f.reject(null); await f.navigator.mediaDevices.getUserMedia({ audio: true }); assert.equal(f.snapshot().error, null);
});
test('page override of capture method is detected', () => {
  const f = fixture(); f.navigator.mediaDevices.getUserMedia = () => Promise.resolve(f.stream);
  // An instance override shadows the patched prototype; snapshot must not falsely claim readiness.
  assert.equal(f.snapshot().hooked, false);
});

function summarize(frames, enabled = true) {
  const context = vm.createContext({ frames, enabled });
  vm.runInContext(statusSource, context);
  context.currentVersion = currentVersion;
  return vm.runInContext('summarizeFrames(frames.map(result => ({ result })), enabled, currentVersion)', context);
}
const ready = { version: currentVersion, available: true, hooked: true, live: 0, processing: 0, unknown: 0, muted: 0, pending: 0, error: null };
test('ready without capture does not claim verified', () => assert.equal(summarize([ready]).code, 'ready'));
test('all live captured settings matching remote-only is verified', () => assert.equal(summarize([{ ...ready, live: 1 }]).code, 'verified'));
test('pending refresh is distinct for ON and OFF', () => {
  assert.equal(summarize([]).code, 'reload');
  assert.equal(summarize([ready], false).code, 'reload-off');
  assert.equal(summarize([], false).code, 'off');
});
test('old version requires refresh', () => assert.equal(summarize([{ ...ready, version: '0.1.0' }]).code, 'reload'));
test('active processing in any iframe prevents false success', () => assert.equal(summarize([{ ...ready, live: 1 }, { ...ready, live: 1, processing: 1 }]).code, 'processing'));
test('missing settings and muted capture are distinct', () => {
  assert.equal(summarize([{ ...ready, live: 1, unknown: 1 }]).code, 'unknown');
  assert.equal(summarize([{ ...ready, live: 1, muted: 1 }]).code, 'muted');
});
test('all known errors map to actionable Chinese hints', () => {
  for (const error of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'SecurityError', 'InvalidStateError', 'TypeError', 'UnknownError']) {
    const s = summarize([{ ...ready, error }]); assert.equal(s.code, 'capture-error'); assert.match(s.hint, /[\u4e00-\u9fff]/);
  }
});
