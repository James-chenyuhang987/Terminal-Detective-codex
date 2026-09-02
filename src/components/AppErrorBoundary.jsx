import React from 'react';
import { attemptChunkRecovery, isChunkLoadError, reloadLatestVersion } from '@/lib/chunkRecovery';
import { errorReference } from '@/lib/publicError';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error, reference: errorReference(error) };
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
            : (zh ? '界面遇到意外故障。你可以安全重试模块；若问题持续，请记录下方编号。' : 'The interface encountered an unexpected fault. Retry safely; if it persists, note the reference below.')}</p>
          {!chunkFailure && <small>{zh ? '故障编号' : 'REFERENCE'}: {this.state.reference}</small>}
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
