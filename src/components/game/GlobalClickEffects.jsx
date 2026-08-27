import { useEffect, useRef } from 'react';

const MAX_EFFECT_NODES = 54;

export default function GlobalClickEffects() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const removeNode = node => {
      if (node?.parentNode === layer) node.remove();
    };
    const onPointerDown = event => {
      if (event.button !== undefined && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const interactive = !!target?.closest('button, a, [role="button"], input, select, textarea, summary');
      const burst = document.createElement('span');
      burst.className = `td-gold-click-burst${interactive ? ' is-interactive' : ''}`;
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;
      burst.setAttribute('aria-hidden', 'true');

      const particleCount = reducedMotion?.matches ? 0 : interactive ? 7 : 4;
      for (let index = 0; index < particleCount; index += 1) {
        const particle = document.createElement('i');
        const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.25;
        const distance = (interactive ? 30 : 22) + Math.random() * 18;
        particle.style.setProperty('--click-x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--click-y', `${Math.sin(angle) * distance}px`);
        particle.style.setProperty('--click-delay', `${index * 12}ms`);
        burst.appendChild(particle);
      }
      layer.appendChild(burst);
      while (layer.childElementCount > MAX_EFFECT_NODES) layer.firstElementChild?.remove();
      burst.addEventListener('animationend', animationEvent => {
        if (animationEvent.target === burst) removeNode(burst);
      });
      window.setTimeout(() => removeNode(burst), 900);
    };

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);

  return <div ref={layerRef} className="td-global-click-layer" aria-hidden="true" />;
}
