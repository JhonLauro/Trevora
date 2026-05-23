import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Battery,
  Building2,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cog,
  Compass,
  Disc,
  DoorOpen,
  Droplets,
  Eye,
  FileText,
  Flame,
  Gauge,
  Lightbulb,
  Mic,
  MoveVertical,
  Package,
  PencilLine,
  Receipt,
  ScanLine,
  Share2,
  Snowflake,
  Sparkles,
  Wind,
  Wrench,
} from 'lucide-react';

const COMPONENT_META = {
  engine: { label: 'Engine', icon: Cog },
  tires: { label: 'Tires', icon: Wrench },
  brakes: { label: 'Brakes', icon: Disc },
  battery: { label: 'Battery', icon: Battery },
  airFilter: { label: 'Air Filter', icon: Wind },
  transmission: { label: 'Transmission', icon: Activity },
  cooling: { label: 'Cooling System', icon: Droplets },
  suspension: { label: 'Suspension', icon: MoveVertical },
  lights: { label: 'Lights', icon: Lightbulb },
  ac: { label: 'AC System', icon: Snowflake },
  body: { label: 'Doors / Body', icon: DoorOpen },
  exhaust: { label: 'Exhaust', icon: Flame },
  fluids: { label: 'Fluids', icon: Gauge },
  trunk: { label: 'Trunk / Body', icon: Package },
};

