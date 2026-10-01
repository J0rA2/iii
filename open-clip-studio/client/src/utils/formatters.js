export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function formatTimeDetailed(seconds) {
  if (isNaN(seconds) || seconds === null) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
}

export function getViralityBadge(score) {
  if (score >= 90) {
    return {
      label: 'Mega Viral',
      badgeClass: 'badge-viral',
      icon: '🔥',
      color: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.4)'
    };
  } else if (score >= 80) {
    return {
      label: 'High Potential',
      badgeClass: 'badge-trending',
      icon: '🚀',
      color: '#06b6d4',
      glow: 'rgba(6, 182, 212, 0.4)'
    };
  } else {
    return {
      label: 'Solid Hook',
      badgeClass: 'badge-good',
      icon: '✨',
      color: '#10b981',
      glow: 'rgba(16, 185, 129, 0.4)'
    };
  }
}
