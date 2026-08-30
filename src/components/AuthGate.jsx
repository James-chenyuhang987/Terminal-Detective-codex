import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';

const COPY = {
  zh: {
    eyebrow: 'SECURE NEURAL ACCESS',
    title: '身份验证终端',
    subtitle: '案件进度与受保护规则由 Base44 安全后端提供，请先验证身份。',
    email: '邮箱地址',
    password: '密码',
    otp: '邮箱验证码',
    login: '进入系统',
    register: '创建账号',
    verify: '验证并登录',
    switchRegister: '没有账号？创建一个',
    switchLogin: '已有账号？返回登录',
    resend: '重新发送验证码',
    codeSent: '验证码已发送至邮箱，请在下方输入。',
    codeResent: '新的验证码已发送。',
    passwordHint: '密码至少 8 位',
    busy: '正在建立安全连接…',
    security: '凭据仅发送至 Base44，不会进入项目代码或 GitHub。',
  },
  en: {
    eyebrow: 'SECURE NEURAL ACCESS',
    title: 'Identity Terminal',
    subtitle: 'Case progress and protected rules use the secured Base44 backend. Authenticate to continue.',
    email: 'Email address',
    password: 'Password',
    otp: 'Email verification code',
    login: 'Enter system',
    register: 'Create account',
    verify: 'Verify and sign in',
    switchRegister: 'New here? Create an account',
    switchLogin: 'Already registered? Sign in',
    resend: 'Resend verification code',
    codeSent: 'A verification code was sent to your email.',
    codeResent: 'A new verification code was sent.',
    passwordHint: 'Use at least 8 characters',
    busy: 'Establishing secure connection…',
    security: 'Credentials go only to Base44 and are never stored in this project or GitHub.',
  },
};

