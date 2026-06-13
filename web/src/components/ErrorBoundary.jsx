import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Wafer] Render crash:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ margin: '1.5rem', padding: '1.5rem' }}>
        <h2>Something went wrong</h2>
        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
          {this.state.error?.message || String(this.state.error)}
        </p>
        <button className="btn-connect" style={{ marginTop: '1rem' }} onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
