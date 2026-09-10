import { useEffect, useRef } from 'react';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';

const MAX_EFFECT_NODES = 4;

export default function GlobalClickEffects() {
  const layerRef = useRef(null);
  const { motionEnabled, reducedMotion, foreground } = usePresentationMotion();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tdMotion = reducedMotion ? 'reduced' : foreground ? 'active' : 'paused';
    return () => { delete root.dataset.tdMotion; };
  }, [reducedMotion, foreground]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !motionEnabled) return undefined;

    const timers = new Set();
    const removeNode = node => {
      if (node?.parentNode === layer) node.remove();
    };
    const onPointerDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const interactive = target?.closest('button:not(:disabled), a[href], [role="button"], summary');
      if (!interactive || document.hidden) return;
      const burst = document.createElement('span');
      burst.className = `td-gold-click-burst${interactive ? ' is-interactive' : ''}`;
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;
      burst.setAttribute('aria-hidden', 'true');

      layer.appendChild(burst);
      while (layer.childElementCount > MAX_EFFECT_NODES) layer.firstElementChild?.remove();
      burst.addEventListener('animationend', animationEvent => {
        if (animationEvent.target === burst) removeNode(burst);
      });
      const timer = window.setTimeout(() => { removeNode(burst); timers.delete(timer); }, 600);
      timers.add(timer);
    };

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      timers.forEach(window.clearTimeout);
      layer.replaceChildren();
    };
  }, [motionEnabled]);

  return <div ref={layerRef} className="td-global-click-layer" aria-hidden="true" />;
}
