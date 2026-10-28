// Pure local regression: no Next server, credentials, network or audio downloads.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(result.outputText, { module, exports: module.exports, structuredClone, URL, setTimeout, clearTimeout,
    require: name => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; } }, { filename: file, timeout: 1000 });
  return module.exports;
}
const settings = load(path.join(root, 'lib/tv-music-settings.ts'));
const { TVAudioController } = load(path.join(root, 'lib/tv-audio-player.ts'), { './tv-music-settings': settings });
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const tracks = ids.map((id, index) => ({ id, name: `Bài ${index + 1}`, url: `https://dummy.invalid/tv/music/${id}.mp3`, sizeBytes: 3 }));
const config = () => ({ enabled: true, volume: 30, revision: 1, tracks: structuredClone(tracks) });
const settle = () => new Promise(resolve => setImmediate(resolve));
class FakeAudio extends EventTarget {
  paused = true; currentTime = 0; volume = 1; preload = ''; sources = []; plays = 0; loads = 0; blocked = false; failures = new Set();
  get src() { return this.source || ''; }
  set src(value) { this.source = value; this.sources.push(value); this.currentTime = 0; }
  play() {
    this.plays++;
    if (this.blocked) return Promise.reject({ name: 'NotAllowedError' });
    if (this.failures.has(this.src)) return Promise.reject({ name: 'NotSupportedError' });
    this.paused = false; return Promise.resolve();
  }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name) { if (name === 'src') this.source = ''; }
  end() { this.paused = true; this.dispatchEvent(new Event('ended')); }
}

test('music contract is identical in Web, Admin and API; legacy config defaults to disabled', () => {
  const source = fs.readFileSync(path.join(root, 'lib/tv-music-settings.ts'), 'utf8').replace(/\r\n/g, '\n');
  for (const file of ['../admin-xeluottoantrung/src/lib/tv-music-settings.ts', '../api-xeluottoantrung/src/modules/content/tv-music.settings.ts'])
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'), source);
  assert.equal(settings.parseTVMusic(undefined).enabled, false);
  assert.equal(settings.parseTVMusic({ ...config(), tracks: [{ ...tracks[0], sizeBytes: 1_000_000_000 }] }).tracks.length, 1);
  assert.throws(() => settings.parseTVMusic({ ...config(), tracks: [{ ...tracks[0], sizeBytes: 1_000_000_000 }, tracks[1]] }));
});

test('no downloads before cars are ready; slide/snapshot/volume/name updates do not restart playback', async () => {
  const audio = new FakeAudio(); const player = new TVAudioController(audio, () => {}); const music = config();
  try {
    player.update(music, false, true); assert.equal(audio.sources.length, 0); assert.equal(audio.plays, 0);
    player.update(music, true, true); await settle(); audio.currentTime = 37;
    for (let index = 0; index < 500; index++) player.update({ ...music, tracks: music.tracks.map(track => ({ ...track, name: `Đổi tên ${index}` })), volume: 45 }, true, true);
    assert.equal(audio.sources.length, 1); assert.equal(audio.plays, 1); assert.equal(audio.currentTime, 37); assert.equal(audio.volume, .45);
    audio.end(); await settle(); assert.equal(audio.src, tracks[1].url);
    audio.end(); await settle(); assert.equal(audio.src, tracks[0].url, 'Playlist loops without consuming any vehicle page');
  } finally { player.dispose(); }
});

test('autoplay waits for a gesture; visibility pauses/resumes without resetting the source', async () => {
  const audio = new FakeAudio(); audio.blocked = true; let prompt = false;
  const player = new TVAudioController(audio, value => { prompt = value; });
  try {
    player.update(config(), true, true); await settle(); assert.equal(prompt, true); assert.equal(audio.plays, 1);
    player.update(config(), true, true); await settle(); assert.equal(audio.plays, 1, 'No repeated autoplay polling');
    audio.blocked = false; player.startByGesture(); await settle(); assert.equal(prompt, false); assert.equal(audio.paused, false);
    audio.currentTime = 42; player.update(config(), true, false); assert.equal(audio.paused, true);
    player.update(config(), true, true); await settle(); assert.equal(audio.currentTime, 42); assert.equal(audio.sources.length, 1);
    player.update({ ...config(), enabled: false }, true, true); assert.equal(audio.paused, true); assert.equal(audio.src, '');
  } finally { player.dispose(); }
});

test('bad tracks are skipped; an entirely broken playlist waits instead of spinning; disposal stops retries', async () => {
  const audio = new FakeAudio(); audio.failures.add(tracks[0].url);
  const player = new TVAudioController(audio, () => {});
  player.update(config(), true, true); await settle(); assert.equal(audio.src, tracks[1].url); assert.equal(audio.plays, 2);
  audio.failures.add(tracks[1].url); audio.dispatchEvent(new Event('error')); await settle();
  assert.equal(audio.src, ''); assert.equal(audio.plays, 2);
  player.update(config(), true, true); await settle(); assert.equal(audio.plays, 2);
  player.dispose(); audio.end(); assert.equal(audio.plays, 2);
});

test('removed current track changes once; reordering and refreshing the playlist do not reset a retained track', async () => {
  const audio = new FakeAudio(); const player = new TVAudioController(audio, () => {});
  try {
    player.update(config(), true, true); await settle();
    player.update({ ...config(), tracks: [tracks[1], tracks[0]], revision: 2 }, true, true); await settle(); assert.equal(audio.sources.length, 1);
    player.update({ ...config(), tracks: [tracks[1]], revision: 3 }, true, true); await settle(); assert.equal(audio.src, tracks[1].url); assert.equal(audio.sources.length, 2);
    player.update({ ...config(), tracks: [] }, true, true); assert.equal(audio.src, '');
  } finally { player.dispose(); }
});
