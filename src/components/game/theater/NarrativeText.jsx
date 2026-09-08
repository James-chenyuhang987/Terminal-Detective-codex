import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { segmentNarrativeText, narrativeTextTiming } from '@/game/narrativeMotion';
import './narrativeText.css';

export default function NarrativeText({ text, lang, variant = 'passage', visibleCount = Infinity, paused = false, instant = false }) {
  const tokens = useMemo(() => segmentNarrativeText(text, lang), [text, lang]);
  const root = useRef(null);
  const animations = useRef(new Map());

  useLayoutEffect(() => {
    const running = animations.current;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => { if (query.matches) running.forEach(animation => animation?.finish()); };
    query.addEventListener('change', finish);
    return () => {
      query.removeEventListener('change', finish);
      running.forEach(animation => animation?.cancel());
      running.clear();
    };
  }, [text, lang, variant]);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const immediate = instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveal = (element, key, frames, timing) => {
      if (!animations.current.has(key)) {
        animations.current.set(key, immediate || !element.animate ? null : element.animate(frames, timing));
      }
      const animation = animations.current.get(key);
      if (!animation) return;
      if (immediate) animation.finish();
      else if (paused && animation.playState !== 'finished') animation.pause();
      else if (!paused && animation.playState === 'paused') animation.play();
    };
    // Script-owned animations survive display:none when a modal or Home closes the frame.
    if (variant === 'title') reveal(node, 'frame', [
      { transform: 'translateY(.3em)', clipPath: 'inset(0 0 100% 0)' },
      { transform: 'translateY(0)', clipPath: 'inset(0)' },
    ], { duration: 640, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' });
    node.querySelectorAll('.td-narrative-token.is-visible').forEach(element => {
      const index = Number(element.dataset.token);
      reveal(element, index, [{ opacity: 0 }, { opacity: 1 }], narrativeTextTiming(variant, index));
    });
  }, [text, lang, variant, visibleCount, paused, instant]);

  return <span ref={root} className={`td-narrative-text td-narrative-text--${variant}`} aria-hidden="true">
    {tokens.map(({ text: token, end, whitespace }, index) => whitespace ? token : <span key={index} data-token={index}
      className={`td-narrative-token${end <= visibleCount ? ' is-visible' : ''}`}>
      {token}
    </span>)}
  </span>;
}
