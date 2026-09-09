import React, { useRef } from 'react';
import { usePresentationMotion } from './usePresentationMotion.js';

/** @param {React.HTMLAttributes<HTMLElement> & {as?: React.ElementType, children?: React.ReactNode}} props */
export default function SlicedTitle({ children, as: Tag = 'h2', className = '', ...props }) {
  const { motionEnabled, foreground } = usePresentationMotion();
  const reveal = useRef(motionEnabled);
  if (!motionEnabled) reveal.current = false;
  const text = String(children ?? '');
  return (
    <Tag {...props} className={`td-sliced-title ${className}`.trim()} data-motion-reduced={!reveal.current} data-motion-paused={!foreground}>
      <span className="td-visually-hidden">{text}</span>
      <span className="td-sliced-title-ink" aria-hidden="true">
        {text.split(/(\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/u).filter(Boolean).map((word, wordIndex) => /^\s+$/.test(word) ? word : (
          <span className="td-type-word" key={wordIndex}>
            {Array.from(word).map((char, index) => (
              <span className="td-type-slice" key={index} style={/** @type {React.CSSProperties} */ ({ '--slice-delay': `${Math.min((wordIndex * 3 + index) * 24, 360)}ms` })}>
                <span>{char}</span>
              </span>
            ))}
          </span>
        ))}
      </span>
    </Tag>
  );
}