const STATUS_CONFIG = {
  good: { label: 'Recently serviced', color: '#047857', bg: '#ecfdf5', border: '#86efac', dot: '#10b981' },
  soon: { label: 'Needs review soon', color: '#b45309', bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b' },
  overdue: { label: 'Overdue / issue', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444' },
  none: { label: 'No record found', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1', dot: '#94a3b8' },
};

const SOURCE_CONFIG = {
  RECEIPT: { label: 'Receipt', icon: Receipt, color: '#1d4ed8', bg: '#eff6ff' },
  SCAN: { label: 'Scan', icon: ScanLine, color: '#0e7490', bg: '#ecfeff' },
  VOICE: { label: 'Voice', icon: Mic, color: '#7c3aed', bg: '#f5f3ff' },
  MANUAL: { label: 'Manual', icon: PencilLine, color: '#475569', bg: '#f1f5f9' },
};

function SideViewCar() {
  return (
    <g>
      <ellipse cx="300" cy="280" rx="240" ry="8" fill="#e2e8f0" opacity="0.6" />
      <circle cx="150" cy="240" r="42" fill="#1e293b" />
      <circle cx="470" cy="240" r="42" fill="#1e293b" />
      <circle cx="150" cy="240" r="22" fill="#475569" />
      <circle cx="470" cy="240" r="22" fill="#475569" />
      <circle cx="150" cy="240" r="6" fill="#1e293b" />
      <circle cx="470" cy="240" r="6" fill="#1e293b" />
      <path
        d="M 50,230 L 50,210 Q 50,180 80,170 L 130,165 Q 145,140 175,125 L 230,110 Q 280,98 340,100 L 410,108 Q 440,118 460,150 L 510,160 Q 555,165 560,200 L 560,235 L 50,235 Z"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M 175,135 Q 200,118 240,114 L 330,114 Q 380,118 410,135 L 430,165 L 175,165 Z"
        fill="#dbeafe"
        opacity="0.85"
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      <line x1="295" y1="118" x2="295" y2="165" stroke="#cbd5e1" strokeWidth="1.5" />
      <line x1="240" y1="165" x2="240" y2="230" stroke="#e2e8f0" strokeWidth="1.5" />
      <line x1="350" y1="165" x2="350" y2="230" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="260" y="185" width="18" height="4" rx="2" fill="#cbd5e1" />
      <rect x="370" y="185" width="18" height="4" rx="2" fill="#cbd5e1" />
      <ellipse cx="75" cy="200" rx="14" ry="10" fill="#fde68a" opacity="0.95" />
      <rect x="540" y="190" width="18" height="20" rx="4" fill="#fca5a5" opacity="0.9" />
      <path d="M 200,135 L 195,118 L 205,118 Z" fill="#94a3b8" />
      <line x1="55" y1="225" x2="555" y2="225" stroke="#e2e8f0" />
    </g>
  );
}

function FrontViewCar() {
  return (
    <g>
      <ellipse cx="300" cy="370" rx="190" ry="8" fill="#e2e8f0" opacity="0.6" />
      <rect x="80" y="280" width="50" height="70" rx="8" fill="#1e293b" />
      <rect x="470" y="280" width="50" height="70" rx="8" fill="#1e293b" />
      <rect x="92" y="295" width="26" height="40" rx="4" fill="#475569" />
      <rect x="482" y="295" width="26" height="40" rx="4" fill="#475569" />
      <path
        d="M 110,80 Q 110,55 145,45 L 250,30 Q 300,25 350,30 L 455,45 Q 490,55 490,80 L 500,250 Q 500,300 480,330 L 430,335 L 170,335 Q 120,330 100,300 Z"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M 155,90 Q 200,68 260,62 L 340,62 Q 400,68 445,90 L 440,180 L 160,180 Z"
        fill="#dbeafe"
        opacity="0.85"
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      <line x1="115" y1="190" x2="485" y2="190" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="220" y="220" width="160" height="38" rx="6" fill="#475569" opacity="0.85" />
      <ellipse cx="155" cy="220" rx="38" ry="20" fill="#fde68a" opacity="0.95" stroke="#cbd5e1" />
      <ellipse cx="445" cy="220" rx="38" ry="20" fill="#fde68a" opacity="0.95" stroke="#cbd5e1" />
      <rect x="110" y="295" width="380" height="32" rx="10" fill="#f1f5f9" stroke="#cbd5e1" />
      <rect x="265" y="278" width="70" height="20" rx="3" fill="white" stroke="#cbd5e1" />
      <text x="300" y="293" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">ABC 1234</text>
      <circle cx="300" cy="210" r="6" fill="#94a3b8" />
    </g>
  );
}

function RearViewCar() {
  return (
    <g>
      <ellipse cx="300" cy="370" rx="190" ry="8" fill="#e2e8f0" opacity="0.6" />
      <rect x="80" y="280" width="50" height="70" rx="8" fill="#1e293b" />
      <rect x="470" y="280" width="50" height="70" rx="8" fill="#1e293b" />
      <path
        d="M 110,80 Q 110,55 145,45 L 250,30 Q 300,25 350,30 L 455,45 Q 490,55 490,80 L 500,250 Q 500,300 480,330 L 430,335 L 170,335 Q 120,330 100,300 Z"
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M 155,90 Q 200,68 260,62 L 340,62 Q 400,68 445,90 L 440,170 L 160,170 Z"
        fill="#dbeafe"
        opacity="0.85"
        stroke="#cbd5e1"
      />
      <line x1="115" y1="180" x2="485" y2="180" stroke="#e2e8f0" strokeWidth="1.5" />
      <line x1="300" y1="180" x2="300" y2="280" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="120" y="200" width="80" height="38" rx="6" fill="#fca5a5" opacity="0.95" stroke="#cbd5e1" />
      <rect x="400" y="200" width="80" height="38" rx="6" fill="#fca5a5" opacity="0.95" stroke="#cbd5e1" />
      <rect x="110" y="295" width="380" height="32" rx="10" fill="#f1f5f9" stroke="#cbd5e1" />
      <rect x="265" y="278" width="70" height="20" rx="3" fill="white" stroke="#cbd5e1" />
      <text x="300" y="293" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">ABC 1234</text>
      <rect x="362" y="320" width="38" height="14" rx="7" fill="#475569" />
    </g>
  );
}

function EngineBayCar() {
  return (
    <g>
      <rect x="60" y="40" width="480" height="340" rx="14" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="78" y="56" width="444" height="308" rx="10" fill="white" stroke="#e2e8f0" strokeDasharray="4,4" />
      <rect x="100" y="68" width="400" height="28" rx="4" fill="#0e7490" opacity="0.15" stroke="#0e7490" />
      <circle cx="230" cy="135" r="32" fill="white" stroke="#cbd5e1" />
      <circle cx="230" cy="135" r="20" fill="#f1f5f9" />
      <rect x="170" y="180" width="200" height="140" rx="10" fill="#1e293b" />
      <rect x="180" y="190" width="180" height="120" rx="6" fill="#334155" />
      <rect x="232" y="232" width="86" height="36" rx="4" fill="#0f172a" />
      <text x="275" y="255" textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">ENGINE</text>
      <rect x="95" y="120" width="64" height="80" rx="6" fill="#fef3c7" stroke="#b45309" />
      <text x="127" y="170" textAnchor="middle" fontSize="9" fontWeight="700" fill="#92400e">12V</text>
      <rect x="420" y="115" width="80" height="80" rx="8" fill="white" stroke="#94a3b8" />
      <rect x="430" y="125" width="60" height="60" rx="4" fill="#f1f5f9" />
      <circle cx="115" cy="270" r="22" fill="white" stroke="#0e7490" />
      <circle cx="115" cy="270" r="14" fill="#ecfeff" />
      <rect x="395" y="220" width="40" height="46" rx="4" fill="white" stroke="#cbd5e1" />
      <rect x="445" y="220" width="40" height="46" rx="4" fill="white" stroke="#cbd5e1" />
      <rect x="160" y="330" width="220" height="34" rx="6" fill="#475569" />
      <text x="270" y="352" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">TRANSMISSION</text>
    </g>
  );
}

const VIEWS = {
  side: {
    label: 'Side View',
    short: 'Side',
    icon: ArrowRight,
    viewBox: '0 0 600 300',
    draw: SideViewCar,
    hotspots: [
      { key: 'lights', cx: 78, cy: 198, labelSide: 'left' },
      { key: 'body', cx: 295, cy: 145, labelSide: 'top' },
      { key: 'suspension', cx: 150, cy: 200, labelSide: 'top' },
      { key: 'brakes', cx: 470, cy: 245, labelSide: 'right' },
      { key: 'tires', cx: 150, cy: 252, labelSide: 'left' },
    ],
  },
  front: {
    label: 'Front View',
    short: 'Front',
    icon: ArrowUp,
    viewBox: '0 0 600 400',
    draw: FrontViewCar,
    hotspots: [
      { key: 'lights', cx: 155, cy: 220, labelSide: 'left' },
      { key: 'engine', cx: 300, cy: 120, labelSide: 'top' },
      { key: 'battery', cx: 410, cy: 130, labelSide: 'right' },
      { key: 'cooling', cx: 300, cy: 240, labelSide: 'right' },
      { key: 'brakes', cx: 105, cy: 320, labelSide: 'left' },
    ],
  },
  rear: {
    label: 'Rear View',
    short: 'Rear',
    icon: ArrowDown,
    viewBox: '0 0 600 400',
    draw: RearViewCar,
    hotspots: [
      { key: 'lights', cx: 160, cy: 220, labelSide: 'left' },
      { key: 'trunk', cx: 300, cy: 130, labelSide: 'top' },
      { key: 'tires', cx: 495, cy: 318, labelSide: 'right' },
      { key: 'brakes', cx: 105, cy: 318, labelSide: 'left' },
      { key: 'exhaust', cx: 388, cy: 327, labelSide: 'right' },
    ],
  },
  engineBay: {
    label: 'Engine Bay',
    short: 'Engine Bay',
    icon: ArrowUp,
    viewBox: '0 0 600 420',
    draw: EngineBayCar,
    hotspots: [
      { key: 'cooling', cx: 230, cy: 135, labelSide: 'left' },
      { key: 'battery', cx: 127, cy: 160, labelSide: 'left' },
      { key: 'airFilter', cx: 460, cy: 155, labelSide: 'right' },
      { key: 'engine', cx: 275, cy: 250, labelSide: 'right' },
      { key: 'ac', cx: 115, cy: 270, labelSide: 'left' },
      { key: 'fluids', cx: 440, cy: 243, labelSide: 'right' },
      { key: 'transmission', cx: 270, cy: 347, labelSide: 'right' },
    ],
  },
};

const VIEW_ORDER = ['side', 'front', 'rear', 'engineBay'];

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function sourceConfig(value) {
  return SOURCE_CONFIG[String(value || 'MANUAL').toUpperCase()] || SOURCE_CONFIG.MANUAL;
}

function deriveStatus(records) {
  if (records.length === 0) return 'none';
  if (records.some((record) => record.status === 'Needs Review' || record.status === 'Draft')) return 'soon';
  return 'good';
}

function sortRecords(records) {
  return [...records].sort((a, b) => String(b.serviceDate || '').localeCompare(String(a.serviceDate || '')));
}

export default function PartsMap({ records, odometer, onSelectRecord, onOpenRecord, onShare }) {
  const [view, setView] = useState('side');
  const [selected, setSelected] = useState('brakes');

  const byComponent = useMemo(() => {
    const groups = Object.fromEntries(Object.keys(COMPONENT_META).map((key) => [key, []]));
    records.forEach((record) => {
      (record.components?.length ? record.components : ['engine']).forEach((component) => {
        if (groups[component]) groups[component].push(record);
      });
    });
    Object.keys(groups).forEach((key) => {
      groups[key] = sortRecords(groups[key]);
    });
    return groups;
  }, [records]);

  const statuses = useMemo(() => Object.fromEntries(
    Object.keys(COMPONENT_META).map((key) => [key, deriveStatus(byComponent[key] || [])]),
  ), [byComponent]);

  const activeView = VIEWS[view];

  useEffect(() => {
    if (!activeView.hotspots.some((hotspot) => hotspot.key === selected)) {
      setSelected(activeView.hotspots[0]?.key || 'engine');
    }
  }, [activeView, selected]);

  const selectedRecords = byComponent[selected] || [];
  const selectedStatus = statuses[selected];
  const selectedMeta = COMPONENT_META[selected];

  return (
    <section className="figma-parts-map">
      <div className="figma-parts-card">
        <div className="figma-parts-heading">
          <div>
            <h2><Car size={17} aria-hidden="true" /> Vehicle Service Map</h2>
            <p>Switch views to inspect different parts of your vehicle. Tap a hotspot for that component's full service history.</p>
          </div>
          <Legend />
        </div>

        <div className="figma-view-switcher">
          {VIEW_ORDER.map((viewKey) => {
            const cfg = VIEWS[viewKey];
            const Icon = cfg.icon;
            const active = view === viewKey;
            return (
              <button key={viewKey} className={active ? 'active' : ''} type="button" onClick={() => setView(viewKey)}>
                <Icon size={15} aria-hidden="true" />
                {cfg.short}
              </button>
            );
          })}
          <span><Compass size={14} aria-hidden="true" /> {activeView.label}</span>
        </div>

        <div className="figma-car-canvas">
          <CarSvg activeView={activeView} selected={selected} statuses={statuses} onSelect={setSelected} />
        </div>

        <div className="figma-components-strip">
          <div className="figma-components-title">
            <span>Components in this view</span>
            <small>{activeView.hotspots.length} shown</small>
          </div>
          <div className="figma-components-grid">
            {activeView.hotspots.map((hotspot) => {
              const meta = COMPONENT_META[hotspot.key];
              const Icon = meta.icon;
              const status = statuses[hotspot.key];
              const statusMeta = STATUS_CONFIG[status];
              const last = byComponent[hotspot.key]?.[0];
              return (
                <button
                  key={hotspot.key}
                  className={selected === hotspot.key ? 'active' : ''}
                  type="button"
                  onClick={() => setSelected(hotspot.key)}
                >
                  <span style={{ background: statusMeta.bg, color: statusMeta.color }}><Icon size={16} aria-hidden="true" /></span>
                  <div>
                    <strong>{meta.label}</strong>
                    <small style={{ color: statusMeta.color }}>{last ? `Last: ${formatDate(last.serviceDate)}` : 'No record found'}</small>
                  </div>
                  <i style={{ background: statusMeta.dot }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ComponentDetail
        meta={selectedMeta}
        status={selectedStatus}
        records={selectedRecords}
        odometer={odometer}
        viewLabel={activeView.label}
        onSelectRecord={onSelectRecord}
        onOpenRecord={onOpenRecord}
        onShare={onShare}
      />
    </section>
  );
}

function CarSvg({ activeView, selected, statuses, onSelect }) {
  const Draw = activeView.draw;
  return (
    <div className="figma-car-svg-wrap">
      <svg viewBox={activeView.viewBox}>
        <Draw />
        {activeView.hotspots.map((hotspot) => (
          <Hotspot key={hotspot.key} hotspot={hotspot} status={statuses[hotspot.key]} selected={selected === hotspot.key} onClick={() => onSelect(hotspot.key)} />
        ))}
      </svg>
      <div className="figma-view-label">{activeView.label}</div>
    </div>
  );
}

function Hotspot({ hotspot, status, selected, onClick }) {
  const meta = COMPONENT_META[hotspot.key];
  const cfg = STATUS_CONFIG[status];
  const labelW = 96;
  const labelH = 22;
  const offset = 22;
  let lx = -labelW / 2;
  let ly = -offset - labelH;
  if (hotspot.labelSide === 'right') { lx = offset; ly = -labelH / 2; }
  if (hotspot.labelSide === 'left') { lx = -offset - labelW; ly = -labelH / 2; }
  if (hotspot.labelSide === 'bottom') { lx = -labelW / 2; ly = offset; }

  return (
    <g className="figma-hotspot" onClick={onClick}>
      {selected && (
        <circle cx={hotspot.cx} cy={hotspot.cy} r="20" fill={cfg.dot} opacity="0.18">
          <animate attributeName="r" from="14" to="24" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={hotspot.cx} cy={hotspot.cy} r="13" fill="white" stroke={cfg.dot} strokeWidth={selected ? 3 : 2} />
      <circle cx={hotspot.cx} cy={hotspot.cy} r="6" fill={cfg.dot} />
      <g transform={`translate(${hotspot.cx + lx}, ${hotspot.cy + ly})`}>
        <rect width={labelW} height={labelH} rx="11" fill={selected ? cfg.color : 'white'} stroke={cfg.border} />
        <text x={labelW / 2} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill={selected ? 'white' : '#0f172a'}>
          {meta.label}
        </text>
      </g>
    </g>
  );
}

function Legend() {
  return (
    <div className="figma-parts-legend">
      {Object.entries(STATUS_CONFIG).map(([key, status]) => (
        <span key={key} style={{ background: status.bg, color: status.color }}>
          <i style={{ background: status.dot }} />
          {status.label}
        </span>
      ))}
    </div>
  );
}

function ComponentDetail({ meta, status, records, odometer, viewLabel, onSelectRecord, onOpenRecord, onShare }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = meta.icon;
  const last = records[0];
  const totalCost = records.reduce((sum, record) => sum + Number(record.totalCost || 0), 0);
  const sources = [...new Set(records.map((record) => String(record.sourceInputMethod || 'MANUAL').toUpperCase()))];
  const replacement = records.find((record) => record.partsReplaced && String(record.partsReplaced).length > 2) || last;

  return (
    <aside className="figma-component-panel">
      <div className="figma-component-panel-head" style={{ background: cfg.bg }}>
        <div style={{ color: cfg.color }}><Icon size={24} aria-hidden="true" /></div>
        <section>
          <span style={{ color: cfg.color }}>{viewLabel} · {meta.label}</span>
          <h2>{meta.label} Service History</h2>
          <em style={{ color: cfg.color, borderColor: cfg.border }}>
            <i style={{ background: cfg.dot }} /> Status: {cfg.label}
          </em>
        </section>
      </div>

      <div className="figma-component-panel-body">
        <div className="figma-component-facts">
          <div><span>Last service</span><strong>{last ? formatDate(last.serviceDate) : 'No record'}</strong></div>
          <div><span>Latest odometer</span><strong>{last?.odometer != null ? `${Number(last.odometer).toLocaleString()} km` : `${Number(odometer || 0).toLocaleString()} km`}</strong></div>
          <div><span>Related records</span><strong>{records.length}</strong></div>
          <div><span>Total cost</span><strong>{formatMoney(totalCost)}</strong></div>
        </div>

        {!records.length ? (
          <div className="figma-component-empty">
            <CircleHelp size={34} aria-hidden="true" />
            <h3>No record found</h3>
            <p>Add a service record so Trevora can start tracking this component.</p>
          </div>
        ) : (
          <>
            {replacement && (
              <div className="figma-component-callout">
                <CheckCircle2 size={16} aria-hidden="true" />
                <p><strong>Last replacement</strong>{replacement.serviceType} on {formatDate(replacement.serviceDate)}</p>
              </div>
            )}

            <div>
              <h3 className="figma-panel-kicker">Captured from</h3>
              <div className="figma-source-list">
                {sources.map((source) => {
                  const sourceMeta = sourceConfig(source);
                  const SourceIcon = sourceMeta.icon;
                  return (
                    <span key={source} style={{ color: sourceMeta.color, background: sourceMeta.bg }}>
                      <SourceIcon size={13} aria-hidden="true" /> {sourceMeta.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="figma-ai-confidence">
              <Sparkles size={16} aria-hidden="true" />
              <p><strong>AI / OCR confidence: High</strong>Extracted fields look reliable.</p>
            </div>

            <div>
              <h3 className="figma-panel-kicker">Related records ({records.length})</h3>
              <div className="figma-related-records">
                {records.map((record) => (
                  <button key={record.recordId} type="button" onClick={() => onSelectRecord(record)}>
                    <div>
                      <strong>{record.serviceType}</strong>
                      <span><Building2 size={13} aria-hidden="true" /> {record.shopName || 'Shop not provided'}</span>
                      <small>{formatDate(record.serviceDate)} · {record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</small>
                    </div>
                    <em>{formatMoney(record.totalCost)}</em>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="figma-component-actions">
        <button type="button" disabled={!last} onClick={() => last && onOpenRecord(last.recordId)}>
          <Eye size={15} aria-hidden="true" /> View Related Records
        </button>
        <button type="button" onClick={onShare}>
          <Share2 size={15} aria-hidden="true" /> Share Record
        </button>
        <button type="button" disabled={!last} onClick={() => last && onSelectRecord(last)}>
          <FileText size={15} aria-hidden="true" /> Source Docs
        </button>
      </div>
    </aside>
  );
}
