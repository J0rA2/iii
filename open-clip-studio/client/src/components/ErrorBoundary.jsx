import React from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          maxWidth: '650px',
          margin: '60px auto',
          padding: '32px 28px',
          background: 'rgba(18, 20, 32, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 'var(--radius-lg, 16px)',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            <AlertTriangle size={28} color="#ef4444" />
          </div>

          <h3 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.4rem',
            fontWeight: 700,
            marginBottom: '8px',
            color: '#ffffff'
          }}>
            Something went wrong in Studio
          </h3>

          <p style={{
            fontSize: '0.86rem',
            color: 'var(--text-muted, #94a3b8)',
            marginBottom: '20px',
            lineHeight: 1.5
          }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the clip editor.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            {this.props.onBack && (
              <button
                onClick={() => {
                  this.handleReset();
                  this.props.onBack();
                }}
                className="btn-secondary"
                style={{ padding: '8px 18px', fontSize: '0.84rem', gap: '6px' }}
              >
                <ArrowLeft size={14} />
                <span>Back to Clips</span>
              </button>
            )}
            <button
              onClick={this.handleReset}
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: '0.84rem', gap: '6px' }}
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
