// Display-only studies of already-public object observations. No methods,
// evidence rewards, measurements or case conclusions belong in this module.
const copy = (zh, en) => Object.freeze({ zh, en });
const detail = (id, label, position) => Object.freeze({ id, label, position: Object.freeze(position) });
const study = (variant, features, viewHint) => Object.freeze({ variant, features: Object.freeze(features), viewHint });

export const OBSERVATION_PRESENTATIONS = Object.freeze({
  target_c_01: study('folded-receipt', [
    detail('stain', copy('纸角有暗红色斑点', 'A dark red stain marks a paper corner'), [-.14, .025, .18]),
    detail('fold', copy('购买项目被折痕挡住', 'A fold hides the purchased item'), [.08, .085, -.12]),
  ], copy('旋转比较纸角与折起的纸面；折叠处不会直接显示被遮住的内容。', 'Rotate to compare the corner with the raised fold. Covered text is not revealed by the sketch.')),
  target_d_05: study('connector-can', [
    detail('shell', copy('罐体没有饮料重量', 'The can lacks the weight of a drink'), [.09, .17, .02]),
    detail('connector', copy('底部有数据接口', 'A data connector underneath'), [0, .012, .045]),
  ], copy('把视角转到罐底，查看下置接口；重量信息来自现场观察记录。', 'Orbit below the can to view its connector. Weight information comes from the field observation.')),
  target_e_01: study('power-gauge', [
    detail('safety', copy('保险开关没有损坏', 'The safety switch is intact'), [.12, .075, .08]),
    detail('peak', copy('峰值指示却超出刻度', 'The peak indicator exceeds its scale'), [.035, .20, -.025]),
  ], copy('从正面比较保险与峰值指示；示意刻线不代表新的测量值。', 'Compare the safety and peak indicator from the front. Sketch ticks are not additional measurements.')),
  target_f_07: study('marked-valve', [
    detail('marks', copy('新鲜压痕间距非常规则', 'Fresh impressions are regularly spaced'), [.13, .105, .055]),
    detail('crystals', copy('阀旁有少量结晶', 'A little crystal residue remains beside the valve'), [-.14, .035, .11]),
  ], copy('侧看压痕的间距，再查看阀旁结晶；材质成分仍需核验。', 'View the impression spacing from the side, then examine the residue. Its composition still requires verification.')),
  target_g_03: study('particle-pallet', [
    detail('particles', copy('托盘边缘有发光微粒', 'Glowing particles mark a pallet'), [.12, .067, .12]),
    detail('declaration', copy('申报医疗冷却剂', 'Declared as medical coolant'), [-.13, .071, -.08]),
  ], copy('沿托盘边缘观察颗粒分布，再对照申报标签；外观不等于成分结论。', 'Follow the particles along the pallet edge and compare the declaration tag. Appearance does not establish composition.')),
  target_h_04: study('resin-reference', [
    detail('reference', copy('参考块', 'The reference block'), [-.105, .075, .025]),
    detail('edge', copy('展品边缘的透明物质外观接近', 'Resembles the clear material at the exhibit edge'), [.12, .105, .015]),
  ], copy('并排查看透明参考块与边缘示意；是否同种树脂仍需比对。', 'Compare the clear reference block and edge sketch. Whether they are the same resin still requires comparison.')),
  target_i_02: study('audio-fragments', [
    detail('first', copy('相隔一段时间的呼吸声', 'Breaths separated in time'), [-.07, .112, -.07]),
    detail('second', copy('听起来完全相同', 'Sound exactly identical'), [.07, .112, .06]),
  ], copy('上下两条曲线表示公开描述中的两个片段；曲线是示意，不是新增音频读数。', 'The two curves represent the fragments in the public account. They are sketches, not new audio measurements.')),
  target_j_01: study('sealed-air-tube', [
    detail('seal', copy('备用取样器封管仍在', 'The backup sampler’s sealed tube remains'), [-.09, .30, 0]),
    detail('sensor', copy('常规毒气传感器显示无报警', 'Ordinary toxin sensors show no alarm'), [.125, .14, .055]),
  ], copy('比较封管与旁侧传感器状态；封管内成分和浓度不会从外观直接显示。', 'Compare the sealed tube and adjacent sensor. Contents and concentrations are not visible from appearance alone.')),
});

export function observationPresentation(targetId) {
  return typeof targetId === 'string' && Object.hasOwn(OBSERVATION_PRESENTATIONS, targetId)
    ? OBSERVATION_PRESENTATIONS[targetId] : null;
}

const ASSISTS = Object.freeze({
  logic_power: Object.freeze({ key: 'compare', color: '#d8bd85', label: copy('并列对照', 'Comparison guide'),
    instruction: copy('先分开记录两处外观，再由核验判断它们的关系。', 'Record the two appearances separately, then verify their relationship.') }),
  observation_focus: Object.freeze({ key: 'trace', color: '#c4b0d9', label: copy('痕迹定位', 'Trace guide'),
    instruction: copy('编号圈出已公开的细节；旋转检查遮挡，不把相似外观当作结论。', 'Numbers locate the published details. Rotate to check occlusion; similar appearances are not a conclusion.') }),
  hack_level: Object.freeze({ key: 'carrier', color: '#9fbfc4', label: copy('载体查看', 'Carrier guide'),
    instruction: copy('参考框帮助查看载体和接口；不会解密内容或代替正式核验。', 'A reference frame helps examine the carrier and interfaces. It does not decrypt content or replace verification.') }),
});

/** Public agent attributes choose a visual aid, never a cost or outcome. */
export function observationAssist(executor) {
  if (!executor || typeof executor !== 'object') return null;
  const keys = Object.keys(ASSISTS).filter(key => Number.isFinite(Number(executor[key])) && Number(executor[key]) > 0);
  keys.sort((a, b) => Number(executor[b]) - Number(executor[a]));
  return keys.length ? ASSISTS[keys[0]] : null;
}
