import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';
import { appParams } from '@/lib/app-params';
import { consumeAuthRedirectError } from '@/lib/auth-redirect';

const COPY = {
  zh: {
    eyebrow: 'CLOUDFLARE SECURE ACCESS',
    title: '身份验证终端',
    subtitle: '这是全新的账号系统。旧账号不会迁移，首次使用 GitHub 登录会创建一份全新侦探档案。',
    github: '使用 GitHub 安全登录',
    githubHint: '不发送登录邮件 · 会话使用安全 Cookie · 档案保存于 Cloudflare D1',
    security: 'GitHub 密钥只保存在 Cloudflare，绝不会写入浏览器、项目代码或 GitHub 仓库。',
    loading: '正在检查登录服务…',
    unavailable: 'GitHub 登录尚未完成管理员配置。',
    oauth_not_configured: 'GitHub 登录尚未完成管理员配置。',
    oauth_cancelled: 'GitHub 授权已取消，请重新尝试。',
    oauth_state_invalid: '登录校验已过期，请重新发起 GitHub 授权。',
    github_email_required: 'GitHub 账号需要提供一个已验证邮箱。',
    oauth_failed: 'GitHub 登录失败，请稍后重试。',
  },
  en: {
    eyebrow: 'CLOUDFLARE SECURE ACCESS',
    title: 'Identity Terminal',
    subtitle: 'This is a fresh account system. Legacy accounts are not migrated; your first GitHub sign-in creates a new detective profile.',
    github: 'Continue securely with GitHub',
    githubHint: 'No login email · Secure cookie session · Profile stored in Cloudflare D1',
    security: 'GitHub secrets stay in Cloudflare and are never exposed to the browser, source code, or repository.',
    loading: 'Checking sign-in service…',
    unavailable: 'GitHub sign-in has not been configured by the administrator yet.',
    oauth_not_configured: 'GitHub sign-in has not been configured by the administrator yet.',
    oauth_cancelled: 'GitHub authorization was cancelled. Please try again.',
    oauth_state_invalid: 'The sign-in check expired. Start GitHub authorization again.',
    github_email_required: 'Your GitHub account must provide a verified email.',
    oauth_failed: 'GitHub sign-in failed. Please retry shortly.',
  },
};

