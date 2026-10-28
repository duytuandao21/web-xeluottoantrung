import { defaultTVMusic, type TVMusicSettings, type TVMusicTrack } from './tv-music-settings';

/** One native audio element for the entire TV session. No per-second React updates or API calls. */
export class TVAudioController {
  private music: TVMusicSettings = defaultTVMusic;
  private current: TVMusicTrack | undefined;
  private ready = false;
  private visible = true;
  private disposed = false;
  private failed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private requesting = false;
  private blocked = false;
  private signature = '';
  constructor(private readonly audio: HTMLAudioElement, private readonly prompt: (needed: boolean) => void,
    private readonly retryDelay = 30_000) {
    audio.preload = 'none';
    audio.addEventListener('ended', this.ended);
    audio.addEventListener('error', this.error);
  }
  update(music: TVMusicSettings, ready: boolean, visible: boolean) {
    this.music = music; this.ready = ready; this.visible = visible;
    this.audio.volume = music.volume / 100;
    const signature = music.tracks.map(track => `${track.id}:${track.url}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature; this.failed.clear(); this.clearRetry();
    }
    if (!music.enabled || !music.tracks.length) { this.stop(); return; }
    if (!ready || !visible) {
      this.generation++; this.requesting = false; this.audio.pause(); this.prompt(false); return;
    }
    const retained = this.current && music.tracks.find(track => track.id === this.current!.id && track.url === this.current!.url);
    if (!retained) this.choose(music.tracks.find(track => !this.failed.has(track.id)));
    else this.current = retained;
    if (!this.blocked) this.play(); else this.prompt(true);
  }
  startByGesture() {
    this.blocked = false;
    this.play(); // Must remain synchronous with the actual click's user activation.
  }
  private choose(track?: TVMusicTrack) {
    this.generation++; this.requesting = false;
    this.audio.pause(); this.current = track;
    if (track) { this.audio.src = track.url; this.audio.load(); }
    else { this.audio.removeAttribute('src'); this.audio.load(); }
  }
  private play() {
    if (this.disposed || !this.ready || !this.visible || !this.music.enabled || !this.current || this.timer || this.requesting || !this.audio.paused) return;
    const generation = this.generation;
    this.requesting = true;
    void this.audio.play().then(() => {
      if (this.disposed || generation !== this.generation) return;
      this.requesting = false; this.blocked = false; this.prompt(false);
    }).catch((error: unknown) => {
      if (this.disposed || generation !== this.generation) return;
      this.requesting = false;
      const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
      if (name === 'NotAllowedError') { this.blocked = true; this.prompt(true); }
      else if (name !== 'AbortError') this.error();
    });
  }
  private ended = () => {
    if (!this.music.enabled || this.disposed) return;
    const index = this.music.tracks.findIndex(track => track.id === this.current?.id);
    const tracks = [...this.music.tracks.slice(index + 1), ...this.music.tracks.slice(0, index + 1)];
    this.choose(tracks.find(track => !this.failed.has(track.id))); this.play();
  };
  private error = () => {
    if (!this.music.enabled || this.disposed || !this.current) return;
    this.failed.add(this.current.id);
    const next = this.music.tracks.find(track => !this.failed.has(track.id));
    this.choose(next);
    if (next) this.play();
    else {
      this.prompt(false); this.clearRetry();
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.disposed) return;
        this.failed.clear();
        // Wait until visible/ready before assigning a source again.
        if (this.ready && this.visible && this.music.enabled) { this.choose(this.music.tracks[0]); this.play(); }
      }, this.retryDelay);
    }
  };
  private clearRetry() { clearTimeout(this.timer); this.timer = undefined; }
  private stop() {
    this.clearRetry(); this.blocked = false; this.prompt(false);
    if (this.current) this.choose(); else this.audio.pause();
  }
  dispose() {
    this.disposed = true; this.stop();
    this.audio.removeEventListener('ended', this.ended);
    this.audio.removeEventListener('error', this.error);
  }
}
