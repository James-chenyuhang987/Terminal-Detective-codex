import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AUTH_FEEDBACK_CODES, validatePassword } from '@/lib/authErrors';
import { useLang } from '@/lib/lang.jsx';

const COPY = {
  zh: {
    eyebrow: 'FIREBASE × CLOUDFLARE SECURE ACCESS', title: '侦探身份终端',
    subtitle: '邮箱与 GitHub 统一身份验证，调查档案安全保存在 Cloudflare D1。',
    login: '登录', register: '注册', email: '邮箱', password: '密码', confirm: '确认密码',
    loginBtn: '进入侦探之家', registerBtn: '注册并发送验证邮件', forgot: '忘记密码？',
    github: '使用 GitHub 登录', githubHint: '弹窗授权，不离开当前调查终端', or: '或使用邮箱',
    show: '显示', hide: '隐藏', back: '返回登录', resetTitle: '重置密码',
    resetDesc: '输入邮箱后，我们会发送 Firebase 官方重置邮件。', resetBtn: '发送重置邮件',
    resetSent: '如果该邮箱已注册，密码重置邮件将会送达。',
    verifyTitle: '等待邮箱验证', verifyDesc: '验证邮件已经发送至',
    verifyHint: '请打开最新一封邮件完成验证，然后返回这里继续。', verifiedBtn: '我已完成验证',
    resend: '重新发送验证邮件', changeEmail: '换一个邮箱', resent: '验证邮件已重新发送。',
    cooldown: '秒后可重新发送', githubAccount: 'GitHub 登录不需要验证邮件',
    security: '密码由 Firebase Authentication 管理；游戏服务器不会保存或看到你的明文密码。',
    mismatch: '两次输入的密码不一致。', passwordRules: '密码需为 8–64 个字符，并至少包含一个字母和一个数字。',
    ruleLength: '8–64 个字符', ruleLetter: '至少一个字母', ruleNumber: '至少一个数字',
    working: '正在建立安全连接…', configHelp: 'Firebase 尚未配置。请管理员先填写公开 Web 配置并部署 Worker 项目 ID。',
    invalid_credential: '邮箱或密码不正确。', email_unverified: '请先完成邮箱验证，再进入游戏。',
    email_in_use: '该邮箱已注册，请直接登录或重置密码。', weak_password: '密码不符合要求：需 8–64 位，且包含字母和数字。',
    rate_limited: '操作过于频繁，请等待倒计时后再试。', github_cancelled: 'GitHub 授权已取消，你可以重新尝试。',
    account_exists: '该邮箱已有密码账号，请先用邮箱密码登录，再在设置中绑定 GitHub。',
    popup_blocked: '弹窗被浏览器阻止，正在切换到安全跳转登录。', network: '网络或认证服务暂时不可用，表单内容已保留，请稍后重试。',
    invalid_email: '请输入有效的邮箱地址。', recent_login_required: '该安全操作需要重新登录后再进行。',
    last_provider: '至少需要保留一种登录方式。', action_expired: '操作链接无效或已过期，请重新发送邮件。',
    profile_conflict: '该邮箱已关联另一份身份档案，请使用原登录方式或联系管理员。',
    account_disabled: '该账号已停用，请联系管理员。', backend_not_ready: '游戏登录后端尚未就绪，请管理员检查 Firebase 项目、D1 绑定与数据库迁移。', unknown: '认证没有完成，请稍后重试。',
  },
  en: {
    eyebrow: 'FIREBASE × CLOUDFLARE SECURE ACCESS', title: 'Detective Identity Terminal',
    subtitle: 'Unified email and GitHub authentication with game profiles secured in Cloudflare D1.',
    login: 'SIGN IN', register: 'REGISTER', email: 'Email', password: 'Password', confirm: 'Confirm password',
    loginBtn: 'ENTER DETECTIVE HOME', registerBtn: 'REGISTER & SEND VERIFICATION', forgot: 'Forgot password?',
    github: 'CONTINUE WITH GITHUB', githubHint: 'Popup authorization without leaving the terminal', or: 'or use email',
    show: 'SHOW', hide: 'HIDE', back: 'BACK TO SIGN IN', resetTitle: 'Reset Password',
    resetDesc: 'Enter your email to receive Firebase’s official reset email.', resetBtn: 'SEND RESET EMAIL',
    resetSent: 'If the email is registered, a password reset message will arrive.',
    verifyTitle: 'Verify Your Email', verifyDesc: 'A verification message was sent to',
    verifyHint: 'Open the latest email, finish verification, then return here.', verifiedBtn: 'I HAVE VERIFIED',
    resend: 'RESEND VERIFICATION', changeEmail: 'USE ANOTHER EMAIL', resent: 'Verification email sent again.',
    cooldown: 's before resend', githubAccount: 'GitHub sign-in does not require a verification email',
    security: 'Firebase Authentication manages passwords. The game server never stores or sees your plaintext password.',
    mismatch: 'The two passwords do not match.', passwordRules: 'Use 8–64 characters with at least one letter and one number.',
    ruleLength: '8–64 characters', ruleLetter: 'At least one letter', ruleNumber: 'At least one number',
    working: 'Establishing secure connection…', configHelp: 'Firebase is not configured. Add the public Web config and the Worker project ID first.',
    invalid_credential: 'The email or password is incorrect.', email_unverified: 'Verify your email before entering the game.',
    email_in_use: 'This email is registered. Sign in or reset the password.', weak_password: 'Password must be 8–64 characters and contain a letter and a number.',
    rate_limited: 'Too many attempts. Wait for the cooldown and try again.', github_cancelled: 'GitHub authorization was cancelled. You can try again.',
    account_exists: 'This email already has a password account. Sign in by email, then link GitHub in Settings.',
    popup_blocked: 'The popup was blocked. Switching to secure redirect sign-in.', network: 'The network or auth service is temporarily unavailable. Your form has been preserved.',
    invalid_email: 'Enter a valid email address.', recent_login_required: 'Sign in again before this sensitive operation.',
    last_provider: 'At least one sign-in method must remain linked.', action_expired: 'This action link is invalid or expired. Send a new email.',
    profile_conflict: 'This email is linked to another identity profile. Use the original sign-in method or contact an administrator.',
    account_disabled: 'This account is disabled. Contact an administrator.', backend_not_ready: 'The game sign-in backend is not ready. Check the Firebase project, D1 binding, and database migrations.', unknown: 'Authentication did not complete. Please retry shortly.',
  },
};

