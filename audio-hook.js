// byUS小序
// Experimental PAGE-level constraints, NOT Chrome feature flags or OS audio settings.
// Runs at document_start only when enabled. Reload is needed after changing the switch.
(() => {
  "use strict";
  const version = "0.2.0";
  const wrapped = Symbol.for("byUSXiaoxu.audioCompat.v2");
  const diagnosticKey = Symbol.for("byUSXiaoxu.audioCompat.diagnostic");
  if (typeof globalThis[diagnosticKey] === "function") return;
  const tracks = new WeakSet();
  const records = new Set();
  const bindings = [];
  const fields = ["echoCancellation", "autoGainControl", "noiseSuppression"];
  const trackOwner = globalThis.MediaStreamTrack && MediaStreamTrack.prototype;
  const nativeSettings = trackOwner && trackOwner.getSettings;
  let lastError = null;
  let pending = 0;
  const allowedErrors = new Set(["NotAllowedError", "NotFoundError", "NotReadableError",
    "OverconstrainedError", "AbortError", "SecurityError", "InvalidStateError", "TypeError"]);

  function recordError(error) {
    lastError = allowedErrors.has(error && error.name) ? error.name : "UnknownError";
  }

  function prune() {
    for (const ref of records) {
      const track = ref.deref();
      if (!track || track.readyState === "ended") records.delete(ref);
    }
  }

  function trackAudio(track) {
    if (!tracks.has(track)) {
      tracks.add(track);
      records.add(new WeakRef(track));
    }
  }

  // Read only a small non-identifying summary. Never expose device IDs, names or audio.
  // MAIN-world diagnostics are not a tamper-proof security assertion.
  function snapshot() {
    prune();
    let live = 0, processing = 0, unknown = 0, muted = 0;
    for (const ref of records) {
      const track = ref.deref();
      if (!track || track.readyState === "ended") continue;
      live++;
      if (track.muted || track.enabled === false) muted++;
      try {
        const settings = Reflect.apply(nativeSettings, track, []);
        if (fields.some(key => settings[key] === true)) processing++;
        else if (!fields.every(key => settings[key] === false)) unknown++;
      } catch { unknown++; }
    }
    return {
      version, available: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      hooked: bindings.length > 0 && bindings.every(binding =>
        binding.owner[binding.name] === binding.replacement &&
        (binding.name !== "getUserMedia" || binding.owner === navigator ||
          (navigator.mediaDevices && navigator.mediaDevices.getUserMedia === binding.replacement))),
      live, processing, unknown, muted, pending, error: lastError
    };
  }

  function copyDictionary(input) {
    const copy = { ...input };
    // WebIDL dictionaries may inherit device/video constraints from a prototype.
    Object.setPrototypeOf(copy, Object.getPrototypeOf(input));
    return copy;
  }

  function quietAudio(audio) {
    const result = audio && typeof audio === "object" ? copyDictionary(audio) : {};
    for (const field of fields) Object.defineProperty(result, field, {
      value: { exact: false }, enumerable: true, configurable: true, writable: true
    });
    if (Array.isArray(result.advanced)) {
      const advanced = result.advanced.map(item => {
        if (!item || typeof item !== "object") return item;
        const clean = copyDictionary(item);
        for (const field of fields) {
          if (field in clean) Object.defineProperty(clean, field, {
            value: { exact: false }, enumerable: true, configurable: true, writable: true
          });
        }
        return clean;
      });
      Object.defineProperty(result, "advanced", { value: advanced, enumerable: true, configurable: true, writable: true });
    }
    return result;
  }

  function request(constraints) {
    if (!constraints || typeof constraints !== "object" || !constraints.audio) return constraints;
    if (constraints.audio !== true && typeof constraints.audio !== "object") return constraints;
    const copy = copyDictionary(constraints);
    Object.defineProperty(copy, "audio", { value: quietAudio(constraints.audio), enumerable: true, configurable: true, writable: true });
    return copy;
  }

  function remember(stream) {
    prune();
    for (const track of stream.getAudioTracks()) trackAudio(track);
    return stream;
  }

  function patch(owner, name, makeWrapper) {
    if (!owner) return;
    const original = owner[name];
    if (typeof original !== "function" || original[wrapped]) return;
    const replacement = makeWrapper(original);
    Object.defineProperty(replacement, wrapped, { value: true });
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    try {
      Object.defineProperty(owner, name, {
        configurable: descriptor ? descriptor.configurable : true,
        enumerable: descriptor ? descriptor.enumerable : true,
        writable: descriptor && "writable" in descriptor ? descriptor.writable : true,
        value: replacement
      });
      if (name.includes("GetUserMedia") || name === "getUserMedia") bindings.push({ owner, name, replacement });
    } catch {
      // Locked page APIs remain untouched. Never block page loading or fake success.
    }
  }

  const mediaOwner = globalThis.MediaDevices ? MediaDevices.prototype : navigator.mediaDevices;
  patch(mediaOwner, "getUserMedia", original => function getUserMedia(...args) {
    const hasAudio = Boolean(args[0] && args[0].audio);
    if (args.length) args[0] = request(args[0]);
    if (!hasAudio) return Reflect.apply(original, this, args);
    pending++; lastError = null;
    try {
      return Reflect.apply(original, this, args).then(stream => {
        pending--; lastError = null; return remember(stream);
      }, error => {
        pending--; recordError(error); throw error;
      });
    } catch (error) {
      pending--; recordError(error); throw error;
    }
  });

  for (const method of ["getUserMedia", "webkitGetUserMedia"]) {
    patch(navigator, method, original => function (...args) {
      if (!args[0] || !args[0].audio) return Reflect.apply(original, this, args);
      if (args.length) args[0] = request(args[0]);
      const success = args[1];
      const failure = args[2];
      lastError = null;
      if (typeof success === "function") args[1] = function (stream) {
        lastError = null;
        return Reflect.apply(success, this, [remember(stream)]);
      };
      if (typeof failure === "function") args[2] = function (error) {
        recordError(error); return Reflect.apply(failure, this, [error]);
      };
      return Reflect.apply(original, this, args);
    });
  }

  patch(trackOwner, "applyConstraints", original => function applyConstraints(...args) {
    // Do not change video, screen-share audio, or tracks not obtained via microphone APIs.
    if (tracks.has(this) && this.kind === "audio" &&
        (!args.length || args[0] == null || typeof args[0] === "object")) {
      args[0] = quietAudio(args[0]);
      return Reflect.apply(original, this, args).then(result => {
        lastError = null; return result;
      }, error => { recordError(error); throw error; });
    }
    return Reflect.apply(original, this, args);
  });
  patch(trackOwner, "clone", original => function clone(...args) {
    const copy = Reflect.apply(original, this, args);
    if (tracks.has(this)) trackAudio(copy);
    return copy;
  });
  const streamOwner = globalThis.MediaStream && MediaStream.prototype;
  patch(streamOwner, "clone", original => function clone(...args) {
    const copy = Reflect.apply(original, this, args);
    const audio = this.getAudioTracks();
    if (audio.length && audio.every(track => tracks.has(track))) remember(copy);
    return copy;
  });
  try {
    Object.defineProperty(globalThis, diagnosticKey, { value: snapshot, configurable: true });
  } catch { /* A locked diagnostic slot must not break capture. */ }
})();
