import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, RotateCcw, Download, Sparkles, Sliders, Type, Scissors,
  ArrowLeft, Palette, Check, RefreshCw, Smartphone, Monitor, Square,
  Zap, Volume2, Crosshair, Flame, Wand2, Eye, ShieldAlert, Sparkle,
  Users, Rows2, Maximize2, Layers, Trash2, Plus, Film, Clock
} from 'lucide-react';
import { drawKineticSubtitles } from '../utils/captionRenderer';
import { formatTimeDetailed, formatTime } from '../utils/formatters';

export default function StudioEditor({
  clip,
  videoUrl,
  filePath,
  backendUrl = '',
  onBack,
  onExport
}) {
  const videoRef = useRef(null);
  const bgVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTriggeredSfxRef = useRef(null);
  const sfxAudiosRef = useRef({});
  const audioCtxRef = useRef(null);
  const audioBuffersRef = useRef({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(null);
  const [activeTab, setActiveTab] = useState('framing'); // 'framing' | 'pacing' | 'effects' | 'styles' | 'words'

  // Studio Customization States
  const [style, setStyle] = useState('hormozi'); // 'hormozi' | 'mrbeast' | 'clean' | 'cyberpunk'
  const [highlightColor, setHighlightColor] = useState('#FFE600');
  const [fontSize, setFontSize] = useState(54);
  const [captionPosition, setCaptionPosition] = useState('bottom');
  const [showEmojis, setShowEmojis] = useState(true);
  // Remember the last chosen output format (defaults to 16:9 landscape)
  const [aspectRatio, setAspectRatioState] = useState(() => {
    try {
      const saved = localStorage.getItem('openclip_aspect_ratio');
      return ['9:16', '1:1', '16:9'].includes(saved) ? saved : '16:9';
    } catch (e) { return '16:9'; }
  });
  const setAspectRatio = (ratio) => {
    setAspectRatioState(ratio);
    try { localStorage.setItem('openclip_aspect_ratio', ratio); } catch (e) {}
  };
  const exportDims = aspectRatio === '16:9' ? '1920x1080' : aspectRatio === '1:1' ? '1080x1080' : '1080x1920';
  const [reframeMode, setReframeMode] = useState('smart_track'); // 'smart_track' | 'split_stacked' | 'crop_center' | 'blur_fill'

  // AI Tracking & Pacing States
  const [trackingData, setTrackingData] = useState({
    avgXPercent: 50.0,
    hasTwoSpeakers: false,
    speakerLeftPercent: 30.0,
    speakerRightPercent: 70.0,
    trajectory: []
  });
  const [speakerLeftPercent, setSpeakerLeftPercent] = useState(30.0);
  const [speakerRightPercent, setSpeakerRightPercent] = useState(70.0);
  const [singleSpeakerFocusMode, setSingleSpeakerFocusMode] = useState('auto_pan'); // 'auto_pan' | 'primary' | 'left' | 'right' | 'center' | 'custom'
  const [singleSpeakerFocusX, setSingleSpeakerFocusX] = useState(50.0);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);
  const [enableJumpCut, setEnableJumpCut] = useState(true);
  const [enableSfx, setEnableSfx] = useState(true);
  const [sfxVolume, setSfxVolume] = useState(0.40); // Default to 40% (0.40)
  const [jumpCutData, setJumpCutData] = useState(null);
  const [activeSfxBadge, setActiveSfxBadge] = useState(null);
  const [showHookBanner, setShowHookBanner] = useState(true);
  const [hookBannerText, setHookBannerText] = useState(clip.title ? clip.title.toUpperCase() : 'VIRAL MOMENT 🔥');

  // Manual SFX insertion state
  const [manualSfxType, setManualSfxType] = useState('vine_boom');
  const [manualSfxTime, setManualSfxTime] = useState(0);
  const [manualSfxLabel, setManualSfxLabel] = useState('');

  // Viral Teaser Hook states
  const [enableTeaserHook, setEnableTeaserHook] = useState(false);
  const [teaserHookData, setTeaserHookData] = useState(null);
  const [teaserBannerText, setTeaserBannerText] = useState('WAIT FOR IT... ⚡');
  const [isPreviewingHook, setIsPreviewingHook] = useState(false);

  // Visual FX & Clipping Assets States
  const [enableSpotlight, setEnableSpotlight] = useState(false); // Natural lighting by default (not dark!)
  const [spotlightIntensity, setSpotlightIntensity] = useState(0.4);
  const [enablePunchInZoom, setEnablePunchInZoom] = useState(true);
  const [isZoomedPunch, setIsZoomedPunch] = useState(false);
  const [enableBeatFlash, setEnableBeatFlash] = useState(true);
  const [isBeatFlashing, setIsBeatFlashing] = useState(false);
  const [enableReactionBadges, setEnableReactionBadges] = useState(true);
  const [activeReactionBadge, setActiveReactionBadge] = useState(null);

  // Editable words & trim boundaries
  const [words, setWords] = useState(clip.words || []);
  const [trimStart, setTrimStart] = useState(clip.start !== undefined ? clip.start : (clip.startTime !== undefined ? clip.startTime : 0));
  const [trimEnd, setTrimEnd] = useState(clip.end !== undefined ? clip.end : (clip.endTime !== undefined ? clip.endTime : (clip.duration || 30)));
  const [jumpCutPacing, setJumpCutPacing] = useState('balanced');

  const clipDuration = Math.max(0.5, parseFloat((trimEnd - trimStart).toFixed(2)));
  const backendBase = backendUrl ? backendUrl.replace(/\/$/, '') : (window.location.port === '5173' ? 'http://localhost:5000' : '');
  const isServerAvailable = Boolean(
    backendUrl ||
    window.location.port === '5173' ||
    window.location.hostname === 'localhost' ||
    !window.location.hostname.includes('github.io')
  );

  // High-performance clip snippet URL: directly plays the exact trimmed clip interval
  const previewVideoUrl = (filePath && isServerAvailable && !filePath.endsWith('.vtt'))
    ? `${backendBase}/api/clip-preview?filePath=${encodeURIComponent(filePath)}&startTime=${trimStart}&duration=${clipDuration}`
    : videoUrl;

  // Initialize Web Audio Engine and decode sound effect buffers (sourced from MyInstants)
  useEffect(() => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();
      }
    } catch (e) {
      console.warn('Web Audio not supported:', e);
    }

    const sfxList = ['vine_boom', 'whoosh', 'ding', 'record_scratch', 'bruh'];
    sfxList.forEach(name => {
      fetch(`./sfx/${name}.wav`)
        .then(r => r.arrayBuffer())
        .then(ab => {
          if (audioCtxRef.current) {
            return audioCtxRef.current.decodeAudioData(ab);
          }
        })
        .then(decoded => {
          if (decoded) audioBuffersRef.current[name] = decoded;
        })
        .catch(e => console.warn(`SFX decode error for ${name}:`, e));

      // HTML5 Audio fallback
      try {
        const a = new Audio(`./sfx/${name}.wav`);
        a.preload = 'auto';
        sfxAudiosRef.current[name] = a;
      } catch (e) {}
    });
  }, []);

  // Web Audio playback function
  const playSfx = (type) => {
    if (!enableSfx) return;

    // Always resume audio context if suspended by browser policy
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (audioCtxRef.current && audioBuffersRef.current[type]) {
      try {
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = audioBuffersRef.current[type];
        const gain = audioCtxRef.current.createGain();
        const baseVol = (type === 'vine_boom') ? 1.35 : (type === 'bruh' ? 1.25 : 1.0);
        gain.gain.value = baseVol * sfxVolume;
        source.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        source.start(0);
      } catch (e) {
        console.warn('Web audio playback issue:', e);
      }
    } else {
      const audio = sfxAudiosRef.current[type];
      if (audio) {
        audio.currentTime = 0;
        audio.volume = Math.min(1.0, ((type === 'vine_boom') ? 1.0 : 0.85) * sfxVolume);
        audio.play().catch(() => {});
      }
    }

    // Trigger Visual FX on Sound Effect Hits
    if (type === 'vine_boom') {
      if (enablePunchInZoom) {
        setIsZoomedPunch(true);
        setTimeout(() => setIsZoomedPunch(false), 1100);
      }
      if (enableBeatFlash) {
        setIsBeatFlashing(true);
        setTimeout(() => setIsBeatFlashing(false), 500);
      }
      if (enableReactionBadges) {
        setActiveReactionBadge('🔥 W MOMENT');
        setTimeout(() => setActiveReactionBadge(null), 1400);
      }
    } else if (type === 'record_scratch') {
      if (enablePunchInZoom) {
        setIsZoomedPunch(true);
        setTimeout(() => setIsZoomedPunch(false), 800);
      }
      if (enableReactionBadges) {
        setActiveReactionBadge('🚨 SUS MOMENT');
        setTimeout(() => setActiveReactionBadge(null), 1400);
      }
    } else if (type === 'ding') {
      if (enableReactionBadges) {
        setActiveReactionBadge('💡 BIG BRAIN');
        setTimeout(() => setActiveReactionBadge(null), 1200);
      }
    }
  };

  const triggerSfxBadge = (badgeText) => {
    setActiveSfxBadge(badgeText);
    setTimeout(() => setActiveSfxBadge(null), 1200);
  };

  // 1. Fetch AI Subject Tracking (only depends on clip trim window, not words)
  useEffect(() => {
    if (!filePath) return;
    let isMounted = true;
    setIsTrackingLoading(true);

    const backendBase = backendUrl || (typeof window !== 'undefined' && localStorage.getItem('openclip_backend_url')) || '';
    const trackingEndpoint = backendBase
      ? `${backendBase.replace(/\/$/, '')}/api/clip-tracking?filePath=${encodeURIComponent(filePath)}&startTime=${trimStart}&duration=${clipDuration}`
      : `/api/clip-tracking?filePath=${encodeURIComponent(filePath)}&startTime=${trimStart}&duration=${clipDuration}`;

    fetch(trackingEndpoint)
      .then(r => r.json())
      .then(data => {
        if (isMounted) {
          setTrackingData(data);
          if (data.primarySpeakerXPercent) {
            setSingleSpeakerFocusX(data.primarySpeakerXPercent);
          } else if (data.avgXPercent) {
            setSingleSpeakerFocusX(data.avgXPercent);
          }
          if (data.speakerLeftPercent) setSpeakerLeftPercent(data.speakerLeftPercent);
          if (data.speakerRightPercent) setSpeakerRightPercent(data.speakerRightPercent);
          setIsTrackingLoading(false);
        }
      })
      .catch(err => {
        console.warn('Tracking fetch error:', err);
        if (isMounted) setIsTrackingLoading(false);
      });

    return () => { isMounted = false; };
  }, [filePath, trimStart, clipDuration, backendUrl]);

  // 2. Calculate Jump-Cuts (depends on words edits and pacing)
  useEffect(() => {
    if (!filePath) return;
    let isMounted = true;

    const backendBase = backendUrl || (typeof window !== 'undefined' && localStorage.getItem('openclip_backend_url')) || '';
    const jumpCutEndpoint = backendBase
      ? `${backendBase.replace(/\/$/, '')}/api/jump-cuts`
      : '/api/jump-cuts';

    fetch(jumpCutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words,
        startTime: trimStart,
        duration: clipDuration,
        pacing: jumpCutPacing,
        silenceThreshold: jumpCutPacing === 'snappy' ? 0.65 : (jumpCutPacing === 'natural' ? 1.2 : 0.85),
        deletedIndices: words.map((w, idx) => w.deleted ? idx : null).filter(idx => idx !== null)
      })
    })
      .then(r => r.json())
      .then(data => {
        if (isMounted) {
          setJumpCutData(data);
          if (data.teaserHook) {
            setTeaserHookData(data.teaserHook);
            if (data.teaserHook.bannerText) setTeaserBannerText(data.teaserHook.bannerText);
          }
        }
      })
      .catch(err => console.warn('Jump-cuts calculation error:', err));

    return () => { isMounted = false; };
  }, [filePath, trimStart, clipDuration, words, backendUrl, jumpCutPacing]);

  // Exact mathematical conversion from video horizontal coordinate (0% - 100%)
  // to CSS object-position percentage, ensuring subject is in the dead-center of the 9:16 phone mockup
  const getCssObjectPosition = (xPercent) => {
    const x = Math.max(0, Math.min(100, xPercent)) / 100;
    // Container aspect: 9/16 = 0.5625. Video aspect (16/9): 1.77778
    // R = (16/9) / (9/16) = 256 / 81 = 3.1604938
    const R = 3.1604938;
    const p = ((x * R - 0.5) / (R - 1)) * 100;
    return Math.max(0, Math.min(100, p));
  };

  const getCssObjectPositionSplit = (xPercent) => {
    const x = Math.max(0, Math.min(100, xPercent)) / 100;
    // Split container aspect: 1080/960 = 1.125. Video aspect: 16/9 = 1.77778
    // R = (16/9) / 1.125 = 1.580247
    const R = 1.580247;
    const p = ((x * R - 0.5) / (R - 1)) * 100;
    return Math.max(0, Math.min(100, p));
  };

  // Interpolate tracking X position with Cinema Deadband & Smoothstep
  const getCurrentTrackingX = () => {
    if (singleSpeakerFocusMode !== 'auto_pan') {
      return singleSpeakerFocusX;
    }
    const traj = trackingData?.trajectory;
    if (!trackingData || !traj || traj.length === 0) {
      return singleSpeakerFocusX || trackingData?.primarySpeakerXPercent || trackingData?.avgXPercent || 50.0;
    }

    // Deadband check: if overall speaker motion variation is under 4%, lock to primary speaker
    const xs = traj.map(pt => pt.xPercent);
    if (Math.max(...xs) - Math.min(...xs) < 4.0) {
      return trackingData?.primarySpeakerXPercent || trackingData?.avgXPercent || 50.0;
    }

    const t = videoRef.current ? videoRef.current.currentTime : currentTime;
    if (t <= traj[0].t) return traj[0].xPercent;
    if (t >= traj[traj.length - 1].t) return traj[traj.length - 1].xPercent;

    for (let i = 0; i < traj.length - 1; i++) {
      const p0 = traj[i];
      const p1 = traj[i + 1];
      if (t >= p0.t && t <= p1.t) {
        const dt = Math.max(0.01, p1.t - p0.t);
        const u = Math.max(0, Math.min(1, (t - p0.t) / dt));
        const smoothU = u * u * (3 - 2 * u);
        return p0.xPercent + (p1.xPercent - p0.xPercent) * smoothU;
      }
    }
    return trackingData?.primarySpeakerXPercent || 50.0;
  };

  // Sync canvas size with video/container
  const updateCanvas = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const targetW = 1080;
    const targetH = 1920;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    const absoluteTime = trimStart + (video.currentTime || 0);

    drawKineticSubtitles(ctx, targetW, targetH, absoluteTime, words, {
      style,
      fontSize,
      highlightColor,
      primaryColor: '#FFFFFF',
      position: reframeMode === 'split_stacked' ? 'center' : captionPosition,
      showEmojis,
      hookBannerText,
      showHookBanner
    });

    if (!video.paused && !video.ended) {
      animationFrameRef.current = requestAnimationFrame(updateCanvas);
    }
  };

  // Sync background/secondary video element
  const syncBgVideo = () => {
    const video = videoRef.current;
    const bg = bgVideoRef.current;
    if (!video || !bg) return;
    if (Math.abs(bg.currentTime - video.currentTime) > 0.08) {
      bg.currentTime = video.currentTime;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (bgVideoRef.current && bgVideoRef.current.paused) {
        bgVideoRef.current.play().catch(() => {});
      }
      animationFrameRef.current = requestAnimationFrame(updateCanvas);
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (bgVideoRef.current && !bgVideoRef.current.paused) {
        bgVideoRef.current.pause();
      }
      cancelAnimationFrame(animationFrameRef.current);
      updateCanvas();
    };

    const handleTimeUpdate = () => {
      const vTime = video.currentTime;
      setCurrentTime(vTime);
      syncBgVideo();

      // 1. Smart Jump-Cut dead-air skipping
      if (enableJumpCut && jumpCutData?.segments && jumpCutData.segments.length > 1) {
        for (let i = 0; i < jumpCutData.segments.length - 1; i++) {
          const segEndRel = jumpCutData.segments[i].end - trimStart;
          const nextSegStartRel = jumpCutData.segments[i + 1].start - trimStart;
          if (vTime >= segEndRel && vTime < nextSegStartRel) {
            video.currentTime = nextSegStartRel;
            if (bgVideoRef.current) bgVideoRef.current.currentTime = nextSegStartRel;
            triggerSfxBadge('⚡ JUMP CUT');
            break;
          }
        }
      }

      // 2. Streamer SFX cue triggers (Vine Boom, Ding, Whoosh, Record Scratch)
      // Always play SFX events (both auto-generated and manually added)
      if (jumpCutData?.sfxEvents) {
        jumpCutData.sfxEvents.forEach(evt => {
          if (Math.abs(vTime - evt.time) < 0.15) {
            if (lastTriggeredSfxRef.current !== evt.time) {
              lastTriggeredSfxRef.current = evt.time;
              playSfx(evt.type);
              const badgeLabel = evt.type === 'vine_boom' ? '💥 VINE BOOM'
                : evt.type === 'whoosh' ? '💨 WHOOSH'
                : evt.type === 'ding' ? '🔔 DING'
                : evt.type === 'bruh' ? '🗿 BRUH'
                : '💿 RECORD SCRATCH';
              triggerSfxBadge(badgeLabel);
            }
          }
        });
      }

      if (vTime >= clipDuration) {
        video.pause();
        if (bgVideoRef.current) bgVideoRef.current.pause();
        video.currentTime = 0;
        if (bgVideoRef.current) bgVideoRef.current.currentTime = 0;
      }
      updateCanvas();
    };

    const handleWaiting = () => setVideoLoading(true);
    const handleCanPlay = () => {
      setVideoLoading(false);
      setVideoError(null);
      updateCanvas();
    };
    const handleError = (e) => {
      console.warn('Video preview error:', e);
      setVideoLoading(false);
      setVideoError('Video preview failed to load. Click to retry.');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trimStart, trimEnd, clipDuration, words, style, highlightColor, fontSize, captionPosition, showEmojis, enableJumpCut, enableSfx, jumpCutData, sfxVolume, enablePunchInZoom, enableBeatFlash, enableReactionBadges, reframeMode, hookBannerText, showHookBanner]);

  // Re-draw canvas immediately when styling, banner or words change
  useEffect(() => {
    updateCanvas();
  }, [style, highlightColor, fontSize, captionPosition, showEmojis, words, reframeMode, hookBannerText, showHookBanner]);

  const togglePlay = () => {
    const video = videoRef.current;
    const bg = bgVideoRef.current;
    if (!video) return;

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (video.paused) {
      if (video.currentTime >= clipDuration || video.currentTime < 0) {
        video.currentTime = 0;
        if (bg) bg.currentTime = 0;
      }
      video.play().then(() => {
        if (bg) bg.play().catch(() => {});
      }).catch(err => {
        console.warn('Playback error:', err);
      });
    } else {
      video.pause();
      if (bg) bg.pause();
    }
  };

  const handleSeek = (timeInClip) => {
    const video = videoRef.current;
    const bg = bgVideoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(clipDuration, timeInClip));
    video.currentTime = clamped;
    if (bg) bg.currentTime = clamped;
    setCurrentTime(clamped);
    updateCanvas();
  };

  const handleWordEdit = (index, newText) => {
    const updated = [...words];
    updated[index].word = newText;
    setWords(updated);
  };

  const handleWordEmojiChange = (index, newEmoji) => {
    const updated = [...words];
    updated[index].emoji = newEmoji || null;
    setWords(updated);
  };

  const handleToggleWordDelete = (index) => {
    const updated = [...words];
    updated[index] = { ...updated[index], deleted: !updated[index].deleted };
    setWords(updated);
  };

  const handleAddManualSfx = () => {
    const targetTime = parseFloat(manualSfxTime);
    if (isNaN(targetTime) || targetTime < 0) return;

    const sfxLabels = {
      vine_boom: '💥 Vine Boom',
      bruh: '🗿 Bruh',
      ding: '🔔 Ding',
      whoosh: '💨 Whoosh',
      record_scratch: '💿 Scratch'
    };

    const newEvent = {
      type: manualSfxType,
      time: parseFloat(targetTime.toFixed(2)),
      label: manualSfxLabel.trim() || sfxLabels[manualSfxType] || manualSfxType,
      trigger: manualSfxLabel.trim() ? `Manual: "${manualSfxLabel.trim()}"` : `Manual: ${sfxLabels[manualSfxType]}`
    };

    setJumpCutData(prev => {
      const existing = prev?.sfxEvents || [];
      const updated = [...existing, newEvent].sort((a, b) => a.time - b.time);
      return {
        ...(prev || {}),
        sfxEvents: updated
      };
    });

    playSfx(manualSfxType);
    triggerSfxBadge(newEvent.label);
  };

  const handleDeleteSfx = (indexToDelete) => {
    setJumpCutData(prev => {
      if (!prev?.sfxEvents) return prev;
      const updated = prev.sfxEvents.filter((_, idx) => idx !== indexToDelete);
      return {
        ...prev,
        sfxEvents: updated
      };
    });
  };

  const handleClearAllSfx = () => {
    setJumpCutData(prev => ({
      ...(prev || {}),
      sfxEvents: []
    }));
  };

  const handlePreviewTeaserHook = () => {
    if (!teaserHookData || !videoRef.current) return;
    setIsPreviewingHook(true);
    triggerSfxBadge('⚡ HOOK TEASER');

    const hookStartRel = (filePath && !filePath.endsWith('.vtt'))
      ? Math.max(0, teaserHookData.start - trimStart)
      : teaserHookData.start;

    videoRef.current.currentTime = Math.max(0, hookStartRel);
    videoRef.current.play().catch(() => {});

    setTimeout(() => {
      playSfx('whoosh');
      triggerSfxBadge('💨 TRANSITION WHOOSH');
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      setIsPreviewingHook(false);
    }, Math.max(1000, teaserHookData.duration * 1000));
  };

  const handleSelectTeaserCandidate = (cand) => {
    setTeaserHookData(prev => ({
      ...(prev || {}),
      start: cand.start,
      end: cand.end,
      duration: cand.duration,
      text: cand.text
    }));
  };

  const handleExportClick = () => {
    const activeWords = words.filter(w => !w.deleted);
    const deletedIdxs = words.map((w, idx) => w.deleted ? idx : null).filter(idx => idx !== null);

    onExport({
      filePath,
      clipId: clip.id,
      startTime: trimStart,
      duration: parseFloat((trimEnd - trimStart).toFixed(2)),
      aspectRatio,
      reframeMode,
      targetXPercent: singleSpeakerFocusX || trackingData?.avgXPercent || 50.0,
      speakerLeftPercent: speakerLeftPercent || trackingData?.speakerLeftPercent || 28.0,
      speakerRightPercent: speakerRightPercent || trackingData?.speakerRightPercent || 68.0,
      trajectory: (reframeMode === 'smart_track') ? (trackingData?.trajectory || []) : [],
      segments: (enableJumpCut && jumpCutData?.segments) ? jumpCutData.segments : [],
      deletedIndices: deletedIdxs,
      // Always export all SFX events (auto + manual) — enableSfx only controls preview audio
      sfxEvents: jumpCutData?.sfxEvents || [],
      sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.40,
      enablePunchInZoom,
      enableSpotlight,
      style,
      fontSize,
      words: activeWords,
      hookBannerText: showHookBanner ? hookBannerText : null,
      showHookBanner,
      teaserHook: enableTeaserHook && teaserHookData ? {
        active: true,
        start: teaserHookData.start,
        end: teaserHookData.end,
        text: teaserHookData.text,
        bannerText: teaserBannerText
      } : null
    });
  };

  const colorPalette = [
    { name: 'Neon Yellow', hex: '#FFE600' },
    { name: 'Electric Green', hex: '#00FF66' },
    { name: 'Cyan Glow', hex: '#06B6D4' },
    { name: 'Hot Pink', hex: '#EC4899' },
    { name: 'Pure White', hex: '#FFFFFF' }
  ];

  return (
    <div className="page-shell" style={{ maxWidth: '1280px', margin: '8px auto 36px auto', padding: '0 24px' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={onBack}
            className="btn-secondary"
            style={{ padding: '7px 13px', fontSize: '0.8rem' }}
          >
            <ArrowLeft size={14} />
            <span>Clips</span>
          </button>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#ffffff',
              letterSpacing: '-0.3px',
              marginBottom: '2px'
            }}>
              {clip.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span className="badge-minimal" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                Score: {clip.viralityScore}/100
              </span>
              <span>•</span>
              <span>Trim: {formatTime(trimStart)} - {formatTime(trimEnd)} ({(trimEnd - trimStart).toFixed(1)}s)</span>
              {trackingData.hasTwoSpeakers && (
                <span className="badge-tag">
                  Dual Speaker Detected
                </span>
              )}
              <span style={{
                fontSize: '0.68rem',
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                ⚡ Agency ML (Hook:{clip.hookScore || 85}% • Flow:{clip.flowScore || 88}% • Energy:{clip.energyScore || 82}% • Climax:{clip.climaxScore || 86}%)
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleExportClick}
          className="btn-primary studio-export-btn"
          style={{ padding: '9px 18px', fontSize: '0.82rem' }}
        >
          <Download size={14} />
          <span>Export {exportDims} ({aspectRatio})</span>
        </button>
      </div>

      {/* Main Studio Workspace */}
      <div className="studio-grid" style={{
        display: 'grid',
        gridTemplateColumns: '420px 1fr',
        gap: '28px',
        alignItems: 'start'
      }}>
        {/* Left Column: Phone Mockup Video Player */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Aspect Ratio Segmented Selector */}
          <div style={{
            display: 'flex',
            gap: '3px',
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '3px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--glass-specular)',
            marginBottom: '16px'
          }}>
            <button
              onClick={() => setAspectRatio('9:16')}
              style={{
                background: aspectRatio === '9:16' ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                color: aspectRatio === '9:16' ? '#ffffff' : 'var(--text-muted)',
                border: aspectRatio === '9:16' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '5px 13px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.76rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              <Smartphone size={12} />
              <span>9:16 Shorts</span>
            </button>
            <button
              onClick={() => setAspectRatio('1:1')}
              style={{
                background: aspectRatio === '1:1' ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                color: aspectRatio === '1:1' ? '#ffffff' : 'var(--text-muted)',
                border: aspectRatio === '1:1' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '5px 13px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.76rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              <Square size={12} />
              <span>1:1 Square</span>
            </button>
            <button
              onClick={() => setAspectRatio('16:9')}
              style={{
                background: aspectRatio === '16:9' ? 'rgba(255, 255, 255, 0.09)' : 'transparent',
                color: aspectRatio === '16:9' ? '#ffffff' : 'var(--text-muted)',
                border: aspectRatio === '16:9' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '5px 13px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.76rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              <Monitor size={12} />
              <span>16:9 Landscape</span>
            </button>
          </div>

          {/* Smartphone Mockup Frame */}
          <div
            className={`studio-preview-frame ${aspectRatio === '9:16' ? 'smartphone-mockup' : ''}`}
            data-aspect={aspectRatio}
            style={{
              width: aspectRatio === '9:16' ? '330px' : aspectRatio === '1:1' ? '380px' : '420px',
              height: aspectRatio === '9:16' ? '586px' : aspectRatio === '1:1' ? '380px' : '236px',
              borderRadius: aspectRatio === '9:16' ? '42px' : '14px',
              padding: aspectRatio === '9:16' ? '10px' : '0',
              background: aspectRatio === '9:16' ? '#030509' : 'rgba(14, 18, 28, 0.8)',
              border: aspectRatio === '9:16' ? '7px solid #141722' : '1px solid var(--border-subtle)',
              boxShadow: isBeatFlashing
                ? '0 0 50px rgba(239, 68, 68, 0.9), 0 25px 50px -12px rgba(0, 0, 0, 0.8)'
                : aspectRatio === '9:16'
                  ? 'var(--shadow-phone)'
                  : '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: 'box-shadow 0.15s ease'
            }}
          >
            {/* Dynamic Island at Top */}
            {aspectRatio === '9:16' && <div className="smartphone-island" />}
            {/* Home Indicator Bar at Bottom */}
            {aspectRatio === '9:16' && <div className="smartphone-homebar" />}

            {/* Screen Area */}
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: aspectRatio === '9:16' ? '30px' : '14px',
              overflow: 'hidden',
              position: 'relative',
              backgroundColor: '#000000',
              boxShadow: isBeatFlashing
                ? 'inset 0 0 55px rgba(239, 68, 68, 0.95), inset 0 0 100px rgba(245, 158, 11, 0.5)'
                : 'none',
              transition: 'box-shadow 0.15s ease-out'
            }}>
              {/* LAYOUT OPTION A: Opus Clip Split-Screen Dual Speaker (Stacked Top & Bottom) */}
              {aspectRatio === '9:16' && reframeMode === 'split_stacked' ? (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Top Half: Speaker 1 */}
                  <div style={{ position: 'relative', width: '100%', height: '50%', overflow: 'hidden', backgroundColor: '#050811' }}>
                    <video
                      ref={videoRef}
                      src={previewVideoUrl}
                      playsInline
                      preload="auto"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: `${getCssObjectPositionSplit(speakerLeftPercent)}% center`,
                        cursor: 'pointer'
                      }}
                      onClick={togglePlay}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      color: '#a5b4fc',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Users size={11} />
                      <span>SPEAKER 1</span>
                    </div>
                  </div>

                  {/* Center Split Divider Bar */}
                  <div style={{
                    height: '4px',
                    background: 'linear-gradient(90deg, #6366f1 0%, #06b6d4 100%)',
                    boxShadow: '0 0 12px rgba(99, 102, 241, 0.9)',
                    zIndex: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    <span style={{
                      position: 'absolute',
                      background: '#090d16',
                      color: '#818cf8',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      letterSpacing: '0.04em'
                    }}>
                      SPLIT-SCREEN
                    </span>
                  </div>

                  {/* Bottom Half: Speaker 2 */}
                  <div style={{ position: 'relative', width: '100%', height: '50%', overflow: 'hidden', backgroundColor: '#050811' }}>
                    <video
                      ref={bgVideoRef}
                      src={previewVideoUrl}
                      playsInline
                      preload="auto"
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: `${getCssObjectPositionSplit(speakerRightPercent)}% center`,
                        cursor: 'pointer'
                      }}
                      onClick={togglePlay}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                      color: '#06b6d4',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Users size={11} />
                      <span>SPEAKER 2</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Blurred Background Layer for 9:16 blur_fill mode */}
                  {aspectRatio === '9:16' && reframeMode === 'blur_fill' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      overflow: 'hidden',
                      filter: 'blur(22px) brightness(0.65)',
                      transform: 'scale(1.25)',
                      pointerEvents: 'none'
                    }}>
                      <video
                        ref={bgVideoRef}
                        src={previewVideoUrl}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted
                        playsInline
                        preload="auto"
                      />
                    </div>
                  )}

                  {/* Main Full-Bleed Video Element */}
                  <video
                    ref={videoRef}
                    src={previewVideoUrl}
                    playsInline
                    preload="auto"
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      objectFit: (aspectRatio === '9:16' && (reframeMode === 'smart_track' || reframeMode === 'crop_center')) ? 'cover' : 'contain',
                      objectPosition: (aspectRatio === '9:16' && reframeMode === 'smart_track')
                        ? `${getCssObjectPosition(getCurrentTrackingX())}% center`
                        : (reframeMode === 'crop_center' ? `${getCssObjectPosition(50)}% center` : 'center center'),
                      transform: isZoomedPunch ? 'scale(1.16) translate(1px, -2px)' : 'scale(1.0)',
                      transition: isZoomedPunch
                        ? 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275), object-position 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)'
                        : 'transform 0.4s ease-out, object-position 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      zIndex: 2,
                      backgroundColor: '#000000',
                      cursor: 'pointer'
                    }}
                    onClick={togglePlay}
                  />

                  {/* Live Active Speaker Focus Badge for 9:16 Single Speaker */}
                  {aspectRatio === '9:16' && reframeMode === 'smart_track' && (
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      pointerEvents: 'none',
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Crosshair size={11} />
                      <span>{singleSpeakerFocusMode === 'auto_pan' ? 'AI AUTO-PAN' : `FOCUS: ${Math.round(singleSpeakerFocusX)}%`}</span>
                    </div>
                  )}

                  {/* Optional Subtle Spotlight (Disabled by default so video is bright & crisp) */}
                  {aspectRatio === '9:16' && enableSpotlight && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      zIndex: 3,
                      background: `radial-gradient(circle at ${getCurrentTrackingX()}% 42%, rgba(255, 255, 255, 0.05) 0%, transparent 45%, rgba(0, 0, 0, ${spotlightIntensity * 0.4}) 75%, rgba(0, 0, 0, ${spotlightIntensity * 0.6}) 100%)`,
                      transition: 'background 0.25s ease-out'
                    }} />
                  )}
                </>
              )}

              {/* Synchronous 60 FPS Kinetic Subtitle Canvas Overlay */}
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 6
                }}
              />

              {/* Dynamic Animated SFX Badge Popup */}
              {activeSfxBadge && (
                <div className="sfx-badge-animate" style={{
                  position: 'absolute',
                  top: '18px',
                  left: '50%',
                  zIndex: 10,
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff',
                  padding: '7px 16px',
                  borderRadius: '30px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  letterSpacing: '0.04em',
                  boxShadow: '0 0 25px rgba(239, 68, 68, 0.85), 0 4px 12px rgba(0,0,0,0.5)',
                  border: '2px solid rgba(255, 255, 255, 0.4)',
                  pointerEvents: 'none',
                  textTransform: 'uppercase'
                }}>
                  {activeSfxBadge}
                </div>
              )}

              {/* Streamer Reaction Badge Overlay */}
              {activeReactionBadge && (
                <div className="sfx-badge-animate" style={{
                  position: 'absolute',
                  top: '64px',
                  right: '16px',
                  zIndex: 10,
                  background: activeReactionBadge.includes('W')
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : activeReactionBadge.includes('L')
                    ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  pointerEvents: 'none'
                }}>
                  {activeReactionBadge}
                </div>
              )}

              {/* Dynamic Animated Teaser Hook Badge Overlay during preview */}
              {isPreviewingHook && (
                <div className="sfx-badge-animate" style={{
                  position: 'absolute',
                  top: '22px',
                  left: '50%',
                  zIndex: 12,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                  color: '#ffffff',
                  padding: '8px 18px',
                  borderRadius: '30px',
                  fontWeight: 900,
                  fontSize: '0.84rem',
                  letterSpacing: '0.04em',
                  boxShadow: '0 0 28px rgba(99, 102, 241, 0.9), 0 4px 14px rgba(0,0,0,0.6)',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⚡ HOOK TEASER:</span>
                  <span style={{ color: '#fde047' }}>{teaserBannerText || 'WAIT FOR IT...'}</span>
                </div>
              )}

              {/* Clean AI Tracking Indicator (Minimal pill, no dashed boxes covering face) */}
              {aspectRatio === '9:16' && (
                <div style={{
                  position: 'absolute',
                  top: '14px',
                  left: '14px',
                  zIndex: 8,
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  color: '#a5b4fc',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  pointerEvents: 'none'
                }}>
                  <Crosshair size={12} color="#818cf8" />
                  <span>
                    {reframeMode === 'split_stacked'
                      ? `Split 2-Speaker`
                      : `Tracked: ${getCurrentTrackingX().toFixed(0)}%`}
                  </span>
                </div>
              )}

              {/* Dead-Air Cut Pill */}
              {enableJumpCut && jumpCutData?.timeSaved > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '14px',
                  right: '14px',
                  zIndex: 8,
                  background: 'rgba(16, 185, 129, 0.85)',
                  color: '#ffffff',
                  padding: '4px 8px',
                  borderRadius: '20px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                }}>
                  <Zap size={11} />
                  <span>-{jumpCutData.timeSaved}s cut</span>
                </div>
              )}

              {/* Buffering / Loading Indicator */}
              {videoLoading && !videoError && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 0, 0, 0.45)',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    border: '3px solid rgba(255, 255, 255, 0.2)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>Loading Studio Preview...</span>
                </div>
              )}

              {/* Video Error Banner */}
              {videoError && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 7,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.94)',
                  padding: '20px',
                  textAlign: 'center',
                  gap: '12px'
                }}>
                  <p style={{ fontSize: '0.85rem', color: '#f87171', fontWeight: 600 }}>{videoError}</p>
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.load();
                        setVideoLoading(true);
                        setVideoError(null);
                      }
                    }}
                    className="btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    <RefreshCw size={14} />
                    <span>Retry Video</span>
                  </button>
                </div>
              )}

              {/* Play Overlay Button if paused */}
              {!isPlaying && !videoLoading && (
                <div
                  onClick={togglePlay}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.12)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.28)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.15s ease'
                  }}>
                    <Play size={20} fill="#ffffff" color="#ffffff" style={{ marginLeft: '3px' }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scrubber & Player Controls */}
          <div style={{
            width: '100%',
            maxWidth: '420px',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={togglePlay}
                className="btn-secondary"
                style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center' }}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} fill="white" />}
              </button>

              <input
                type="range"
                min={0}
                max={clipDuration}
                step="0.05"
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />

              <button
                onClick={() => handleSeek(0)}
                className="btn-secondary"
                style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center' }}
                title="Restart Clip"
              >
                <RotateCcw size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>{formatTimeDetailed(currentTime)}</span>
              <span>{formatTimeDetailed(clipDuration)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Customization Panel */}
        <div className="glass-panel studio-panel" style={{ padding: '24px', minHeight: '580px' }}>
          {/* Segmented Tab Navigation */}
          <div style={{
            display: 'flex',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--glass-specular)',
            marginBottom: '22px',
            overflowX: 'auto'
          }}>
            <button
              onClick={() => setActiveTab('framing')}
              style={{
                background: activeTab === 'framing' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'framing' ? '#ffffff' : 'var(--text-muted)',
                border: activeTab === 'framing' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === 'framing' ? 'var(--glass-specular)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Rows2 size={14} color={activeTab === 'framing' ? '#ffffff' : 'var(--text-dim)'} />
              <span>Framing</span>
            </button>

            <button
              onClick={() => setActiveTab('pacing')}
              style={{
                background: activeTab === 'pacing' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'pacing' ? '#ffffff' : 'var(--text-muted)',
                border: activeTab === 'pacing' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === 'pacing' ? 'var(--glass-specular)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={14} color={activeTab === 'pacing' ? '#ffffff' : 'var(--text-dim)'} />
              <span>Pacing &amp; Audio</span>
            </button>

            <button
              onClick={() => setActiveTab('effects')}
              style={{
                background: activeTab === 'effects' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'effects' ? '#ffffff' : 'var(--text-muted)',
                border: activeTab === 'effects' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === 'effects' ? 'var(--glass-specular)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Wand2 size={14} color={activeTab === 'effects' ? '#ffffff' : 'var(--text-dim)'} />
              <span>Visual FX</span>
            </button>

            <button
              onClick={() => setActiveTab('styles')}
              style={{
                background: activeTab === 'styles' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'styles' ? '#ffffff' : 'var(--text-muted)',
                border: activeTab === 'styles' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === 'styles' ? 'var(--glass-specular)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Palette size={14} color={activeTab === 'styles' ? '#ffffff' : 'var(--text-dim)'} />
              <span>Captions</span>
            </button>

            <button
              onClick={() => setActiveTab('words')}
              style={{
                background: activeTab === 'words' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: activeTab === 'words' ? '#ffffff' : 'var(--text-muted)',
                border: activeTab === 'words' ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid transparent',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                boxShadow: activeTab === 'words' ? 'var(--glass-specular)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Type size={14} color={activeTab === 'words' ? '#ffffff' : 'var(--text-dim)'} />
              <span>Words ({words.length})</span>
            </button>
          </div>

          {/* Tab 1: Framing & Split-Screen (Opus Clip Feature) */}
          {activeTab === 'framing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', display: 'block' }}>
                  AI 9:16 Video Reframing &amp; Multi-Speaker Layout
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Option 1: Opus Clip Dual-Speaker Split-Screen */}
                  <div
                    onClick={() => setReframeMode('split_stacked')}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: reframeMode === 'split_stacked' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: reframeMode === 'split_stacked' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-subtle)',
                      boxShadow: reframeMode === 'split_stacked' ? 'var(--glass-specular)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={15} color={reframeMode === 'split_stacked' ? '#ffffff' : 'var(--text-muted)'} strokeWidth={1.5} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                          Dual-Speaker Split View (Stacked)
                        </span>
                      </div>
                      {reframeMode === 'split_stacked' && <Check size={14} color="#ffffff" />}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                      Splits the 9:16 frame vertically into two stacked views: Speaker 1 on top, Speaker 2 on bottom. Designed for interviews and dialogue.
                    </div>
                    {reframeMode === 'split_stacked' ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(129, 140, 248, 0.35)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e0e7ff' }}>
                            🎯 Dual Speaker Framing Adjuster
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#818cf8', fontWeight: 600 }}>
                            Live Preview Enabled
                          </span>
                        </div>

                        {/* Top Speaker Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px', color: '#c7d2fe' }}>
                            <span>Top Speaker (Host / Left):</span>
                            <strong style={{ color: '#38bdf8' }}>{Math.round(speakerLeftPercent)}%</strong>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            step="1"
                            value={speakerLeftPercent}
                            onChange={(e) => setSpeakerLeftPercent(parseFloat(e.target.value))}
                            style={{
                              width: '100%',
                              accentColor: '#38bdf8',
                              cursor: 'pointer'
                            }}
                          />
                        </div>

                        {/* Bottom Speaker Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px', color: '#c7d2fe' }}>
                            <span>Bottom Speaker (Guest / Right):</span>
                            <strong style={{ color: '#818cf8' }}>{Math.round(speakerRightPercent)}%</strong>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            step="1"
                            value={speakerRightPercent}
                            onChange={(e) => setSpeakerRightPercent(parseFloat(e.target.value))}
                            style={{
                              width: '100%',
                              accentColor: '#818cf8',
                              cursor: 'pointer'
                            }}
                          />
                        </div>

                        {/* Framing Presets */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                            QUICK PRESETS:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => { setSpeakerLeftPercent(30.0); setSpeakerRightPercent(70.0); }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                borderRadius: '4px',
                                background: (Math.round(speakerLeftPercent) === 30 && Math.round(speakerRightPercent) === 70) ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Standard (30% / 70%)
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSpeakerLeftPercent(22.0); setSpeakerRightPercent(78.0); }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                borderRadius: '4px',
                                background: (Math.round(speakerLeftPercent) === 22 && Math.round(speakerRightPercent) === 78) ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Wide Studio (22% / 78%)
                            </button>
                            <button
                              type="button"
                              onClick={() => { setSpeakerLeftPercent(38.0); setSpeakerRightPercent(62.0); }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                borderRadius: '4px',
                                background: (Math.round(speakerLeftPercent) === 38 && Math.round(speakerRightPercent) === 62) ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Close Dialogue (38% / 62%)
                            </button>
                            {trackingData?.speakerLeftPercent && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSpeakerLeftPercent(trackingData.speakerLeftPercent);
                                  setSpeakerRightPercent(trackingData.speakerRightPercent);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '0.7rem',
                                  borderRadius: '4px',
                                  background: (Math.round(speakerLeftPercent) === Math.round(trackingData.speakerLeftPercent) && Math.round(speakerRightPercent) === Math.round(trackingData.speakerRightPercent)) ? '#059669' : 'rgba(16, 185, 129, 0.15)',
                                  color: '#34d399',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                AI Detect ({Math.round(trackingData.speakerLeftPercent)}% / {Math.round(trackingData.speakerRightPercent)}%)
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#a5b4fc'
                      }}>
                        <span>Top Speaker: <strong>{Math.round(speakerLeftPercent)}%</strong></span>
                        <span>Bottom Speaker: <strong>{Math.round(speakerRightPercent)}%</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Option 2: Smart Single Speaker (Auto-Pan) */}
                  <div
                    onClick={() => setReframeMode('smart_track')}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: reframeMode === 'smart_track' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: reframeMode === 'smart_track' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-subtle)',
                      boxShadow: reframeMode === 'smart_track' ? 'var(--glass-specular)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Crosshair size={15} color={reframeMode === 'smart_track' ? '#ffffff' : 'var(--text-muted)'} strokeWidth={1.5} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                          Smart Single Speaker (Auto-Pan)
                        </span>
                      </div>
                      {reframeMode === 'smart_track' && <Check size={14} color="#ffffff" />}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                      Full-bleed vertical crop without letterboxing. Auto-pans smoothly to follow the active speaker.
                    </div>

                    {reframeMode === 'smart_track' && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          marginTop: '12px',
                          padding: '12px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(6, 182, 212, 0.35)',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e0e7ff' }}>
                            🎯 Speaker Focus & Camera Pan
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#06b6d4', fontWeight: 600 }}>
                            {singleSpeakerFocusMode === 'auto_pan' ? 'AI Auto-Follow' : `Locked at ${Math.round(singleSpeakerFocusX)}%`}
                          </span>
                        </div>

                        {/* Focus Targets */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                            FOCUS TARGET:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setSingleSpeakerFocusMode('auto_pan')}
                              style={{
                                padding: '5px 9px',
                                fontSize: '0.72rem',
                                borderRadius: '4px',
                                background: singleSpeakerFocusMode === 'auto_pan' ? '#0891b2' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Crosshair size={12} />
                              <span>AI Auto-Pan (Continuous)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSingleSpeakerFocusMode('primary');
                                setSingleSpeakerFocusX(trackingData?.primarySpeakerXPercent || trackingData?.avgXPercent || 50.0);
                              }}
                              style={{
                                padding: '5px 9px',
                                fontSize: '0.72rem',
                                borderRadius: '4px',
                                background: singleSpeakerFocusMode === 'primary' ? '#0891b2' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Primary Speaker ({Math.round(trackingData?.primarySpeakerXPercent || trackingData?.avgXPercent || 50)}%)
                            </button>
                            {trackingData?.speakerLeftPercent && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSingleSpeakerFocusMode('left');
                                  setSingleSpeakerFocusX(trackingData.speakerLeftPercent);
                                }}
                                style={{
                                  padding: '5px 9px',
                                  fontSize: '0.72rem',
                                  borderRadius: '4px',
                                  background: singleSpeakerFocusMode === 'left' ? '#0891b2' : 'rgba(255, 255, 255, 0.08)',
                                  color: '#ffffff',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                Host / Left ({Math.round(trackingData.speakerLeftPercent)}%)
                              </button>
                            )}
                            {trackingData?.speakerRightPercent && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSingleSpeakerFocusMode('right');
                                  setSingleSpeakerFocusX(trackingData.speakerRightPercent);
                                }}
                                style={{
                                  padding: '5px 9px',
                                  fontSize: '0.72rem',
                                  borderRadius: '4px',
                                  background: singleSpeakerFocusMode === 'right' ? '#0891b2' : 'rgba(255, 255, 255, 0.08)',
                                  color: '#ffffff',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                Guest / Right ({Math.round(trackingData.speakerRightPercent)}%)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSingleSpeakerFocusMode('center');
                                setSingleSpeakerFocusX(50.0);
                              }}
                              style={{
                                padding: '5px 9px',
                                fontSize: '0.72rem',
                                borderRadius: '4px',
                                background: singleSpeakerFocusMode === 'center' ? '#0891b2' : 'rgba(255, 255, 255, 0.08)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              Center (50%)
                            </button>
                          </div>
                        </div>

                        {/* Fine-Tuning Slider */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px', color: '#c7d2fe' }}>
                            <span>Camera Center Position:</span>
                            <strong style={{ color: '#06b6d4' }}>{Math.round(singleSpeakerFocusX)}%</strong>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="85"
                            step="1"
                            value={singleSpeakerFocusX}
                            onChange={(e) => {
                              setSingleSpeakerFocusX(parseFloat(e.target.value));
                              setSingleSpeakerFocusMode('custom');
                            }}
                            style={{
                              width: '100%',
                              accentColor: '#06b6d4',
                              cursor: 'pointer'
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                            <span>Left (15%)</span>
                            <span>Center (50%)</span>
                            <span>Right (85%)</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Option 3: Center Speaker Crop */}
                  <div
                    onClick={() => setReframeMode('crop_center')}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: reframeMode === 'crop_center' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: reframeMode === 'crop_center' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-subtle)',
                      boxShadow: reframeMode === 'crop_center' ? 'var(--glass-specular)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Maximize2 size={15} color={reframeMode === 'crop_center' ? '#ffffff' : 'var(--text-muted)'} strokeWidth={1.5} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                          Center Fixed Crop (50%)
                        </span>
                      </div>
                      {reframeMode === 'crop_center' && <Check size={14} color="#ffffff" />}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Fixed vertical crop locked strictly to the center 50% coordinate of the source video.
                    </div>
                  </div>

                  {/* Option 4: Frosted Blur Fill */}
                  <div
                    onClick={() => setReframeMode('blur_fill')}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)',
                      background: reframeMode === 'blur_fill' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: reframeMode === 'blur_fill' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid var(--border-subtle)',
                      boxShadow: reframeMode === 'blur_fill' ? 'var(--glass-specular)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={15} color={reframeMode === 'blur_fill' ? '#ffffff' : 'var(--text-muted)'} strokeWidth={1.5} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                          Blurred Backdrop Fill
                        </span>
                      </div>
                      {reframeMode === 'blur_fill' && <Check size={14} color="#ffffff" />}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Preserves 100% widescreen view with ambient blurred bars above and below.
                    </div>
                  </div>
                </div>
              </div>

              {/* Clip Start/End Trimmers */}
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', display: 'block' }}>
                  Fine-tune Clip Boundaries
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Clip Start (sec)</div>
                    <input
                      type="number"
                      step="0.1"
                      value={trimStart}
                      onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontWeight: 600
                      }}
                    />
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Clip End (sec)</div>
                    <input
                      type="number"
                      step="0.1"
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontWeight: 600
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Pacing & Streamer SFX */}
          {activeTab === 'pacing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Jump-Cut / Dead-Air Silence Removal */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f59e0b'
                    }}>
                      <Zap size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        Smart Jump-Cuts &amp; Silence Removal
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Trims dead-air pauses &gt;0.5s for rapid, punchy streamer pacing
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableJumpCut}
                    onChange={(e) => setEnableJumpCut(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>

                {/* Pacing Mode Selector to avoid choppy video */}
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Silence Cut Sensitivity &amp; Pacing:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { id: 'natural', label: 'Natural', desc: '>1.2s (Smooth)' },
                      { id: 'balanced', label: 'Balanced', desc: '>0.85s (Default)' },
                      { id: 'snappy', label: 'Snappy', desc: '>0.65s (Viral)' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setJumpCutPacing(p.id)}
                        style={{
                          padding: '8px 6px',
                          borderRadius: '6px',
                          border: jumpCutPacing === p.id ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                          background: jumpCutPacing === p.id ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                          color: jumpCutPacing === p.id ? '#ffffff' : 'var(--text-dim)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.label}</span>
                        <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {jumpCutData && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '10px',
                    marginTop: '14px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Dead Air Trimmed</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                        {jumpCutData.timeSaved}s
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Jump-Cuts Made</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>
                        {jumpCutData.segments ? jumpCutData.segments.length - 1 : 0} cuts
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Punchy Duration</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#818cf8' }}>
                        {jumpCutData.condensedDuration || jumpCutData.newDuration}s
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Meme & Streamer Sound Effects with Web Audio Engine */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ef4444'
                    }}>
                      <Flame size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        Streamer Meme Sound Effects (Web Audio Active)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Plays Vine Booms on punchlines &amp; Whooshes on cuts (baked into export)
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableSfx}
                    onChange={(e) => setEnableSfx(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>

                {/* SFX Volume Booster */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <Volume2 size={15} color="#818cf8" />
                    <span>SFX Master Gain</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="range"
                      min="0.2"
                      max="1.5"
                      step="0.1"
                      value={sfxVolume}
                      onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                      style={{ width: '100px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ffffff', minWidth: '35px' }}>
                      {Math.round(sfxVolume * 100)}%
                    </span>
                  </div>
                </div>

                {/* Soundboard Test Buttons (Directly sourced from MyInstants) */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Streamer Soundboard (Authentic MyInstants SFX):</span>
                    <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>5 Active Sounds</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => { playSfx('vine_boom'); triggerSfxBadge('💥 VINE BOOM'); }}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '8px 6px', justifyContent: 'center' }}
                    >
                      <span>💥 Vine Boom</span>
                    </button>
                    <button
                      onClick={() => { playSfx('whoosh'); triggerSfxBadge('💨 WHOOSH'); }}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '8px 6px', justifyContent: 'center' }}
                    >
                      <span>💨 Whoosh</span>
                    </button>
                    <button
                      onClick={() => { playSfx('ding'); triggerSfxBadge('🔔 DING'); }}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '8px 6px', justifyContent: 'center' }}
                    >
                      <span>🔔 Ding</span>
                    </button>
                    <button
                      onClick={() => { playSfx('record_scratch'); triggerSfxBadge('💿 SCRATCH'); }}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '8px 6px', justifyContent: 'center' }}
                    >
                      <span>💿 Scratch</span>
                    </button>
                    <button
                      onClick={() => { playSfx('bruh'); triggerSfxBadge('🗿 BRUH'); }}
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '8px 6px', justifyContent: 'center' }}
                    >
                      <span>🗿 Bruh</span>
                    </button>
                  </div>
                </div>

                {/* 2. Add Manual SFX on Required Timestamp */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#c7d2fe' }}>
                      <Plus size={14} color="#818cf8" />
                      <span>Add SFX on Required Timestamp</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualSfxTime(parseFloat(currentTime.toFixed(1)))}
                      className="btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Clock size={11} />
                      <span>Use Playhead ({currentTime.toFixed(1)}s)</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Timestamp (sec)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={clipDuration}
                        value={manualSfxTime}
                        onChange={(e) => setManualSfxTime(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          background: 'rgba(0, 0, 0, 0.35)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          padding: '6px 10px',
                          fontSize: '0.8rem',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Sound Effect
                      </label>
                      <select
                        value={manualSfxType}
                        onChange={(e) => setManualSfxType(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0d1117',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          padding: '6px 10px',
                          fontSize: '0.8rem',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="vine_boom">💥 Vine Boom</option>
                        <option value="bruh">🗿 Bruh</option>
                        <option value="ding">🔔 Ding / Insight</option>
                        <option value="whoosh">💨 Fast Whoosh</option>
                        <option value="record_scratch">💿 Record Scratch</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Optional cue note (e.g. Punchline drop)..."
                      value={manualSfxLabel}
                      onChange={(e) => setManualSfxLabel(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: '#ffffff',
                        padding: '6px 10px',
                        fontSize: '0.78rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddManualSfx}
                      className="btn-primary"
                      style={{
                        fontSize: '0.78rem',
                        padding: '6px 14px',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Plus size={13} />
                      <span>Add Cue</span>
                    </button>
                  </div>
                </div>

                {/* 3. Scheduled Cues Timeline */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Scheduled SFX Timeline Events ({jumpCutData?.sfxEvents?.length || 0}):
                    </div>
                    {jumpCutData?.sfxEvents?.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllSfx}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Trash2 size={11} />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>

                  <div style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {(!jumpCutData?.sfxEvents || jumpCutData.sfxEvents.length === 0) ? (
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '8px', textAlign: 'center' }}>
                        No SFX cues scheduled. Add sound effects above at any timestamp!
                      </div>
                    ) : (
                      jumpCutData.sfxEvents.map((evt, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '6px',
                            fontSize: '0.78rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: evt.type === 'vine_boom' ? 'rgba(239, 68, 68, 0.2)' : evt.type === 'bruh' ? 'rgba(245, 158, 11, 0.2)' : evt.type === 'ding' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                              color: evt.type === 'vine_boom' ? '#f87171' : evt.type === 'bruh' ? '#fbbf24' : evt.type === 'ding' ? '#4ade80' : '#818cf8',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}>
                              {evt.type === 'vine_boom' ? '💥 Vine Boom' : evt.type === 'whoosh' ? '💨 Whoosh' : evt.type === 'ding' ? '🔔 Ding' : evt.type === 'bruh' ? '🗿 Bruh' : '💿 Scratch'}
                            </span>
                            <span style={{ color: '#ffffff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {evt.trigger || evt.label}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleSeek(evt.time)}
                              style={{
                                color: 'var(--text-muted)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: 'none',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '0.74rem',
                                cursor: 'pointer'
                              }}
                              title="Seek player to this SFX"
                            >
                              {evt.time.toFixed(1)}s
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSfx(i)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.8
                              }}
                              title="Delete this sound effect"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 4. Viral Teaser Hook Video Prepend Feature */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: enableTeaserHook ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                transition: 'all 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: enableTeaserHook ? '14px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(99, 102, 241, 0.3)'
                    }}>
                      <Film size={17} color="#818cf8" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff' }}>
                        Viral Teaser Hook Video Prepend
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        Prepend an engaging 2–3s teaser hook clip before video starts with a whoosh cut
                      </div>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: enableTeaserHook ? '#818cf8' : 'var(--text-muted)' }}>
                      {enableTeaserHook ? 'YES (Enabled)' : 'NO (Disabled)'}
                    </span>
                    <input
                      type="checkbox"
                      checked={enableTeaserHook}
                      onChange={(e) => setEnableTeaserHook(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                {enableTeaserHook && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-subtle)'
                  }}>
                    {/* Detected Hook Highlight Card */}
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>
                          🎯 AI Climax Hook Selected ({teaserHookData?.duration || 2.4}s)
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Original Timestamp: {teaserHookData?.start || 0}s - {teaserHookData?.end || 2.5}s
                        </span>
                      </div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#ffffff', fontStyle: 'italic', marginBottom: '10px' }}>
                        "{teaserHookData?.text || 'Finding best cliffhanger hook from clip...'}"
                      </div>

                      {/* Action Button: Preview Hook Intro */}
                      <button
                        type="button"
                        onClick={handlePreviewTeaserHook}
                        className="btn-primary"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '0.8rem',
                          justifyContent: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Play size={13} fill="currentColor" />
                        <span>{isPreviewingHook ? 'Previewing Hook + Cut...' : '▶ Preview Teaser Hook (+ Transition Whoosh)'}</span>
                      </button>
                    </div>

                    {/* Alternate Candidate Hooks */}
                    {teaserHookData?.candidates?.length > 1 && (
                      <div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                          Select Alternate Hook Sentence:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {teaserHookData.candidates.map((cand, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelectTeaserCandidate(cand)}
                              style={{
                                textAlign: 'left',
                                background: teaserHookData.start === cand.start ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0, 0, 0, 0.25)',
                                border: teaserHookData.start === cand.start ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                fontSize: '0.76rem',
                                color: teaserHookData.start === cand.start ? '#ffffff' : 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '82%' }}>
                                "{cand.text}"
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 600 }}>
                                {cand.duration}s
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teaser Hook Banner Overlay Text */}
                    <div>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                        Teaser Intro Headline Banner
                      </label>
                      <input
                        type="text"
                        value={teaserBannerText}
                        onChange={(e) => setTeaserBannerText(e.target.value)}
                        placeholder="e.g. WAIT FOR IT... ⚡"
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          padding: '7px 10px',
                          fontSize: '0.8rem',
                          outline: 'none',
                          marginBottom: '6px'
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['WAIT FOR IT... ⚡', 'WATCH TILL THE END 🤫', 'WAIT WHAT?! 🤯', 'DON\'T SKIP ⚠️'].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTeaserBannerText(preset)}
                            style={{
                              fontSize: '0.68rem',
                              padding: '3px 8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              color: 'var(--text-muted)',
                              cursor: 'pointer'
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Visual FX & Clipping Assets */}
          {activeTab === 'effects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Impact Punch-In Zoom & Camera Shake */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8'
                    }}>
                      <Flame size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        💥 Impact Punch-In Zoom &amp; Shake
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Zooms 1.15x with impact camera shake when punchlines or Vine Booms hit
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enablePunchInZoom}
                    onChange={(e) => setEnablePunchInZoom(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Dramatic Beat Lighting Flash */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f59e0b'
                    }}>
                      <Zap size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        ⚡ Dramatic Beat Lighting Flash
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Flashes screen borders with red/gold pulse on intense bass hits
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableBeatFlash}
                    onChange={(e) => setEnableBeatFlash(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Streamer Reaction Badges */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#10b981'
                    }}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        🏷️ Streamer Reaction Badges (W / L / SUS)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Pops floating reaction stickers (🔥 W, 💀 L, 🚨 SUS) on key moments
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableReactionBadges}
                    onChange={(e) => setEnableReactionBadges(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Optional Subtle Spotlight Lighting (Off by default for clean, natural brightness) */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: 'rgba(236, 72, 153, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ec4899'
                    }}>
                      <Wand2 size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        🎯 Subtle Spotlight Lighting (Optional)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Adds subtle radiant lighting around speaker (kept off for maximum natural brightness)
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableSpotlight}
                    onChange={(e) => setEnableSpotlight(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Subtitle Styles */}
          {activeTab === 'styles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* Presets */}
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', display: 'block' }}>
                  Caption Style Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    {
                      id: 'hormozi',
                      name: 'Alex Hormozi',
                      desc: 'Bold uppercase, neon active word pop',
                      preview: <>MAKE <span style={{ color: '#ffe600', textDecoration: 'underline' }}>MONEY</span> FAST</>
                    },
                    {
                      id: 'mrbeast',
                      name: 'MrBeast Style',
                      desc: 'Impact font, high-contrast dark stroke',
                      preview: <>WIN <span style={{ color: '#00ff66' }}>$50,000</span> TODAY</>
                    },
                    {
                      id: 'clean',
                      name: 'Clean Modern',
                      desc: 'Minimalist Inter with translucent pill',
                      preview: <>Focus on <span style={{ color: '#818cf8', fontWeight: 700 }}>growth</span></>
                    },
                    {
                      id: 'cyberpunk',
                      name: 'Cyber Neon',
                      desc: 'Futuristic cyan glow and drop shadow',
                      preview: <>FUTURE <span style={{ color: '#06b6d4', textShadow: '0 0 8px #06b6d4' }}>AI</span></>
                    }
                  ].map(p => (
                    <div
                      key={p.id}
                      onClick={() => setStyle(p.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: style === p.id ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: style === p.id ? '1px solid rgba(255, 255, 255, 0.22)' : '1px solid var(--border-subtle)',
                        boxShadow: style === p.id ? 'var(--glass-specular)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.84rem', color: '#ffffff' }}>{p.name}</span>
                        {style === p.id && (
                          <div style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Check size={10} color="#07090e" strokeWidth={2.5} />
                          </div>
                        )}
                      </div>

                      {/* Visual Preview Pill */}
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        textAlign: 'center',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        marginBottom: '8px',
                        color: '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.06)'
                      }}>
                        {p.preview}
                      </div>

                      <span style={{ fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.3, display: 'block' }}>
                        {p.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Highlight Color */}
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', display: 'block' }}>
                  Active Spoken Word Highlight
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {colorPalette.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setHighlightColor(c.hex)}
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        backgroundColor: c.hex,
                        border: highlightColor === c.hex ? '3px solid #ffffff' : '1px solid rgba(0,0,0,0.5)',
                        boxShadow: highlightColor === c.hex ? `0 0 14px ${c.hex}` : 'none',
                        cursor: 'pointer'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Font Size Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.84rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Font Size</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="36"
                  max="76"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              {/* Caption Position */}
              <div>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', display: 'block' }}>
                  Vertical Caption Placement
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {['bottom', 'center', 'top'].map(pos => (
                    <button
                      key={pos}
                      onClick={() => setCaptionPosition(pos)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: captionPosition === pos ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: captionPosition === pos ? '1px solid var(--border-focus)' : '1px solid var(--border-subtle)',
                        color: captionPosition === pos ? '#ffffff' : 'var(--text-muted)',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        textTransform: 'capitalize'
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Emojis Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Auto Animated Emojis</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Pops relevant emojis (🔥, 💸, 🚀, 🤖) above spoken keywords</div>
                </div>
                <input
                  type="checkbox"
                  checked={showEmojis}
                  onChange={(e) => setShowEmojis(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Viral Top Hook Banner (Opus Signature Header) */}
              <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🏷️ Top Hook Headline Banner</span>
                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', borderRadius: '4px', fontWeight: 700 }}>OPUS CLIPS</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>Scroll-stopping header card pinned at the top of the 9:16 vertical short</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showHookBanner}
                    onChange={(e) => setShowHookBanner(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                </div>
                {showHookBanner && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={hookBannerText}
                      onChange={(e) => setHookBannerText(e.target.value)}
                      placeholder="Enter viral headline banner..."
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#ffffff',
                        fontSize: '0.84rem',
                        fontWeight: 700
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0 10px' }}
                      onClick={() => setHookBannerText((clip.title ? clip.title.toUpperCase() : 'VIRAL MOMENT') + ' 🔥')}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Words & Emojis Editor / Edit-by-Transcript */}
          {activeTab === 'words' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Scissors size={14} />
                    Edit-by-Transcript (Timeline Slicing)
                  </span>
                  {words.filter(w => w.deleted).length > 0 && (
                    <span className="badge-minimal" style={{ fontSize: '0.72rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                      {words.filter(w => w.deleted).length} cut
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Click the scissor icon to cut out filler words, stutters, or tangents. The video timeline will automatically splice them out in both the player and the exported video!
                </p>
              </div>

              <div style={{
                maxHeight: '440px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '6px'
              }}>
                {words.map((w, idx) => {
                  const currentAbs = trimStart + currentTime;
                  const isActive = currentAbs >= w.start && currentAbs <= w.end;
                  const isDeleted = Boolean(w.deleted);

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: isDeleted
                          ? 'rgba(239, 68, 68, 0.07)'
                          : (isActive ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.02)'),
                        border: isDeleted
                          ? '1px dashed rgba(239, 68, 68, 0.35)'
                          : (isActive ? '1px solid var(--border-focus)' : '1px solid var(--border-subtle)'),
                        opacity: isDeleted ? 0.6 : 1,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Timestamp button */}
                      <button
                        onClick={() => handleSeek(Math.max(0, Math.min(clipDuration, w.start - trimStart)))}
                        style={{
                          fontSize: '0.74rem',
                          color: isDeleted ? '#ef4444' : '#818cf8',
                          background: isDeleted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                          padding: '3px 7px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {formatTime(w.start)}
                      </button>

                      {/* Word Input / Struck-through */}
                      <input
                        type="text"
                        value={w.word}
                        disabled={isDeleted}
                        onChange={(e) => handleWordEdit(idx, e.target.value)}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          color: isDeleted ? 'rgba(255, 255, 255, 0.4)' : '#ffffff',
                          textDecoration: isDeleted ? 'line-through' : 'none',
                          fontWeight: 600,
                          fontSize: '0.9rem'
                        }}
                      />

                      {/* Cut / Restore Word Button (Timeline Slicing) */}
                      <button
                        type="button"
                        onClick={() => handleToggleWordDelete(idx)}
                        title={isDeleted ? "Restore word to video" : "Cut word from video"}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: isDeleted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
                          background: isDeleted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          color: isDeleted ? '#ef4444' : 'var(--text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Scissors size={12} />
                        <span>{isDeleted ? 'CUT' : 'Cut'}</span>
                      </button>

                      {/* Emoji Input */}
                      {!isDeleted && (
                        <input
                          type="text"
                          placeholder="Emoji"
                          value={w.emoji || ''}
                          onChange={(e) => handleWordEmojiChange(idx, e.target.value)}
                          style={{
                            width: '44px',
                            textAlign: 'center',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            padding: '3px',
                            fontSize: '0.9rem'
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
