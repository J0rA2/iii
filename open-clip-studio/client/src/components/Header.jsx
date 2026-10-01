import React from 'react';
import { Film, Sliders, ChevronRight, Plus } from 'lucide-react';

export default function Header({ onOpenSettings, status, view = 'ingestion', onNavigate, onNewVideo }) {
  return (
    <header className="app-header" style={{
      margin: '14px 24px 8px 24px',
      padding: '10px 20px',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(11, 14, 23, 0.75)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      border: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 30,
      boxShadow: 'var(--glass-specular)'
    }}>
      {/* Brand & Workspace Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          onClick={() => onNavigate && onNavigate('ingestion')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: onNavigate ? 'pointer' : 'default',
            userSelect: 'none'
          }}
        >
          {/* Handcrafted Obsidian Icon Tile */}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Film size={16} color="#f8fafc" strokeWidth={1.75} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.05rem',
              fontWeight: 600,
              letterSpacing: '-0.3px',
              color: '#ffffff'
            }}>
              OpenClip
            </span>
            <span style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.05rem',
              fontWeight: 400,
              color: 'var(--text-muted)'
            }}>
              Studio
            </span>
            <span className="badge-minimal" style={{ fontSize: '0.68rem', padding: '1px 7px', marginLeft: '2px' }}>
              Studio Edition
            </span>
          </div>
        </div>

        {/* Minimalist Lowkey Breadcrumbs */}
        {view !== 'ingestion' && (
          <div className="app-breadcrumb" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingLeft: '14px',
            borderLeft: '1px solid var(--border-subtle)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}>
            <button
              onClick={() => onNavigate ? onNavigate('ingestion') : onNewVideo && onNewVideo()}
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
                padding: 0,
                fontSize: 'inherit',
                fontWeight: 500
              }}
              onMouseEnter={(e) => e.target.style.color = '#ffffff'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
            >
              Workspace
            </button>
            <ChevronRight size={12} color="var(--text-dim)" />
            {view === 'clips' ? (
              <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Viral Clips</span>
            ) : (
              <>
                <button
                  onClick={() => onNavigate && onNavigate('clips')}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    padding: 0,
                    fontSize: 'inherit',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => e.target.style.color = '#ffffff'}
                  onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                >
                  Viral Clips
                </button>
                <ChevronRight size={12} color="var(--text-dim)" />
                <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Clip Studio</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Lowkey Status Indicator */}
        <div className="app-status" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '5px 11px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.74rem',
          color: 'var(--text-muted)'
        }}>
          <span
            className="pulse-dot"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: (status?.isStaticDemo || status?.status === 'starting') ? '#f59e0b' : '#10b981',
              boxShadow: (status?.isStaticDemo || status?.status === 'starting') ? '0 0 6px rgba(245, 158, 11, 0.6)' : '0 0 6px rgba(16, 185, 129, 0.6)',
              display: 'inline-block'
            }}
          />
          <span style={{ fontWeight: 500, color: status?.isStaticDemo ? '#fcd34d' : 'var(--text-secondary)' }}>
            {status?.isStaticDemo ? 'Web Demo (Static)' : status?.status === 'starting' ? 'Server starting...' : (status?.ffmpegReady ? 'Server ready' : 'Connecting...')}
          </span>
        </div>

        {/* Quick New Video Button */}
        {view !== 'ingestion' && onNewVideo && (
          <button
            onClick={onNewVideo}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '5px' }}
            title="Import a new video"
            aria-label="New video"
          >
            <Plus size={13} />
            <span className="hide-xs">New Video</span>
          </button>
        )}

        {/* AI Settings Trigger */}
        <button
          onClick={onOpenSettings}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '5px' }}
          title="Configure API Keys or Settings"
          aria-label="Settings"
        >
          <Sliders size={13} />
          <span className="hide-xs">Settings</span>
        </button>
      </div>
    </header>
  );
}
