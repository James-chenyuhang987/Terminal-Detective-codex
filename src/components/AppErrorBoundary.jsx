import React from 'react';
import { attemptChunkRecovery, isChunkLoadError, reloadLatestVersion } from '@/lib/chunkRecovery';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Terminal Detective UI failed:', error, info);
    attemptChunkRecovery(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkFailure = isChunkLoadError(this.state.error);
    let zh = true;
    try { zh = localStorage.getItem('td_lang_v1') !== 'en'; } catch { /* default Chinese */ }
    return (
      <main className="td-error-boundary" role="alert">
        <div>
          <span>◈ MODULE RECOVERY</span>
          <h1>{chunkFailure
            ? (zh ? '检测到页面版本更新' : 'PAGE UPDATE DETECTED')
            : (zh ? '界面模块加载失败' : 'INTERFACE MODULE FAILED')}</h1>
          <p>{chunkFailure
            ? (zh ? '当前页面仍在使用旧版资源。加载最新版本即可恢复，游戏云端档案不会丢失。' : 'This page is still using outdated assets. Load the latest version to recover; your cloud profile is safe.')
            : (this.state.error?.message || 'Unexpected interface error.')}</p>
          {chunkFailure ? (
            <button className="td-ui-button td-button-primary" type="button" onClick={() => reloadLatestVersion()}>{zh ? '加载最新版本' : 'LOAD LATEST VERSION'}</button>
          ) : (
            <>
              <button className="td-ui-button td-button-secondary" type="button" onClick={() => this.setState({ error: null })}>{zh ? '重试界面' : 'RETRY MODULE'}</button>
              <button className="td-ui-button td-button-ghost" type="button" onClick={() => reloadLatestVersion()}>{zh ? '重新加载页面' : 'RELOAD PAGE'}</button>
            </>
          )}
        </div>
      </main>
    );
  }
}
