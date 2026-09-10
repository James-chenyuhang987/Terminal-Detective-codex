import React from 'react';
import { ICON_PATHS, iconTextParts, resolveIconName } from './iconData.js';

/** @param {React.SVGProps<SVGSVGElement> & {name: unknown, size?: string | number, label?: string}} props */
export default function Icon({ name, size = '1em', label, className = '', ...props }) {
  const resolved = resolveIconName(name);
  return (
    <svg {...props} className={`td-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : true} aria-label={label || undefined} role={label ? 'img' : undefined} focusable="false"
      data-icon={resolved}>
      {ICON_PATHS[resolved].map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

export function IconText({ text }) {
  return <>{iconTextParts(text).map((part, index) => part.icon
    ? <Icon key={index} name={part.icon} />
    : <React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}
