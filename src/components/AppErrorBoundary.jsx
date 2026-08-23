import React from 'react';

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
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="td-error-boundary" role="alert">
        <div>
          <span>◈ MODULE RECOVERY</span>
          <h1>界面模块加载失败</h1>
          <p>{this.state.error?.message || 'Unexpected interface error.'}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>重试模块</button>
          <button type="button" onClick={() => window.location.reload()}>重新加载页面</button>
        </div>
      </main>
    );
  }
}
