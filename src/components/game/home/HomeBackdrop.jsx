import React from 'react';

const BG = `${import.meta.env.BASE_URL}assets/home/detective-office.jpg`;

export default function HomeBackdrop() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', background: '#08121c' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'saturate(.32) contrast(1.08)', opacity: .62,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 52% 38%, rgba(8,18,28,.36), rgba(8,18,28,.88) 72%), linear-gradient(180deg, rgba(8,18,28,.12), #08121c)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: .22,
        background: 'repeating-linear-gradient(158deg, transparent 0 68px, rgba(197,166,111,.08) 68px 86px, transparent 86px 128px)',
      }} />
    </div>
  );
}
