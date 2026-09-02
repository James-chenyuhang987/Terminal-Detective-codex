import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';

const COPY = {
  zh: {
    password_reset_complete: '密码已重置，请使用新密码登录。',
    verification_incomplete: '验证链接无效、已过期或尚未完成。请在验证页面重新发送邮件。',
    github_linked: 'GitHub 已成功绑定到当前侦探账号。',
    reauthenticated: '身份已重新确认，请再次执行刚才的账户操作。',
    invalid_credential: '登录凭据已失效，请重新登录。',
    account_exists: '该凭据已属于其他账号，请使用原登录方式。',
    network: '认证服务暂时不可用，当前游戏会话已保留。',
    backend_not_ready: '登录后端尚未就绪，请管理员检查 Firebase 与 D1 配置。',
    account_disabled: '该账号已停用，请联系管理员。',
    unknown: '认证操作未完成，请稍后重试。',
    close: '关闭提示',
  },
  en: {
    password_reset_complete: 'Password reset complete. Sign in with your new password.',
    verification_incomplete: 'The verification link is invalid, expired, or incomplete. Resend it from the verification screen.',
    github_linked: 'GitHub is now linked to this detective account.',
    reauthenticated: 'Identity confirmed. Run the account action again.',
    invalid_credential: 'Your sign-in credential expired. Sign in again.',
    account_exists: 'That credential belongs to another account. Use its original sign-in method.',
    network: 'Authentication is temporarily unavailable. Your current game session was preserved.',
    backend_not_ready: 'The sign-in backend is not ready. Check the Firebase and D1 configuration.',
    account_disabled: 'This account is disabled. Contact an administrator.',
    unknown: 'The authentication action did not complete. Try again shortly.',
    close: 'Dismiss notice',
  },
};

export default function AuthNotice() {
  const { authNotice, clearAuthNotice } = useAuth();
  const { lang } = useLang();
  const text = COPY[lang] || COPY.zh;

  useEffect(() => {
    if (!authNotice) return undefined;
    const timer = window.setTimeout(clearAuthNotice, authNotice.kind === 'success' ? 6000 : 9000);
    return () => window.clearTimeout(timer);
  }, [authNotice, clearAuthNotice]);

  if (!authNotice) return null;
  const success = authNotice.kind === 'success';
  return (
    <div className={`auth-global-notice ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>
      <span>{success ? '◆' : '⚠'} {text[authNotice.code] || text.unknown}</span>
      <button aria-label={text.close} onClick={clearAuthNotice} type="button">×</button>
      <style>{`
        .auth-global-notice{position:fixed;z-index:1000;top:max(12px,env(safe-area-inset-top));left:50%;width:min(560px,calc(100vw - max(24px,env(safe-area-inset-left)) - max(24px,env(safe-area-inset-right))));display:flex;align-items:center;justify-content:space-between;gap:12px;transform:translateX(-50%);padding:11px 12px 11px 15px;border-radius:10px;box-shadow:0 12px 40px #0008;backdrop-filter:blur(16px);font:600 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.auth-global-notice.success{border:1px solid #27d98b80;background:#042e20ed;color:#80f4bd}.auth-global-notice.error{border:1px solid #ff4c7080;background:#3b0712ed;color:#ff9aac}.auth-global-notice button{min-width:32px;min-height:32px;border:0;border-radius:7px;background:#ffffff0d;color:inherit;font:20px/1 sans-serif;cursor:pointer}
      `}</style>
    </div>
  );
}
