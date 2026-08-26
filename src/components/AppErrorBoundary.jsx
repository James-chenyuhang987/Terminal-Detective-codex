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
    return (
      <main className="td-error-boundary" role="alert">
        <div>
          <span>◈ MODULE RECOVERY</span>
          <h1>{chunkFailure ? '检测到页面版本更新' : '界面模块加载失败'}</h1>
          <p>{chunkFailure
            ? '当前页面仍在使用旧版资源。加载最新版本即可恢复，游戏云端档案不会丢失。'
            : (this.state.error?.message || 'Unexpected interface error.')}</p>
          {chunkFailure ? (
            <button className="td-ui-button td-button-primary" type="button" onClick={() => reloadLatestVersion()}>加载最新版本</button>
          ) : (
            <>
              <button className="td-ui-button td-button-secondary" type="button" onClick={() => this.setState({ error: null })}>重试界面</button>
              <button className="td-ui-button td-button-ghost" type="button" onClick={() => reloadLatestVersion()}>重新加载页面</button>
            </>
          )}
        </div>
      </main>
    );
  }
}
