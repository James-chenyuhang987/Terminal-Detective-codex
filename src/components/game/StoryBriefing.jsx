import React from 'react';
import { useLang } from '@/lib/lang.jsx';

// 决策工作区优先完整复现玩家刚刚看到的观察阶段终端稿。
export default function StoryBriefing({ story, headingId = 'td-decision-story-title', language }) {
  const { lang: currentLang } = useLang();
  const lang = language === 'en' || language === 'zh' ? language : currentLang;
  const zh = lang === 'zh';
  if (!story) return null;
  const fallbackTranscript = [
    story.narrative,
    story.objective && `${zh ? '本轮目标' : 'TURN OBJECTIVE'}：${story.objective}`,
  ].filter(Boolean).join('\n\n');
  const transcript = String(story.transcript || fallbackTranscript).trim();

  return (
    <article className="td-story-briefing">
      <header className="td-story-briefing-header">
        <div>
          <small>{story.chapterLabel || (zh ? '案件观察记录' : 'CASE OBSERVATION LOG')}</small>
          <h2 id={headingId}>{zh ? '【剧情内容】' : '[COMPLETE STORY]'}</h2>
        </div>
        <span>{story.caseTitle || (zh ? '当前案件' : 'ACTIVE CASE')} · {zh ? `回合 ${story.turn}` : `TURN ${story.turn}`}</span>
      </header>
      <section className="td-story-transcript" aria-label={zh ? '本回合完整剧情' : 'Complete turn narrative'}>
        <p>{transcript}</p>
      </section>
    </article>
  );
}
