import React, { useId, useState } from 'react';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import './reconstructionWorkbench.css';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
function clockTime(seconds) {
  const value = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}

function SourceFields({ record, lang }) {
  if (!record) return null;
  return <div className="td-workbench-source-record">
    <p className="td-workbench-source">{text(record.source, lang)}</p>
    <dl>{(record.fields || []).map((entry, index) => <div key={index}>
      <dt>{text(entry.label, lang)}</dt><dd>{text(entry.value, lang)}</dd>
    </div>)}</dl>
  </div>;
}

function TraceChart({ reference = [], observed = [], referenceLabel, observedLabel, xLabel, yLabel,
  step = 1, alignment = 0, showReference = true, cursor = undefined, lang }) {
  const chartId = useId();
  const zh = lang === 'zh';
  const width = 640; const height = 220; const padX = 40; const padY = 24;
  const values = [...reference, ...observed].filter(Number.isFinite);
  const min = Math.min(0, ...values); const max = Math.max(1, ...values);
  const length = Math.max(2, reference.length, observed.length);
  const x = index => padX + (index / (length - 1)) * (width - padX * 2);
  const y = value => height - padY - ((value - min) / (max - min)) * (height - padY * 2);
  const points = (samples, shift = 0) => samples.map((value, index) => `${x(index + shift)},${y(value)}`).join(' ');
  const cursorIndex = cursor === undefined ? -1 : Math.round(cursor / step);
  return <div className="td-workbench-traces">
    <div className="td-workbench-trace-legend">
      <span className="is-observed">{text(observedLabel, lang)}</span>
      {showReference && <span className="is-reference">{text(referenceLabel, lang)}</span>}
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
      <title id={`${chartId}-title`}>{`${text(observedLabel, lang)} / ${text(referenceLabel, lang)}`}</title>
      <desc id={`${chartId}-description`}>{zh ? '实线为当前材料，虚线为登记参考。原始数值可在图下展开。' : 'The solid trace is the current material; the dashed trace is its registered reference. Expand the original values below.'}</desc>
      <defs><clipPath id={`${chartId}-plot`}><rect x={padX} y={padY} width={width - padX * 2} height={height - padY * 2} /></clipPath></defs>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => <line key={fraction} x1={padX} x2={width - padX} y1={padY + fraction * (height - padY * 2)} y2={padY + fraction * (height - padY * 2)} className="td-workbench-grid" />)}
      <line x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} className="td-workbench-axis" />
      <g clipPath={`url(#${chartId}-plot)`}>
        {showReference && <polyline points={points(reference, alignment / step)} className="td-workbench-reference-trace" />}
        <polyline points={points(observed)} className="td-workbench-observed-trace" />
        {cursorIndex >= 0 && cursorIndex < observed.length && <>
          <line x1={x(cursorIndex)} x2={x(cursorIndex)} y1={padY} y2={height - padY} className="td-workbench-cursor" />
          <circle cx={x(cursorIndex)} cy={y(observed[cursorIndex])} r="5" className="td-workbench-observed-point" />
        </>}
      </g>
      <text x="4" y={padY + 5}>{fmt(max)}</text><text x="4" y={height - padY}>{fmt(min)}</text>
      <text x={padX} y={height - 4}>0</text><text x={width - padX} y={height - 4} textAnchor="end">{fmt((length - 1) * step)}</text>
    </svg>
    <p className="td-workbench-axis-label">{text(xLabel, lang)} · {text(yLabel, lang) || (zh ? '归一化测量值' : 'Normalized measurement')}</p>
    <details className="td-workbench-values"><summary>{zh ? '查看原始采样数值' : 'View original sample values'}</summary>
      <div className="td-workbench-table-scroll"><table><caption>{zh ? '对齐操作不会更改以下原始值' : 'Alignment never changes these original values'}</caption>
        <thead><tr><th scope="col">{text(xLabel, lang)}</th><th scope="col">{text(referenceLabel, lang)}</th><th scope="col">{text(observedLabel, lang)}</th></tr></thead>
        <tbody>{Array.from({ length: Math.max(reference.length, observed.length) }, (_, index) => <tr key={index}>
          <th scope="row">{fmt(index * step)}</th><td>{reference[index] ?? '—'}</td><td>{observed[index] ?? '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </div>;
}

function ClockMaterials({ material, items, offsets, onOffsetChange, disabled, lang }) {
  const zh = lang === 'zh';
  const times = items.map(item => material.records[item.id]?.seconds).filter(Number.isFinite);
  const min = Math.min(...times) + material.offset_min;
  const max = Math.max(...times) + material.offset_max;
  const clockById = Object.fromEntries(material.clocks.map(clock => [clock.id, clock]));
  const corrected = record => record.seconds + (offsets[record.clock_id] || 0);
  return <div className="td-workbench-clock">
    <div className="td-workbench-clock-controls">{material.clocks.map(clock => <label key={clock.id}>
      <strong>{text(clock.label, lang)}</strong>
      <span>{zh ? '校时回执：设备' : 'Calibration: device'} {clockTime(clock.device_seconds)} / {zh ? '标准' : 'reference'} {clockTime(clock.reference_seconds)}</span>
      <span>{zh ? '显示偏移' : 'Display offset'}: {offsets[clock.id] || 0} {zh ? '秒' : 'seconds'}</span>
      <input type="range" aria-label={`${text(clock.label, lang)} · ${zh ? '显示偏移秒数' : 'display offset in seconds'}`}
        min={material.offset_min} max={material.offset_max} step={material.offset_step} value={offsets[clock.id] || 0} disabled={disabled}
        onChange={event => onOffsetChange(clock.id, clamp(event.target.value, material.offset_min, material.offset_max))} />
    </label>)}</div>
    <svg viewBox={`0 0 640 ${items.length * 48 + 40}`} role="img" aria-label={zh ? '校准后的记录时间分布，下表包含相同数值' : 'Calibrated record timeline; the same values are in the table below'}>
      {items.map((item, index) => {
        const record = material.records[item.id];
        const cx = 42 + ((corrected(record) - min) / Math.max(1, max - min)) * 550;
        return <g key={item.id}><line x1="42" x2="592" y1={28 + index * 48} y2={28 + index * 48} className="td-workbench-grid" />
          <text x="8" y={33 + index * 48}>{index + 1}</text><circle cx={cx} cy={28 + index * 48} r="6" className="td-workbench-observed-point" />
          <text x={Math.min(540, cx + 12)} y={33 + index * 48}>{clockTime(corrected(record))}</text></g>;
      })}
    </svg>
    <div className="td-workbench-table-scroll"><table><caption>{zh ? '校时前后对照' : 'Original and calibrated readings'}</caption><thead><tr>
      <th scope="col">{zh ? '记录' : 'Record'}</th><th scope="col">{zh ? '原始读数' : 'Original reading'}</th><th scope="col">{zh ? '显示读数' : 'Display reading'}</th>
    </tr></thead><tbody>{items.map((item, index) => {
      const record = material.records[item.id];
      return <tr key={item.id}><th scope="row">{index + 1}. {text(record.label, lang)}<small>{text(clockById[record.clock_id]?.label, lang)}</small></th>
        <td>{clockTime(record.seconds)}</td><td>{clockTime(corrected(record))}</td></tr>;
    })}</tbody></table></div>
  </div>;
}

function RouteMaterials({ material, answerIds, onToggle, disabled, readOnly, lang }) {
  const zh = lang === 'zh';
  const nodes = Object.fromEntries(material.nodes.map(node => [node.id, node]));
  const selectedPoints = answerIds.map(id => nodes[id]).filter(Boolean).map(node => `${node.x * 6.4},${node.y * 3.4}`).join(' ');
  return <div className="td-workbench-map">
    <svg viewBox="0 0 640 340" preserveAspectRatio="none" role="img" aria-label={zh ? '建筑连接与玩家选择的经过点；可通过图中按钮选择地点' : 'Building connections and your selected waypoints; select locations using the map buttons'}>
      {material.edges.map((edge, index) => {
        const a = nodes[edge.a]; const b = nodes[edge.b];
        return <g key={`${edge.a}-${edge.b}`}><line x1={a.x * 6.4} y1={a.y * 3.4} x2={b.x * 6.4} y2={b.y * 3.4} className={edge.barrier ? 'td-workbench-barrier' : 'td-workbench-route'} />
          <text x={(a.x + b.x) * 3.2} y={(a.y + b.y) * 1.7 + (index % 2 ? 20 : -12)} textAnchor="middle">{text(edge.label, lang)}</text></g>;
      })}
      {answerIds.length > 1 && <polyline points={selectedPoints} className="td-workbench-selected-route" />}
    </svg>
    {material.nodes.map(node => <button type="button" key={node.id} className={`td-workbench-map-node${answerIds.includes(node.id) ? ' is-selected' : ''}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }} disabled={disabled || readOnly} aria-pressed={answerIds.includes(node.id)}
      onClick={() => onToggle(node.id)}><small>{answerIds.includes(node.id) ? `${answerIds.indexOf(node.id) + 1} · ` : ''}{zh ? '经过点' : 'Waypoint'}</small>{text(material.records[node.id]?.label, lang)}</button>)}
  </div>;
}

export default function ReconstructionWorkbench({ puzzle, answerIds = [], onAnswerChange, disabled = false, lang = 'zh', viewState, onViewChange }) {
  const zh = lang === 'zh';
  const material = puzzle?.workbench;
  const items = puzzle?.items || [];
  const [localView, setLocalView] = useState({});
  const { activeId = items[0]?.id || '', offsets = {}, showReference = true, alignments = {}, frame: restoredFrame = 0 } = viewState || localView;
  const changeView = updates => {
    const apply = previous => ({ ...previous, ...updates(previous || {}) });
    if (onViewChange) onViewChange(apply);
    else setLocalView(apply);
  };
  if (!material?.records) return null;
  const selected = answerIds.filter(id => items.some(item => item.id === id));
  const currentId = items.some(item => item.id === activeId) ? activeId : items[0]?.id;
  const current = material.records[currentId];
  const readOnly = Boolean(puzzle.completed);
  const comparison = puzzle.type === 'compare';
  const toggle = id => {
    if (disabled || readOnly || !items.some(item => item.id === id)) return;
    onAnswerChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  };
  const move = (index, direction) => {
    if (disabled || readOnly) return;
    const next = [...selected]; const other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    onAnswerChange(next);
  };
  const alignment = alignments[currentId] || 0;
  const trace = material.kind === 'camera' ? material : current;
  const hasTrace = Array.isArray(trace?.reference) && Array.isArray(trace?.observed);
  const step = trace?.sample_step || 1;
  const alignmentStep = material.kind === 'camera' ? 6 : step;
  const alignmentMax = material.kind === 'camera' ? 18 : step * 4;
  const frameMax = material.kind === 'camera' && hasTrace ? Math.max(0, Math.min(material.observed.length, material.reference.length) - 1) * step : 0;
  const sampleFrame = value => Math.round(clamp(value, 0, frameMax) / step) * step;
  const frame = sampleFrame(restoredFrame);

  return <section className={`td-reconstruction-workbench is-${material.kind}`} aria-label={text(material.title, lang)}>
    <header><h4>{text(material.title, lang)}</h4><p>{text(material.instructions, lang)}</p><p className="td-workbench-source">{text(material.source_note, lang)}</p></header>
    {material.kind === 'clock' && <ClockMaterials material={material} items={items} offsets={offsets} disabled={disabled} lang={lang}
      onOffsetChange={(id, value) => changeView(previous => ({ offsets: { ...previous.offsets, [id]: value } }))} />}
    {material.kind === 'route' && <RouteMaterials material={material} answerIds={selected} onToggle={toggle} disabled={disabled} readOnly={readOnly} lang={lang} />}
    <div className="td-workbench-record-tabs" role="group" aria-label={zh ? '查看原始材料' : 'Review original materials'}>
      {items.map(item => <button type="button" key={item.id} aria-pressed={currentId === item.id} disabled={disabled}
        onClick={() => changeView(() => ({ activeId: item.id }))}>{text(material.records[item.id]?.label || item.label, lang)}</button>)}
    </div>
    {current && <article className="td-workbench-current-record"><h5>{text(current.label, lang)}</h5><SourceFields record={current} lang={lang} />
      {material.kind === 'script' && <>
        <button type="button" aria-pressed={showReference} disabled={disabled} onClick={() => changeView(previous => ({ showReference: !(previous.showReference ?? true) }))}>{showReference ? (zh ? '隐藏标准配置' : 'Hide reference configuration') : (zh ? '显示标准配置' : 'Show reference configuration')}</button>
        <div className="td-workbench-code-pair">{showReference && <div><strong>{zh ? '签章标准版本' : 'Signed reference'}</strong><pre>{current.reference}</pre></div>}
          <div><strong>{zh ? '恢复片段' : 'Recovered fragment'}</strong><pre>{current.recovered}</pre></div></div>
      </>}
      {hasTrace && <>
        <div className="td-workbench-measure-controls"><button type="button" aria-pressed={showReference} disabled={disabled} onClick={() => changeView(previous => ({ showReference: !(previous.showReference ?? true) }))}>{zh ? '叠加登记参考' : 'Overlay registered reference'}</button>
          <label>{zh ? '参考对齐偏移' : 'Reference alignment offset'} <output>{alignment}</output>
            <input type="range" min={-alignmentMax} max={alignmentMax} step={alignmentStep} value={alignment} disabled={disabled}
              aria-label={zh ? '参考对齐偏移' : 'Reference alignment offset'} onChange={event => changeView(previous => ({ alignments: { ...previous.alignments, [currentId]: clamp(event.target.value, -alignmentMax, alignmentMax) } }))} />
          </label>
          {material.kind === 'camera' && <label>{zh ? '取帧时刻 / 秒' : 'Frame time / seconds'} <output>{frame}</output><input type="range" min="0" max={frameMax} step={step} value={frame} disabled={disabled}
            aria-label={zh ? '取帧时刻' : 'Frame time'} onChange={event => changeView(() => ({ frame: sampleFrame(event.target.value) }))} /></label>}
        </div>
        <TraceChart reference={trace.reference} observed={trace.observed} referenceLabel={trace.reference_label} observedLabel={trace.observed_label}
          xLabel={trace.x_label} yLabel={trace.y_label} step={step} alignment={alignment} showReference={showReference} cursor={material.kind === 'camera' ? frame : undefined} lang={lang} />
        {material.kind === 'camera' && <p role="status">{zh ? '当前帧' : 'Current frame'}: {frame}s · {zh ? '监控位置' : 'Camera position'} {material.observed[Math.round(frame / step)]} · {zh ? '独立星图' : 'Independent star map'} {material.reference[Math.round(frame / step)]}</p>}
      </>}
      {!hasTrace && (material.kind === 'spectrum' || material.kind === 'waveform') && <p>{zh ? '此记录没有材料或声学测量通道；请按来源和观察内容判断其用途。' : 'This record has no material or acoustic measurement channel; assess it from its source and observation.'}</p>}
      <button type="button" className="td-workbench-select-current" aria-pressed={selected.includes(currentId)} disabled={disabled || readOnly} onClick={() => toggle(currentId)}>
        {selected.includes(currentId) ? (zh ? '从本次核验移除' : 'Remove from this reconstruction') : (zh ? '选入本次核验' : 'Select for this reconstruction')} · {text(current.label, lang)}
      </button>
    </article>}
    <section className="td-workbench-selection" aria-label={comparison ? (zh ? '所选材料' : 'Selected materials') : (zh ? '所选事件或路径顺序' : 'Selected event or route order')}>
      <h5>{comparison ? (zh ? '所选材料' : 'Selected materials') : (zh ? '你的重建顺序' : 'Your reconstruction order')} · {selected.length}</h5>
      {!selected.length && <p>{zh ? '查看材料后自主选取；观察和对齐不消耗 AP，也不会替你提交答案。' : 'Review the material and make your selections. Viewing and alignment cost no AP and never submit an answer for you.'}</p>}
      <ol className={comparison ? 'is-unordered' : ''}>{selected.map((id, index) => <li key={id}><span>{text(material.records[id]?.label, lang)}</span>
        {!comparison && <><button type="button" disabled={disabled || readOnly || index === 0} aria-label={`${zh ? '向前移动' : 'Move earlier'} · ${text(material.records[id]?.label, lang)}`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" disabled={disabled || readOnly || index === selected.length - 1} aria-label={`${zh ? '向后移动' : 'Move later'} · ${text(material.records[id]?.label, lang)}`} onClick={() => move(index, 1)}>↓</button></>}
        <button type="button" disabled={disabled || readOnly} aria-label={`${zh ? '移除' : 'Remove'} · ${text(material.records[id]?.label, lang)}`} onClick={() => toggle(id)}>×</button>
      </li>)}</ol>
    </section>
  </section>;
}
