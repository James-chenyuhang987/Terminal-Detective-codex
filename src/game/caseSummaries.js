export const CASE_SUMMARIES = Object.freeze([
  {
    case_id: 'Lvl_01', difficulty: 'OMEGA', clue_total: 9,
    title: '霓虹血迹', subtitle: 'Neon Blood', setting: '2157年，赛博朋克城市深处的顶层豪华公寓。',
    en: { title: 'Neon Blood', subtitle: 'Case LVL-01', setting: '2157. A luxury penthouse in the depths of a cyberpunk metropolis.' },
  },
  {
    case_id: 'Lvl_02', difficulty: 'HARD', clue_total: 9,
    title: '幽灵协议', subtitle: 'Ghost Protocol', setting: '2159年，顶级私人量子研究所。一名科学家从封闭实验室中神秘消失。',
    en: { title: 'Ghost Protocol', subtitle: 'Case LVL-02', setting: '2159. A scientist vanishes from a sealed private quantum research lab.' },
  },
  {
    case_id: 'Lvl_03', difficulty: 'NORMAL', clue_total: 9,
    title: '红蝶陷阱', subtitle: 'Red Butterfly', setting: '2155年，地下九区非法神经娱乐俱乐部「蝶巢」发生神经过载死亡事件。',
    en: { title: 'Red Butterfly', subtitle: 'Case LVL-03', setting: '2155. A neural-overload death strikes The Nest, an illegal club in Underground Sector 9.' },
  },
  {
    case_id: 'Lvl_04', difficulty: 'HARD', clue_total: 9,
    title: '零度回声', subtitle: 'Zero Echo', setting: '2161年，极地气候档案站的密封冷库发生异常死亡事件。',
    en: { title: 'Zero Echo', subtitle: 'Case LVL-04', setting: '2161. An impossible death inside the sealed cold vault of a polar climate archive.' },
  },
  {
    case_id: 'Lvl_05', difficulty: 'OMEGA', clue_total: 9,
    title: '天穹失联', subtitle: 'Skyfall Silence', setting: '2163年，轨道电梯上的救生舱谋杀与军用货柜失踪同时发生。',
    en: { title: 'Skyfall Silence', subtitle: 'Case LVL-05', setting: '2163. A lifeboat murder and a missing military container collide aboard an orbital elevator.' },
  },
]);

export function getCaseSummary(caseId) {
  return CASE_SUMMARIES.find(item => item.case_id === caseId) || CASE_SUMMARIES[0];
}