function Feedback({ value, text }) {
  if (!value) return null;
  const success = value.kind === 'success';
  return <p className={`auth-feedback ${success ? 'success' : 'error'}`} role={success ? 'status' : 'alert'}>{success ? '◆' : '⚠'} {value.message || text[value.code] || text.unknown}</p>;
}

export default function AuthGate() {
  const auth = useAuth();
  const { lang, setLang } = useLang();
  const text = COPY[lang] || COPY.zh;
  const [mode, setMode] = useState(auth.verificationPending ? 'verify' : 'login');
  const [email, setEmail] = useState(auth.verificationEmail || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [cooldowns, setCooldowns] = useState(() => auth.cooldownRemaining());
  const passwordState = useMemo(() => validatePassword(password), [password]);
  const emailCooldown = mode === 'register' ? cooldowns.registration : cooldowns.emailLogin;
  const githubCooldown = cooldowns.github;

  useEffect(() => {
    if (auth.verificationPending) {
      setMode('verify');
      setEmail(current => auth.verificationEmail || current);
    }
  }, [auth.verificationEmail, auth.verificationPending]);

  useEffect(() => {
    const timer = window.setInterval(() => setCooldowns(auth.cooldownRemaining()), 1000);
    return () => window.clearInterval(timer);
  }, [auth.cooldownRemaining]);

  const run = async task => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try { await task(); }
    catch (error) {
      setFeedback({
        kind: 'error',
        code: error?.feedbackCode || AUTH_FEEDBACK_CODES.UNKNOWN,
      });
    }
    finally { setBusy(false); setCooldowns(auth.cooldownRemaining()); }
  };

  const submitEmail = event => {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) {
      setFeedback({ kind: 'error', message: text.mismatch });
      return;
    }
    if (mode === 'register' && !passwordState.valid) {
      setFeedback({ kind: 'error', code: AUTH_FEEDBACK_CODES.WEAK_PASSWORD });
      return;
    }
    void run(async () => {
      if (mode === 'register') {
        await auth.signUpWithEmail(email, password);
        setMode('verify');
      } else {
        await auth.signInWithEmail(email, password);
      }
    });
  };

  const submitReset = event => {
    event.preventDefault();
    void run(async () => {
      await auth.sendPasswordReset(email);
      setFeedback({ kind: 'success', message: text.resetSent });
    });
  };

  const switchMode = next => {
    setMode(next);
    setFeedback(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <main className="auth-gate td-page-shell">
      <div className="auth-grid" aria-hidden="true" /><div className="auth-scan" aria-hidden="true" />
      <button className="auth-lang td-ui-button td-button-ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} type="button">{lang === 'zh' ? 'EN' : '中'}</button>
      <section className="auth-panel td-ui-card" aria-busy={busy}>
        <div className="auth-orb" aria-hidden="true"><span>◈</span></div>
        <p className="auth-eyebrow">{text.eyebrow}</p><h1>{mode === 'reset' ? text.resetTitle : mode === 'verify' ? text.verifyTitle : text.title}</h1>
        {!auth.firebaseConfigured && <Feedback value={{ kind: 'error', message: text.configHelp }} text={text} />}
        {auth.firebaseConfigured && auth.authServiceError && auth.authServiceError !== AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED && <Feedback value={{ kind: 'error', code: auth.authServiceError }} text={text} />}
        <Feedback value={feedback} text={text} />
        {mode === 'verify' ? (
          <div className="auth-verify">
            <p>{text.verifyDesc}</p><strong>{auth.verificationEmail || email}</strong><p>{text.verifyHint}</p>
            <button className="auth-primary" disabled={busy} onClick={() => void run(() => auth.refreshEmailVerification())} type="button">✓ {text.verifiedBtn}</button>
            <button className="auth-secondary" disabled={busy || cooldowns.verification > 0} onClick={() => void run(async () => { await auth.sendVerificationAgain(); setFeedback({ kind: 'success', message: text.resent }); })} type="button">
              {cooldowns.verification > 0 ? `${cooldowns.verification}${text.cooldown}` : text.resend}
            </button>
            <button className="auth-github" disabled={busy || githubCooldown > 0 || !auth.firebaseConfigured} onClick={() => void run(() => auth.loginWithGitHub())} type="button"><b>GH</b><span><strong>{text.github}</strong><small>{githubCooldown > 0 ? `${githubCooldown}${text.cooldown}` : text.githubAccount}</small></span><i>›</i></button>
            <button className="auth-link" disabled={busy} onClick={() => void run(async () => { await auth.logout(); switchMode('register'); })} type="button">{text.changeEmail}</button>
          </div>
        ) : mode === 'reset' ? (
          <form onSubmit={submitReset}>
            <p className="auth-subtitle">{text.resetDesc}</p>
            <label>{text.email}<input autoComplete="email" required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
            <button className="auth-primary" disabled={busy || cooldowns.reset > 0} type="submit">{cooldowns.reset > 0 ? `${cooldowns.reset}${text.cooldown}` : text.resetBtn}</button>
            <button className="auth-link" onClick={() => switchMode('login')} type="button">‹ {text.back}</button>
          </form>
        ) : (
          <>
            <p className="auth-subtitle">{text.subtitle}</p>
            <div className="auth-tabs" role="tablist">
              <button aria-selected={mode === 'login'} onClick={() => switchMode('login')} role="tab" type="button">{text.login}</button>
              <button aria-selected={mode === 'register'} onClick={() => switchMode('register')} role="tab" type="button">{text.register}</button>
            </div>
            <form onSubmit={submitEmail}>
              <label>{text.email}<input autoComplete="email" required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
              <label>{text.password}<span className="auth-password"><input autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} maxLength={64} required type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} /><button onClick={() => setShowPassword(value => !value)} type="button">{showPassword ? text.hide : text.show}</button></span></label>
              {mode === 'register' && <label>{text.confirm}<input autoComplete="new-password" minLength={8} maxLength={64} required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>}
              {mode === 'register' && (
                <div className="auth-rules" aria-label={text.passwordRules}>
                  {[
                    [passwordState.length, text.ruleLength],
                    [passwordState.letter, text.ruleLetter],
                    [passwordState.number, text.ruleNumber],
                  ].map(([valid, label]) => (
                    <span className={password && valid ? 'valid' : ''} key={label}>{password && valid ? '✓' : '○'} {label}</span>
                  ))}
                </div>
              )}
              {mode === 'login' && <button className="auth-forgot" onClick={() => switchMode('reset')} type="button">{text.forgot}</button>}
              <button className="auth-primary" disabled={busy || emailCooldown > 0 || !auth.firebaseConfigured} type="submit">{emailCooldown > 0 ? `${emailCooldown}${text.cooldown}` : mode === 'register' ? text.registerBtn : text.loginBtn}</button>
            </form>
            <div className="auth-divider"><span>{text.or}</span></div>
            <button className="auth-github" disabled={busy || githubCooldown > 0 || !auth.firebaseConfigured} onClick={() => void run(() => auth.loginWithGitHub())} type="button"><b>GH</b><span><strong>{text.github}</strong><small>{githubCooldown > 0 ? `${githubCooldown}${text.cooldown}` : text.githubHint}</small></span><i>›</i></button>
          </>
        )}
        {busy && <p className="auth-working">◌ {text.working}</p>}
        <p className="auth-security">🔒 {text.security}</p>
      </section>
      <style>{`
        .auth-gate{min-height:100dvh;display:grid;place-items:center;position:relative;overflow:hidden;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));background:radial-gradient(circle at 50% 15%,#17335b 0,#050914 43%,#02040a 100%);color:#dffcff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.auth-grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(0,229,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.18) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 92%)}.auth-scan{position:absolute;inset:-40% 0 auto;height:42%;background:linear-gradient(transparent,rgba(0,229,255,.05),transparent);animation:authScan 7s linear infinite;pointer-events:none}.auth-lang{position:absolute;top:max(20px,env(safe-area-inset-top));right:max(22px,env(safe-area-inset-right));z-index:2;min-width:50px;min-height:44px;border:1px solid #00e5ff59;border-radius:999px;background:#000a16b3;color:#71f5ff;font:inherit;cursor:pointer}.auth-panel{width:min(100%,500px);max-height:calc(100dvh - max(32px,env(safe-area-inset-top)) - max(32px,env(safe-area-inset-bottom)));overflow:auto;position:relative;z-index:1;padding:32px 38px;border:1px solid #00e5ff4d;border-radius:24px;background:linear-gradient(145deg,#071226f2,#020712f7);box-shadow:0 28px 90px #0009,0 0 50px #00e5ff17,inset 0 1px #fff0d;backdrop-filter:blur(18px)}.auth-orb{width:54px;height:54px;display:grid;place-items:center;margin:0 auto 16px;border:1px solid #00e5ff80;border-radius:17px;color:#00e5ff;font-size:25px;box-shadow:0 0 30px #00e5ff38;transform:rotate(45deg)}.auth-orb span{transform:rotate(-45deg)}.auth-eyebrow{margin:0 0 7px;text-align:center;color:#00e5ffb0;font-size:9px;letter-spacing:.22em}.auth-panel h1{margin:0;text-align:center;font-size:clamp(24px,5vw,34px);letter-spacing:.06em;background:linear-gradient(90deg,#72f7ff,#d88cff);background-clip:text;color:transparent}.auth-subtitle{margin:12px auto 20px;max-width:400px;text-align:center;color:#9eb4c8;font-size:11px;line-height:1.7}.auth-tabs{display:grid;grid-template-columns:1fr 1fr;margin:17px 0;padding:4px;border:1px solid #ffffff12;border-radius:11px;background:#000611}.auth-tabs button{min-height:39px;border:0;border-radius:8px;background:transparent;color:#6f899e;font:700 11px/1 inherit;cursor:pointer}.auth-tabs button[aria-selected=true]{background:#00e5ff18;color:#77f7ff;box-shadow:inset 0 0 0 1px #00e5ff52}.auth-panel form{display:grid;gap:12px}.auth-panel label{display:grid;gap:6px;color:#8fb1c6;font-size:9px;letter-spacing:.08em}.auth-panel input{width:100%;min-height:45px;padding:0 13px;border:1px solid #4f78964d;border-radius:9px;outline:0;background:#000711;color:#e7fbff;font:12px/1 inherit}.auth-panel input:focus{border-color:#00e5ffaa;box-shadow:0 0 0 3px #00e5ff12}.auth-password{display:flex;position:relative}.auth-password input{padding-right:67px}.auth-password button{position:absolute;right:5px;top:5px;bottom:5px;border:0;border-left:1px solid #ffffff16;background:transparent;color:#63d9e3;font:8px/1 inherit;cursor:pointer}.auth-primary,.auth-secondary{width:100%;min-height:47px;border-radius:10px;font:800 10px/1.3 inherit;letter-spacing:.1em;cursor:pointer}.auth-primary{border:1px solid #5af0ff9e;background:linear-gradient(100deg,#00e5ff2e,#8b5cf638);color:#e9fdff;box-shadow:0 0 25px #00e5ff14}.auth-secondary{border:1px solid #4f78965c;background:#07101c;color:#7debf3}.auth-primary:disabled,.auth-secondary:disabled,.auth-github:disabled{cursor:not-allowed;opacity:.42}.auth-forgot,.auth-link{justify-self:end;border:0;background:transparent;color:#6edce5;font:9px/1.4 inherit;cursor:pointer}.auth-link{justify-self:center;margin-top:2px}.auth-rules{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:-3px 0 1px;color:#d69b63;font-size:8px;line-height:1.4}.auth-rules span{padding:5px 6px;border:1px solid #d69b6330;border-radius:6px}.auth-rules span.valid{border-color:#52d69a45;color:#52d69a}.auth-divider{display:flex;align-items:center;gap:10px;margin:18px 0;color:#557085;font-size:8px}.auth-divider:before,.auth-divider:after{content:"";height:1px;flex:1;background:#ffffff12}.auth-github{width:100%;min-height:60px;display:flex;align-items:center;gap:12px;padding:9px 13px;text-align:left;border:1px solid #ae86ff75;border-radius:11px;color:#edf8ff;background:linear-gradient(100deg,#0a1524,#26194380);cursor:pointer}.auth-github>b{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#f1f7ff;color:#07101b;font-size:11px}.auth-github>span{flex:1;display:grid;gap:4px}.auth-github strong{font-size:10px}.auth-github small{color:#849fb4;font-size:8px}.auth-github i{font-style:normal;font-size:21px;color:#c9a7ff}.auth-verify{display:grid;gap:12px;margin-top:18px;text-align:center}.auth-verify p{margin:0;color:#91aabe;font-size:10px;line-height:1.65}.auth-verify strong{color:#7af6ff;font-size:12px;overflow-wrap:anywhere}.auth-feedback{margin:13px 0 0;padding:10px 12px;border-radius:9px;text-align:center;font-size:9px;line-height:1.55}.auth-feedback.error{border:1px solid #ff4c7059;background:#46041252;color:#ff829b}.auth-feedback.success{border:1px solid #27d98b59;background:#042e205c;color:#63eab0}.auth-working{margin:12px 0 0;text-align:center;color:#7dcdd8;font-size:9px}.auth-security{margin:20px 0 0;border-top:1px solid #ffffff12;padding-top:14px;text-align:center;color:#627a8e;font-size:8px;line-height:1.6}@keyframes authScan{to{transform:translateY(340%)}}@media(max-width:520px){.auth-gate{padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}.auth-panel{padding:25px 18px;border-radius:18px;max-height:calc(100dvh - max(20px,env(safe-area-inset-top)) - max(20px,env(safe-area-inset-bottom)))}.auth-lang{top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right))}.auth-rules{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.auth-scan{animation:none}}
      `}</style>
    </main>
  );
}
