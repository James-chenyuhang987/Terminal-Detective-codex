// Authored source measurements for the protected investigation service.
// This module never imports client code and is never bundled into the game UI.
// Public records contain observations, not answer keys or required support sets.
export const INVESTIGATION_RAW_MATERIALS_REVISION = 1;
const t = (zh, en) => ({ zh, en });
const record = (label, source, fields, extra = {}) => ({ label, source, fields, ...extra });
const field = (label, value) => ({ label, value });

const WORKBENCHES = {
  Lvl_01: {
    kind: 'clock', title: t('独立时钟校准台', 'Independent-clock calibration'),
    instructions: t('根据校时回执调整各设备相对标准时钟的偏移，再选择记录并排列事件。校准只改变对照显示，不改写原件。', 'Use the calibration receipts to offset each device against the reference clock, then select records and arrange the events. Calibration changes the comparison display, never the originals.'),
    source_note: t('设备原始读数与校时回执分别封存；证据正文采用校准后的标准时间。', 'Original device readings and calibration receipts are retained separately. Evidence descriptions use calibrated reference time.'),
    clocks: [
      { id: 'receipt', label: t('收据终端', 'Receipt terminal'), device_seconds: 43200, reference_seconds: 43200 },
      { id: 'shaft', label: t('维修锁时钟', 'Shaft-lock clock'), device_seconds: 43290, reference_seconds: 43200 },
      { id: 'duty', label: t('值班终端', 'Duty terminal'), device_seconds: 43140, reference_seconds: 43200 },
    ],
    offset_min: -180, offset_max: 180, offset_step: 30,
    records: {
      exit: record(t('锁控制器 · 关闭事件', 'Lock controller · closure'), t('维修井电子锁', 'Shaft electronic lock'), [field(t('执行位', 'State bit'), 'OPEN → CLOSED')], { clock_id: 'shaft', seconds: 84030 }),
      discovery: record(t('保安上楼 · 值班终端', 'Guard arrival · duty terminal'), t('地下值班刷卡记录', 'Underground duty reader'), [field(t('值班区间', 'Duty interval'), '23:10–23:25 / reference')], { clock_id: 'duty', seconds: 84600 }),
      purchase: record(t('收据 · 支付事件', 'Receipt · payment'), t('端子下的收据', 'Receipt beneath the terminal'), [field(t('收银项目', 'Line item'), t('高压电容器', 'High-voltage capacitor'))], { clock_id: 'receipt', seconds: 83100 }),
      pulse: record(t('锁控制器 · 开启事件', 'Lock controller · opening'), t('维修锁与独立电源回执', 'Shaft lock and independent power receipt'), [field(t('独立电源中断标记', 'Independent power-gap marker'), '23:17:00 / reference')], { clock_id: 'shaft', seconds: 83910 }),
    },
  },
  Lvl_02: {
    kind: 'route', title: t('密室通道测绘台', 'Sealed-room passage map'),
    instructions: t('对照门锁、设备与屋顶的原始记录，在图中选择经过点；按经过次序排列。线条表示建筑连接，不代表已经证实有人通过。', 'Compare the original door, device and roof records, then select waypoints on the map and arrange the route. Lines show building connections, not proven movement.'),
    source_note: t('空间图来自疏散图；人员与设备记录分别列出，设备回收时间不等于经过时间。', 'Geometry comes from the evacuation plan. Person and device records are separate; recovery time is not passage time.'),
    nodes: [
      { id: 'roof', x: 78, y: 18 }, { id: 'lab', x: 16, y: 72 },
      { id: 'shaft', x: 76, y: 72 }, { id: 'phase', x: 45, y: 72 },
    ],
    edges: [
      { a: 'lab', b: 'phase', label: t('主门锁闭', 'Main door locked'), barrier: true },
      { a: 'phase', b: 'shaft', label: t('隔墙外侧', 'Beyond partition') },
      { a: 'shaft', b: 'roof', label: t('内部楼梯', 'Internal stair') },
      { a: 'lab', b: 'roof', label: t('外侧梯道封闭', 'Exterior stair sealed'), barrier: true },
    ],
    records: {
      roof: record(t('屋顶压力板', 'Roof pressure plate'), t('屋顶传感器原始日志', 'Original roof-sensor log'), [field(t('压力脉冲', 'Pressure pulse'), '02:34'), field(t('回收封签', 'Recovery seal'), 'QPS-α / 02:41')]),
      phase: record(t('实验室隔墙', 'Lab partition'), t('QPS-α设备回执', 'QPS-alpha device receipt'), [field(t('能量核', 'Energy core'), '100% → 0%'), field(t('设备模式', 'Device mode'), 'PHASE / boundary crossing')]),
      lab: record(t('核心实验室', 'Core laboratory'), t('核心门禁原始日志', 'Original core-door log'), [field(t('入室读卡', 'Entry read'), '02:18'), field(t('主门离开读卡', 'Main-door exit read'), '—')]),
      shaft: record(t('内部紧急通道', 'Internal emergency passage'), t('疏散图与设备去向记录', 'Evacuation plan and device location record'), [field(t('连接', 'Connection'), 'partition → roof'), field(t('主门刷卡要求', 'Main-door badge requirement'), 'NO')]),
    },
  },
  Lvl_03: {
    kind: 'script', title: t('恢复脚本与标准配置', 'Recovered script and reference configuration'),
    instructions: t('切换标准配置显示，逐段核对恢复代码和执行参数，选择两项与保护状态或输出功率直接相关的材料。', 'Toggle the reference configuration and compare recovered code with execution values. Select the two records directly affecting protection or output power.'),
    source_note: t('左列为签章标准版本，右列为平板恢复片段；代码行号不表示执行先后。', 'The signed reference is on the left; recovered tablet fragments are on the right. Line numbers do not establish execution order.'),
    records: {
      ui: record(t('片段 D · 界面设置', 'Fragment D · interface settings'), t('平板片段 / L66', 'Tablet fragment / L66'), [], { reference: 'theme = "silver"', recovered: 'theme = "violet"' }),
      boost: record(t('片段 B · 输出配置', 'Fragment B · output configuration'), t('平板片段 / L42', 'Tablet fragment / L42'), [field(t('执行回执', 'Execution receipt'), 'power_multiplier = 4.7')], { reference: 'power_multiplier = 1.0', recovered: 'power_multiplier = 4.7' }),
      safe: record(t('片段 A · 遥测开关', 'Fragment A · telemetry switch'), t('平板片段 / L08', 'Tablet fragment / L08'), [field(t('执行回执', 'Execution receipt'), 'telemetry = true')], { reference: 'telemetry = true', recovered: 'telemetry = true' }),
      bypass: record(t('片段 C · 联锁配置', 'Fragment C · interlock configuration'), t('平板片段 / L31', 'Tablet fragment / L31'), [field(t('联锁输入位', 'Interlock input bit'), '1 → 0')], { reference: 'safety = true', recovered: 'safety = false' }),
    },
  },
  Lvl_04: {
    kind: 'route', title: t('D-4痕迹与维护图', 'D-4 traces and service map'),
    instructions: t('比较每处的磨屑、扭矩和喷射记录，选择设备经过点并重建方向。建筑连通不等于痕迹已经证明通过。', 'Compare track residue, torque and jet records at each location, select the device waypoints and reconstruct its direction. A building connection alone does not prove passage.'),
    source_note: t('D-4的设备记录与人员气闸记录分开保存。', 'D-4 device records are preserved separately from personnel-airlock records.'),
    nodes: [{ id: 'valve', x: 73, y: 74 }, { id: 'dock', x: 15, y: 25 }, { id: 'hatch', x: 81, y: 20 }, { id: 'tunnel', x: 40, y: 73 }],
    edges: [
      { a: 'dock', b: 'tunnel', label: t('履带通道', 'Tracked passage') },
      { a: 'tunnel', b: 'valve', label: t('旁路管廊', 'Bypass gallery') },
      { a: 'valve', b: 'hatch', label: t('顶部检修线', 'Upper service line') },
      { a: 'dock', b: 'hatch', label: t('人员气闸关闭', 'Personnel airlock shut'), barrier: true },
    ],
    records: {
      hatch: record(t('冷库顶部维护口', 'Cold-room upper hatch'), t('顶部霜裂采样', 'Upper frost-fracture sample'), [field(t('喷射方向', 'Jet direction'), t('顶部维护口 → 防寒服表面', 'upper hatch → suit surface')), field(t('残留', 'Residue'), 'D-4 / nitrogen')]),
      tunnel: record(t('维护隧道', 'Maintenance tunnel'), t('磨屑取样袋 T-2', 'Track sample bag T-2'), [field(t('履带间距', 'Track pitch'), 'D-4'), field(t('磨屑方向', 'Residue direction'), 'dock → bypass')]),
      dock: record(t('控制室坞站', 'Control-room dock'), t('D-4坞站记录', 'D-4 dock record'), [field(t('设备状态', 'Device state'), 'DOCKED → REMOTE'), field(t('接口', 'Interface'), 'service network')]),
      valve: record(t('液氮旁路阀', 'Nitrogen bypass valve'), t('阀轴扭矩记录', 'Valve-shaft torque record'), [field(t('扭矩档', 'Torque setting'), 'D-4 default'), field(t('阀向', 'Valve direction'), 'bypass → upper line')]),
    },
  },
  Lvl_05: {
    kind: 'camera', title: t('监控帧与独立回执', 'Camera frames and independent receipts'),
    instructions: t('拖动取帧时刻，比较星背景的位置变化；可平移叠加参考轨迹。随后用独立回执而非画面播放顺序排列事件。', 'Move the frame cursor and compare the star-background position. Shift the reference overlay if useful, then order events using independent receipts rather than video playback order.'),
    source_note: t('星图位置使用归一化传感器坐标；回执编号保留独立的父记录引用。', 'Star positions use normalized sensor coordinates. Receipts retain independent parent-record references.'),
    sample_step: 6, x_label: t('播放时间 / 秒', 'Playback / seconds'), y_label: t('星背景位置', 'Star-background position'),
    reference_label: t('独立星图测量', 'Independent star measurement'), observed_label: t('监控存储帧', 'Stored camera frames'),
    reference: [12, 24, 36, 48, 60, 72, 84], observed: [12, 24, 36, 12, 24, 36, 12],
    records: {
      release: record(t('港务放行回执', 'Port release receipt'), t('港务原始签章', 'Original port signature'), [field(t('回执', 'Receipt'), 'REL-83'), field(t('前置回执', 'Parent receipt'), 'DIA-82'), field(t('签名延迟 / 毫秒', 'Signature latency / ms'), '148 / key baseline 12')]),
      warn: record(t('紧急信标片段', 'Emergency beacon fragment'), t('独立信标存证', 'Independent beacon archive'), [field(t('回执', 'Receipt'), 'BCN-81'), field(t('原始载荷', 'Original payload'), t('不要相信放行记录', 'Do not trust the release record'))]),
      move: record(t('货运转移回执', 'Cargo-transfer receipt'), t('未上链航单', 'Off-chain manifest'), [field(t('回执', 'Receipt'), 'MOV-84'), field(t('前置回执', 'Parent receipt'), 'REL-83')]),
      diagnose: record(t('主控诊断回执', 'Master-diagnostic receipt'), t('诊断端口执行镜像', 'Diagnostic execution mirror'), [field(t('回执', 'Receipt'), 'DIA-82'), field(t('前置回执', 'Parent receipt'), 'BCN-81'), field(t('参数', 'Parameters'), 'diagnostic = ON; alarm_forward = OFF')]),
    },
  },
  Lvl_06: {
    kind: 'spectrum', title: t('材料谱与标记测量', 'Material spectra and marker measurements'),
    instructions: t('切换取样记录，叠加各自的登记参考并检查数值。选择两项可直接区分展厅物件与箱中物件的测量记录。', 'Switch sample records, overlay each registered reference and inspect the values. Select the two measurements that directly distinguish the displayed object from the cased object.'),
    source_note: t('曲线为封存检测记录的离散采样；标签文字与封条观察另列，不能代替材料或标记测量。', 'Curves are discrete samples of preserved test records. Exhibit text and seal observations are listed separately and do not replace material or marker measurements.'),
    records: {
      seal: record(t('运输封条观察', 'Transport-seal observation'), t('冷箱交接照片', 'Case-handoff photograph'), [field(t('封条状态', 'Seal state'), 'INTACT'), field(t('材料测量通道', 'Material measurement channels'), '—')]),
      resin: record(t('展品边缘取样', 'Exhibit-edge sample'), t('边缘采样与R-41登记', 'Edge sample and R-41 registry'), [field(t('登记批次', 'Registered batch'), 'R-41 / −3 weeks')], { sample_step: 1, reference_label: t('R-41参考块', 'R-41 reference block'), observed_label: t('展品边缘', 'Exhibit edge'), x_label: t('材料检测通道', 'Material-test channel'), reference: [2, 4, 14, 72, 18, 6, 4, 12, 92, 20, 5, 3, 10, 62, 14, 4], observed: [3, 5, 13, 70, 19, 7, 3, 13, 90, 21, 6, 4, 11, 60, 15, 5] }),
      label: record(t('展牌文字照片', 'Exhibit-label photograph'), t('展厅标签原件', 'Original exhibit label'), [field(t('印刷文字', 'Printed text'), t('真品', 'Original')), field(t('材料测量通道', 'Material measurement channels'), '—')]),
      marker: record(t('箱内标记读数', 'Cased-marker reading'), t('量子标记与原始登记', 'Quantum marker and original registry'), [field(t('登记', 'Registry'), 'ORIGINAL / Q-19')], { sample_step: 1, reference_label: t('原始登记Q-19', 'Original registry Q-19'), observed_label: t('冷箱内标记', 'Marker inside flight case'), x_label: t('标记检测通道', 'Marker-test channel'), reference: [3, 7, 81, 12, 4, 5, 18, 5, 4, 68, 9, 3, 7, 95, 11, 3], observed: [4, 8, 79, 13, 5, 4, 18, 6, 5, 66, 10, 4, 8, 93, 12, 4] }),
    },
  },
  Lvl_07: {
    kind: 'waveform', title: t('声学原始窗口对照', 'Original acoustic-window comparison'),
    instructions: t('切换声学窗口，平移叠加轨迹并核对采样值。选择能判断录音来源与重复性的两组原始材料；音量与录制时间分别判断。', 'Switch acoustic windows, shift the overlaid trace and inspect sample values. Select the two source comparisons that establish recording origin and repetition; assess volume and recording time separately.'),
    source_note: t('波形为局部窗口的归一化振幅；全段时间标签保留在来源记录中。对齐不会改写采样。', 'Waveforms show normalized amplitudes within local windows; full-recording timestamps remain with the sources. Alignment does not rewrite samples.'),
    records: {
      volume: record(t('扬声器输出窗口', 'Speaker-output window'), t('分段增益遥测', 'Segment-gain telemetry'), [field(t('增益', 'Gain'), '0.6 / 1.0 / 0.8'), field(t('录音源时间', 'Source-recording time'), '—')], { sample_step: 4, x_label: t('局部时间 / 毫秒', 'Local time / ms'), reference_label: t('输入窗口', 'Input window'), observed_label: t('输出窗口', 'Output window'), reference: [0, 12, -18, 42, -62, 84, -36, 14, 5, -22, 34, -12, 4, 0, 0, 0], observed: [0, 7, -11, 25, -37, 50, -22, 8, 3, -13, 20, -7, 2, 0, 0, 0] }),
      drill: record(t('阀响局部窗口', 'Valve-noise window'), t('当前求救段与三日前演练', 'Current distress segment and drill three days earlier'), [field(t('参考封存', 'Reference archive'), 'DRILL / −3 days'), field(t('窗口', 'Window'), 'valve transient')], { sample_step: 4, x_label: t('局部时间 / 毫秒', 'Local time / ms'), reference_label: t('三日前演练背景', 'Drill background, three days earlier'), observed_label: t('当前求救段背景', 'Current distress background'), reference: [0, 0, 5, 36, -75, 43, -18, 9, -4, 2, 0, 0, 0, 0, 0, 0], observed: [0, 0, 5, 36, -75, 43, -18, 9, -4, 2, 0, 0, 0, 0, 0, 0] }),
      room: record(t('阵列环境窗口', 'Array-ambient window'), t('当前海流与站内参考', 'Current current-noise and station reference'), [field(t('传感器', 'Sensor'), 'ambient / sonar station')], { sample_step: 4, x_label: t('局部时间 / 毫秒', 'Local time / ms'), reference_label: t('站内环境参考', 'Station ambient reference'), observed_label: t('当前海流', 'Current sea noise'), reference: [5, -12, 8, -5, 17, -8, 5, -14, 8, -5, 16, -9, 6, -12, 7, -4], observed: [32, -26, 48, -34, 62, -53, 45, -38, 64, -50, 42, -35, 58, -47, 33, -28] }),
      breath: record(t('两处呼吸窗口', 'Two breath windows'), t('求救段1秒与48秒取样', 'Distress samples at seconds 1 and 48'), [field(t('取样起点', 'Window starts'), '00:01 / 00:48'), field(t('采样通道', 'Sample channel'), 'breath noise')], { sample_step: 4, x_label: t('局部时间 / 毫秒', 'Local time / ms'), reference_label: t('第1秒窗口', 'Window at second 1'), observed_label: t('第48秒窗口', 'Window at second 48'), reference: [0, 12, -18, 42, -62, 84, -36, 14, 5, -22, 34, -12, 4, 0, 0, 0], observed: [0, 12, -18, 42, -62, 84, -36, 14, 5, -22, 34, -12, 4, 0, 0, 0] }),
    },
  },
  Lvl_08: {
    kind: 'signature', title: t('签章回执与执行链', 'Signed receipts and execution chain'),
    instructions: t('逐份核对记录的来源、指令引用和签章；选择记录并排列执行链。账号名称、读卡硬件和批准签章应分别比较。', 'Inspect each record’s source, command references and signature, then select records and arrange the execution chain. Compare account names, badge hardware and authorizing signatures separately.'),
    source_note: t('回执标识仅用于对照同案记录；独立气样读数不来自被关闭的空气报警。', 'Receipt identifiers cross-reference records within this case. Independent gas measurements do not come from the disabled air alarm.'),
    records: {
      erase: record(t('核心审计快照', 'Core-audit snapshot'), t('风险路径删除日志', 'Risk-path deletion log'), [field(t('回执', 'Receipt'), 'AUD-44'), field(t('引用执行回执', 'Referenced execution receipt'), 'AIR-43'), field(t('操作权限', 'Authority'), 'DIRECTOR'), field(t('操作', 'Operation'), 'risk_path.DELETE')]),
      clone: record(t('空气机房读卡回执', 'Air-plant reader receipt'), t('读卡器与电梯独立存证', 'Reader and independent elevator archive'), [field(t('回执', 'Receipt'), 'ACC-41'), field(t('权限名', 'Permission name'), 'TOMAS'), field(t('读卡硬件', 'Badge hardware'), 'HW-C77'), field(t('登记硬件', 'Registered hardware'), 'HW-T12'), field(t('同期电梯求救', 'Concurrent elevator distress'), 'HW-T12 / ACTIVE')]),
      execute: record(t('独立气样取样回执', 'Independent gas-sample receipt'), t('备用封管与氧传感器', 'Backup tube and oxygen sensor'), [field(t('回执', 'Receipt'), 'AIR-43'), field(t('引用指令', 'Referenced command'), 'ENV-42'), field(t('混合阀', 'Mixing valve'), 'Ar/Xe / OPEN'), field(t('氧浓度轨迹', 'Oxygen trace'), '20.9% → 17.0% → 11.2%')]),
      human: record(t('环境模式指令', 'Environment-mode command'), t('人类签章原件', 'Original human signature'), [field(t('回执', 'Receipt'), 'ENV-42'), field(t('访问引用', 'Access reference'), 'ACC-41'), field(t('批准签章', 'Authorizing signature'), 'LUCAN / HUMAN'), field(t('参数', 'Parameters'), 'independent_air_alarm = OFF; mixing = ON')]),
    },
  },
};

// Extra proof routes are intentionally narrow. They require an independently
// verified device signature, not merely a matching permission or person's name.
const REPORT_SUPPORT_ALTERNATIVES = {
  Lvl_01: {
    opportunity: [['c_05', 'c_secret_99']],
    timeline: [['c_05', 'c_08', 'c_secret_99']],
  },
};

export function getReconstructionWorkbench(caseId) {
  return WORKBENCHES[caseId] || null;
}

export function getReportSupportAlternatives(caseId) {
  return REPORT_SUPPORT_ALTERNATIVES[caseId] || {};
}
