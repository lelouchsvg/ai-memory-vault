'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Command,
  Cpu,
  FileText,
  LoaderCircle,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import './agentic-os.css';

type Row = { id: string; [key: string]: any };
type OsState = {
  sessions: Row[];
  messages: Row[];
  runs: Row[];
  memory: Row[];
  skills: Row[];
  events: Row[];
  status: Record<string, any>;
};
type BusinessState = Record<string, any>;
type NoteDraft = { id?: string; title: string; content: string; tags: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const emptyState: OsState = {
  sessions: [],
  messages: [],
  runs: [],
  memory: [],
  skills: [],
  events: [],
  status: {},
};
const money = (value: unknown) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
const time = (value: unknown, timeZone = 'America/New_York') =>
  value
    ? new Date(String(value)).toLocaleTimeString('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
const terminalStatuses = new Set(['COMPLETED', 'BLOCKED', 'FAILED', 'CANCELLED']);

function Galaxy({ working }: { working: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      last = -Infinity,
      rotation = 0,
      size = 600;
    const starCount = 3900;
    const stars = Array.from({ length: starCount }, (_, i) => {
      const seed = Math.sin(i * 123.4567 + 0.891) * 43212.62;
      const noise = seed - Math.floor(seed);
      const radius = Math.pow((i + 1) / (starCount + 1), 0.72) * 0.475;
      const arm = i % 5;
      const angle = (arm * Math.PI * 2) / 5 + radius * 11 + (noise - 0.5) * (0.3 + radius * 1.05);
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.89,
        radius: 0.45 + noise * 1.25,
        brightness: 0.4 + noise * 0.6,
        phase: noise * Math.PI * 2,
      };
    });
    const resize = () => {
      size = Math.min(canvas.clientWidth || 600, 720);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      last = -Infinity;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const draw = (stamp: number) => {
      frame = requestAnimationFrame(draw);
      if (stamp - last < (motion.matches ? 1000 : 40) || document.hidden) return;
      last = stamp;
      if (!motion.matches) rotation += working ? 0.0016 : 0.00045;
      context.clearRect(0, 0, size, size);
      const center = size / 2;
      const glow = context.createRadialGradient(center, center, 0, center, center, size * 0.42);
      glow.addColorStop(0, working ? 'rgba(162,242,240,.13)' : 'rgba(220,239,242,.13)');
      glow.addColorStop(0.18, 'rgba(179,218,227,.025)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, size, size);
      context.save();
      context.translate(center, center);
      context.rotate(rotation);
      for (const star of stars) {
        const pulse = motion.matches ? 1 : 0.72 + Math.sin(stamp / 1450 + star.phase) * 0.28;
        context.globalAlpha = star.brightness * pulse;
        context.fillStyle = working ? '#dcfffc' : '#f2f6ff';
        context.shadowColor = working ? '#b9fff7' : '#e1efff';
        context.shadowBlur = star.brightness > 0.86 ? 5 : 0;
        context.fillRect(star.x * size, star.y * size, star.radius, star.radius);
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      const core = context.createRadialGradient(0, 0, 0, 0, 0, size * 0.08);
      core.addColorStop(0, 'rgba(255,255,255,.95)');
      core.addColorStop(0.1, 'rgba(225,248,255,.6)');
      core.addColorStop(1, 'rgba(225,248,255,0)');
      context.fillStyle = core;
      context.fillRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.16);
      context.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [working]);
  return (
    <canvas
      ref={canvasRef}
      className="os-galaxy"
      role="img"
      aria-label={working ? 'Luminous spiral, agent working' : 'Luminous spiral, agent idle'}
    />
  );
}

function MiniChart({ values }: { values: number[] }) {
  const maximum = Math.max(...values, 1),
    minimum = Math.min(...values, 0);
  const points = values
    .map(
      (n, i) =>
        `${(i / Math.max(values.length - 1, 1)) * 240},${40 - ((n - minimum) / Math.max(maximum - minimum, 1)) * 32}`,
    )
    .join(' ');
  return (
    <svg className="os-sparkline" viewBox="0 0 240 48" aria-hidden="true">
      <path d="M0 46H240" />
      <polyline points={points} />
      {values.length > 0 && (
        <circle
          cx="240"
          cy={40 - ((values.at(-1)! - minimum) / Math.max(maximum - minimum, 1)) * 32}
          r="2.5"
        />
      )}
    </svg>
  );
}

export default function AgenticOS() {
  const router = useRouter();
  const [mode, setMode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [os, setOs] = useState<OsState>(emptyState);
  const [business, setBusiness] = useState<BusinessState>({});
  const [sessionId, setSessionId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleTab, setConsoleTab] = useState<'runs' | 'events'>('runs');
  const [showSkills, setShowSkills] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [note, setNote] = useState<NoteDraft | null>(null);
  const [providerInfo, setProviderInfo] = useState(false);
  const modalType = note
    ? 'note'
    : showMemory
      ? 'memory'
      : showSkills
        ? 'skills'
        : providerInfo
          ? 'provider'
          : null;
  const [clock, setClock] = useState({ time: '--:--:--', date: '—' });
  const [canDictate, setCanDictate] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const recognitionRef = useRef<Recognition | null>(null);
  const spokenRef = useRef(new Set<string>());
  const selectedSessionRef = useRef(sessionId);
  const messages = os.messages.filter((m) => m.sessionId === sessionId);
  const sessionRuns = os.runs.filter((r) => !sessionId || r.sessionId === sessionId);
  const running = os.runs.filter((r) => ['QUEUED', 'RUNNING'].includes(r.status));
  const working = running.length > 0;
  const summary = business.summary || {};
  const properties: Row[] = business.properties || [];
  const pending: Row[] = (business.approvals || []).filter((a: Row) => a.status === 'PENDING');
  const directives: Row[] = (business.tasks || [])
    .filter((task: Row) => !['DONE', 'FAILED'].includes(task.status))
    .sort((a: Row, b: Row) =>
      String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')),
    )
    .slice(0, 3);
  const monthly: Row[] = summary.monthly || [];
  const workerConnected = os.status.worker?.state === 'CONNECTED';
  const provider = os.status.planner || {};

  const load = useCallback(
    async (silent = false) => {
      const requestedMode = modeRef.current;
      if (!silent) setLoading(true);
      try {
        const [osResponse, businessResponse] = await Promise.all([
          fetch(`/api/os?mode=${requestedMode}`, { cache: 'no-store' }),
          fetch(`/api/state?mode=${requestedMode}`, { cache: 'no-store' }),
        ]);
        if (osResponse.status === 401 || businessResponse.status === 401) {
          router.replace('/login?next=/os');
          return;
        }
        const [nextOs, nextBusiness] = await Promise.all([
          osResponse.json(),
          businessResponse.json(),
        ]);
        if (modeRef.current !== requestedMode) return;
        if (!osResponse.ok) throw new Error(nextOs.error || 'Could not load the command runtime.');
        if (!businessResponse.ok)
          throw new Error(nextBusiness.error || 'Could not load the business workspace.');
        setOs({ ...emptyState, ...nextOs });
        setBusiness(nextBusiness);
        if (!selectedSessionRef.current && nextOs.sessions?.length) {
          setSessionId(nextOs.sessions[0].id);
          selectedSessionRef.current = nextOs.sessions[0].id;
        }
        setConnectionError('');
      } catch (e) {
        if (modeRef.current === requestedMode)
          setConnectionError(e instanceof Error ? e.message : 'Connection failed.');
      } finally {
        if (modeRef.current === requestedMode) setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    modeRef.current = mode;
    void load();
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const schedule = () => {
      timer = setTimeout(
        async () => {
          await load(true);
          if (!disposed) schedule();
        },
        working ? 2000 : 10000,
      );
    };
    schedule();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [mode, load, working]);
  useEffect(() => {
    selectedSessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const zone = business.settings?.ownerTimezone || 'America/New_York';
      setClock({
        time: now.toLocaleTimeString('en-GB', { timeZone: zone, hour12: false }),
        date: now.toLocaleDateString('en-US', {
          timeZone: zone,
          weekday: 'short',
          month: 'short',
          day: '2-digit',
        }),
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [business.settings?.ownerTimezone]);
  useEffect(() => {
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    setCanDictate(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
    setCanSpeak(Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance));
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        commandRef.current?.focus();
      }
      if (event.key === 'Escape') {
        recognitionRef.current?.abort();
        setNote(null);
        setProviderInfo(false);
        setShowSkills(false);
        setShowMemory(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!modalType) return;
    const dialog = document.querySelector<HTMLElement>('.os-shell [role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const items = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
        ),
      );
    items()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = items(),
        first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = before;
      dialog.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [modalType]);
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);
  useEffect(() => {
    if (!speak || !window.speechSynthesis) return;
    const last = messages.filter((m) => m.role === 'ASSISTANT').at(-1);
    if (!last || spokenRef.current.has(last.id)) return;
    spokenRef.current.add(last.id);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(last.content));
  }, [messages, speak]);

  async function action(payload: Record<string, unknown>) {
    const requestMode = modeRef.current;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: requestMode, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Command failed.');
      if (modeRef.current !== requestMode) return result;
      const value = result.data || result;
      if (value.sessionId) {
        setSessionId(value.sessionId);
        selectedSessionRef.current = value.sessionId;
      }
      await load(true);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed.');
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!command.trim() || busy) return;
    const message = command.trim();
    try {
      await action({
        action: 'chat',
        message,
        sessionId: sessionId || undefined,
        propertyId: propertyId || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setCommand('');
    } catch {}
  }
  async function runSkill(skill: Row) {
    if (skill.requiresProperty && !propertyId) {
      setError('Choose a property in Mission context before running this skill.');
      document.getElementById('os-property')?.focus();
      return;
    }
    try {
      await action({
        action: 'runSkill',
        skillId: skill.id,
        sessionId: sessionId || undefined,
        propertyId: propertyId || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch {}
  }
  async function newSession() {
    try {
      const result = await action({ action: 'createSession', title: 'New mission' });
      const id = result.sessionId || result.id;
      if (id) {
        setSessionId(id);
        selectedSessionRef.current = id;
      }
      setCommand('');
      commandRef.current?.focus();
    } catch {}
  }
  function switchMode(nextMode: 'DEMO' | 'LIVE') {
    if (nextMode === mode) return;
    if (nextMode === 'LIVE' && business.actor?.demoOnly) {
      setError(
        'Demo sessions cannot access LIVE records. Use a configured owner account for live operations.',
      );
      return;
    }
    modeRef.current = nextMode;
    selectedSessionRef.current = '';
    setOs(emptyState);
    setBusiness({});
    setSessionId('');
    setPropertyId('');
    setCommand('');
    setMode(nextMode);
    setError('');
  }
  function dictate() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const browser = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) {
      setError('Voice dictation is unavailable in this browser. Type a command instead.');
      return;
    }
    const recognition = new Constructor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ');
      setCommand((previous) => [previous, text].filter(Boolean).join(' '));
      commandRef.current?.focus();
    };
    recognition.onerror = (event) => {
      setError(`Browser dictation: ${event.error}. You can type your command.`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError('Could not start browser dictation. Check microphone permission.');
    }
  }
  const statusLabel = listening ? 'LISTENING' : working ? 'WORKING' : error ? 'ATTENTION' : 'IDLE';
  const skills = os.skills.slice(0, 4);

  return (
    <div className={`os-shell ${working ? 'os-working' : ''}`}>
      <header className="os-header">
        <Link href="/os" className="os-brand">
          <span>
            CONTROL TOWER<span className="os-version"> / OS</span>
          </span>
          <small>YOUR BUSINESS. ORCHESTRATED.</small>
        </Link>
        <div className="os-engine" aria-label="Runtime connection">
          <span className="os-engine-active">
            <Cpu size={15} />
            Local skills
          </span>
          <button type="button" onClick={() => setProviderInfo(true)}>
            <Command size={15} />
            {provider.configured && provider.provider !== 'LOCAL'
              ? provider.label || 'AI planner'
              : 'AI planner'}
            <i className={provider.configured && provider.provider !== 'LOCAL' ? 'online' : ''} />
          </button>
        </div>
        <div className="os-clock">
          <time>{clock.time}</time>
          <small>{clock.date.toUpperCase()}</small>
        </div>
      </header>

      <div className="os-subheader">
        <div className="os-workspace-mode">
          <button className={mode === 'DEMO' ? 'active' : ''} onClick={() => switchMode('DEMO')}>
            DEMO
          </button>
          <button className={mode === 'LIVE' ? 'active' : ''} onClick={() => switchMode('LIVE')}>
            LIVE
          </button>
          <span>
            {mode === 'DEMO' ? 'FICTIONAL RECORDS · REAL WORKFLOWS' : 'LIVE BUSINESS WORKSPACE'}
          </span>
        </div>
        <Link href="/" className="os-workspace-link">
          Open business workspace <ArrowUpRight size={13} />
        </Link>
      </div>
      {(error || connectionError) && (
        <div className="os-error" role="alert">
          <span>{error || connectionError}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => {
              setError('');
              setConnectionError('');
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <main className="os-grid">
        <aside className="os-side os-left">
          <section className="os-panel">
            <div className="os-section-title">
              <h2>SYSTEM VITALS</h2>
              <span>BUSINESS DATA</span>
            </div>
            {[
              {
                label: 'ACTIVE OPPORTUNITIES',
                value: summary.activeLeads,
                detail: `${summary.qualifiedLeads || 0} qualified`,
                series: [],
              },
              {
                label: 'REALIZED REVENUE',
                value: money(summary.actualRevenue ?? summary.revenue),
                detail: `${money(summary.weightedPipeline)} weighted pipeline`,
                series: monthly.map((m) => Number(m.revenue) || 0),
              },
              {
                label: 'REALIZED NET PROFIT',
                value: money(summary.netProfit),
                detail: `${summary.totalClosed || 0} deals closed`,
                series: monthly.map((m) => (Number(m.revenue) || 0) - (Number(m.expenses) || 0)),
              },
            ].map((metric, index) => (
              <div className="os-vital" key={metric.label}>
                <div className="os-vital-label">
                  <span>
                    <i className={`os-metric-dot tone-${index}`} />
                    {metric.label}
                  </span>
                  <small>{index === 0 ? 'NOW' : 'ALL TIME'}</small>
                </div>
                <div className="os-vital-value">{loading ? '—' : (metric.value ?? '—')}</div>
                <p>{metric.detail}</p>
                {metric.series.length > 0 ? (
                  <MiniChart values={metric.series} />
                ) : (
                  <div className="os-segment-track">
                    {Array.from({ length: 24 }, (_, i) => (
                      <i
                        key={i}
                        className={
                          i < Math.round(((Number(summary.dataHealthScore) || 0) / 100) * 24)
                            ? 'lit'
                            : ''
                        }
                      />
                    ))}
                  </div>
                )}
                <small className="os-trend-caption">
                  {index === 0
                    ? `DATA QUALITY · ${summary.dataHealthScore ?? 0}%`
                    : 'LAST 6 MONTHS'}
                </small>
              </div>
            ))}
          </section>
          <section className="os-panel os-runtime-card">
            <div className="os-section-title">
              <h2>RUNTIME</h2>
              <span>OBSERVED</span>
            </div>
            <div className="os-runtime-stat">
              <strong>{running.length.toString().padStart(2, '0')}</strong>
              <span>active missions</span>
              <Cpu size={21} />
            </div>
            <div className="os-health-row">
              <span>Database</span>
              <b className={os.status.database === 'CONNECTED' ? 'os-good' : ''}>
                {os.status.database || 'CONNECTING'}
              </b>
            </div>
            <div className="os-health-row">
              <span>Worker</span>
              <b className={workerConnected ? 'os-good' : 'os-warn'}>
                {workerConnected ? 'CONNECTED' : loading ? 'CHECKING' : 'OFFLINE'}
              </b>
            </div>
            <div className="os-health-row">
              <span>Vault notes</span>
              <b>{os.memory.length}</b>
            </div>
            {!workerConnected && !loading && (
              <p className="os-footnote">Queued work resumes when the worker connects.</p>
            )}
          </section>
          <section className="os-panel">
            <div className="os-section-title">
              <h2>DIRECTIVES</h2>
              <span>TOP 3</span>
            </div>
            <div className="os-directives">
              {directives.length ? (
                directives.map((task) => (
                  <Link href="/?section=tasks" key={task.id}>
                    <span className="os-checkbox" />
                    <span>
                      {task.title}
                      <small>
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'No due date'}{' '}
                        · {task.assignedAgent || task.department || 'OPS'}
                      </small>
                    </span>
                    <ArrowUpRight size={12} />
                  </Link>
                ))
              ) : (
                <p className="os-muted">
                  No open directives. Run Plan today to review the operation.
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="os-core">
          <div className="os-core-connection">
            <span>
              <i className={working ? 'os-pulse' : ''} />
              {statusLabel}
            </span>
            <span>VAULT {os.memory.length ? 'CONNECTED' : 'READY'}</span>
            <span>WORKER {workerConnected ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <div className="os-galaxy-container">
            <Galaxy working={working} />
            <div className="os-orbit-label os-orbit-label-one">INTELLIGENCE / OPERATIONS</div>
            <div className="os-orbit-label os-orbit-label-two">{mode} · HUMAN IN CONTROL</div>
          </div>
          <div className="os-core-heading">
            <span className="os-eyebrow">YOUR ACQUISITIONS COPILOT</span>
            <h1>ASTRA</h1>
            <p>
              {provider.configured && provider.provider !== 'LOCAL'
                ? `${provider.label || provider.provider} planner · governed skills`
                : 'Deterministic skills · Persistent memory'}
            </p>
          </div>
          <div className="os-state-line">
            <span className={`os-state-chip ${working ? 'working' : ''}`}>
              {statusLabel.toLowerCase()}
            </span>
            <span>
              {working
                ? `${running.length} mission${running.length > 1 ? 's' : ''} in progress`
                : 'Ready for your next move'}
            </span>
            <button
              type="button"
              onClick={() => {
                setConsoleOpen(true);
                setConsoleTab('runs');
              }}
            >
              View activity <ArrowRight size={12} />
            </button>
          </div>
          <form className="os-command-form" onSubmit={submit}>
            <div className={`os-command-box ${listening ? 'listening' : ''}`}>
              <Command size={18} />
              <textarea
                ref={commandRef}
                aria-label="Command"
                placeholder="Ask Astra, or give your operation a directive…"
                value={command}
                rows={2}
                maxLength={8000}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
              <button
                className="os-send"
                type="submit"
                aria-label="Send command"
                disabled={busy || !command.trim()}
              >
                {busy ? <LoaderCircle size={17} className="os-spin" /> : <ArrowRight size={20} />}
              </button>
            </div>
            <div className="os-command-hints">
              <span>
                <kbd>↵</kbd> to send · <kbd>⇧ ↵</kbd> new line
              </span>
              <span>
                <kbd>⌘ K</kbd> focus command
              </span>
            </div>
          </form>
          <div className="os-suggestions">
            <button onClick={() => setCommand('Give me a morning brief')}>
              Morning brief <ArrowUpRight size={11} />
            </button>
            <button onClick={() => setCommand('What needs my approval?')}>
              Pending approvals <ArrowUpRight size={11} />
            </button>
            <button onClick={() => setCommand('Recall my operating preferences')}>
              Recall memory <ArrowUpRight size={11} />
            </button>
          </div>

          <section className="os-transcript">
            <div className="os-transcript-heading">
              <span className="os-section-title">
                <h2>TRANSCRIPT</h2>
                <span>{messages.length} MESSAGES</span>
              </span>
              <div className="os-transcript-controls">
                <select
                  aria-label="Mission session"
                  value={sessionId}
                  onChange={(event) => {
                    setSessionId(event.target.value);
                    selectedSessionRef.current = event.target.value;
                  }}
                >
                  <option value="">New mission</option>
                  {os.sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="New session"
                  title="New session"
                  type="button"
                  disabled={busy}
                  onClick={newSession}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div
              className="os-transcript-body"
              ref={transcriptRef}
              role="log"
              aria-label="Assistant transcript"
            >
              {messages.length ? (
                messages.map((message) => (
                  <article
                    className={`os-message ${message.role === 'USER' ? 'os-message-user' : 'os-message-assistant'}`}
                    key={message.id}
                  >
                    <div className="os-message-heading">
                      <strong>{message.role === 'USER' ? 'YOU' : 'ASTRA'}</strong>
                      <time>{time(message.createdAt, business.settings?.ownerTimezone)}</time>
                    </div>
                    <p>{message.content}</p>
                    {message.runId && (
                      <button
                        onClick={() => {
                          setConsoleOpen(true);
                          setConsoleTab('runs');
                        }}
                        className="os-message-run"
                      >
                        View mission <ArrowRight size={11} />
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="os-transcript-empty">
                  <Terminal size={18} />
                  <p>
                    Your command history lives here.
                    <br />
                    <span>Run a skill or start with “Give me a morning brief.”</span>
                  </p>
                </div>
              )}
              {sessionRuns
                .filter((run) => !terminalStatuses.has(run.status))
                .map((run) => (
                  <div className="os-message-running" key={run.id}>
                    <LoaderCircle size={13} className="os-spin" />
                    <span>
                      {run.cancelRequested
                        ? 'Cancellation requested'
                        : run.status === 'QUEUED'
                          ? 'Queued for the background worker'
                          : 'Working with your business data'}
                      …
                    </span>
                  </div>
                ))}
            </div>
          </section>
        </section>

        <aside className="os-side os-right">
          <section className="os-panel">
            <div className="os-section-title">
              <h2>SKILLS</h2>
              <span>QUICK ACCESS</span>
            </div>
            <div className="os-skills-grid">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  disabled={busy}
                  onClick={() => runSkill(skill)}
                  title={skill.description}
                >
                  <span>{skill.name}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <button className="os-text-button os-browse" onClick={() => setShowSkills(true)}>
              Browse all skills{' '}
              <span>
                {os.skills.length}
                <ArrowUpRight size={12} />
              </span>
            </button>
            <p className="os-kicker">RUNS IN THE BACKGROUND · RESULTS APPEAR HERE</p>
          </section>
          <section className="os-panel">
            <div className="os-section-title">
              <h2>MISSION CONTEXT</h2>
              <span>PROPERTY</span>
            </div>
            <label className="os-field-label" htmlFor="os-property">
              Working property
            </label>
            <select
              id="os-property"
              aria-label="Working property"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
            >
              <option value="">Entire operation</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.dealId} · {property.address}
                </option>
              ))}
            </select>
            {propertyId && (
              <p className="os-footnote">
                Underwriting, matching, offers, and risk review use this property.
              </p>
            )}
          </section>
          <section className="os-panel">
            <div className="os-section-title">
              <h2>OWNER INBOX</h2>
              <span>HUMAN CONTROL</span>
            </div>
            <Link href="/?section=approvals" className="os-approval-link">
              <ShieldCheck size={21} />
              <span>
                <strong>{pending.length}</strong> decisions waiting
              </span>
              <ArrowUpRight size={15} />
            </Link>
            <p className="os-footnote">
              Offers and consequential actions stay behind your approval.
            </p>
          </section>
          <section className="os-panel">
            <div className="os-section-title">
              <h2>MEMORY VAULT</h2>
              <button
                aria-label="Add memory note"
                title="Add memory note"
                onClick={() => setNote({ title: '', content: '', tags: '' })}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="os-memory-list">
              {os.memory.slice(0, 3).map((memory) => (
                <button
                  key={memory.id}
                  onClick={() =>
                    setNote({
                      id: memory.id,
                      title: memory.title,
                      content: memory.content,
                      tags: (memory.tags || []).join(', '),
                    })
                  }
                >
                  <FileText size={14} />
                  <span>
                    {memory.title}
                    <small>{memory.content.slice(0, 65)}</small>
                  </span>
                  <ArrowUpRight size={12} />
                </button>
              ))}
              {!os.memory.length && (
                <p className="os-muted">
                  Give Astra context that persists across sessions. Your business records remain the
                  source of truth.
                </p>
              )}
            </div>
            <button className="os-text-button os-browse" onClick={() => setShowMemory(true)}>
              Open vault{' '}
              <span>
                {os.memory.length}
                <ArrowUpRight size={12} />
              </span>
            </button>
          </section>
          <section className="os-panel os-voice">
            <div className="os-section-title">
              <h2>VOICE</h2>
              <span>BROWSER DICTATION</span>
            </div>
            <div className="os-wave" aria-hidden="true">
              {Array.from({ length: 37 }, (_, i) => (
                <i key={i} style={{ height: listening ? `${4 + ((i * 13) % 23)}px` : '3px' }} />
              ))}
            </div>
            <div className="os-voice-controls">
              <button
                aria-label={listening ? 'Stop dictation' : 'Start dictation'}
                disabled={!canDictate}
                className={listening ? 'listening' : ''}
                onClick={dictate}
              >
                <Mic size={14} />
                {listening
                  ? 'Stop listening'
                  : canDictate
                    ? 'Tap to dictate'
                    : 'Dictation unavailable'}
              </button>
              <button
                aria-label={
                  !canSpeak
                    ? 'Spoken responses unavailable'
                    : speak
                      ? 'Disable spoken responses'
                      : 'Enable spoken responses'
                }
                title={
                  canSpeak
                    ? 'Browser spoken responses'
                    : 'Spoken responses unavailable in this browser'
                }
                disabled={!canSpeak}
                onClick={() => {
                  setSpeak(!speak);
                  window.speechSynthesis?.cancel();
                }}
              >
                {speak ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <p className="os-footnote">
              {listening
                ? 'Listening. Your words appear in the command box.'
                : 'Dictate, review, then send. Browser speech services may process audio.'}
            </p>
          </section>
        </aside>
      </main>

      <section className={`os-console ${consoleOpen ? 'open' : ''}`}>
        <div className="os-console-bar">
          <button aria-label="Toggle agent console" onClick={() => setConsoleOpen(!consoleOpen)}>
            <Terminal size={15} />
            <strong>Agent console</strong>
            <span>{running.length} active</span>
            {consoleOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <div>
            <span className="os-console-status">
              <i className={workerConnected ? 'online' : ''} />
              {workerConnected ? 'WORKER CONNECTED' : 'WORKER OFFLINE'}
            </span>
            <button aria-label="Refresh OS" title="Refresh OS" onClick={() => load()}>
              <RefreshCw size={14} className={loading ? 'os-spin' : ''} />
            </button>
            <button onClick={newSession}>
              <Plus size={14} /> New mission
            </button>
          </div>
        </div>
        {consoleOpen && (
          <div className="os-console-drawer">
            <div className="os-console-tabs">
              <button
                className={consoleTab === 'runs' ? 'active' : ''}
                onClick={() => setConsoleTab('runs')}
              >
                Missions <span>{os.runs.length}</span>
              </button>
              <button
                className={consoleTab === 'events' ? 'active' : ''}
                onClick={() => setConsoleTab('events')}
              >
                Event log <span>{os.events.length}</span>
              </button>
              <p>Persisted runtime events · no shell access</p>
            </div>
            <div className="os-console-content" role="log" aria-label="Agent console">
              {consoleTab === 'runs' ? (
                sessionRuns.length ? (
                  sessionRuns.map((run) => (
                    <article className="os-run" key={run.id}>
                      <span className={`os-run-status state-${run.status.toLowerCase()}`}>
                        {run.status === 'RUNNING' ? (
                          <LoaderCircle size={12} className="os-spin" />
                        ) : run.status === 'COMPLETED' ? (
                          <Check size={12} />
                        ) : (
                          <Square size={10} />
                        )}{' '}
                        {run.status}
                      </span>
                      <div>
                        <strong>
                          {os.skills.find((skill) => skill.id === run.skillId)?.name ||
                            run.skillId ||
                            'Command'}
                        </strong>
                        <p>
                          {run.prompt ||
                            run.result?.summary ||
                            run.error?.message ||
                            'Skill execution'}
                        </p>
                        {run.result && (
                          <details>
                            <summary>View structured output</summary>
                            <pre>{JSON.stringify(run.result, null, 2)}</pre>
                          </details>
                        )}
                        {run.error && (
                          <p className="os-run-error">
                            {typeof run.error === 'string' ? run.error : run.error.message}
                          </p>
                        )}
                      </div>
                      <time>{time(run.createdAt, business.settings?.ownerTimezone)}</time>
                      {['QUEUED', 'RUNNING'].includes(run.status) && (
                        <button
                          disabled={busy || run.cancelRequested}
                          onClick={() =>
                            action({ action: 'cancelRun', id: run.id }).catch(() => {})
                          }
                        >
                          {run.cancelRequested ? 'Cancel requested' : 'Cancel'}
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="os-console-empty">
                    No missions in this session. A skill or command creates a persisted run.
                  </p>
                )
              ) : os.events.length ? (
                os.events
                  .filter(
                    (event) => !sessionId || sessionRuns.some((run) => run.id === event.runId),
                  )
                  .map((event) => (
                    <div className="os-log-event" key={event.id}>
                      <time>{time(event.createdAt, business.settings?.ownerTimezone)}</time>
                      <span>{event.level || 'INFO'}</span>
                      <p>{event.message}</p>
                      <small>{event.runId?.slice(0, 8)}</small>
                    </div>
                  ))
              ) : (
                <p className="os-console-empty">
                  Runtime events will appear as work is claimed, executed, blocked, or completed.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {note && (
        <div className="os-modal-scrim" onClick={() => setNote(null)}>
          <section
            className="os-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="os-note-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="os-modal-heading">
              <div>
                <span className="os-eyebrow">PERSISTENT MEMORY</span>
                <h2 id="os-note-title">{note.id ? 'Edit vault note' : 'New vault note'}</h2>
              </div>
              <button aria-label="Close memory editor" onClick={() => setNote(null)}>
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await action({
                    action: 'saveMemory',
                    ...note,
                    tags: note.tags
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  });
                  setNote(null);
                } catch {}
              }}
            >
              <label>
                Memory title
                <input
                  aria-label="Memory title"
                  required
                  maxLength={160}
                  value={note.title}
                  onChange={(event) => setNote({ ...note, title: event.target.value })}
                />
              </label>
              <label>
                Memory content
                <textarea
                  aria-label="Memory content"
                  required
                  maxLength={20000}
                  rows={9}
                  value={note.content}
                  onChange={(event) => setNote({ ...note, content: event.target.value })}
                />
              </label>
              <label>
                Tags
                <input
                  aria-label="Memory tags"
                  value={note.tags}
                  maxLength={500}
                  onChange={(event) => setNote({ ...note, tags: event.target.value })}
                  placeholder="acquisitions, preferences"
                />
              </label>
              <p className="os-footnote">
                Notes provide context. They cannot override financial records, permissions, or
                approval gates. Keep credentials out of the vault.
              </p>
              {error && (
                <p role="alert" className="os-modal-error">
                  {error}
                </p>
              )}
              <div className="os-modal-actions">
                {note.id && (
                  <button
                    type="button"
                    className="os-danger"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await action({ action: 'deleteMemory', id: note.id });
                        setNote(null);
                      } catch {}
                    }}
                  >
                    <Trash2 size={14} /> Delete note
                  </button>
                )}
                <button type="submit" className="os-primary" disabled={busy}>
                  {busy ? <LoaderCircle size={14} className="os-spin" /> : <Check size={14} />}Save
                  memory
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showSkills && (
        <div className="os-modal-scrim" onClick={() => setShowSkills(false)}>
          <section
            className="os-modal os-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="os-skills-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="os-modal-heading">
              <div>
                <span className="os-eyebrow">CAPABILITIES / {os.skills.length}</span>
                <h2 id="os-skills-title">Skill library</h2>
              </div>
              <button aria-label="Close skills" onClick={() => setShowSkills(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="os-skill-library">
              {os.skills.map((skill) => (
                <article key={skill.id}>
                  <div>
                    <span>{skill.agent || 'ASTRA'}</span>
                    <h3>{skill.name}</h3>
                    <p>{skill.description}</p>
                    <small>
                      {skill.requiresProperty ? 'Requires selected property' : 'Operation-wide'} ·{' '}
                      {skill.writeScope || 'read-only'}
                    </small>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void runSkill(skill);
                      if (!skill.requiresProperty || propertyId) setShowSkills(false);
                    }}
                  >
                    Run skill <ArrowRight size={14} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {showMemory && (
        <div className="os-modal-scrim" onClick={() => setShowMemory(false)}>
          <section
            className="os-modal os-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="os-vault-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="os-modal-heading">
              <div>
                <span className="os-eyebrow">CONTEXT THAT PERSISTS</span>
                <h2 id="os-vault-title">Memory vault</h2>
              </div>
              <button aria-label="Close vault" onClick={() => setShowMemory(false)}>
                <X size={18} />
              </button>
            </div>
            <button
              className="os-primary"
              onClick={() => {
                setShowMemory(false);
                setNote({ title: '', content: '', tags: '' });
              }}
            >
              <Plus size={14} /> Add memory
            </button>
            <div className="os-vault-grid">
              {os.memory.map((memory) => (
                <button
                  key={memory.id}
                  onClick={() => {
                    setShowMemory(false);
                    setNote({
                      id: memory.id,
                      title: memory.title,
                      content: memory.content,
                      tags: (memory.tags || []).join(', '),
                    });
                  }}
                >
                  <BookOpen size={18} />
                  <h3>{memory.title}</h3>
                  <p>{memory.content.slice(0, 180)}</p>
                  <small>{(memory.tags || []).join(' / ') || 'UNTAGGED'}</small>
                </button>
              ))}
              {!os.memory.length && (
                <p className="os-muted">
                  No notes yet. Add operating preferences, research notes, and business context for
                  future sessions.
                </p>
              )}
            </div>
            <p className="os-footnote">
              Stored in the canonical database, scoped to {mode}. Business facts stay in their
              source records.
            </p>
          </section>
        </div>
      )}
      {providerInfo && (
        <div className="os-modal-scrim" onClick={() => setProviderInfo(false)}>
          <section
            className="os-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="os-runtime-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="os-modal-heading">
              <div>
                <span className="os-eyebrow">RUNTIME CONNECTIONS</span>
                <h2 id="os-runtime-title">Intelligence engine</h2>
              </div>
              <button aria-label="Close runtime information" onClick={() => setProviderInfo(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="os-provider-row">
              <Cpu size={20} />
              <div>
                <strong>Local skills</strong>
                <p>Deterministic business tools, persisted missions, and approval controls.</p>
              </div>
              <span className="os-good">AVAILABLE</span>
            </div>
            <div className="os-provider-row">
              <Command size={20} />
              <div>
                <strong>
                  {provider.provider !== 'LOCAL' && provider.label ? provider.label : 'AI planner'}
                </strong>
                <p>
                  {provider.reason ||
                    'Connect an approved AI provider in the server environment to interpret broader requests.'}
                </p>
              </div>
              <span
                className={
                  provider.configured && provider.provider !== 'LOCAL' ? 'os-good' : 'os-warn'
                }
              >
                {provider.configured && provider.provider !== 'LOCAL'
                  ? 'CONNECTED'
                  : 'NOT CONFIGURED'}
              </span>
            </div>
            <p className="os-footnote">
              Every runtime uses the same governed skills. Chat cannot approve offers, sign
              documents, move money, or open a host shell. This app does not claim a connected Codex
              or Claude session.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