export default function AuthGate() {
  const {
    loginWithPassword,
    registerAccount,
    verifyRegistration,
    resendVerification,
  } = useAuth();
  const { lang, setLang } = useLang();
  const text = COPY[lang];
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setLocalError('');
    setNotice('');
    setOtp('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setLocalError('');
    setNotice('');

    try {
      if (mode === 'register') {
        if (password.length < 8) throw new Error(text.passwordHint);
        await registerAccount(email.trim(), password);
        setMode('verify');
        setNotice(text.codeSent);
      } else if (mode === 'verify') {
        await verifyRegistration(email.trim(), otp.trim());
        await loginWithPassword(email.trim(), password);
      } else {
        await loginWithPassword(email.trim(), password);
      }
    } catch (error) {
      setLocalError(error?.message || (lang === 'zh' ? '身份验证失败。' : 'Authentication failed.'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setLocalError('');
    try {
      await resendVerification(email.trim());
      setNotice(text.codeResent);
    } catch (error) {
      setLocalError(error?.message || (lang === 'zh' ? '无法重新发送验证码。' : 'Unable to resend code.'));
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = mode === 'verify' ? text.verify : mode === 'register' ? text.register : text.login;
  const canSubmit = Boolean(email.trim() && (mode === 'verify' ? otp.trim() : password));

  return (
    <main className="auth-gate td-page-shell">
      <div className="auth-grid" aria-hidden="true" />
      <button className="auth-lang td-ui-button td-button-ghost td-button-compact" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} type="button">
        {lang === 'zh' ? 'EN' : '中'}
      </button>

      <section className="auth-panel td-ui-card">
        <div className="auth-orb" aria-hidden="true">◈</div>
        <p className="auth-eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p className="auth-subtitle">{text.subtitle}</p>

        <form onSubmit={submit}>
          <label>
            <span>{text.email}</span>
            <input
              className="td-ui-input"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="detective@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          {mode === 'verify' ? (
            <label>
              <span>{text.otp}</span>
              <input
                className="td-ui-input"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                type="text"
                value={otp}
              />
            </label>
          ) : (
            <label>
              <span>{text.password}</span>
              <input
                className="td-ui-input"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={mode === 'register' ? 8 : undefined}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
              {mode === 'register' && <small>{text.passwordHint}</small>}
            </label>
          )}

          <div className="auth-feedback" aria-live="polite">
            {localError && <p className="auth-error">⚠ {localError}</p>}
            {notice && <p className="auth-notice">✓ {notice}</p>}
          </div>

          <button className="auth-submit td-ui-button td-button-primary" disabled={!canSubmit || busy} type="submit">
            {busy ? text.busy : `▶ ${actionLabel}`}
          </button>
        </form>

        {mode === 'verify' && (
          <button className="auth-link td-ui-button td-button-ghost" disabled={busy} onClick={resend} type="button">
            {text.resend}
          </button>
        )}
        <button
          className="auth-link td-ui-button td-button-ghost"
          disabled={busy}
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          type="button"
        >
          {mode === 'login' ? text.switchRegister : text.switchLogin}
        </button>

        <p className="auth-security">🔒 {text.security}</p>
      </section>

      <style>{`
        .auth-gate { min-height: 100vh; display: grid; place-items: center; position: relative; overflow: hidden; padding: 24px; background: radial-gradient(circle at 50% 20%, #11234a 0, #050914 38%, #02040a 100%); color: #dffcff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .auth-grid { position: absolute; inset: 0; opacity: .16; background-image: linear-gradient(rgba(0,229,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.18) 1px, transparent 1px); background-size: 42px 42px; mask-image: linear-gradient(to bottom, black, transparent 85%); }
        .auth-lang { position: absolute; top: 20px; right: 22px; z-index: 2; border: 1px solid rgba(0,229,255,.35); border-radius: 999px; padding: 7px 12px; background: rgba(0,10,22,.7); color: #71f5ff; font: inherit; cursor: pointer; }
        .auth-panel { width: min(100%, 430px); position: relative; z-index: 1; padding: 34px; border: 1px solid rgba(0,229,255,.28); border-radius: 22px; background: linear-gradient(145deg, rgba(7,18,38,.94), rgba(2,7,18,.96)); box-shadow: 0 28px 90px rgba(0,0,0,.55), 0 0 45px rgba(0,229,255,.08), inset 0 1px rgba(255,255,255,.04); backdrop-filter: blur(18px); }
        .auth-orb { width: 58px; height: 58px; display: grid; place-items: center; margin: 0 auto 18px; border: 1px solid #00e5ff80; border-radius: 18px; color: #00e5ff; font-size: 28px; box-shadow: 0 0 26px #00e5ff38; transform: rotate(45deg); }
        .auth-orb::first-letter { transform: rotate(-45deg); }
        .auth-eyebrow { margin: 0 0 8px; text-align: center; color: #00e5ffb0; font-size: 10px; letter-spacing: .28em; }
        .auth-panel h1 { margin: 0; text-align: center; font-size: clamp(25px, 6vw, 34px); letter-spacing: .08em; background: linear-gradient(90deg, #72f7ff, #d88cff); background-clip: text; color: transparent; }
        .auth-subtitle { margin: 12px auto 26px; max-width: 340px; text-align: center; color: #a7bbcf; font-size: 12px; line-height: 1.7; }
        .auth-panel form { display: grid; gap: 16px; }
        .auth-panel label { display: grid; gap: 7px; color: #81a7bd; font-size: 11px; letter-spacing: .06em; }
        .auth-panel input { width: 100%; box-sizing: border-box; border: 1px solid rgba(100,210,255,.2); border-radius: 11px; padding: 13px 14px; outline: none; background: rgba(0,5,14,.78); color: #e8fcff; font: inherit; transition: border-color .2s, box-shadow .2s; }
        .auth-panel input:focus { border-color: #00e5ff99; box-shadow: 0 0 0 3px rgba(0,229,255,.09); }
        .auth-panel small { color: #6f8292; }
        .auth-feedback { min-height: 18px; }
        .auth-feedback p { margin: 0; font-size: 11px; line-height: 1.5; }
        .auth-error { color: #ff7d9c; }
        .auth-notice { color: #65f5b1; }
        .auth-submit { border: 1px solid #00e5ff88; border-radius: 11px; padding: 13px; background: linear-gradient(90deg, rgba(0,229,255,.17), rgba(190,92,255,.18)); color: #dffcff; font: 700 12px/1 ui-monospace, monospace; letter-spacing: .08em; cursor: pointer; box-shadow: 0 0 22px rgba(0,229,255,.08); }
        .auth-submit:hover:not(:disabled) { border-color: #69f4ff; box-shadow: 0 0 30px rgba(0,229,255,.18); }
        .auth-submit:disabled, .auth-link:disabled { cursor: not-allowed; opacity: .45; }
        .auth-link { display: block; margin: 14px auto 0; border: 0; padding: 2px; background: transparent; color: #8bc8df; font: 11px/1.4 ui-monospace, monospace; cursor: pointer; }
        .auth-link:hover:not(:disabled) { color: #63f3ff; }
        .auth-security { margin: 24px 0 0; border-top: 1px solid rgba(255,255,255,.07); padding-top: 16px; text-align: center; color: #61788d; font-size: 9px; line-height: 1.6; }
        @media (max-width: 520px) { .auth-gate { padding: 14px; } .auth-panel { padding: 28px 20px; border-radius: 18px; } }
      `}</style>
    </main>
  );
}