export default function AuthGate() {
  const { loginWithGitHub } = useAuth();
  const { lang, setLang } = useLang();
  const text = COPY[lang];
  const [providerReady, setProviderReady] = useState(null);
  const [errorCode, setErrorCode] = useState('');

  useEffect(() => {
    const redirectError = consumeAuthRedirectError();
    if (redirectError) setErrorCode(redirectError);
    const serverOrigin = new URL(appParams.serverUrl).origin;
    if (serverOrigin !== window.location.origin) {
      // The preserved GitHub Pages entrance cannot read a cross-site session.
      // It sends the player to the Worker, where OAuth and the game are same-origin.
      setProviderReady(true);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`${appParams.serverUrl}/api/auth/config`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(config => setProviderReady(Boolean(config?.github)))
      .catch(error => { if (error?.name !== 'AbortError') setProviderReady(false); });
    return () => controller.abort();
  }, []);

  const feedback = errorCode ? (text[errorCode] || text.oauth_failed) : '';

  return (
    <main className="auth-gate td-page-shell">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-scan" aria-hidden="true" />
      <button className="auth-lang td-ui-button td-button-ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} type="button">
        {lang === 'zh' ? 'EN' : '中'}
      </button>

      <section className="auth-panel td-ui-card">
        <div className="auth-orb" aria-hidden="true"><span>◈</span></div>
        <p className="auth-eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p className="auth-subtitle">{text.subtitle}</p>

        <button
          className="auth-github td-ui-button td-button-primary"
          disabled={providerReady !== true}
          onClick={loginWithGitHub}
          type="button"
        >
          <span aria-hidden="true" className="auth-github-mark">GH</span>
          <span><strong>{text.github}</strong><small>{text.githubHint}</small></span>
          <b aria-hidden="true">›</b>
        </button>

        {providerReady === null && <p className="auth-status">{text.loading}</p>}
        {providerReady === false && <p className="auth-warning">⚠ {text.unavailable}</p>}
        {feedback && <p className="auth-error" role="alert">⚠ {feedback}</p>}

        <p className="auth-security">🔒 {text.security}</p>
      </section>

      <style>{`
        .auth-gate { min-height: 100dvh; display: grid; place-items: center; position: relative; overflow: hidden; padding: 24px; background: radial-gradient(circle at 50% 18%, #132850 0, #050914 40%, #02040a 100%); color: #dffcff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .auth-grid { position: absolute; inset: 0; opacity: .18; background-image: linear-gradient(rgba(0,229,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.18) 1px, transparent 1px); background-size: 42px 42px; mask-image: linear-gradient(to bottom, black, transparent 88%); }
        .auth-scan { position: absolute; inset: -40% 0 auto; height: 45%; background: linear-gradient(transparent, rgba(0,229,255,.055), transparent); animation: authScan 7s linear infinite; pointer-events: none; }
        .auth-lang { position: absolute; top: max(20px, env(safe-area-inset-top)); right: 22px; z-index: 2; min-width: 50px; min-height: 44px; border: 1px solid rgba(0,229,255,.35); border-radius: 999px; background: rgba(0,10,22,.7); color: #71f5ff; font: inherit; cursor: pointer; }
        .auth-panel { width: min(100%, 460px); position: relative; z-index: 1; padding: 38px; border: 1px solid rgba(0,229,255,.3); border-radius: 24px; background: linear-gradient(145deg, rgba(7,18,38,.95), rgba(2,7,18,.97)); box-shadow: 0 28px 90px rgba(0,0,0,.58), 0 0 50px rgba(0,229,255,.09), inset 0 1px rgba(255,255,255,.05); backdrop-filter: blur(18px); }
        .auth-orb { width: 62px; height: 62px; display: grid; place-items: center; margin: 0 auto 20px; border: 1px solid #00e5ff80; border-radius: 19px; color: #00e5ff; font-size: 28px; box-shadow: 0 0 30px #00e5ff38; transform: rotate(45deg); }
        .auth-orb span { transform: rotate(-45deg); }
        .auth-eyebrow { margin: 0 0 8px; text-align: center; color: #00e5ffb0; font-size: 10px; letter-spacing: .28em; }
        .auth-panel h1 { margin: 0; text-align: center; font-size: clamp(25px, 6vw, 35px); letter-spacing: .08em; background: linear-gradient(90deg, #72f7ff, #d88cff); background-clip: text; color: transparent; }
        .auth-subtitle { margin: 14px auto 28px; max-width: 380px; text-align: center; color: #a7bbcf; font-size: 12px; line-height: 1.75; }
        .auth-github { width: 100%; min-height: 68px; display: flex; align-items: center; gap: 13px; padding: 11px 14px; text-align: left; border: 1px solid rgba(90,240,255,.64); border-radius: 14px; color: #e9fdff; background: linear-gradient(100deg, rgba(0,229,255,.18), rgba(139,92,246,.2)); cursor: pointer; box-shadow: 0 0 25px rgba(0,229,255,.08); }
        .auth-github:hover:not(:disabled) { transform: translateY(-1px); border-color: #78f6ff; box-shadow: 0 10px 34px rgba(0,229,255,.17); }
        .auth-github:disabled { cursor: not-allowed; opacity: .42; }
        .auth-github-mark { width: 40px; height: 40px; flex: 0 0 40px; display: grid; place-items: center; border-radius: 50%; background: #eefbff; color: #07101b; font: 900 12px/1 ui-monospace, monospace; }
        .auth-github span:nth-child(2) { flex: 1; display: grid; gap: 5px; }
        .auth-github strong { font-size: 12px; letter-spacing: .04em; }
        .auth-github small { color: #91afc2; font-size: 8px; line-height: 1.45; }
        .auth-github b { color: #77f7ff; font-size: 24px; }
        .auth-status, .auth-warning, .auth-error { margin: 14px 0 0; text-align: center; font-size: 10px; line-height: 1.6; }
        .auth-status { color: #8bb6c8; }
        .auth-warning { color: #ffc06f; }
        .auth-error { padding: 10px 12px; border: 1px solid rgba(255,76,112,.35); border-radius: 10px; background: rgba(70,4,18,.32); color: #ff829b; }
        .auth-security { margin: 25px 0 0; border-top: 1px solid rgba(255,255,255,.07); padding-top: 17px; text-align: center; color: #61788d; font-size: 9px; line-height: 1.65; }
        @keyframes authScan { to { transform: translateY(320%); } }
        @media (max-width: 520px) { .auth-gate { padding: 14px; } .auth-panel { padding: 30px 20px; border-radius: 19px; } }
        @media (prefers-reduced-motion: reduce) { .auth-scan { animation: none; } .auth-github { transition: none; } }
      `}</style>
    </main>
  );
}
