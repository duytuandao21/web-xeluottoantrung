'use client';
import { useEffect, useRef, useState } from 'react';
import { TVAudioController } from '@/lib/tv-audio-player';
import { defaultTVMusic, type TVMusicSettings } from '@/lib/tv-music-settings';
import './tv-music.css';

export default function TVMusicPlayer({ music = defaultTVMusic, ready }: { music?: TVMusicSettings; ready: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<TVAudioController | null>(null);
  const latest = useRef({ music, ready });
  const [needsGesture, setNeedsGesture] = useState(false);
  useEffect(() => {
    const player = new TVAudioController(audio.current!, setNeedsGesture);
    controller.current = player;
    const sync = () => player.update(latest.current.music, latest.current.ready, !document.hidden);
    document.addEventListener('visibilitychange', sync); sync();
    return () => { document.removeEventListener('visibilitychange', sync); player.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { latest.current = { music, ready }; controller.current?.update(music, ready, !document.hidden); }, [music, ready]);
  return <><audio ref={audio} preload="none" aria-hidden="true"/>
    {needsGesture && ready && music.enabled && <button type="button" className="tv-music-start" onClick={() => controller.current?.startByGesture()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></svg>Chạm để bật nhạc
    </button>}</>;
}
