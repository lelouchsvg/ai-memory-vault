'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Users,
  Wallet,
  X,
  Upload,
  AlertTriangle,
  Play,
  Pause,
  CheckSquare2,
  Handshake,
  TrendingUp,
  MapPin,
} from 'lucide-react';

type Row = { id: string; [key: string]: any };
type State = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[] | { value: string; label: string }[];
  default?: any;
  hint?: string;
};
type ModalState = {
  title: string;
  body?: ReactNode;
  fields?: Field[];
  values?: Row | Record<string, any>;
  submit?: (values: Record<string, any>) => Promise<void>;
  submitLabel?: string;
  wide?: boolean;
};
const STAGES = [
  'NEW LEAD',
  'RESEARCHING',
  'OWNERSHIP VERIFICATION',
  'SELLER OUTREACH',
  'SELLER ENGAGED',
  'SELLER QUALIFIED',
  'UNDERWRITING',
  'OFFER PREPARATION',
  'OFFER READY FOR APPROVAL',
  'OFFER SENT',
  'NEGOTIATION',
  'UNDER CONTRACT',
  'TITLE OPEN',
  'DISPOSITIONS',
  'BUYER MATCHING',
  'BUYER COMMITTED',
  'ASSIGNMENT PREPARATION',
  'CLOSING',
  'CLOSED',
  'FOLLOW-UP',
  'DEAD',
  'LOST',
  'ON HOLD',
];
const NAV = [
  { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'sellers', label: 'Sellers', icon: Users },
  { id: 'buyers', label: 'Buyers', icon: Handshake },
  { id: 'pipeline', label: 'Deal Pipeline', icon: GitBranch },
  { id: 'underwriting', label: 'Underwriting', icon: SlidersHorizontal },
  { id: 'dispositions', label: 'Dispositions', icon: Target },
  { id: 'tasks', label: 'Tasks & Deadlines', icon: ListTodo },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'closings', label: 'Closings', icon: CheckSquare2 },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'agents', label: 'Agent Center', icon: Bot },
  { id: 'approvals', label: 'Approval Inbox', icon: ShieldCheck },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
const titles: Record<string, string> = {
  search: 'Find the right record.',
  dashboard: 'Your business, in focus.',
  properties: 'Property workspace',
  sellers: 'Seller relationships',
  buyers: 'Your investor network',
  pipeline: 'Every deal. One pipeline.',
  underwriting: 'Numbers you can stand behind.',
  dispositions: 'Connect the right buyer.',
  tasks: 'Keep the next step moving.',
  documents: 'Your document library',
  closings: 'From contract to close.',
  finance: 'A clear view of your business.',
  agents: 'Your operations team',
  approvals: 'You make the call.',
  compliance: 'Guardrails for every deal',
  activity: 'The complete picture',
  settings: 'Make it your operation.',
};
const subtitles: Record<string, string> = {
  search: 'Search addresses, Deal IDs, people, companies, phone numbers, and email addresses.',
  dashboard: 'The signals, decisions, and opportunities that matter today.',
  properties: 'One source of truth for every property and every opportunity.',
  sellers: 'Manage conversations, consent, motivation, and the next follow-up.',
  buyers: 'Know their buy box. Build lasting relationships.',
  pipeline: 'Track progress with clear prerequisites and an auditable history.',
  underwriting: 'Deterministic calculations. Transparent assumptions. Clear risk.',
  dispositions: 'Ranked buyer matches, grounded in real investment criteria.',
  tasks: 'Work, reminders, and critical dates in one place.',
  documents: 'Versioned records, signatures, and supporting evidence.',
  closings: 'Track title, buyer commitments, and critical dates.',
  finance: 'Projected opportunity and recorded results, kept distinct.',
  agents: 'Structured workflows with controlled permissions and visible activity.',
  approvals: 'Review the context before an action moves forward.',
  compliance: 'Monitor consent, legal review, data quality, and deal risk.',
  activity: 'An immutable record of material decisions and changes.',
  settings: 'Business assumptions, workflow preferences, and integration readiness.',
};
const money = (n: any) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const number = (n: any) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const date = (v: any) =>
  v
    ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
