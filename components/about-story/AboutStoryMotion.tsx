'use client';

import { useEffect } from 'react';

/** A zero-markup island: the story remains fully readable before hydration. */
export default function AboutStoryMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector<HTMLElement>('.tt-story');
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import('./about-story-motion').then(({ mountAboutStoryMotion }) => {
      if (!cancelled && root.isConnected && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cleanup = mountAboutStoryMotion(root);
      }
    }).catch(() => { /* Static HTML is the fallback when the motion chunk fails. */ });

    return () => { cancelled = true; cleanup?.(); };
  }, []);
  return null;
}
