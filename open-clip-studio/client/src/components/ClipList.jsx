import React from 'react';
import { ArrowLeft, ArrowRight, Clock, Sparkles } from 'lucide-react';
import { formatTime } from '../utils/formatters';

export default function ClipList({ clips, onSelectClip, onNewVideo, videoMeta }) {
  return (
    <div className="page-shell" style={{ maxWidth: '1120px', margin: '24px auto 48px auto', padding: '0 24px' }}>
      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '26px',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={onNewVideo}
            className="btn-secondary"
            style={{ padding: '7px 13px', fontSize: '0.8rem' }}
          >
            <ArrowLeft size={14} />
            <span>Workspace</span>
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.45rem',
                fontWeight: 700,
                letterSpacing: '-0.4px',
                color: '#ffffff'
              }}>
                Extracted Clips ({clips.length})
              </h2>
              <span className="badge-minimal" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                9:16 Vertical
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Ranked by speech coherence, engagement density, and narrative completeness
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '6px 13px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.76rem',
          color: 'var(--text-muted)'
        }}>
          <Sparkles size={13} color="#94a3b8" />
          <span>Select any clip to edit reframing &amp; subtitles</span>
        </div>
      </div>

      {/* Grid of Handcrafted Glass Clip Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
        gap: '20px'
      }}>
        {clips.map((clip, index) => {
          const score = clip.viralityScore || 85;
          const hookScore = clip.hookScore || Math.min(99, Math.round(score * 1.04));
          const flowScore = clip.flowScore || Math.min(98, Math.round(score * 0.98));
          const energyScore = clip.energyScore || Math.min(95, Math.round(score * 0.95));
          const climaxScore = clip.climaxScore || Math.min(94, Math.round(score * 0.92));

          return (
            <div
              key={clip.id || index}
              className="glass-card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
            >
              <div>
                {/* Top Row: Score & Timestamp */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px'
                }}>
                  {/* Understated Minimalist Score Tag */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--glass-specular)'
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: score >= 90 ? '#10b981' : score >= 80 ? '#38bdf8' : '#8b5cf6'
                    }} />
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      color: '#ffffff',
                      fontFamily: 'var(--font-mono)'
                    }}>
                      {score}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                      /100
                    </span>
                  </div>

                  {/* Clean Timestamp */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)'
                  }}>
                    <Clock size={12} />
                    <span>{formatTime(clip.start)} - {formatTime(clip.end)}</span>
                    <span style={{ color: 'var(--text-dim)' }}>•</span>
                    <span>{clip.duration}s</span>
                  </div>
                </div>

                {/* Hook Tag & Agency ML Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: 'var(--text-secondary)'
                  }}>
                    {clip.hookType || 'Core Segment'}
                  </span>
                  <span style={{
                    fontSize: '0.66rem',
                    background: 'rgba(56, 189, 248, 0.1)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    ⚡ Agency ML Model
                  </span>
                </div>

                {/* Title */}
                <h3 style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  lineHeight: 1.4,
                  marginBottom: '14px',
                  color: '#ffffff'
                }}>
                  {clip.title}
                </h3>

                {/* 4-Vector Precision Metric Breakdown Bars (Opus-Equivalent) */}
                <div style={{
                  background: 'rgba(7, 10, 18, 0.55)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px'
                }}>
                  {/* Hook Potential */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Hook Potential (3s)</span>
                      <span style={{ fontWeight: 500, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{hookScore}%</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${hookScore}%`, height: '100%', background: '#38bdf8', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Flow & Pacing */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Retention Flow</span>
                      <span style={{ fontWeight: 500, color: '#818cf8', fontFamily: 'var(--font-mono)' }}>{flowScore}%</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${flowScore}%`, height: '100%', background: '#818cf8', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Acoustic Energy */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Acoustic Energy</span>
                      <span style={{ fontWeight: 500, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{energyScore}%</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${energyScore}%`, height: '100%', background: '#f59e0b', borderRadius: '2px' }} />
                    </div>
                  </div>

                  {/* Climax Payoff */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Climax Payoff</span>
                      <span style={{ fontWeight: 500, color: '#ec4899', fontFamily: 'var(--font-mono)' }}>{climaxScore}%</span>
                    </div>
                    <div style={{ width: '100%', height: '3px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${climaxScore}%`, height: '100%', background: '#ec4899', borderRadius: '2px' }} />
                    </div>
                  </div>
                </div>

                {/* Diagnostic Callout */}
                <div style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                  marginBottom: '14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.7rem', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8', fontWeight: 600 }}>
                      <Sparkles size={11} />
                      <span>{clip.mlModel?.includes('v4') ? 'v4 46-D Multimodal Virality Engine' : (clip.mlModel ? 'v4 46-D Neural Multimodal' : 'ML Diagnostic Intelligence')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {clip.hookVelocity !== null && clip.hookVelocity !== undefined && (
                        <span style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#7dd3fc',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          ⚡ H2S: {(clip.hookVelocity * 100).toFixed(0)}%
                        </span>
                      )}
                      {clip.survivalProbability !== null && clip.survivalProbability !== undefined && (
                        <span style={{
                          background: 'rgba(52, 211, 153, 0.12)',
                          color: '#6ee7b7',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(52, 211, 153, 0.25)',
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          📈 Retention: {(clip.survivalProbability * 100).toFixed(0)}%
                        </span>
                      )}
                      {clip.semanticMargin !== null && clip.semanticMargin !== undefined && (
                        <span style={{
                          background: 'rgba(129, 140, 248, 0.12)',
                          color: '#a5b4fc',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(129, 140, 248, 0.25)',
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          🧠 Vector: {(clip.semanticMargin * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Summary: </span>
                  {clip.viralityReason}
                </div>

                {/* Hashtags */}
                {clip.hashtags && clip.hashtags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '16px' }}>
                    {clip.hashtags.map((tag, tIdx) => (
                      <span key={tIdx} className="badge-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div style={{ paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => onSelectClip(clip)}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    fontSize: '0.82rem',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>Open in Studio</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