const pretty = (s: any) =>
  String(s ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const active = (p: Row) => !['CLOSED', 'DEAD', 'LOST'].includes(p.stage);
function tone(status: any) {
  const s = String(status).toUpperCase();
  return /RED|FAILED|BLOCKED|REJECTED|ISSUE|LOST|DEAD|EXPIRED/.test(s)
    ? 'red'
    : /APPROV|PENDING|YELLOW|REVIEW|HOLD|NURTURE|WARM/.test(s)
      ? 'amber'
      : /GREEN|CLEAR|CLOSED|DONE|ACTIVE|VERIFIED|APPROVED|COMPLETED|HOT/.test(s)
        ? 'green'
        : 'blue';
}
function Badge({ children, status }: { children?: ReactNode; status?: any }) {
  return <span className={`badge ${tone(status ?? children)}`}>{children ?? pretty(status)}</span>;
}
function Empty({
  title = 'Nothing here yet',
  text = 'Create a record to get this workflow moving.',
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Building2 size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function FormModal({
  modal,
  close,
  busy,
  setBusy,
  onError,
}: {
  modal: ModalState;
  close: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onError: (s: string) => void;
}) {
  const [localError, setLocalError] = useState('');
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      (modal.fields ?? []).map((f) => [
        f.key,
        (Array.isArray(modal.values?.[f.key])
          ? modal.values?.[f.key].join(', ')
          : modal.values?.[f.key]) ??
          f.default ??
          (f.type === 'checkbox' ? false : ''),
      ]),
    ),
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!modal.submit) return;
    setLocalError('');
    setBusy(true);
    try {
      await modal.submit(values);
      close();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLocalError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [close, busy]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section
        className={`modal ${modal.wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={modal.title}
      >
        <div className="modal-header">
          <h2>{modal.title}</h2>
          <button className="icon-button" onClick={close} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {modal.fields ? (
          <form onSubmit={submit}>
            <div className="modal-body form-grid">
              {localError && (
                <div className="error-banner full-width" role="alert">
                  <AlertTriangle size={17} />
                  <span>{localError}</span>
                </div>
              )}
              {modal.fields.map((f) => (
                <label
                  className={`field ${['textarea', 'checkbox'].includes(f.type ?? '') ? 'full-width' : ''}`}
                  key={f.key}
                >
                  <span className="field-label">
                    {f.label}
                    {f.required && ' *'}
                  </span>
                  {f.options ? (
                    <select
                      className="input"
                      value={values[f.key]}
                      required={f.required}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {f.options.map((o) => (
                        <option
                          key={typeof o === 'string' ? o : o.value}
                          value={typeof o === 'string' ? o : o.value}
                        >
                          {typeof o === 'string' ? pretty(o) : o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'file' ? (
                    <input
                      className="input"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,text/plain"
                      required={f.required}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.files?.[0] })}
                    />
                  ) : f.type === 'textarea' ? (
                    <textarea
                      className="textarea"
                      value={values[f.key]}
                      rows={4}
                      required={f.required}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  ) : f.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(values[f.key])}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                    />
                  ) : (
                    <input
                      className="input"
                      type={f.type ?? 'text'}
                      step={f.type === 'number' ? 'any' : undefined}
                      required={f.required}
                      value={values[f.key]}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]:
                            f.type === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value,
                        })
                      }
                    />
                  )}{' '}
                  {f.hint && <span className="help">{f.hint}</span>}
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="button secondary" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? 'Saving…' : (modal.submitLabel ?? 'Save record')}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-body">{modal.body}</div>
        )}
      </section>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const requestRef = useRef(0);
  const [data, setData] = useState<State>({});
  const [mode, setMode] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [section, setSection] = useState('dashboard');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState('Overview');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [financePeriod, setFinancePeriod] = useState('ALL TIME');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'warning'>('success');
  const [modal, setModal] = useState<ModalState | null>(null);
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const rows = (key: string): Row[] => (Array.isArray(data[key]) ? data[key] : []);
  const properties = rows('properties'),
    sellers = rows('sellers'),
    buyers = rows('buyers'),
    approvals = rows('approvals'),
    tasks = rows('tasks'),
    transactions = rows('transactions'),
    activities = rows('activities'),
    deadlines = rows('deadlines');
  const pending = approvals.filter((a) =>
    ['PENDING', 'NEEDS APPROVAL', 'READY'].includes(a.status),
  );
  const settings = data.settings ?? {};
  const prop = (id: any) => properties.find((p) => p.id === id);
  const filtered = (records: Row[], q = search) =>
    records.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const load = useCallback(
    async (nextMode = mode) => {
      const request = ++requestRef.current;
      setLoading(true);
      setError('');
      try {
        const r = await fetch(`/api/state?mode=${nextMode}`, { cache: 'no-store' });
        if (r.status === 401) {
          router.replace('/login');
          return;
        }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Unable to load workspace');
        if (request === requestRef.current) setData(j);
      } catch (e) {
        if (request === requestRef.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [mode, router],
  );
  async function action(payload: Record<string, any>, message = 'Changes saved') {
    const r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, mode }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'The action could not be completed');
    await load();
    const result = j.data ?? {};
    let notice = message;
    let warning = false;
    if (['BLOCKED', 'FAILED', 'NOT CONFIGURED', 'LEGAL REVIEW REQUIRED'].includes(result.status)) {
      notice = `${payload.agent ?? 'Workflow'}: ${pretty(result.status)}. ${result.output?.message ?? 'Review the structured output and blocked tasks.'}`;
      warning = true;
    } else if (result.executionStatus === 'NOT CONFIGURED') {
      notice = 'Approval recorded. Delivery NOT CONFIGURED; no external message sent.';
      warning = true;
    } else if (result.executionStatus === 'DEMO SIMULATED') {
      notice = 'Demo approval simulated. No external message was sent.';
    } else if (result.pendingApproval) {
      notice = 'Policy change is waiting in the owner approval inbox.';
    } else if (result.paused) {
      notice = 'Internal automation is paused. No queued jobs were processed.';
      warning = true;
    } else if (payload.action === 'runJobs') {
      const blocked = (result.results ?? []).filter((r: Row) =>
        ['BLOCKED', 'FAILED'].includes(r.status),
      ).length;
      notice = `Processed ${result.processed ?? 0} queued jobs${blocked ? `; ${blocked} blocked or failed — review agent logs` : ''}.`;
      warning = blocked > 0;
    }
    setToastTone(warning ? 'warning' : 'success');
    setToast(notice);
    return j;
  }
  async function run(payload: Record<string, any>, message?: string) {
    setBusy(true);
    try {
      await action(payload, message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const saved = localStorage.getItem('tower-mode');
    if (saved === 'LIVE') setMode('LIVE');
    setDark(localStorage.getItem('tower-theme') === 'dark');
    setOnboarded(localStorage.getItem('tower-onboarded') === 'yes');
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem('tower-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function navigate(id: string) {
    setSection(id);
    setSelected(null);
    setSearch('');
    setStage('');
    setMobile(false);
  }
  function detail(p: Row) {
    setSection('properties');
    setSelected(p.id);
    setTab('Overview');
    setSearch('');
  }
  function changeMode(m: 'DEMO' | 'LIVE') {
    if (m === mode) return;
    requestRef.current++;
    setData({});
    setLoading(true);
    setMode(m);
    localStorage.setItem('tower-mode', m);
    setSelected(null);
    setSearch('');
  }
  function edit(entity: string, fields: Field[], record?: Row, title?: string) {
    setModal({
      title: title ?? `${record ? 'Edit' : 'New'} ${entity.replace(/s$/, '')}`,
      fields,
      values: record,
      submit: async (values) => {
        await action(
          {
            action: 'save',
            entity,
            record: {
              ...record,
              ...values,
              ...(entity === 'buyers'
                ? Object.fromEntries(
                    ['markets', 'counties', 'propertyTypes'].map((k) => [
                      k,
                      typeof values[k] === 'string'
                        ? values[k]
                            .split(',')
                            .map((v: string) => v.trim())
                            .filter(Boolean)
                        : values[k],
                    ]),
                  )
                : {}),
              ...(entity === 'documents' && values.url ? { source: values.url } : {}),
            },
          },
          `${pretty(entity.replace(/s$/, ''))} saved`,
        );
      },
    });
  }
  const propertyFields: Field[] = [
    { key: 'address', label: 'Street address', required: true },
    { key: 'city', label: 'City', required: true },
    { key: 'county', label: 'County', required: true },
    { key: 'state', label: 'State', required: true, default: 'NJ' },
    { key: 'zip', label: 'ZIP code', required: true },
    {
      key: 'propertyType',
      label: 'Property type',
      options: ['SINGLE FAMILY', 'MULTI FAMILY', 'CONDO', 'TOWNHOUSE', 'LAND', 'OTHER'],
      default: 'SINGLE FAMILY',
    },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', default: 3 },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number', default: 2 },
    { key: 'sqft', label: 'Square feet', type: 'number', required: true },
    { key: 'yearBuilt', label: 'Year built', type: 'number' },
    {
      key: 'sellerId',
      label: 'Seller',
      options: sellers.map((s) => ({ value: s.id, label: s.name })),
    },
    { key: 'leadSource', label: 'Lead source', default: 'Manual' },
    { key: 'askingPrice', label: 'Seller asking price ($)', type: 'number' },
    { key: 'ownershipEntity', label: 'Ownership entity' },
    { key: 'ownershipVerified', label: 'Ownership verified from evidence', type: 'checkbox' },
    { key: 'ownershipSource', label: 'Ownership source' },
    {
      key: 'ownershipRetrievedAt',
      label: 'Ownership evidence retrieval date',
      type: 'date',
      default: new Date().toISOString().slice(0, 10),
    },
    { key: 'ownershipConfidence', label: 'Ownership confidence (0–100)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const sellerFields: Field[] = [
    { key: 'name', label: 'Full name', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone (international format)' },
    {
      key: 'status',
      label: 'Relationship status',
      options: [
        'NEW',
        'UNCONTACTED',
        'ATTEMPTED',
        'CONNECTED',
        'QUALIFIED',
        'HOT',
        'WARM',
        'NURTURE',
        'NEGOTIATING',
        'AGREEMENT',
        'CLOSED',
        'DO NOT CONTACT',
        'DEAD',
      ],
      default: 'NEW',
    },
    {
      key: 'contactPreference',
      label: 'Preferred contact method',
      options: ['EMAIL', 'PHONE', 'SMS', 'NONE'],
    },
    { key: 'contactSource', label: 'Contact data source' },
    { key: 'consent', label: 'Contact consent recorded', type: 'checkbox' },
    { key: 'doNotContact', label: 'Do not contact / opted out', type: 'checkbox' },
    { key: 'motivation', label: 'Seller motivation' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'nextFollowUp', label: 'Next follow-up', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const buyerFields: Field[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone' },
    {
      key: 'buyerType',
      label: 'Strategy',
      options: [
        'FLIPPER',
        'LANDLORD',
        'BRRRR',
        'DEVELOPER',
        'WHOLESALER',
        'INSTITUTIONAL',
        'OTHER',
      ],
      default: 'FLIPPER',
    },
    { key: 'markets', label: 'Markets (comma separated)', default: 'NJ' },
    { key: 'counties', label: 'Counties (comma separated)', default: 'Atlantic' },
    { key: 'propertyTypes', label: 'Property types (comma separated)', default: 'SINGLE FAMILY' },
    { key: 'minPrice', label: 'Minimum price ($)', type: 'number', default: 0 },
    { key: 'maxPrice', label: 'Maximum price ($)', type: 'number', default: 300000 },
    { key: 'maxRehab', label: 'Maximum rehab ($)', type: 'number', default: 75000 },
    { key: 'minBedrooms', label: 'Minimum bedrooms', type: 'number', default: 2 },
    { key: 'minSqft', label: 'Minimum square feet', type: 'number', default: 800 },
    { key: 'targetMargin', label: 'Target margin (%)', type: 'number', default: 20 },
    { key: 'closeSpeedDays', label: 'Typical days to close', type: 'number', default: 21 },
    {
      key: 'tier',
      label: 'Buyer tier',
      options: ['NEW', 'VERIFIED', 'ACTIVE', 'PREFERRED', 'VIP', 'INACTIVE', 'BLOCKED'],
      default: 'NEW',
    },
    {
      key: 'proofOfFundsStatus',
      label: 'Proof of funds',
      options: ['NOT PROVIDED', 'VERIFIED', 'EXPIRED'],
      default: 'NOT PROVIDED',
    },
    { key: 'proofOfFundsExpiry', label: 'Proof of funds expiration', type: 'date' },
    { key: 'consent', label: 'Contact consent recorded', type: 'checkbox' },
    { key: 'doNotContact', label: 'Do not contact', type: 'checkbox' },
    { key: 'notes', label: 'Relationship notes', type: 'textarea' },
  ];
  function addComp(p: Row) {
    edit(
      'comps',
      [
        {
          key: 'propertyId',
          label: 'Property',
          options: [{ value: p.id, label: p.address }],
          default: p.id,
          required: true,
        },
        { key: 'address', label: 'Comparable address', required: true },
        { key: 'salePrice', label: 'Sale price ($)', type: 'number', required: true },
        { key: 'sqft', label: 'Square feet', type: 'number', required: true },
        { key: 'saleDate', label: 'Sale date', type: 'date', required: true },
        { key: 'distance', label: 'Distance (miles)', type: 'number', default: 0.5 },
        { key: 'bedrooms', label: 'Bedrooms', type: 'number', default: p.bedrooms },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number', default: p.bathrooms },
        { key: 'propertyType', label: 'Property type', default: p.propertyType },
        { key: 'source', label: 'Source / reference URL', required: true },
        { key: 'excluded', label: 'Exclude from ARV calculation', type: 'checkbox' },
      ],
      undefined,
      'Add comparable sale',
    );
  }
  function addRepair(p: Row) {
    edit(
      'repairs',
      [
        {
          key: 'propertyId',
          label: 'Property',
          options: [{ value: p.id, label: p.address }],
          default: p.id,
          required: true,
        },
        {
          key: 'category',
          label: 'Category',
          options: [
            'roof',
            'foundation',
            'HVAC',
            'electrical',
            'plumbing',
            'kitchen',
            'bathrooms',
            'flooring',
            'windows',
            'doors',
            'paint',
            'drywall',
            'exterior',
            'landscaping',
            'structural',
            'permits',
            'miscellaneous',
          ],
          required: true,
        },
        { key: 'low', label: 'Low estimate ($)', type: 'number', required: true },
        { key: 'expected', label: 'Expected estimate ($)', type: 'number', required: true },
        { key: 'high', label: 'High estimate ($)', type: 'number', required: true },
        {
          key: 'assumptions',
          label: 'Scope, source, and assumptions',
          type: 'textarea',
          required: true,
        },
      ],
      undefined,
      'Add repair estimate',
    );
  }
  function requestOffer(p: Row) {
    setModal({
      title: 'Prepare offer for approval',
      fields: [
        {
          key: 'amount',
          label: 'Proposed offer ($)',
          type: 'number',
          required: true,
          default: p.recommendedOffer ?? p.mao,
        },
        {
          key: 'reason',
          label: 'Recommendation and supporting context',
          type: 'textarea',
          required: true,
        },
        {
          key: 'overrideReason',
          label: 'Owner override reason (required above MAO)',
          type: 'textarea',
        },
      ],
      submit: async (v) => {
        await action(
          { action: 'requestOffer', propertyId: p.id, ...v },
          'Offer sent to the approval inbox',
        );
      },
    });
  }
  function transition(p: Row) {
    setModal({
      title: 'Update deal stage',
      wide: true,
      fields: [
        { key: 'stage', label: 'Next stage', options: STAGES, required: true, default: p.stage },
        { key: 'reason', label: 'Reason for transition', required: true },
        {
          key: 'contractPrice',
          label: 'Contract price ($)',
          type: 'number',
          default: p.contractPrice,
        },
        {
          key: 'executionDate',
          label: 'Execution date',
          type: 'date',
          default: p.executionDate?.slice(0, 10),
        },
        {
          key: 'closingDate',
          label: 'Closing deadline',
          type: 'date',
          default: p.closingDate?.slice(0, 10),
        },
        { key: 'inspectionDeadline', label: 'Inspection deadline', type: 'date' },
        {
          key: 'signedDocumentId',
          label: 'Signed document',
          options: rows('documents')
            .filter((d) => d.propertyId === p.id)
            .map((d) => ({
              value: d.id,
              label: `${d.name ?? d.title} · ${d.status ?? d.approvalStatus}`,
            })),
        },
        {
          key: 'ownerApproved',
          label: 'I confirm owner approval and the recorded contract evidence',
          type: 'checkbox',
        },
      ],
      submit: async (v) => {
        await action({ action: 'transition', propertyId: p.id, ...v }, 'Deal stage updated');
      },
    });
  }
  function selectBuyer(p: Row) {
    setModal({
      title: 'Record buyer commitment',
      fields: [
        {
          key: 'buyerId',
          label: 'Committed buyer',
          required: true,
          options: buyers.map((b) => ({
            value: b.id,
            label: `${b.name} · ${b.company ?? b.tier}`,
          })),
        },
        {
          key: 'assignmentPrice',
          label: 'Assignment purchase price ($)',
          type: 'number',
          required: true,
          default: p.targetAssignmentPrice,
        },
        { key: 'reason', label: 'Commitment evidence / notes', type: 'textarea', required: true },
      ],
      submit: async (v) => {
        await action(
          { action: 'selectBuyer', propertyId: p.id, ...v },
          'Buyer commitment recorded',
        );
      },
    });
  }
  function recordClosing(p: Row) {
    setModal({
      title: 'Record completed closing',
      fields: [
        {
          key: 'amount',
          label: 'Actual assignment revenue ($)',
          type: 'number',
          required: true,
          default: p.projectedAssignmentFee,
        },
        {
          key: 'date',
          label: 'Closing date',
          type: 'date',
          required: true,
          default: new Date().toISOString().slice(0, 10),
        },
        { key: 'reason', label: 'Settlement statement reference', required: true },
        {
          key: 'confirmed',
          label: 'I confirm the closing and revenue from settlement records',
          type: 'checkbox',
        },
      ],
      submit: async (v) => {
        if (!v.confirmed)
          throw new Error('Confirm the completed closing before recording revenue.');
        await action(
          { action: 'close', propertyId: p.id, ...v, fundingConfirmed: v.confirmed },
          'Closing, revenue, and postmortem recorded',
        );
      },
    });
  }
  function addTask(p?: Row) {
    edit(
      'tasks',
      [
        { key: 'title', label: 'Task title', required: true },
        {
          key: 'propertyId',
          label: 'Property',
          options: properties.map((p) => ({ value: p.id, label: `${p.dealId} · ${p.address}` })),
          default: p?.id,
        },
        { key: 'department', label: 'Department', default: 'Operations' },
        {
          key: 'assignedAgent',
          label: 'Assigned agent',
          options: rows('agents').map((a) => a.name),
        },
        {
          key: 'priority',
          label: 'Priority',
          options: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          default: 'MEDIUM',
        },
        {
          key: 'status',
          label: 'Status',
          options: [
            'BACKLOG',
            'READY',
            'IN PROGRESS',
            'BLOCKED',
            'NEEDS APPROVAL',
            'DONE',
            'FAILED',
          ],
          default: 'READY',
        },
        { key: 'dueDate', label: 'Due date', type: 'date', required: true },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'dependencyId', label: 'Dependency task ID' },
      ],
      undefined,
      'Create task',
    );
  }
  function addTransaction(p?: Row) {
    edit(
      'transactions',
      [
        {
          key: 'propertyId',
          label: 'Property',
          options: properties.map((p) => ({ value: p.id, label: `${p.dealId} · ${p.address}` })),
          default: p?.id,
        },
        {
          key: 'type',
          label: 'Entry type',
          options: ['EXPENSE', 'REVENUE'],
          default: 'EXPENSE',
          required: true,
        },
        {
          key: 'category',
          label: 'Category',
          options: [
            'Marketing',
            'Data',
            'Software',
            'Legal',
            'Title',
            'Inspection',
            'Travel',
            'Contractor',
            'Administrative',
            'Assignment Fee',
            'Other',
          ],
          default: 'Other',
        },
        { key: 'amount', label: 'Amount ($)', type: 'number', required: true },
        {
          key: 'date',
          label: 'Date',
          type: 'date',
          required: true,
          default: new Date().toISOString().slice(0, 10),
        },
        { key: 'description', label: 'Description / source', required: true },
      ],
      undefined,
      'Record financial entry',
    );
  }
  function addDocument(p?: Row) {
    edit(
      'documents',
      [
        {
          key: 'propertyId',
          label: 'Property',
          options: properties.map((p) => ({ value: p.id, label: `${p.dealId} · ${p.address}` })),
          default: p?.id,
          required: true,
        },
        { key: 'name', label: 'Document name', required: true },
        {
          key: 'type',
          label: 'Document type',
          options: [
            'Purchase Agreement',
            'Assignment Agreement',
            'Disclosure',
            'Proof of Funds',
            'Title Document',
            'Inspection',
            'Photo',
            'Comp Report',
            'Repair Estimate',
            'Closing Statement',
            'Other',
          ],
          required: true,
        },
        {
          key: 'url',
          label: 'Secure storage URL / reference',
          required: true,
          hint: 'Register an existing document reference. No document is generated or signed.',
        },
        { key: 'version', label: 'Version', type: 'number', default: 1 },
        {
          key: 'status',
          label: 'Document status',
          options: ['DRAFT', 'REVIEW', 'APPROVED', 'SIGNED'],
          default: 'DRAFT',
        },
        { key: 'notes', label: 'Evidence / notes', type: 'textarea' },
      ],
      undefined,
      'Register document',
    );
  }
  function uploadDocument(property?: Row) {
    setModal({
      title: 'Upload document',
      fields: [
        {
          key: 'propertyId',
          label: 'Property',
          options: properties.map((p) => ({ value: p.id, label: `${p.dealId} · ${p.address}` })),
          default: property?.id,
          required: true,
        },
        {
          key: 'type',
          label: 'Document type',
          options: [
            'Purchase Agreement',
            'Assignment Agreement',
            'Disclosure',
            'Proof of Funds',
            'Title Document',
            'Inspection',
            'Photo',
            'Comp Report',
            'Repair Estimate',
            'Closing Statement',
            'Other',
          ],
          default: 'Other',
          required: true,
        },
        {
          key: 'file',
          label: 'PDF, PNG, JPEG, or plain text · up to 10 MB',
          type: 'file',
          required: true,
        },
      ],
      submitLabel: 'Upload securely',
      submit: async (v) => {
        const form = new FormData();
        form.set('mode', mode);
        form.set('propertyId', v.propertyId);
        form.set('type', v.type);
        form.set('file', v.file);
        const response = await fetch('/api/documents', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Upload failed');
        await load();
        setToast('Document uploaded and stored securely');
      },
    });
  }
  function onboarding() {
    setModal({
      title: 'Welcome to your Control Tower',
      fields: [
        {
          key: 'companyName',
          label: 'Company name',
          required: true,
          default: settings.companyName ?? 'My Acquisitions',
        },
        { key: 'primaryMarket', label: 'Primary market', default: 'New Jersey' },
        { key: 'targetCounties', label: 'Target counties (comma separated)', default: 'Atlantic' },
        { key: 'propertyType', label: 'Typical property type', default: 'SINGLE FAMILY' },
        {
          key: 'minimumAssignmentFee',
          label: 'Minimum assignment fee ($)',
          type: 'number',
          default: 15000,
        },
        {
          key: 'targetInvestorMargin',
          label: 'Preferred investor margin (%)',
          type: 'number',
          default: 20,
        },
        { key: 'repairContingency', label: 'Repair contingency (%)', type: 'number', default: 15 },
        { key: 'ownerTimezone', label: 'Owner time zone', default: 'America/New_York' },
      ],
      submitLabel: 'Save workspace preferences',
      submit: async (v) => {
        await action(
          { action: 'settings', settings: { ...settings, ...v, onboardingComplete: true } },
          'Workspace preferences saved',
        );
        localStorage.setItem('tower-onboarded', 'yes');
        setOnboarded(true);
      },
    });
  }
  const link = (p: Row) => (
    <button className="entity-link" onClick={() => detail(p)}>
      {p.address}
      <small>
        {p.city}, {p.state} {p.zip}
      </small>
    </button>
  );
  const table = (headers: string[], body: ReactNode, empty = false) =>
    empty ? (
      <Empty />
    ) : (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    );
  const propertyTable = (list: Row[]) =>
    table(
      ['Property / Deal ID', 'Stage', 'ARV', 'Est. repairs', 'Projected fee', 'Risk', ''],
      list.map((p) => (
        <tr key={p.id}>
          <td>
            {link(p)}
            <span className="mono table-subtext">{p.dealId}</span>
          </td>
          <td>
            <Badge status={p.stage} />
          </td>
          <td className="numeric">{money(p.arvBase)}</td>
          <td className="numeric">{money(p.repairExpected)}</td>
          <td className="numeric emphasized">{money(p.projectedAssignmentFee)}</td>
          <td>
            <Badge status={p.riskGrade ?? 'Not reviewed'} />
          </td>
          <td>
            <button
              className="icon-button"
              aria-label={`Open ${p.address}`}
              onClick={() => detail(p)}
            >
              <ChevronRight size={18} />
            </button>
          </td>
        </tr>
      )),
      !list.length,
    );
  function editApproval(a: Row) {
    if (a.action === 'PROPOSED POLICY CHANGE') {
      setModal({
        title: 'Edit proposed policy',
        wide: true,
        fields: [
          {
            key: 'settings',
            label: 'Proposed settings (JSON)',
            type: 'textarea',
            required: true,
            default: JSON.stringify(a.payload?.settings ?? {}, null, 2),
          },
          {
            key: 'reason',
            label: 'Reason for edit and approval',
            type: 'textarea',
            required: true,
          },
        ],
        submitLabel: 'Approve edited policy',
        submit: async (v) => {
          let proposed: unknown;
          try {
            proposed = JSON.parse(v.settings);
          } catch {
            throw new Error('Enter valid JSON settings.');
          }
          if (!proposed || Array.isArray(proposed) || typeof proposed !== 'object')
            throw new Error('Settings must be a JSON object.');
          await action(
            {
              action: 'approval',
              id: a.id,
              decision: 'APPROVED',
              reason: v.reason,
              payload: { ...a.payload, settings: proposed },
            },
            'Edited policy approved',
          );
        },
      });
    } else {
      setModal({
        title: 'Edit proposed action',
        fields: [
          {
            key: 'amount',
            label: 'Revised amount ($)',
            type: 'number',
            default: a.amount ?? a.payload?.amount,
          },
          { key: 'reason', label: 'Reason for edit', type: 'textarea', required: true },
          {
            key: 'overrideReason',
            label: 'Owner override reason (if above MAO)',
            type: 'textarea',
          },
        ],
        submit: async (v) => {
          await action(
            {
              action: 'approval',
              id: a.id,
              decision: 'APPROVED',
              reason: v.reason,
              overrideReason: v.overrideReason,
              payload: { ...a.payload, amount: v.amount },
            },
            'Edited action approved',
          );
        },
      });
    }
  }
  function ApprovalCard({ a }: { a: Row }) {
    const p = prop(a.propertyId);
    return (
      <article className="approval-card">
        <div className="card-topline">
          <Badge status={a.status} />
          <span className="muted">{date(a.createdAt)}</span>
        </div>
        <h3>{pretty(a.action ?? a.type ?? 'Review action')}</h3>
        {p && (
          <button className="entity-link" onClick={() => detail(p)}>
            {p.address}
            <small>{p.dealId}</small>
          </button>
        )}
        <p className="card-description">
          {a.reason ?? a.description ?? 'Review supporting information before deciding.'}
        </p>
        <div className="metric-row">
          <span>Financial impact</span>
          <strong>{money(a.amount ?? a.payload?.amount)}</strong>
        </div>
        {a.risk && (
          <p>
            <Badge status={a.risk} />
          </p>
        )}
        {a.payload && (
          <details>
            <summary>Supporting data</summary>
            <pre className="json-output">{JSON.stringify(a.payload, null, 2)}</pre>
          </details>
        )}
        {['PENDING', 'NEEDS APPROVAL', 'READY'].includes(a.status) && (
          <div className="approval-actions">
            <button
              className="button primary small"
              disabled={busy}
              onClick={() =>
                run(
                  {
                    action: 'approval',
                    id: a.id,
                    decision: 'APPROVED',
                    reason: 'Owner reviewed and approved supporting data',
                  },
                  'Approval recorded',
                )
              }
            >
              <Check size={15} /> Approve
            </button>
            <button className="button secondary small" onClick={() => editApproval(a)}>
              Edit
            </button>
            <button
              className="button danger small"
              onClick={() =>
                setModal({
                  title: 'Reject proposed action',
                  fields: [
                    {
                      key: 'reason',
                      label: 'Reason for rejection',
                      type: 'textarea',
                      required: true,
                    },
                  ],
                  submitLabel: 'Reject action',
                  submit: async (v) => {
                    await action(
                      { action: 'approval', id: a.id, decision: 'REJECTED', reason: v.reason },
                      'Action rejected',
                    );
                  },
                })
              }
            >
              Reject
            </button>
          </div>
        )}
      </article>
    );
  }
  function ActivityList({ list }: { list: Row[] }) {
    return list.length ? (
      <div className="activity-list">
        {list.map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="activity-dot">
              <Activity size={13} />
            </span>
            <div className="activity-content">
              <strong>{pretty(a.action ?? a.title ?? a.type)}</strong>
              <p>{a.reason ?? a.description ?? a.entityType ?? a.entity}</p>
              <span className="muted">
                {a.actorEmail ?? a.actor ?? a.agent ?? 'System'} ·{' '}
                {a.propertyId ? (prop(a.propertyId)?.dealId ?? a.propertyId) : (a.entityId ?? '')}
              </span>
              {(a.oldValue || a.newValue) && (
                <details>
                  <summary>View recorded change</summary>
                  <pre className="json-output">
                    {JSON.stringify({ before: a.oldValue, after: a.newValue }, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <time className="activity-time">{date(a.createdAt ?? a.timestamp)}</time>
          </div>
        ))}
      </div>
    ) : (
      <Empty
        title="No activity yet"
        text="Material changes appear here with their actor, context, and timestamp."
      />
    );
  }
  function Dashboard() {
    const live = properties.filter(active);
    const summary = data.summary ?? {};
    const projected = summary.projectedAssignmentRevenue ?? 0;
    const revenue = summary.actualRevenue ?? 0;
    const expenses = summary.totalExpenses ?? 0;
    const weighted = summary.weightedPipeline ?? 0;
    const stats = [
      {
        label: 'Active opportunities',
        value: number(live.length),
        detail: `${properties.filter((p) => p.stage === 'NEW LEAD').length} new leads in your pipeline`,
        icon: Building2,
      },
      {
        label: 'Projected assignment revenue',
        value: money(projected),
        detail: `${money(weighted)} probability-weighted`,
        icon: TrendingUp,
      },
      {
        label: 'Realized revenue',
        value: money(revenue),
        detail: `${properties.filter((p) => p.stage === 'CLOSED').length} completed deals`,
        icon: CircleDollarSign,
      },
      {
        label: 'Net profit',
        value: money(summary.netProfit),
        detail: `${money(expenses)} in recorded expenses`,
        icon: Wallet,
      },
    ];
    const groups = [
      [
        'Research & qualify',
        [
          'NEW LEAD',
          'RESEARCHING',
          'OWNERSHIP VERIFICATION',
          'SELLER OUTREACH',
          'SELLER ENGAGED',
          'SELLER QUALIFIED',
        ],
      ],
      ['Underwriting', ['UNDERWRITING', 'OFFER PREPARATION', 'OFFER READY FOR APPROVAL']],
      ['Offer & negotiation', ['OFFER SENT', 'NEGOTIATION']],
      ['Under contract', ['UNDER CONTRACT', 'TITLE OPEN']],
      [
        'Dispositions',
        ['DISPOSITIONS', 'BUYER MATCHING', 'BUYER COMMITTED', 'ASSIGNMENT PREPARATION'],
      ],
      ['Closing', ['CLOSING']],
    ] as [string, string[]][];
    return (
      <>
        <div className="stats-grid">
          {stats.map((s) => (
            <div className="stat-card" key={s.label}>
              <div className="stat-label">
                {s.label}
                <s.icon size={17} />
              </div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-detail">{s.detail}</div>
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          <Panel
            title="Pipeline overview"
            subtitle="A clear path from first lead to final close"
            action={
              <button className="text-button" onClick={() => navigate('pipeline')}>
                View pipeline <ArrowRight size={14} />
              </button>
            }
          >
            <div className="pipeline-bars">
              {groups.map(([name, stages], i) => {
                const n = properties.filter((p) => stages.includes(p.stage)).length;
                return (
                  <div className="pipeline-row" key={name}>
                    <span>{name}</span>
                    <div className="pipeline-track">
                      <div
                        className={`pipeline-fill fill-${i}`}
                        style={{
                          width: `${Math.max(n ? 4 : 0, (n / Math.max(...groups.map(([, s]) => properties.filter((p) => s.includes(p.stage)).length), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{n}</strong>
                  </div>
                );
              })}
            </div>
            <div className="panel-footer">
              <span className="status-dot green" />
              {properties.filter((p) => p.stage === 'CLOSED').length} closed deals across all time
            </div>
          </Panel>
          <Panel
            title="Revenue & expenses"
            subtitle="Recorded transactions by month"
            action={<Badge status={mode} />}
          >
            <FinanceChart months={data.summary?.monthly ?? []} />
            <div className="chart-legend">
              <span>
                <i className="legend-dot revenue" />
                Revenue
              </span>
              <span>
                <i className="legend-dot expense" />
                Expenses
              </span>
            </div>
          </Panel>
        </div>
        <div className="dashboard-grid">
          <Panel
            title="Decisions waiting for you"
            subtitle="Owner approval keeps consequential actions in your hands"
            action={
              <button className="text-button" onClick={() => navigate('approvals')}>
                {pending.length} pending <ArrowRight size={14} />
              </button>
            }
          >
            <div className="compact-approvals">
              {pending.slice(0, 3).map((a) => (
                <button key={a.id} className="decision-row" onClick={() => navigate('approvals')}>
                  <span className="decision-icon">
                    <ShieldCheck size={18} />
                  </span>
                  <span>
                    <strong>{pretty(a.action ?? a.type)}</strong>
                    <small>{prop(a.propertyId)?.address ?? a.reason}</small>
                  </span>
                  <strong>{money(a.amount ?? a.payload?.amount)}</strong>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!pending.length && (
                <Empty
                  title="You're all caught up"
                  text="New offers and consequential actions will appear here for review."
                />
              )}
            </div>
          </Panel>
          <Panel
            title="Coming up next"
            subtitle="Deadlines and next actions that need attention"
            action={
              <button className="text-button" onClick={() => navigate('tasks')}>
                All tasks <ArrowRight size={14} />
              </button>
            }
          >
            <div className="deadline-list">
              {[
                ...deadlines.filter((d) => !['DONE', 'COMPLETED'].includes(d.status)),
                ...tasks.filter((t) => !['DONE', 'FAILED'].includes(t.status)),
              ]
                .sort((a, b) =>
                  String(a.dueDate ?? a.date).localeCompare(String(b.dueDate ?? b.date)),
                )
                .slice(0, 4)
                .map((t) => (
                  <div className="deadline-item" key={t.id}>
                    <span className="deadline-date">
                      <Clock3 size={16} />
                      {date(t.dueDate ?? t.date)}
                    </span>
                    <div>
                      <strong>{t.title ?? t.type}</strong>
                      <small>{prop(t.propertyId)?.address ?? t.description}</small>
                    </div>
                    <Badge status={t.priority ?? t.status} />
                  </div>
                ))}
              {!tasks.length && !deadlines.length && (
                <Empty
                  title="No upcoming work"
                  text="Tasks and contract deadlines appear here automatically."
                />
              )}
            </div>
          </Panel>
        </div>
        <Panel
          title="Top opportunities"
          subtitle="Prioritized by lead score, with transparent deal economics"
          action={
            <button className="text-button" onClick={() => navigate('properties')}>
              All properties <ArrowRight size={14} />
            </button>
          }
        >
          {propertyTable(
            [...live].sort((a, b) => Number(b.leadScore) - Number(a.leadScore)).slice(0, 5),
          )}
        </Panel>
        <div className="dashboard-grid">
          <Panel title="Operational pulse" subtitle="Recent material actions across your business">
            <ActivityList list={activities.slice(0, 4)} />
          </Panel>
          <Panel title="Lead source performance" subtitle="Where opportunities enter your pipeline">
            <div className="panel-body">
              {Object.entries(
                properties.reduce(
                  (a: Record<string, number>, p) => ({
                    ...a,
                    [p.leadSource ?? 'Manual']: (a[p.leadSource ?? 'Manual'] ?? 0) + 1,
                  }),
                  {},
                ),
              ).map(([source, count]) => (
                <div className="metric-row" key={source}>
                  <span>{source}</span>
                  <strong>{Number(count)} leads</strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </>
    );
  }
  function SearchResults() {
    const pp = filtered(properties),
      ss = filtered(sellers),
      bb = filtered(buyers);
    return search.trim() ? (
      <>
        <div className="toolbar">
          <Badge status={`${pp.length + ss.length + bb.length} RESULTS`} />
          <span className="muted">
            Results for “{search}” in {mode.toLowerCase()} records
          </span>
        </div>
        <Panel title={`Properties (${pp.length})`}>{propertyTable(pp)}</Panel>
        <Panel title={`Sellers (${ss.length})`}>
          {table(
            ['Seller', 'Phone', 'Email', 'Status', ''],
            ss.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="entity-link" onClick={() => edit('sellers', sellerFields, r)}>
                    {r.name}
                  </button>
                </td>
                <td>{r.phone ?? '—'}</td>
                <td>{r.email ?? '—'}</td>
                <td>
                  <Badge status={r.status} />
                </td>
                <td>
                  <button
                    className="button secondary small"
                    onClick={() => edit('sellers', sellerFields, r)}
                  >
                    Open record
                  </button>
                </td>
              </tr>
            )),
            !ss.length,
          )}
        </Panel>
        <Panel title={`Buyers (${bb.length})`}>
          {table(
            ['Buyer', 'Company', 'Phone', 'Email', ''],
            bb.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="entity-link" onClick={() => edit('buyers', buyerFields, r)}>
                    {r.name}
                  </button>
                </td>
                <td>{r.company ?? '—'}</td>
                <td>{r.phone ?? '—'}</td>
                <td>{r.email ?? '—'}</td>
                <td>
                  <button
                    className="button secondary small"
                    onClick={() => edit('buyers', buyerFields, r)}
                  >
                    Open record
                  </button>
                </td>
              </tr>
            )),
            !bb.length,
          )}
        </Panel>
      </>
    ) : (
      <Empty
        title="Search your workspace"
        text="Enter an address, Deal ID, person, company, phone, or email in the search field above."
      />
    );
  }
  function Properties() {
    const list = filtered(properties).filter((p) => !stage || p.stage === stage);
    return (
      <>
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              className="search-input"
              placeholder="Search address, Deal ID, market…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-input"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            aria-label="Filter stage"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="muted">{list.length} properties</span>
          <button
            className="button secondary small"
            onClick={() =>
              setModal({
                title: 'Import property CSV',
                wide: true,
                fields: [
                  {
                    key: 'csv',
                    label: 'CSV including address,city,county,state,zip,sqft,leadSource',
                    type: 'textarea',
                    required: true,
                    hint: 'The import validates records and reports duplicates. Include a header row.',
                  },
                ],
                submitLabel: 'Import records',
                submit: async (v) => {
                  const result = await action(
                    { action: 'import', csv: v.csv },
                    'Property CSV processed',
                  );
                  setToast(`Import completed: ${JSON.stringify(result)}`);
                },
              })
            }
          >
            <Upload size={15} /> Import CSV
          </button>
        </div>
        <Panel
          title="All properties"
          subtitle="Permanent Deal IDs connect every record, task, and decision"
        >
          {propertyTable(list)}
        </Panel>
      </>
    );
  }
  function PropertyDetail({ p }: { p: Row }) {
    const comps = rows('comps').filter((c) => c.propertyId === p.id),
      repairs = rows('repairs').filter((c) => c.propertyId === p.id),
      ptasks = tasks.filter((c) => c.propertyId === p.id),
      docs = rows('documents').filter((c) => c.propertyId === p.id),
      matches = rows('matches').filter((c) => c.propertyId === p.id),
      closing = rows('closings').find((c) => c.propertyId === p.id),
      seller = sellers.find((s) => s.id === p.sellerId);
    const tabs = [
      'Overview',
      'Seller',
      'Underwriting',
      'Comps',
      'Repairs',
      'Buyers',
      'Documents',
      'Tasks',
      'Closing',
      'Financials',
      'Activity',
      'AI Analysis',
    ];
    return (
      <>
        <div className="detail-header">
          <div>
            <button className="text-button" onClick={() => setSelected(null)}>
              ← All properties
            </button>
            <h1>{p.address}</h1>
            <p>
              <MapPin size={14} />
              {p.city}, {p.county} County, {p.state} {p.zip}
              <span className="mono">{p.dealId}</span>
              <Badge status={p.stage} />
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary"
              onClick={() => edit('properties', propertyFields, p)}
            >
              Edit property
            </button>
            <button className="button primary" onClick={() => transition(p)}>
              Update stage <ChevronDown size={15} />
            </button>
          </div>
        </div>
        <div className="detail-stats">
          {[
            ['ARV · base', money(p.arvBase)],
            ['Expected repairs', money(p.repairExpected)],
            ['Maximum offer', money(p.mao)],
            ['Projected fee', money(p.projectedAssignmentFee)],
            ['Est. close probability', `${p.probability ?? p.dealProbability ?? 0}%`],
            ['Risk review', p.riskGrade ?? 'Not reviewed'],
          ].map(([l, v]) => (
            <div className="detail-stat" key={l}>
              <span>{l}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              className={`tab ${tab === t ? 'active' : ''}`}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
              {t === 'Tasks' && ` (${ptasks.length})`}
            </button>
          ))}
        </div>
        {tab === 'Overview' && (
          <div className="two-columns">
            <Panel
              title="Property overview"
              subtitle="Facts, source information, and operating context"
            >
              <div className="panel-body">
                <div className="form-grid">
                  {[
                    ['Property type', pretty(p.propertyType)],
                    ['Bedrooms / bathrooms', `${p.bedrooms ?? '—'} bd / ${p.bathrooms ?? '—'} ba`],
                    ['Square footage', number(p.sqft)],
                    ['Year built', p.yearBuilt ?? '—'],
                    ['Lead source', p.leadSource ?? 'Manual'],
                    ['Seller asking price', money(p.askingPrice)],
                    ['Ownership entity', p.ownershipEntity ?? 'Not recorded'],
                    ['Ownership status', p.ownershipVerified ? 'Verified' : 'Unverified'],
                    ['Ownership source', p.ownershipSource ?? 'Not recorded'],
                    ['Confidence', `${p.ownershipConfidence ?? 0}%`],
                  ].map(([l, v]) => (
                    <div className="field" key={l}>
                      <span className="field-label">{l}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <h3>Notes</h3>
                <p className="pre-wrap">{p.notes ?? 'No notes recorded.'}</p>
              </div>
            </Panel>
            <div>
              <Panel title="Next best action">
                <div className="panel-body">
                  <div className="next-action-icon">
                    <Target size={24} />
                  </div>
                  <h3>{p.nextAction ?? 'Review property information'}</h3>
                  <p className="muted">
                    {p.nextActionDue
                      ? `Due ${date(p.nextActionDue)}`
                      : 'Verify ownership, add comps, and prepare underwriting.'}
                  </p>
                  <button className="button secondary" onClick={() => addTask(p)}>
                    <Plus size={15} /> Create task
                  </button>
                </div>
              </Panel>
              <Panel title="Risk signals">
                <div className="panel-body">
                  <Badge status={p.riskGrade ?? 'Not reviewed'} />
                  <ul className="risk-reasons">
                    {(p.riskReasons ?? []).map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  {!p.riskReasons?.length && (
                    <p className="muted">Run underwriting to evaluate this opportunity.</p>
                  )}
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        { action: 'underwriting', propertyId: p.id },
                        'Underwriting and risk review completed',
                      )
                    }
                  >
                    <SlidersHorizontal size={15} /> Run underwriting
                  </button>
                </div>
              </Panel>
            </div>
          </div>
        )}
        {tab === 'Seller' &&
          (seller ? (
            <Panel
              title={seller.name}
              action={
                <button
                  className="button secondary small"
                  onClick={() => edit('sellers', sellerFields, seller)}
                >
                  Edit seller
                </button>
              }
            >
              <div className="panel-body">
                <div className="form-grid">
                  {[
                    ['Email', seller.email],
                    ['Phone', seller.phone],
                    ['Status', seller.status],
                    ['Consent', seller.consent ? 'Recorded' : 'Not recorded'],
                    ['Do not contact', seller.doNotContact ? 'Yes' : 'No'],
                    ['Motivation', seller.motivation],
                    ['Timeline', seller.timeline],
                    ['Next follow-up', date(seller.nextFollowUp)],
                  ].map(([k, v]) => (
                    <div className="field" key={k}>
                      <span className="field-label">{k}</span>
                      <strong>{v ?? '—'}</strong>
                    </div>
                  ))}
                </div>
                <p>{seller.notes}</p>
              </div>
            </Panel>
          ) : (
            <Empty
              title="Link a seller"
              text="Create a seller relationship and attach it by editing this property."
              action={
                <button
                  className="button primary"
                  onClick={() => edit('properties', propertyFields, p)}
                >
                  Edit property
                </button>
              }
            />
          ))}
        {tab === 'Underwriting' && (
          <>
            <div className="toolbar">
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(
                    { action: 'underwriting', propertyId: p.id },
                    'Underwriting and Red Team completed',
                  )
                }
              >
                <RefreshCw size={16} /> Recalculate underwriting
              </button>
              <button className="button secondary" onClick={() => requestOffer(p)}>
                Prepare offer <ArrowRight size={15} />
              </button>
            </div>
            <div className="two-columns">
              <Panel
                title="Transparent deal economics"
                subtitle="Deterministic calculations from recorded comps and repair assumptions"
              >
                <div className="panel-body">
                  {[
                    ['ARV base', p.arvBase],
                    ['Expected repairs', p.repairExpected],
                    ['Investor maximum purchase', p.investorMax],
                    ['Company maximum offer', p.mao],
                    ['Recommended offer', p.recommendedOffer],
                    ['Target assignment price', p.targetAssignmentPrice],
                    ['Projected assignment fee', p.projectedAssignmentFee],
                  ].map(([l, v]) => (
                    <div className="metric-row" key={String(l)}>
                      <span>{l}</span>
                      <strong>{money(v)}</strong>
                    </div>
                  ))}
                  <p className="help">
                    The company maximum offer deducts repairs, investor profit, holding,
                    transaction, risk allowance, and the assignment target. No universal percentage
                    rule is applied.
                  </p>
                </div>
              </Panel>
              <Panel
                title="Assumptions & scenarios"
                action={
                  <button className="text-button" onClick={() => navigate('settings')}>
                    View policy <ArrowRight size={14} />
                  </button>
                }
              >
                <div className="panel-body">
                  <div className="metric-row">
                    <span>ARV confidence</span>
                    <strong>{p.arvConfidence ?? 0}%</strong>
                  </div>
                  <div className="metric-row">
                    <span>Repair low / high</span>
                    <strong>
                      {money(p.repairLow)} / {money(p.repairHigh)}
                    </strong>
                  </div>
                  <Badge status={p.riskGrade ?? 'Not reviewed'} />
                  <ul className="risk-reasons">
                    {(p.riskReasons ?? []).map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  {p.scenarios &&
                    Object.entries(p.scenarios).map(([key, value]) => (
                      <div className="scenario" key={key}>
                        <strong>{pretty(key)}</strong>
                        <pre className="json-output">{JSON.stringify(value, null, 2)}</pre>
                      </div>
                    ))}
                </div>
              </Panel>
            </div>
          </>
        )}
        {tab === 'Comps' && (
          <Panel
            title="Comparable sales"
            subtitle="Individual, sourced sales used to calculate ARV"
            action={
              <button className="button primary small" onClick={() => addComp(p)}>
                <Plus size={15} /> Add comp
              </button>
            }
          >
            {table(
              [
                'Comparable',
                'Sale date',
                'Distance',
                'Size',
                'Sale price',
                '$/sq ft',
                'Source',
                'Status',
              ],
              comps.map((c) => (
                <tr key={c.id}>
                  <td>{c.address}</td>
                  <td>{date(c.saleDate)}</td>
                  <td>{c.distance ?? c.distanceMiles} mi</td>
                  <td>{number(c.sqft)}</td>
                  <td>{money(c.salePrice)}</td>
                  <td>{money(c.pricePerSqft)}</td>
                  <td className="truncate">{c.source}</td>
                  <td>
                    <Badge status={c.excluded ? 'EXCLUDED' : 'INCLUDED'} />
                  </td>
                </tr>
              )),
              !comps.length,
            )}
          </Panel>
        )}
        {tab === 'Repairs' && (
          <Panel
            title="Repair scope & uncertainty"
            subtitle="Estimates are assumptions until supported by inspection"
            action={
              <button className="button primary small" onClick={() => addRepair(p)}>
                <Plus size={15} /> Add estimate
              </button>
            }
          >
            {table(
              ['Category', 'Low', 'Expected', 'High', 'Assumptions'],
              repairs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{pretty(r.category)}</strong>
                  </td>
                  <td>{money(r.low)}</td>
                  <td>{money(r.expected)}</td>
                  <td>{money(r.high)}</td>
                  <td>{r.assumptions ?? r.notes}</td>
                </tr>
              )),
              !repairs.length,
            )}
          </Panel>
        )}
        {tab === 'Buyers' && (
          <Panel
            title="Ranked investor matches"
            subtitle="Scores are calculated from buy-box compatibility"
            action={
              <div className="heading-actions">
                <button className="button secondary small" onClick={() => selectBuyer(p)}>
                  Select buyer
                </button>
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={() =>
                    run({ action: 'match', propertyId: p.id }, 'Buyer matches refreshed')
                  }
                >
                  <Target size={15} /> Find matches
                </button>
              </div>
            }
          >
            {table(
              ['Buyer', 'Match score', 'Reasons', 'Status'],
              matches.map((m) => {
                const b = buyers.find((b) => b.id === m.buyerId);
                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{b?.name ?? m.buyerId}</strong>
                      <small>{b?.company}</small>
                    </td>
                    <td>
                      <strong className="match-score">{m.score ?? m.matchScore}%</strong>
                    </td>
                    <td>
                      {(m.reasons ?? m.explanation ?? []).join?.(' · ') ??
                        String(m.explanation ?? '')}
                    </td>
                    <td>
                      <Badge
                        status={p.selectedBuyerId === m.buyerId ? 'COMMITTED' : (b?.tier ?? 'NEW')}
                      />
                    </td>
                  </tr>
                );
              }),
              !matches.length,
            )}
          </Panel>
        )}
        {tab === 'Documents' && <Documents list={docs} property={p} />}
        {tab === 'Tasks' && <TaskList list={ptasks} property={p} />}
        {tab === 'Closing' && (
          <>
            <div className="toolbar">
              <button className="button secondary" onClick={() => transition(p)}>
                Record contract / stage
              </button>
              <button className="button secondary" onClick={() => selectBuyer(p)}>
                Record buyer commitment
              </button>
              <button className="button primary" onClick={() => recordClosing(p)}>
                Record completed closing
              </button>
            </div>
            <Panel
              title="Closing workspace"
              subtitle="Title and execution status are recorded from evidence, never inferred"
            >
              <div className="panel-body">
                <div className="form-grid">
                  {[
                    ['Contract price', money(p.contractPrice)],
                    ['Execution date', date(p.executionDate)],
                    ['Closing date', date(p.closingDate ?? closing?.closingDate)],
                    ['Title status', p.titleStatus ?? closing?.titleStatus ?? 'NOT STARTED'],
                    ['Title company', closing?.titleCompany ?? 'Not recorded'],
                    [
                      'Buyer',
                      buyers.find((b) => b.id === p.selectedBuyerId)?.name ?? 'Not committed',
                    ],
                  ].map(([l, v]) => (
                    <div className="field" key={l}>
                      <span className="field-label">{l}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    edit(
                      'closings',
                      [
                        {
                          key: 'propertyId',
                          label: 'Property',
                          options: [{ value: p.id, label: p.address }],
                          default: p.id,
                        },
                        { key: 'titleCompany', label: 'Title company' },
                        { key: 'attorney', label: 'Attorney' },
                        {
                          key: 'titleStatus',
                          label: 'Title status',
                          options: [
                            'NOT STARTED',
                            'TITLE OPEN',
                            'REVIEW',
                            'ISSUE',
                            'CLEAR',
                            'SCHEDULED',
                            'FUNDED',
                            'CLOSED',
                          ],
                          default: 'NOT STARTED',
                        },
                        { key: 'closingDate', label: 'Closing date', type: 'date' },
                        {
                          key: 'issues',
                          label: 'Title issues and resolution notes',
                          type: 'textarea',
                        },
                      ],
                      closing,
                      'Update closing record',
                    )
                  }
                >
                  Update title record
                </button>
                <h3>Critical dates</h3>
                {deadlines
                  .filter((d) => d.propertyId === p.id)
                  .map((d) => (
                    <div className="metric-row" key={d.id}>
                      <span>{d.title ?? d.type}</span>
                      <strong>{date(d.dueDate ?? d.date)}</strong>
                    </div>
                  ))}
              </div>
            </Panel>
          </>
        )}
        {tab === 'Financials' && <Finance property={p} />}
        {tab === 'Activity' && (
          <Panel title="Property audit trail">
            <ActivityList
              list={activities.filter((a) => a.propertyId === p.id || a.entityId === p.id)}
            />
          </Panel>
        )}
        {tab === 'AI Analysis' && (
          <Panel
            title="Analysis & recommendations"
            subtitle="Structured outputs, with deterministic calculations as the authority"
          >
            <div className="panel-body">
              <div className="integration-callout">
                <Sparkles size={22} />
                <div>
                  <strong>AI provider: NOT CONFIGURED</strong>
                  <p>
                    Internal deterministic workflows remain available. No external research or AI
                    result is fabricated.
                  </p>
                </div>
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(
                    { action: 'runAgent', agent: 'INSPECTOR', propertyId: p.id },
                    'Data quality review completed',
                  )
                }
              >
                Run data-quality review
              </button>
              {rows('agentRuns')
                .filter((r) => r.propertyId === p.id)
                .map((r) => (
                  <article className="analysis-result" key={r.id}>
                    <h3>
                      {r.agentName ?? r.agent} <Badge status={r.status} />
                    </h3>
                    <pre className="json-output">
                      {JSON.stringify(r.output ?? r.result ?? r.error, null, 2)}
                    </pre>
                  </article>
                ))}
            </div>
          </Panel>
        )}
      </>
    );
  }
  function Contacts({ kind }: { kind: 'sellers' | 'buyers' }) {
    const isBuyer = kind === 'buyers',
      list = filtered(isBuyer ? buyers : sellers),
      fields = isBuyer ? buyerFields : sellerFields;
    return (
      <>
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              className="search-input"
              placeholder={`Search ${kind} by name, company, phone, email…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">{list.length} relationships</span>
        </div>
        <Panel
          title={isBuyer ? 'Investor relationships' : 'Seller relationships'}
          subtitle={
            isBuyer
              ? 'Buy-box criteria, reliability, and preferences in one place.'
              : 'Respectful follow-up starts with clear contact permissions.'
          }
        >
          {table(
            isBuyer
              ? [
                  'Buyer / company',
                  'Strategy',
                  'Markets',
                  'Price range',
                  'Proof of funds',
                  'Tier',
                  '',
                ]
              : ['Seller', 'Contact', 'Relationship', 'Contact permission', 'Next follow-up', ''],
            list.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="entity-link" onClick={() => edit(kind, fields, r)}>
                    {r.name}
                    <small>{isBuyer ? r.company : (r.motivation ?? 'Seller relationship')}</small>
                  </button>
                </td>
                {isBuyer ? (
                  <>
                    <td>{pretty(r.buyerType)}</td>
                    <td>{Array.isArray(r.counties) ? r.counties.join(', ') : r.counties}</td>
                    <td>
                      {money(r.minPrice)} – {money(r.maxPrice)}
                    </td>
                    <td>
                      <Badge status={r.proofOfFundsStatus ?? 'NOT PROVIDED'} />
                      <small>
                        {r.proofOfFundsExpiry ? `Expires ${date(r.proofOfFundsExpiry)}` : ''}
                      </small>
                    </td>
                    <td>
                      <Badge status={r.tier} />
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      {r.email ?? '—'}
                      <small>{r.phone ?? 'No phone recorded'}</small>
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      <Badge
                        status={
                          r.doNotContact
                            ? 'DO NOT CONTACT'
                            : r.consent
                              ? 'CONSENT RECORDED'
                              : 'CONSENT REQUIRED'
                        }
                      />
                    </td>
                    <td>{date(r.nextFollowUp)}</td>
                  </>
                )}
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${r.name}`}
                    onClick={() => edit(kind, fields, r)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            )),
            !list.length,
          )}
        </Panel>
        {isBuyer && (
          <Panel
            title="Buyer demand by county"
            subtitle="Count of investor buy boxes in each market"
          >
            <div className="demand-grid">
              {Object.entries(
                buyers.reduce((a: Record<string, number>, b) => {
                  for (const county of Array.isArray(b.counties)
                    ? b.counties
                    : String(b.counties ?? '').split(',')) {
                    if (county) a[county.trim()] = (a[county.trim()] ?? 0) + 1;
                  }
                  return a;
                }, {}),
              ).map(([county, count]) => (
                <div className="demand-card" key={county}>
                  <MapPin size={18} />
                  <strong>{county}</strong>
                  <span>{count} investors</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </>
    );
  }
  function Pipeline() {
    const list = filtered(properties);
    return (
      <>
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              className="search-input"
              placeholder="Filter the pipeline…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="help">
            Stage changes enforce prerequisites and create an audit entry.
          </span>
        </div>
        <div className="pipeline-board">
          {STAGES.map((s) => {
            const records = list.filter((p) => p.stage === s);
            return (
              <section className="pipeline-column" key={s}>
                <div className="pipeline-column-header">
                  <h3>{pretty(s)}</h3>
                  <span>{records.length}</span>
                </div>
                <div className="pipeline-column-total">
                  {money(sum(records, 'projectedAssignmentFee'))}
                </div>
                {records.map((p) => (
                  <button className="pipeline-card" key={p.id} onClick={() => detail(p)}>
                    <span className="mono">{p.dealId}</span>
                    <strong>{p.address}</strong>
                    <small>
                      {p.city}, {p.state}
                    </small>
                    <div>
                      <span>Projected fee</span>
                      <strong>{money(p.projectedAssignmentFee)}</strong>
                    </div>
                    <footer>
                      <Badge status={p.riskGrade ?? 'Not reviewed'} />
                      <span>{p.probability ?? 0}% close est.</span>
                    </footer>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </>
    );
  }
  function Underwriting() {
    const list = filtered(properties).filter(active);
    return (
      <>
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              className="search-input"
              placeholder="Search active opportunities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="button secondary small" onClick={() => navigate('settings')}>
            <Settings2 size={15} /> Underwriting policy
          </button>
        </div>
        <Panel
          title="Underwriting workbench"
          subtitle="Sourced comparable sales and repair scopes power deterministic economics"
        >
          {table(
            [
              'Property',
              'ARV low / base / high',
              'Repair expected',
              'Company MAO',
              'Risk review',
              '',
            ],
            list.map((p) => (
              <tr key={p.id}>
                <td>
                  {link(p)}
                  <small>{p.dealId}</small>
                </td>
                <td>
                  {money(p.arvLow)} / <strong>{money(p.arvBase)}</strong> / {money(p.arvHigh)}
                </td>
                <td>{money(p.repairExpected)}</td>
                <td>
                  <strong>{money(p.mao)}</strong>
                </td>
                <td>
                  <Badge status={p.riskGrade ?? 'Not reviewed'} />
                </td>
                <td>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      detail(p);
                      setTab('Underwriting');
                    }}
                  >
                    Analyze <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            )),
            !list.length,
          )}
        </Panel>
      </>
    );
  }
  function Dispositions() {
    const stages = [
      'UNDER CONTRACT',
      'TITLE OPEN',
      'DISPOSITIONS',
      'BUYER MATCHING',
      'BUYER COMMITTED',
      'ASSIGNMENT PREPARATION',
      'CLOSING',
    ];
    const list = filtered(properties).filter((p) => stages.includes(p.stage));
    return (
      <>
        <div className="integration-callout">
          <Target size={21} />
          <div>
            <strong>Match with intent. Market with approval.</strong>
            <p>
              Match scores are deterministic. External deal marketing requires approval and a
              configured delivery provider.
            </p>
          </div>
        </div>
        <Panel
          title="Dispositions workspace"
          subtitle="Contracted opportunities ready for investor relationships"
        >
          {table(
            ['Property', 'Assignment price', 'Projected fee', 'Committed buyer', 'Matches', ''],
            list.map((p) => (
              <tr key={p.id}>
                <td>
                  {link(p)}
                  <small>{p.dealId}</small>
                </td>
                <td>{money(p.targetAssignmentPrice)}</td>
                <td>{money(p.projectedAssignmentFee)}</td>
                <td>{buyers.find((b) => b.id === p.selectedBuyerId)?.name ?? 'Not selected'}</td>
                <td>{rows('matches').filter((m) => m.propertyId === p.id).length}</td>
                <td>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      detail(p);
                      setTab('Buyers');
                    }}
                  >
                    Open matches <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            )),
            !list.length,
          )}
        </Panel>
      </>
    );
  }
  function TaskList({ list = tasks, property }: { list?: Row[]; property?: Row } = {}) {
    return (
      <>
        <Panel
          title={property ? 'Property tasks' : 'Tasks'}
          subtitle="Dependencies, due dates, and ownership stay visible"
          action={
            <button className="button primary small" onClick={() => addTask(property)}>
              <Plus size={15} /> New task
            </button>
          }
        >
          {table(
            ['Task', 'Property', 'Department / agent', 'Due', 'Priority', 'Status'],
            filtered(list).map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.title ?? t.description}</strong>
                  <small>{t.description}</small>
                  {t.dependencyId && <small>Depends on {t.dependencyId}</small>}
                </td>
                <td>{prop(t.propertyId)?.dealId ?? 'General'}</td>
                <td>
                  {t.department ?? 'Operations'}
                  <small>{t.assignedAgent ?? 'Unassigned'}</small>
                </td>
                <td>{date(t.dueDate)}</td>
                <td>
                  <Badge status={t.priority} />
                </td>
                <td>
                  <select
                    className="select-input small"
                    value={t.status}
                    disabled={busy}
                    aria-label={`Status for ${t.title}`}
                    onChange={(e) =>
                      run(
                        { action: 'taskStatus', id: t.id, status: e.target.value },
                        'Task status updated',
                      )
                    }
                  >
                    {[
                      'BACKLOG',
                      'READY',
                      'IN PROGRESS',
                      'BLOCKED',
                      'NEEDS APPROVAL',
                      'DONE',
                      'FAILED',
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            )),
            !list.length,
          )}
        </Panel>
        {!property && (
          <Panel
            title="Critical deadlines"
            subtitle="Reminder jobs flag dates at 14, 7, and 3 days before they fall due"
            action={
              <button
                className="button secondary small"
                onClick={() =>
                  edit(
                    'deadlines',
                    [
                      {
                        key: 'propertyId',
                        label: 'Property',
                        options: properties.map((p) => ({ value: p.id, label: p.address })),
                        required: true,
                      },
                      { key: 'type', label: 'Deadline type', required: true },
                      { key: 'dueDate', label: 'Due date', type: 'date', required: true },
                      {
                        key: 'status',
                        label: 'Status',
                        options: ['OPEN', 'DONE'],
                        default: 'OPEN',
                      },
                    ],
                    undefined,
                    'Add deadline',
                  )
                }
              >
                Add deadline
              </button>
            }
          >
            {table(
              ['Deadline', 'Property', 'Due date', 'Status'],
              deadlines.map((d) => (
                <tr key={d.id}>
                  <td>{d.title ?? d.type}</td>
                  <td>{prop(d.propertyId)?.address ?? '—'}</td>
                  <td>{date(d.dueDate)}</td>
                  <td>
                    <Badge status={d.status ?? 'OPEN'} />
                  </td>
                </tr>
              )),
              !deadlines.length,
            )}
          </Panel>
        )}
      </>
    );
  }
  function Documents({
    list = rows('documents'),
    property,
  }: { list?: Row[]; property?: Row } = {}) {
    return (
      <Panel
        title="Document records"
        subtitle="Versioned references to evidence and transaction documents"
        action={
          <div className="heading-actions">
            <button className="button secondary small" onClick={() => addDocument(property)}>
              <Plus size={15} /> Register reference
            </button>
            <button className="button primary small" onClick={() => uploadDocument(property)}>
              <Upload size={15} /> Upload file
            </button>
          </div>
        }
      >
        {table(
          ['Document', 'Property', 'Type', 'Version', 'Status', 'Reference'],
          list.map((d) => (
            <tr key={d.id}>
              <td>
                <span className="document-name">
                  <FileText size={17} />
                  <button
                    className="entity-link"
                    onClick={() =>
                      edit(
                        'documents',
                        [
                          { key: 'name', label: 'Document name', required: true },
                          { key: 'source', label: 'Evidence source', required: true },
                          {
                            key: 'status',
                            label: 'Status (owner attestation)',
                            options: ['DRAFT', 'UPLOADED', 'REVIEW', 'APPROVED', 'SIGNED'],
                          },
                          { key: 'notes', label: 'Signature evidence / notes', type: 'textarea' },
                        ],
                        d,
                        'Update document evidence',
                      )
                    }
                  >
                    {d.name ?? d.title}
                  </button>
                </span>
                <small>{date(d.createdAt)}</small>
              </td>
              <td>{prop(d.propertyId)?.dealId ?? '—'}</td>
              <td>{d.type}</td>
              <td>v{d.version ?? 1}</td>
              <td>
                <Badge status={d.status ?? d.approvalStatus} />
              </td>
              <td>
                {d.size ? (
                  <a className="entity-link" href={`/api/documents/${d.id}`}>
                    Download <ArrowDownLeft size={13} />
                  </a>
                ) : /^https:\/\//.test(d.source ?? d.url ?? '') ? (
                  <a
                    className="entity-link"
                    href={d.source ?? d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open reference <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <span className="muted">{d.source ?? d.url ?? 'No reference recorded'}</span>
                )}
              </td>
            </tr>
          )),
          !list.length,
        )}
      </Panel>
    );
  }
  function Closings() {
    const list = rows('closings');
    return (
      <Panel
        title="Closing pipeline"
        subtitle="Every title issue and critical date stays attached to the deal"
      >
        {table(
          ['Property', 'Title company', 'Title status', 'Buyer', 'Closing date', ''],
          list.map((c) => {
            const p = prop(c.propertyId);
            return (
              <tr key={c.id}>
                <td>{p ? link(p) : c.propertyId}</td>
                <td>{c.titleCompany ?? 'Not recorded'}</td>
                <td>
                  <Badge status={c.titleStatus} />
                  <small>{c.issues ?? c.notes}</small>
                </td>
                <td>{buyers.find((b) => b.id === p?.selectedBuyerId)?.name ?? 'Not committed'}</td>
                <td>{date(c.closingDate ?? p?.closingDate)}</td>
                <td>
                  {p && (
                    <button
                      className="button secondary small"
                      onClick={() => {
                        detail(p);
                        setTab('Closing');
                      }}
                    >
                      Manage closing
                    </button>
                  )}
                </td>
              </tr>
            );
          }),
          !list.length,
        )}
      </Panel>
    );
  }
  function Finance({ property }: { property?: Row } = {}) {
    const entries = property
      ? transactions.filter((t) => t.propertyId === property.id)
      : transactions;
    const summary = property
      ? (data.propertyFinancials?.[property.id] ?? {})
      : { ...data.summary, ...data.financialPeriods?.[financePeriod] };
    const revenue = summary.actualRevenue ?? summary.revenue ?? 0,
      expenses = summary.totalExpenses ?? summary.expenses ?? 0;
    const closed = properties.filter((p) => p.stage === 'CLOSED');
    return (
      <>
        {!property && (
          <div className="toolbar">
            <label className="field-label" htmlFor="finance-period">
              Reporting period
            </label>
            <select
              id="finance-period"
              className="select-input"
              value={financePeriod}
              onChange={(e) => setFinancePeriod(e.target.value)}
            >
              {['CURRENT MONTH', 'LAST MONTH', 'QUARTER', 'YEAR TO DATE', 'ALL TIME'].map(
                (period) => (
                  <option key={period}>{period}</option>
                ),
              )}
            </select>
            <span className="help">
              Settled operating entries · refundable deposits and void entries excluded from totals
            </span>
          </div>
        )}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">
              Recorded revenue
              <ArrowDownLeft size={16} />
            </div>
            <div className="stat-value">{money(revenue)}</div>
            <span className="stat-detail">Actual ledger entries</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Recorded expenses
              <ArrowUpRight size={16} />
            </div>
            <div className="stat-value">{money(expenses)}</div>
            <span className="stat-detail">Across all expense categories</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Net profit
              <Wallet size={16} />
            </div>
            <div className="stat-value">{money(summary.netProfit)}</div>
            <span className="stat-detail">Revenue less expenses</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Average assignment fee
              <CircleDollarSign size={16} />
            </div>
            <div className="stat-value">
              {money(
                summary.averageFee ?? summary.averageAssignmentFee ?? property?.actualAssignmentFee,
              )}
            </div>
            <span className="stat-detail">{closed.length} recorded closings</span>
          </div>
        </div>
        {!property && (
          <div className="dashboard-grid">
            <Panel
              title="Financial performance"
              subtitle="Six-month trend from settled transaction entries"
            >
              <FinanceChart months={data.summary?.monthly ?? []} />
            </Panel>
            <Panel
              title="Operating efficiency"
              subtitle="Derived from recorded expenses and pipeline counts"
            >
              <div className="panel-body">
                {[
                  ['Cost per lead', summary.costPerLead],
                  ['Cost per contract', summary.costPerContract],
                  ['Cost per closed deal', summary.costPerClosing],
                  ['Weighted pipeline', summary.weightedPipeline],
                ].map(([l, v]) => (
                  <div className="metric-row" key={String(l)}>
                    <span>{l}</span>
                    <strong>{money(v)}</strong>
                  </div>
                ))}
                <p className="help">
                  Pipeline estimates are not realized revenue. No funds move through this
                  application.
                </p>
              </div>
            </Panel>
          </div>
        )}
        <Panel
          title="Transaction ledger"
          subtitle="Recorded revenue and expenses linked to their deal"
          action={
            <button className="button primary small" onClick={() => addTransaction(property)}>
              <Plus size={15} /> Record entry
            </button>
          }
        >
          {table(
            ['Date', 'Description', 'Category', 'Property', 'Type', 'Amount'],
            [...entries]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .map((t) => (
                <tr key={t.id}>
                  <td>{date(t.date ?? t.createdAt)}</td>
                  <td>
                    <strong>{t.description ?? t.category}</strong>
                  </td>
                  <td>{t.category}</td>
                  <td>{prop(t.propertyId)?.dealId ?? 'General'}</td>
                  <td>
                    <Badge status={t.type} />
                  </td>
                  <td className={`numeric ${t.type === 'REVENUE' ? 'text-teal' : ''}`}>
                    {t.type === 'EXPENSE' ? '−' : ''}
                    {money(t.amount)}
                  </td>
                </tr>
              )),
            !entries.length,
          )}
        </Panel>
      </>
    );
  }
  function Agents() {
    const agents = rows('agents');
    return (
      <>
        <div className="toolbar">
          <span className="help">
            Agents work through structured database records. External providers remain off until
            configured.
          </span>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => run({ action: 'runJobs' }, 'Queued jobs processed')}
          >
            <RefreshCw size={15} /> Process scheduled work
          </button>
        </div>
        <div className="card-grid">
          {agents.map((a) => {
            const name = a.name ?? a.id,
              logs = rows('agentRuns').filter((r) => (r.agentName ?? r.agent) === name),
              failed = logs.filter((r) => r.status === 'FAILED').length;
            return (
              <article className="agent-card" key={a.id ?? name}>
                <div className="card-topline">
                  <span className="agent-icon">
                    <Bot size={22} />
                  </span>
                  <Badge status={a.status ?? 'ACTIVE'} />
                </div>
                <span className="eyebrow">{a.department ?? 'Operations'}</span>
                <h3>{name}</h3>
                <p className="card-description">{a.mission ?? a.description}</p>
                <div className="agent-metrics">
                  <div>
                    <strong>{logs.filter((r) => r.status === 'COMPLETED').length}</strong>
                    <span>Completed</span>
                  </div>
                  <div>
                    <strong>{failed}</strong>
                    <span>Failed</span>
                  </div>
                  <div>
                    <strong>{logs.length ? Math.round((failed / logs.length) * 100) : 0}%</strong>
                    <span>Error rate</span>
                  </div>
                </div>
                <div className="metric-row">
                  <span>Average completion</span>
                  <span>{a.averageCompletionTime ?? 0} ms</span>
                </div>
                <div className="metric-row">
                  <span>Pending approvals</span>
                  <span>{a.pendingApprovals ?? 0}</span>
                </div>
                <div className="metric-row">
                  <span>Last activity</span>
                  <span>{date(a.lastActivity ?? logs[0]?.startedAt)}</span>
                </div>
                <div className="agent-actions">
                  <button
                    className="button primary small"
                    disabled={busy || a.status === 'PAUSED'}
                    onClick={() =>
                      setModal({
                        title: `Run ${name}`,
                        fields: [
                          {
                            key: 'propertyId',
                            label: 'Property context (if needed)',
                            options: properties.map((p) => ({
                              value: p.id,
                              label: `${p.dealId} · ${p.address}`,
                            })),
                          },
                        ],
                        submitLabel: 'Run workflow',
                        submit: async (v) => {
                          await action(
                            { action: 'runAgent', agent: name, ...v },
                            `${name} workflow completed`,
                          );
                        },
                      })
                    }
                  >
                    <Play size={13} /> Run now
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() =>
                      run(
                        {
                          action: 'agentStatus',
                          agent: name,
                          status: a.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
                        },
                        `${name} ${a.status === 'PAUSED' ? 'resumed' : 'paused'}`,
                      )
                    }
                  >
                    {a.status === 'PAUSED' ? <Play size={13} /> : <Pause size={13} />}{' '}
                    {a.status === 'PAUSED' ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setModal({
                        title: `${name} · logs & outputs`,
                        wide: true,
                        body: (
                          <div>
                            {logs.length ? (
                              logs.map((r) => (
                                <article className="analysis-result" key={r.id}>
                                  <div className="card-topline">
                                    <Badge status={r.status} />
                                    <span>{date(r.startedAt ?? r.createdAt)}</span>
                                  </div>
                                  <p>{prop(r.propertyId)?.address ?? 'Workspace workflow'}</p>
                                  <pre className="json-output">
                                    {JSON.stringify(r.output ?? r.result ?? r.error ?? r, null, 2)}
                                  </pre>
                                </article>
                              ))
                            ) : (
                              <Empty
                                title="No runs yet"
                                text="Run this workflow to inspect its structured output."
                              />
                            )}
                            <details>
                              <summary>Agent contract & permissions</summary>
                              <pre className="json-output">{JSON.stringify(a, null, 2)}</pre>
                            </details>
                          </div>
                        ),
                      })
                    }
                  >
                    View log
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {!agents.length && (
          <Empty
            title="No agent definitions loaded"
            text="Check the application database and migration status."
          />
        )}
      </>
    );
  }
  function Approvals() {
    return (
      <>
        <div className="toolbar">
          <Badge status={`${pending.length} PENDING`} />
          <span className="help">
            Approval records an owner decision. Delivery status depends on configured providers.
          </span>
        </div>
        <div className="card-grid">
          {[...pending, ...approvals.filter((a) => !pending.some((p) => p.id === a.id))].map(
            (a) => (
              <ApprovalCard key={a.id} a={a} />
            ),
          )}
        </div>
        {!approvals.length && (
          <Empty
            title="No decisions waiting"
            text="Prepare an offer or another consequential action to start an approval workflow."
          />
        )}
      </>
    );
  }
  function Compliance() {
    const risks = properties.filter((p) => p.riskGrade === 'RED' || !p.ownershipVerified);
    return (
      <>
        <div className="integration-callout">
          <ShieldCheck size={22} />
          <div>
            <strong>Legal review is a prerequisite, not an assumption.</strong>
            <p>
              Uncertain jurisdiction rules, unapproved templates, or missing contact permissions
              block external execution.
            </p>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Unverified ownership</span>
            <strong className="stat-value">
              {properties.filter((p) => !p.ownershipVerified).length}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Red Team alerts</span>
            <strong className="stat-value">
              {properties.filter((p) => p.riskGrade === 'RED').length}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Do not contact</span>
            <strong className="stat-value">
              {[...buyers, ...sellers].filter((p) => p.doNotContact).length}
            </strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Missing contact consent</span>
            <strong className="stat-value">
              {[...buyers, ...sellers].filter((p) => !p.consent).length}
            </strong>
          </div>
        </div>
        <Panel
          title="Jurisdiction policies"
          subtitle="Record reviewed rules and supporting legal references"
          action={
            <button
              className="button primary small"
              onClick={() =>
                setModal({
                  title: 'Propose jurisdiction policy',
                  fields: [
                    { key: 'state', label: 'State (two letters)', required: true, default: 'NJ' },
                    { key: 'version', label: 'Policy version', default: '1' },
                    { key: 'reviewedAt', label: 'Legal review date', type: 'date', required: true },
                    { key: 'source', label: 'Legal reference / reviewer', required: true },
                    {
                      key: 'attorneyApprovedTemplateId',
                      label: 'Attorney-approved template record ID',
                      required: true,
                    },
                    {
                      key: 'disclosuresConfirmed',
                      label: 'Required disclosures reviewed and confirmed',
                      type: 'checkbox',
                    },
                    {
                      key: 'assignmentAllowed',
                      label: 'Assignment permitted under reviewed conditions',
                      type: 'checkbox',
                    },
                    { key: 'active', label: 'Activate reviewed policy', type: 'checkbox' },
                    {
                      key: 'notes',
                      label: 'Restrictions, licensing, and communication rules',
                      type: 'textarea',
                      required: true,
                    },
                  ],
                  submitLabel: 'Submit policy for owner review',
                  submit: async (v) => {
                    await action(
                      {
                        action: 'settings',
                        settings: {
                          ...settings,
                          jurisdictionRules: [
                            ...(settings.jurisdictionRules ?? []).filter(
                              (r: Row) => r.state !== v.state.toUpperCase(),
                            ),
                            { ...v, state: v.state.toUpperCase() },
                          ],
                        },
                        reason: 'Jurisdiction legal policy update',
                      },
                      'Jurisdiction policy submitted',
                    );
                  },
                })
              }
            >
              Add policy
            </button>
          }
        >
          {table(
            ['Jurisdiction', 'Policy version', 'Review status', 'Legal review date', 'Reference'],
            (settings.jurisdictionRules ?? []).map((c: Row) => (
              <tr key={c.state}>
                <td>{c.state}</td>
                <td>{c.version ?? 1}</td>
                <td>
                  <Badge status={c.active ? 'REVIEWED' : 'INACTIVE'} />
                </td>
                <td>{date(c.reviewedAt)}</td>
                <td>{c.source ?? c.notes}</td>
              </tr>
            )),
            !settings.jurisdictionRules?.length,
          )}
        </Panel>
        <Panel
          title="Records requiring attention"
          subtitle="Verify facts and resolve risk before progressing"
        >
          {propertyTable(risks.slice(0, 20))}
        </Panel>
        <Panel title="Transaction templates">
          <div className="panel-body">
            <p className="help">
              Live transactional language must come from attorney-approved templates. The
              application does not invent clauses or sign documents.
            </p>
            <button
              className="button secondary"
              onClick={() =>
                edit(
                  'documents',
                  [
                    {
                      key: 'propertyId',
                      label: 'Property',
                      options: properties.map((p) => ({ value: p.id, label: p.address })),
                      required: true,
                    },
                    { key: 'name', label: 'Template name and jurisdiction', required: true },
                    { key: 'type', label: 'Type', default: 'Attorney Template' },
                    { key: 'source', label: 'Approved template reference', required: true },
                    { key: 'version', label: 'Version', type: 'number', default: 1 },
                    {
                      key: 'status',
                      label: 'Status',
                      options: ['DRAFT', 'APPROVED'],
                      default: 'DRAFT',
                    },
                    {
                      key: 'notes',
                      label: 'Attorney approval date, reviewer, locked fields',
                      type: 'textarea',
                    },
                  ],
                  undefined,
                  'Register attorney template',
                )
              }
            >
              Register template reference
            </button>
          </div>
        </Panel>
      </>
    );
  }
  function Settings() {
    const integrations = Array.isArray(data.integrations)
      ? data.integrations
      : Object.entries(data.integrations ?? {}).map(([name, value]) => ({
          id: name,
          name,
          ...(typeof value === 'object' ? value : { status: value }),
        }));
    return (
      <>
        <Panel
          title="Business preferences"
          subtitle="Change operational assumptions with an explicit owner decision"
          action={
            <button className="button secondary small" onClick={onboarding}>
              Edit workspace
            </button>
          }
        >
          <div className="panel-body form-grid">
            {[
              ['Company', settings.companyName ?? 'My Acquisitions'],
              ['Primary market', settings.primaryMarket ?? 'Not set'],
              [
                'Target counties',
                Array.isArray(settings.targetCounties)
                  ? settings.targetCounties.join(', ')
                  : (settings.targetCounties ?? 'Not set'),
              ],
              ['Owner time zone', settings.ownerTimezone ?? 'America/New_York'],
              [
                'Minimum assignment fee',
                money(settings.minimumAssignmentFee ?? settings.assignmentFee ?? 15000),
              ],
              ['Investor margin', `${settings.targetInvestorMargin ?? 20}%`],
              ['Repair contingency', `${settings.repairContingency ?? 15}%`],
            ].map(([l, v]) => (
              <div className="field" key={l}>
                <span className="field-label">{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Underwriting policy"
          subtitle="High-impact policy changes enter the owner approval workflow"
          action={
            <button
              className="button primary small"
              onClick={() =>
                setModal({
                  title: 'Propose underwriting policy change',
                  fields: [
                    {
                      key: 'minimumAssignmentFee',
                      label: 'Minimum assignment fee ($)',
                      type: 'number',
                      default: settings.minimumAssignmentFee ?? 15000,
                    },
                    {
                      key: 'targetInvestorMargin',
                      label: 'Investor required margin (%)',
                      type: 'number',
                      default: settings.targetInvestorMargin ?? 20,
                    },
                    {
                      key: 'repairContingency',
                      label: 'Repair contingency (%)',
                      type: 'number',
                      default: settings.repairContingency ?? 15,
                    },
                    {
                      key: 'holdingCosts',
                      label: 'Holding costs ($)',
                      type: 'number',
                      default: settings.holdingCosts ?? 5000,
                    },
                    {
                      key: 'transactionCosts',
                      label: 'Transaction costs ($)',
                      type: 'number',
                      default: settings.transactionCosts ?? 18000,
                    },
                    {
                      key: 'riskAllowance',
                      label: 'Risk reserve ($)',
                      type: 'number',
                      default: settings.riskAllowance ?? 10000,
                    },
                    {
                      key: 'reason',
                      label: 'Reason for policy change',
                      type: 'textarea',
                      required: true,
                    },
                  ],
                  submitLabel: 'Save policy proposal',
                  submit: async (v) => {
                    await action(
                      { action: 'settings', settings: { ...settings, ...v }, reason: v.reason },
                      'Policy change submitted',
                    );
                  },
                })
              }
            >
              Propose policy change
            </button>
          }
        >
          <div className="panel-body">
            <p>
              Investor maximum purchase = ARV − repairs − required investor profit − holding costs −
              transaction costs − risk allowance.
            </p>
            <p>Company maximum contract = investor maximum purchase − desired assignment fee.</p>
            <p className="help">
              All monetary calculations run on the server. AI cannot override the authoritative
              values.
            </p>
          </div>
        </Panel>
        <Panel
          title="Workflow automations"
          subtitle="Internal automation uses one workspace-wide enable setting"
          action={
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => run({ action: 'runJobs' }, 'Automation jobs processed')}
            >
              Run scheduled work
            </button>
          }
        >
          <div className="panel-body">
            {rows('automations').length ? (
              rows('automations').map((a) => (
                <div className="metric-row" key={a.id}>
                  <div>
                    <strong>{a.name ?? a.event}</strong>
                    <small>{a.description ?? a.action}</small>
                  </div>
                  <button
                    className={`button small ${a.enabled ? 'primary' : 'secondary'}`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        {
                          action: 'settings',
                          settings: { ...settings, automationEnabled: !a.enabled },
                        },
                        'Internal automation preference updated',
                      )
                    }
                  >
                    {a.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))
            ) : (
              <p className="help">
                Event routing, follow-up tasks, deadline reminders, and postmortems are managed by
                the Control Tower workflow.
              </p>
            )}
          </div>
        </Panel>
        <Panel
          title="Integrations"
          subtitle="Credentials are configured securely in environment settings"
        >
          <div className="integration-grid">
            {(integrations.length
              ? integrations
              : [
                  { id: 'property', name: 'Property data' },
                  { id: 'email', name: 'Email delivery' },
                  { id: 'sms', name: 'SMS delivery' },
                  { id: 'ai', name: 'AI provider' },
                  { id: 'documents', name: 'Document storage' },
                  { id: 'maps', name: 'Maps & geocoding' },
                  { id: 'calendar', name: 'Calendar' },
                ]
            ).map((i) => (
              <div className="integration-card" key={i.id ?? i.name}>
                <span className="integration-icon">
                  <GitBranch size={20} />
                </span>
                <strong>{pretty(i.name ?? i.provider ?? i.id)}</strong>
                <Badge status={i.status ?? 'NOT CONFIGURED'} />
                <p>
                  {i.description ??
                    'External activity requires an approved provider and valid credentials.'}
                </p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Environment & data boundaries">
          <div className="panel-body">
            <div className="metric-row">
              <span>Current data workspace</span>
              <Badge status={mode} />
            </div>
            <p className="help">
              DEMO records are fictional and isolated from LIVE records. Demo simulations do not
              contact sellers or buyers, execute documents, or move money.
            </p>
          </div>
        </Panel>
      </>
    );
  }
  const current = selected ? prop(selected) : null;
  const navigation = NAV.find((n) => n.id === section);
  const headingAction =
    section === 'properties' ? (
      <button
        className="button primary"
        onClick={() => edit('properties', propertyFields, undefined, 'Add property')}
      >
        <Plus size={17} /> Add property
      </button>
    ) : section === 'sellers' ? (
      <button
        className="button primary"
        onClick={() => edit('sellers', sellerFields, undefined, 'Add seller')}
      >
        <Plus size={17} /> Add seller
      </button>
    ) : section === 'buyers' ? (
      <button
        className="button primary"
        onClick={() => edit('buyers', buyerFields, undefined, 'Add buyer')}
      >
        <Plus size={17} /> Add buyer
      </button>
    ) : section === 'dashboard' ? (
      <>
        <button className="button secondary" onClick={() => navigate('approvals')}>
          <ShieldCheck size={16} /> Review approvals{' '}
          {pending.length > 0 && <span className="button-count">{pending.length}</span>}
        </button>
        <button
          className="button primary"
          onClick={() => edit('properties', propertyFields, undefined, 'Add property')}
        >
          <Plus size={17} /> Add property
        </button>
      </>
    ) : null;
  return (
    <div className={`app-shell ${dark ? 'dark' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('dashboard')}>
          <span className="brand-mark">
            <Building2 size={23} />
          </span>
          <span className="brand-copy">
            <strong>CONTROL TOWER</strong>
            <small>Real estate, orchestrated.</small>
          </span>
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">
            {String(settings.companyName ?? 'A')
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <span>
            {settings.companyName ?? 'Acquisitions workspace'}
            <small>{mode === 'DEMO' ? 'Demo workspace' : 'Live workspace'}</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <p className="nav-section-label">WORKSPACE</p>
        <nav className="nav-list">
          {NAV.map((item, i) => (
            <div key={item.id}>
              {i === 11 && <p className="nav-section-label">OPERATIONS</p>}
              <button
                className={`nav-item ${section === item.id ? 'active' : ''}`}
                aria-label={item.label}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span className="nav-label">{item.label}</span>
                {item.id === 'approvals' && pending.length > 0 && (
                  <span className="nav-badge">{pending.length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-health">
            <span className="status-dot green" /> One source of truth
            <small>PostgreSQL · {mode.toLowerCase()} records</small>
          </div>
          <div className="sidebar-user">
            <span className="user-avatar">OW</span>
            <span>
              <strong>{data.actor?.email?.split('@')[0] ?? 'Business owner'}</strong>
              <small>{pretty(data.actor?.role ?? 'OWNER')} workspace</small>
            </span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'logout' }),
                });
                router.replace('/login');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              aria-label="Toggle menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation?.label ?? (section === 'search' ? 'Global search' : 'Command Center')}
            </strong>
          </div>
          <div className="top-actions">
            <div className="global-search">
              <Search size={15} />
              <input
                id="global-search"
                aria-label="Global search"
                placeholder="Search anything…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSection('search');
                  setSelected(null);
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="mode-switch" aria-label="Data workspace">
              {(['DEMO', 'LIVE'] as const).map((m) => (
                <button
                  key={m}
                  className={`mode-button ${mode === m ? 'active' : ''}`}
                  onClick={() => changeMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() =>
                setModal({
                  title: 'Notifications',
                  body: rows('notifications').length ? (
                    <div className="activity-list">
                      {rows('notifications').map((n) => (
                        <article className="activity-item" key={n.id}>
                          <Bell size={18} />
                          <div>
                            <strong>{n.title ?? n.type}</strong>
                            <p>{n.message ?? n.description}</p>
                            <small>{date(n.createdAt)}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="No notifications"
                      text="Deadline alerts, workflow failures, and approval updates appear here."
                    />
                  ),
                })
              }
            >
              <Bell size={18} />
              {rows('notifications').length > 0 && <span className="notification-dot" />}
            </button>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={loading}
              onClick={() => load()}
            >
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>
        <main className="page-content">
          {mode === 'DEMO' && (
            <div className="demo-banner">
              <span>
                <span className="demo-dot" /> DEMO WORKSPACE
              </span>
              <p>Fictional data. Real workflows. Explore with confidence.</p>
              <button onClick={() => changeMode('LIVE')}>
                Switch to live <ArrowRight size={13} />
              </button>
            </div>
          )}
          {mode === 'LIVE' && (
            <div className="live-banner">
              <ShieldCheck size={15} />
              <span>LIVE WORKSPACE</span>
              <p>Only configured integrations can perform external actions.</p>
            </div>
          )}
          {!onboarded && (
            <div className="onboarding-banner">
              <div>
                <strong>Welcome to your operating workspace.</strong>
                <p>Set your company, market, and investment preferences.</p>
              </div>
              <button className="button primary small" onClick={onboarding}>
                Set up workspace
              </button>
              <button
                className="text-button"
                onClick={() => {
                  localStorage.setItem('tower-onboarded', 'yes');
                  setOnboarded(true);
                }}
              >
                Skip for demo
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!current && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {section === 'dashboard'
                    ? 'YOUR COMMAND CENTER'
                    : (navigation?.label.toUpperCase() ?? 'WORKSPACE SEARCH')}
                </span>
                <h1>{titles[section]}</h1>
                <p>{subtitles[section]}</p>
              </div>
              <div className="heading-actions">{headingAction}</div>
            </div>
          )}
          {loading && !Object.keys(data).length ? (
            <div className="loading-workspace">
              <RefreshCw className="spin" size={24} />
              <h3>Loading your workspace…</h3>
            </div>
          ) : current ? (
            PropertyDetail({ p: current })
          ) : (
            <>
              {section === 'search' && SearchResults()}
              {section === 'dashboard' && Dashboard()}
              {section === 'properties' && Properties()}
              {section === 'sellers' && Contacts({ kind: 'sellers' })}
              {section === 'buyers' && Contacts({ kind: 'buyers' })}
              {section === 'pipeline' && Pipeline()}
              {section === 'underwriting' && Underwriting()}
              {section === 'dispositions' && Dispositions()}
              {section === 'tasks' && TaskList()}
              {section === 'documents' && Documents()}
              {section === 'closings' && Closings()}
              {section === 'finance' && Finance()}
              {section === 'agents' && Agents()}
              {section === 'approvals' && Approvals()}
              {section === 'compliance' && Compliance()}
              {section === 'activity' && (
                <>
                  <Panel
                    title="Audit history"
                    subtitle="Material changes are immutable through normal application controls"
                  >
                    <ActivityList list={filtered(activities)} />
                  </Panel>
                  <Panel
                    title="Failed operations"
                    subtitle="Rejected or failed actions stay visible for diagnosis and correction"
                  >
                    {table(
                      ['Action', 'Error / reason', 'Actor', 'Time'],
                      rows('operationErrors').map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{pretty(e.action)}</strong>
                            <small>
                              {e.entityId ? (prop(e.entityId)?.dealId ?? e.entityId) : ''}
                            </small>
                          </td>
                          <td>
                            <span className="text-red">
                              {e.error?.message ?? e.message ?? 'Operation failed'}
                            </span>
                            <small>{e.error?.code ?? e.code}</small>
                          </td>
                          <td>{e.actor ?? 'System'}</td>
                          <td>{date(e.createdAt ?? e.error?.at)}</td>
                        </tr>
                      )),
                      !rows('operationErrors').length,
                    )}
                  </Panel>
                </>
              )}
              {section === 'settings' && Settings()}
            </>
          )}
          <footer className="workspace-footer">
            <span>CONTROL TOWER</span>
            <span>Human judgment. Connected operations.</span>
            <span className="mono">
              {mode} / {new Date().getFullYear()}
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <FormModal
          key={modal.title}
          modal={modal}
          close={() => setModal(null)}
          busy={busy}
          setBusy={setBusy}
          onError={setError}
        />
      )}{' '}
      {toast && (
        <div className={`toast ${toastTone === 'warning' ? 'warning' : ''}`} role="status">
          {toastTone === 'warning' ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function FinanceChart({ months: records }: { months: Row[] }) {
  const months = records.map((m) => ({
    key: m.month,
    label: new Date(`${m.month}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short' }),
    revenue: Number(m.revenue) || 0,
    expense: Number(m.expenses) || 0,
  }));
  const max = Math.max(...months.map((m) => Math.max(m.revenue, m.expense)), 1);
  return (
    <div className="finance-chart">
      <div className="chart-y-axis">
        <span>{money(max)}</span>
        <span>{money(max / 2)}</span>
        <span>$0</span>
      </div>
      <div className="chart-plot">
        <div className="chart-grid-lines">
          <i />
          <i />
          <i />
        </div>
        {months.map((m) => (
          <div className="chart-month" key={m.key}>
            <div className="chart-bars">
              <div
                title={`${m.label} revenue: ${money(m.revenue)}`}
                className="chart-bar revenue"
                style={{ height: `${Math.max(m.revenue ? 2 : 0, (m.revenue / max) * 100)}%` }}
              />
              <div
                title={`${m.label} expenses: ${money(m.expense)}`}
                className="chart-bar expense"
                style={{ height: `${Math.max(m.expense ? 2 : 0, (m.expense / max) * 100)}%` }}
              />
            </div>
            <span>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
