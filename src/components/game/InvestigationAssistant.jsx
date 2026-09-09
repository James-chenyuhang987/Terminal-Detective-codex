import Icon, { IconText } from '@/components/ui/Icon';
import { useLang } from '@/lib/lang.jsx';

export default function InvestigationAssistant({ brief }) {
  const { lang } = useLang();
  if (!brief) return null;

  return (
    <aside
      className={`td-investigation-assistant is-${brief.tone || 'cyan'}`}
      data-onboarding-target="nova"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="td-assistant-avatar" aria-hidden="true">
        <Icon name="robot" size={24} />
      </span>
      <div className="td-assistant-bubble">
        <small>NOVA // {lang === 'zh' ? '调查助理' : 'TACTICAL ASSISTANT'}</small>
        <p><IconText text={brief.message} /></p>
      </div>
    </aside>
  );
}
