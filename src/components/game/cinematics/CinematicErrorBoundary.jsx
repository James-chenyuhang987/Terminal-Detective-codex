import React from 'react';
import ActionCinematicFallback from './ActionCinematicFallback';

export default class CinematicErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, eventId: props.event?.eventId };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.event?.eventId !== state.eventId) {
      return { failed: false, eventId: props.event?.eventId };
    }
    return null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn('3D cinematic fell back to 2D:', error);
  }

  render() {
    if (this.state.failed) {
      return <ActionCinematicFallback event={this.props.event} onComplete={this.props.onComplete} />;
    }
    return this.props.children;
  }
}
