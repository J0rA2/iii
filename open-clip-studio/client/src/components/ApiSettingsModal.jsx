import React, { useState } from 'react';
import { X, Key, ShieldCheck, Zap, Sparkles, Server } from 'lucide-react';

export default function ApiSettingsModal({ isOpen, onClose, onSaveKeys, initialKeys }) {
  const [geminiKey, setGeminiKey] = useState(initialKeys?.geminiApiKey || '');
  const [groqKey, setGroqKey] = useState(initialKeys?.groqApiKey || '');
  const [githubToken, setGithubToken] = useState(initialKeys?.githubToken || '');
  const [backendUrl, setBackendUrl] = useState(initialKeys?.backendUrl || '');
  const [ytCookies, setYtCookies] = useState(initialKeys?.ytCookies || '');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveKeys({
      geminiApiKey: geminiKey.trim(),
      groqApiKey: groqKey.trim(),
      githubToken: githubToken.trim(),
      backendUrl: backendUrl.trim().replace(/\/$/, ''),
      ytCookies: ytCookies.trim()
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '500px',
        width: '100%',
        padding: '28px',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)'
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Key size={18} color="#818cf8" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700 }}>
            AI Engine Configuration
          </h3>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 'var(--radius-sm)',
          color: '#34d399',
          fontSize: '0.8rem',
          marginBottom: '20px'
        }}>
          <ShieldCheck size={16} />
          <span>100% Optional: Platform runs completely free without any keys!</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Google Gemini API Key (Free Tier)
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.88rem'
              }}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Enables Gemini 1.5 Flash for deep story arc & virality scoring. Free from Google AI Studio.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Groq Whisper API Key (Free Tier)
            </label>
            <input
              type="password"
              placeholder="gsk_..."
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.88rem'
              }}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Enables Whisper Large-v3 speech recognition at ~100x real-time speed. Free from console.groq.com.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#818cf8" />
              GitHub Student Plan / GitHub Token (Personal Access Token)
            </label>
            <input
              type="password"
              placeholder="ghp_... or github_pat_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.88rem'
              }}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Unlocks <strong>GitHub Models</strong> (Meta-Llama-3.3-70B &amp; GPT-4o-mini) free via your GitHub Student Developer Pack. Accurately pinpoints the most viral and engaging hooks from transcripts!
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Server size={14} color="#818cf8" />
              Backend Server URL (Required for GitHub Pages)
            </label>
            <input
              type="text"
              placeholder="e.g. http://localhost:5000 or https://your-backend.onrender.com"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.88rem'
              }}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Leave blank when running locally via <code>npm run dev</code>. When hosting on GitHub Pages, enter your running backend URL to enable video uploads &amp; YouTube downloads.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} color="#f59e0b" />
              YouTube Cookies (Optional - Unlocks Cloud YouTube Links)
            </label>
            <textarea
              rows={2}
              placeholder="Paste Netscape cookies.txt content here to bypass YouTube bot detection on cloud servers..."
              value={ytCookies}
              onChange={(e) => setYtCookies(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Export using Chrome/Firefox extension <em>"Get cookies.txt LOCALLY"</em> while logged into YouTube. Stored locally in your browser.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
