export default function InvestigationAssistant({ brief }) {
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
        <i />
        <b>🤖</b>
        <em />
      </span>
      <div key={brief.messageKey} className="td-assistant-bubble">
        <small>NOVA // TACTICAL ASSISTANT</small>
        <p>{brief.message}</p>
      </div>
    </aside>
  );
}
