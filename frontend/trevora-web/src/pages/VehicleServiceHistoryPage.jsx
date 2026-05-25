import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarClock,
  Car,
  ChevronDown,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gauge,
  History,
  LayoutGrid,
  Lightbulb,
  List,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Table2,
  Wrench,
  X,
} from 'lucide-react';
import PartsMap from '../components/PartsMap';
import { getVehicleServiceHistory } from '../api/serviceHistory';
import { getVehicle } from '../api/vehicles';
import { formatServiceText, formatServiceTextInline, serviceTextLines } from '../utils/serviceText';

const COMPONENT_RULES = [
  ['brakes', /\bbrake|rotor|pad|caliper|fluid flush/i],
  ['tires', /\btire|tyre|wheel|alignment|balanc|vibration/i],
  ['suspension', /\bsuspension|shock|strut|alignment|camber|toe/i],
  ['battery', /\bbattery|crank|terminal|motolite/i],
  ['airFilter', /\bair filter|intake|filter box/i],
  ['cooling', /\bcoolant|radiator|thermostat|overheat/i],
  ['transmission', /\btransmission|gearbox|clutch|atf|cvt/i],
  ['ac', /\baircon|a\/c| ac |compressor|freon/i],
  ['lights', /\blight|headlamp|tail|signal|bulb/i],
  ['body', /\bbody|door|paint|panel|wiper|windshield/i],
  ['exhaust', /\bexhaust|muffler|emission/i],
  ['fluids', /\bfluid|oil|lubricant|washer/i],
  ['engine', /\boil|engine|spark|pms|tune|inspection/i],
];

const COMPONENT_KEY_BY_LABEL = {
  Engine: 'engine',
  'Engine Oil': 'engine',
  'Oil Filter': 'engine',
  Brakes: 'brakes',
  Tires: 'tires',
  Battery: 'battery',
  'Air Filter': 'airFilter',
  Transmission: 'transmission',
  'Cooling System': 'cooling',
  Suspension: 'suspension',
  Lights: 'lights',
  'AC System': 'ac',
  Electrical: 'battery',
  Body: 'body',
  Fluids: 'fluids',
};

function vehicleName(vehicle) {
  if (!vehicle) return 'Selected vehicle';
  return vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function vehicleSubtitle(vehicle) {
  if (!vehicle) return '';
  return vehicle.plateNumber || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `PHP ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function badgeClass(value) {
  return `dashboard-badge dashboard-badge-${String(value || 'draft').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')}`;
}

function sourceLabel(value) {
  if (!value) return 'Manual';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function partsArray(value) {
  return serviceTextLines(value).flatMap((line) => line.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean));
}

function formatParts(value) {
  return formatServiceTextInline(value);
}

function recordSearchText(record) {
  return [
    record.serviceType,
    record.category,
    record.shopName,
    record.location,
    record.remarks,
    record.laborPerformed,
    formatParts(record.partsReplaced),
  ].filter(Boolean).join(' ');
}

function inferComponents(record) {
  const controlledComponents = Array.isArray(record.relatedComponents)
    ? record.relatedComponents
    : Array.isArray(record.classification?.relatedComponents)
      ? record.classification.relatedComponents
      : [];
  const mappedComponents = controlledComponents.map((component) => COMPONENT_KEY_BY_LABEL[component]).filter(Boolean);
  if (mappedComponents.length) return [...new Set(mappedComponents)];
  const haystack = recordSearchText(record);
  const matches = COMPONENT_RULES.filter(([, pattern]) => pattern.test(haystack)).map(([key]) => key);
  if (matches.length) return [...new Set(matches)];
  if (String(record.category || '').toLowerCase().includes('inspection')) {
    return ['engine', 'brakes', 'tires', 'lights'];
  }
  return ['engine'];
}

function normalizedStatus(record) {
  if (record.status) return record.status;
  if (record.validationStatus) return sourceLabel(record.validationStatus);
  return 'Validated';
}

function normalizeRecord(record) {
  const classification = record.classification && typeof record.classification === 'object' ? record.classification : {};
  return {
    ...record,
    recordId: record.recordId ?? record.id,
    category: classification.serviceCategory || record.category,
    relatedComponents: Array.isArray(record.relatedComponents) ? record.relatedComponents : classification.relatedComponents,
    recordTags: Array.isArray(record.recordTags) ? record.recordTags : classification.recordTags,
    status: normalizedStatus(record),
    components: inferComponents(record),
  };
}

function groupByMonth(records) {
  return records.reduce((groups, record) => {
    const label = record.serviceDate
      ? new Date(`${record.serviceDate}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : 'No date';
    const group = groups.find((item) => item.label === label);
    if (group) group.records.push(record);
    else groups.push({ label, records: [record] });
    return groups;
  }, []);
}

function newestOdometer(records) {
  const withOdometer = records.filter((record) => record.odometer != null);
  if (!withOdometer.length) return null;
  return withOdometer.reduce((newest, record) => (
    String(record.serviceDate || '') > String(newest.serviceDate || '') ? record : newest
  )).odometer;
}

function topComponent(records) {
  const counts = {};
  records.forEach((record) => {
    record.components.forEach((component) => {
      counts[component] = (counts[component] || 0) + 1;
    });
  });
  const [key] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  const labels = {
    engine: 'Engine',
    brakes: 'Brakes',
    tires: 'Tires',
    suspension: 'Suspension',
    battery: 'Battery',
    airFilter: 'Air Filter',
    cooling: 'Cooling',
    transmission: 'Transmission',
    lights: 'Lights',
    ac: 'A/C',
    body: 'Body',
    exhaust: 'Exhaust',
    fluids: 'Fluids',
  };
  return labels[key] || 'None yet';
}

function dueSuggestions(records) {
  const latestOil = records.find((record) => /oil|filter|pms/i.test(recordSearchText(record)));
  const latestTires = records.find((record) => /tire|wheel|alignment|balanc/i.test(recordSearchText(record)));
  const latestBrakes = records.find((record) => /brake|rotor|pad/i.test(recordSearchText(record)));
  return [
    latestOil && {
      title: 'Engine oil and filter',
      basedOn: `Last serviced ${formatDate(latestOil.serviceDate)} at ${latestOil.odometer ? Number(latestOil.odometer).toLocaleString() : '-'} km`,
      due: latestOil.odometer ? `Due near ${(Number(latestOil.odometer) + 5000).toLocaleString()} km` : 'Due in 6 months',
      kind: 'On track',
    },
    latestTires && {
      title: 'Tire rotation or alignment',
      basedOn: `Based on ${latestTires.serviceType}`,
      due: latestTires.odometer ? `Check near ${(Number(latestTires.odometer) + 5000).toLocaleString()} km` : 'Check on next visit',
      kind: 'Due soon',
    },
    latestBrakes && {
      title: 'Brake inspection',
      basedOn: `Based on ${latestBrakes.serviceType}`,
      due: 'Review pads and fluid at the next scheduled service',
      kind: 'Upcoming',
    },
  ].filter(Boolean);
}

function SummaryCard({ icon: Icon, label, value, sub, tone }) {
  return (
    <article className={`history-summary-card history-summary-${tone || 'blue'}`}>
      <span><Icon size={18} aria-hidden="true" /></span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {sub && <small>{sub}</small>}
      </div>
    </article>
  );
}

function MiniRecordDrawer({ record, vehicleId, onClose }) {
  if (!record) return null;
  return (
    <div className="history-drawer-backdrop" onClick={onClose}>
      <aside className="history-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="history-drawer-top">
          <div>
            <span>Record #{record.recordId}</span>
            <h2>{record.serviceType || 'Service record'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close record preview">
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="history-drawer-body">
          <div className="history-drawer-facts">
            <div><span>Date</span><strong>{formatDate(record.serviceDate)}</strong></div>
            <div><span>Odometer</span><strong>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</strong></div>
            <div><span>Total cost</span><strong>{formatMoney(record.totalCost)}</strong></div>
            <div><span>Source</span><strong>{sourceLabel(record.sourceInputMethod)}</strong></div>
          </div>
          <section>
            <h3>Shop / Mechanic</h3>
            <p>{normalizeText(record.shopName, 'Shop not provided')}</p>
            {record.location && <small>{record.location}</small>}
          </section>
          <section>
            <h3>Parts</h3>
            <p>{formatParts(record.partsReplaced)}</p>
          </section>
          <section>
            <h3>Work Performed</h3>
            <p>{formatServiceText(record.laborPerformed || record.remarks, 'No notes provided')}</p>
          </section>
        </div>
        <div className="history-drawer-actions">
          <Link className="button-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
            Open Full Record
          </Link>
          <Link className="button-link-secondary" to={`/vehicles/${vehicleId}/share`}>
            Share Access
          </Link>
        </div>
      </aside>
    </div>
  );
}

function InsightsRail({ records, suggestions, vehicleId }) {
  const oilRecord = records.find((record) => /oil|filter/i.test(recordSearchText(record)));
  const brakeRecord = records.find((record) => /brake/i.test(recordSearchText(record)));
  const parts = records.flatMap((record) => partsArray(record.partsReplaced));
  const partCounts = parts.reduce((counts, part) => ({ ...counts, [part]: (counts[part] || 0) + 1 }), {});
  const topParts = Object.entries(partCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const next = suggestions[0];

  return (
    <aside className="figma-insights-rail">
      <section className="figma-insight-dark">
        <h2>Vehicle Service Insights</h2>
        <dl>
          <div><dt>Most common service</dt><dd>{topComponent(records)}</dd></div>
          <div><dt>Total spent in 2026</dt><dd>{formatMoney(records.reduce((sum, record) => sum + Number(record.totalCost || 0), 0)).replace('.00', '')}</dd></div>
          <div><dt>Last oil change</dt><dd>{oilRecord ? `${formatDate(oilRecord.serviceDate)} · ${Number(oilRecord.odometer || 0).toLocaleString()} km` : 'No record'}</dd></div>
          <div><dt>Last brake service</dt><dd>{brakeRecord ? `${formatDate(brakeRecord.serviceDate)} · ${Number(brakeRecord.odometer || 0).toLocaleString()} km` : 'No record'}</dd></div>
        </dl>
      </section>
      <section className="figma-rail-card">
        <h2>Most replaced parts</h2>
        {topParts.length ? topParts.map(([part, count]) => (
          <p key={part}><span>{part}</span><strong>{count}x</strong></p>
        )) : <p><span>No replaced parts yet</span></p>}
      </section>
      <section className="figma-next-action">
        <h2>Suggested next action</h2>
        <strong>{next?.title || 'Wheel Alignment'}</strong>
        <p>{next?.due || 'Due soon — within 2,000 km'}</p>
        <div>
          <Link to={`/vehicles/${vehicleId}/history`}>See all</Link>
          <Link to={`/service-input/${vehicleId}`}>+ Log it</Link>
        </div>
      </section>
    </aside>
  );
}

function UpcomingAndReminders({ suggestions, vehicleId }) {
  const items = suggestions;
  const storageKey = `trevora.reminders.${vehicleId}`;
  const [reminderState, setReminderState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(reminderState));
  }, [reminderState, storageKey]);

  function isReminderOn(title) {
    return reminderState[title] ?? true;
  }

  function toggleReminder(title) {
    setReminderState((current) => ({
      ...current,
      [title]: !(current[title] ?? true),
    }));
  }

  const remindersOn = items.filter((item) => isReminderOn(item.title)).length;

  return (
    <section className="figma-secondary-layout">
      <div>
        <div className="figma-section-hero">
          <Sparkles size={22} />
          <div>
            <h2>Suggestions tailored to your vehicle</h2>
            <p>Based on your service records, mileage patterns, and technician recommendations. Turn on reminders for the ones you care about.</p>
          </div>
          <strong>{remindersOn}<span>reminders on</span></strong>
        </div>

        {items.length === 0 ? (
          <section className="figma-coverage-empty figma-reminders-empty">
            <Sparkles size={26} />
            <h2>No upcoming reminders yet</h2>
            <p>Reminders will appear here once Trevora can derive them from your actual service history. Add service records to build the schedule now; later, classification will populate this automatically from extracted fields.</p>
            <Link to={`/service-input/${vehicleId}`}>+ Log service</Link>
          </section>
        ) : (
          <>
            <h3 className="figma-section-kicker">Needs attention · {items.length}</h3>
            <div className="figma-suggestion-list">
              {items.map((item) => {
                const reminderOn = isReminderOn(item.title);
                return (
                  <article key={item.title}>
                    <div><Gauge size={22} /></div>
                    <section>
                      <h2>{item.title} <span>{item.kind}</span></h2>
                      <strong>{item.due}</strong>
                      <p>{item.basedOn}</p>
                      {item.note && <p>{item.note}</p>}
                      {item.estimatedCost && <em>Typical cost: {item.estimatedCost}</em>}
                    </section>
                    <footer>
                      <button
                        type="button"
                        className={reminderOn ? 'active' : ''}
                        onClick={() => toggleReminder(item.title)}
                      >
                        <Bell size={14} /> {reminderOn ? 'Reminder on' : 'Notify me'}
                      </button>
                      <Link to={`/service-input/${vehicleId}`}>+ Log service</Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
      <aside className="figma-secondary-rail">
        <section>
          <h3><Bell size={16} /> Reminder settings</h3>
          <p>Push notifications are sent when enabled reminders approach their expected mileage or service date.</p>
          <ul>
            <li><CheckCircle2 size={14} /> When odometer is within 1,000 km</li>
            <li><CheckCircle2 size={14} /> When the due date is 30 days away</li>
            <li><CheckCircle2 size={14} /> When the item becomes overdue</li>
          </ul>
        </section>
        <section>
          <h3>Need a second opinion?</h3>
          <p>Share your service history with a trusted service advisor, mechanic, repair shop staff, or anyone you want to consult.</p>
          <button><Share2 size={15} /> Share with Service Personnel</button>
        </section>
        <section className="soft-blue">
          <h3><Lightbulb size={16} /> How suggestions work</h3>
          <p>Trevora only suggests items we can derive from service records, technician notes, or manufacturer intervals.</p>
        </section>
      </aside>
    </section>
  );
}
function WarrantyCoverage({ vehicleId }) {
  const storageKey = `trevora.manualCoverage.${vehicleId}`;
  const [coverageItems, setCoverageItems] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    provider: '',
    scope: 'Parts',
    coverage: '',
    endISO: '',
    ref: '',
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(coverageItems));
  }, [coverageItems, storageKey]);

  function addCoverage(event) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setCoverageItems((items) => [
      {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        title: draft.title.trim(),
        provider: draft.provider.trim() || 'Provider not specified',
        scope: draft.scope,
        coverage: draft.coverage.trim() || 'Coverage details not specified yet',
        endISO: draft.endISO,
        ref: draft.ref.trim(),
      },
      ...items,
    ]);
    setDraft({ title: '', provider: '', scope: 'Parts', coverage: '', endISO: '', ref: '' });
    setShowAddForm(false);
  }

  function removeCoverage(id) {
    setCoverageItems((items) => items.filter((item) => item.id !== id));
  }

  function daysRemaining(iso) {
    if (!iso) return null;
    const target = new Date(`${iso}T00:00:00`);
    return Math.ceil((target.getTime() - Date.now()) / 86400000);
  }

  return (
    <section className="figma-secondary-layout">
      <div>
        <div className="figma-section-hero">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h2>Warranty & coverage tracker</h2>
            <p>Keep track of every active warranty, insurance policy, and registration. Trevora will remind you before coverage lapses.</p>
          </div>
        </div>
        <h3 className="figma-section-kicker active">Active coverage · {coverageItems.length}</h3>
        {coverageItems.length === 0 ? (
          <section className="figma-coverage-empty">
            <ShieldCheck size={34} aria-hidden="true" />
            <h2>No coverage added yet</h2>
            <p>
              Manual coverage you add will appear here. Once classification is implemented,
              Trevora can automatically surface detected warranties and coverage from confirmed records.
            </p>
            <button type="button" onClick={() => setShowAddForm(true)}>+ Add coverage manually</button>
          </section>
        ) : (
          <div className="figma-warranty-grid">
            {coverageItems.map((item) => {
              const days = daysRemaining(item.endISO);
              return (
                <article key={item.id}>
                  <header>
                    <ShieldCheck size={20} aria-hidden="true" />
                    <div><h2>{item.title}</h2><p>{item.provider}</p></div>
                    <span>{item.scope}</span>
                  </header>
                  <p>{item.coverage}</p>
                  {item.endISO && (
                    <>
                      <div className="figma-warranty-progress"><i /></div>
                      <strong>{days >= 0 ? `${days} days remaining` : `Expired ${Math.abs(days)} days ago`}</strong>
                    </>
                  )}
                  {item.ref && <small># {item.ref}</small>}
                  <footer>
                    <button type="button"><Bell size={14} /> Reminder on</button>
                    <button type="button" className="figma-text-danger" onClick={() => removeCoverage(item.id)}>Remove</button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <aside className="figma-secondary-rail">
        <section><h2>Expiry reminders</h2><p><CheckCircle2 size={14} /> 60 days before expiry - plan ahead</p><p><CheckCircle2 size={14} /> 30 days before expiry - time to renew</p><p><CheckCircle2 size={14} /> 7 days before expiry - final warning</p></section>
        <section><h2>Add coverage manually</h2><p>Insurance, extended warranty, registration, or shop warranty.</p><button type="button" className="figma-add-coverage-button" onClick={() => setShowAddForm((value) => !value)}>{showAddForm ? 'Cancel' : '+ Add coverage'}</button></section>
        {showAddForm && (
          <form className="figma-coverage-form" onSubmit={addCoverage}>
            <label>Coverage name<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Battery warranty" required /></label>
            <label>Provider<input value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} placeholder="Shop, insurer, dealer" /></label>
            <label>Type<select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}><option>Parts</option><option>Labor</option><option>Casa</option><option>Insurance</option><option>Registration</option><option>Extended</option></select></label>
            <label>Coverage details<textarea value={draft.coverage} onChange={(event) => setDraft({ ...draft, coverage: event.target.value })} rows="3" placeholder="What this covers" /></label>
            <label>Expiry date<input type="date" value={draft.endISO} onChange={(event) => setDraft({ ...draft, endISO: event.target.value })} /></label>
            <label>Reference number<input value={draft.ref} onChange={(event) => setDraft({ ...draft, ref: event.target.value })} placeholder="OR, policy, job order, etc." /></label>
            <button type="submit">Save coverage</button>
          </form>
        )}
        <section className="warning"><h2>Not sure if it's covered?</h2><p>Open the linked service record to see the original receipt, job order, and warranty terms.</p></section>
      </aside>
    </section>
  );
}

function FilterToggle({ label, checked, onChange }) {
  return (
    <label className="figma-filter-toggle">
      <button
        type="button"
        className={checked ? 'active' : ''}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span />
      </button>
      {label}
    </label>
  );
}

export default function VehicleServiceHistoryPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('parts-map');
  const [showFilters, setShowFilters] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shopFilter, setShopFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [costMinFilter, setCostMinFilter] = useState('');
  const [costMaxFilter, setCostMaxFilter] = useState('');
  const [odometerMinFilter, setOdometerMinFilter] = useState('');
  const [odometerMaxFilter, setOdometerMaxFilter] = useState('');
  const [casaOnlyFilter, setCasaOnlyFilter] = useState(false);
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);
  const [hasAiFilter, setHasAiFilter] = useState(false);
  const [hasRefsFilter, setHasRefsFilter] = useState(false);
  const [sortOrder, setSortOrder] = useState('latest');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [activeTab, setActiveTab] = useState('records');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('trevora.activeVehicleId', vehicleId);
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicle) return;
    window.localStorage.setItem('trevora.activeVehicleLabel', vehicleName(vehicle));
    window.localStorage.setItem('trevora.activeVehicleSubtitle', vehicleSubtitle(vehicle) || 'Active vehicle');
  }, [vehicle]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getVehicle(vehicleId),
      getVehicleServiceHistory(vehicleId, { sort: sortOrder, keyword: query.trim() }),
    ])
      .then(([vehicleData, historyData]) => {
        if (!active) return;
        setVehicle(vehicleData);
        setHistory(historyData);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vehicleId, query, sortOrder]);

  const records = useMemo(() => (history?.records ?? []).map(normalizeRecord), [history]);
  const filteredRecords = useMemo(() => {
    const filtered = records.filter((record) => {
      const haystack = recordSearchText(record).toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
      const matchesSource = sourceFilter === 'all'
        || String(record.sourceInputMethod || '').toLowerCase() === sourceFilter;
      const matchesServiceType = serviceTypeFilter === 'all' || record.serviceType === serviceTypeFilter;
      const matchesCategory = categoryFilter === 'all' || record.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesShop = shopFilter === 'all' || record.shopName === shopFilter;
      const matchesDateFrom = !dateFromFilter || String(record.serviceDate || '') >= dateFromFilter;
      const matchesDateTo = !dateToFilter || String(record.serviceDate || '') <= dateToFilter;
      const cost = Number(record.totalCost || 0);
      const odometerValue = Number(record.odometer || 0);
      const matchesCostMin = !costMinFilter || cost >= Number(costMinFilter);
      const matchesCostMax = !costMaxFilter || cost <= Number(costMaxFilter);
      const matchesOdometerMin = !odometerMinFilter || odometerValue >= Number(odometerMinFilter);
      const matchesOdometerMax = !odometerMaxFilter || odometerValue <= Number(odometerMaxFilter);
      const shopText = `${record.shopName || ''} ${record.location || ''}`.toLowerCase();
      const matchesCasa = !casaOnlyFilter || /casa|toyota|honda|mitsubishi|ford|nissan|dealer/.test(shopText);
      const matchesAttachments = !hasAttachmentsFilter || Boolean(record.receiptStoragePath || record.attachmentCount || record.attachments?.length);
      const matchesAi = !hasAiFilter || Boolean(record.aiExplanation || record.aiFields?.length || record.draftId);
      const matchesRefs = !hasRefsFilter || Boolean(record.referenceNumber || record.orNumber || record.jobOrderNumber || record.invoiceNumber || record.draftId);
      return matchesQuery
        && matchesSource
        && matchesServiceType
        && matchesCategory
        && matchesStatus
        && matchesShop
        && matchesDateFrom
        && matchesDateTo
        && matchesCostMin
        && matchesCostMax
        && matchesOdometerMin
        && matchesOdometerMax
        && matchesCasa
        && matchesAttachments
        && matchesAi
        && matchesRefs;
    });

    return [...filtered].sort((a, b) => {
      const result = String(a.serviceDate || '').localeCompare(String(b.serviceDate || ''));
      return sortOrder === 'oldest' ? result : -result;
    });
  }, [
    records,
    query,
    sourceFilter,
    serviceTypeFilter,
    categoryFilter,
    statusFilter,
    shopFilter,
    dateFromFilter,
    dateToFilter,
    costMinFilter,
    costMaxFilter,
    odometerMinFilter,
    odometerMaxFilter,
    casaOnlyFilter,
    hasAttachmentsFilter,
    hasAiFilter,
    hasRefsFilter,
    sortOrder,
  ]);

  const serviceTypes = history?.serviceTypes?.length
    ? history.serviceTypes
    : [...new Set(records.map((record) => record.serviceType).filter(Boolean))];
  const sources = [...new Set(records.map((record) => String(record.sourceInputMethod || '').toLowerCase()).filter(Boolean))];
  const categories = [...new Set(records.map((record) => record.category).filter(Boolean))];
  const statuses = [...new Set(records.map((record) => record.status).filter(Boolean))];
  const shops = [...new Set(records.map((record) => record.shopName).filter(Boolean))];
  const groupedRecords = groupByMonth(filteredRecords);
  const totalCost = records.reduce((sum, record) => sum + Number(record.totalCost || 0), 0);
  const latestRecord = records[0];
  const needsReviewCount = records.filter((record) => record.status !== 'Validated').length;
  const suggestions = dueSuggestions(records);
  const activeFilterCount = [
    query,
    sourceFilter !== 'all',
    serviceTypeFilter !== 'all',
    categoryFilter !== 'all',
    statusFilter !== 'all',
    shopFilter !== 'all',
    dateFromFilter,
    dateToFilter,
    costMinFilter,
    costMaxFilter,
    odometerMinFilter,
    odometerMaxFilter,
    casaOnlyFilter,
    hasAttachmentsFilter,
    hasAiFilter,
    hasRefsFilter,
  ].filter(Boolean).length;
  const odometer = newestOdometer(records);

  function clearFilters() {
    setQuery('');
    setSourceFilter('all');
    setServiceTypeFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
    setShopFilter('all');
    setDateFromFilter('');
    setDateToFilter('');
    setCostMinFilter('');
    setCostMaxFilter('');
    setOdometerMinFilter('');
    setOdometerMaxFilter('');
    setCasaOnlyFilter(false);
    setHasAttachmentsFilter(false);
    setHasAiFilter(false);
    setHasRefsFilter(false);
    setSortOrder('latest');
  }

  return (
    <main className="page-shell service-history-page service-history-rich-page">
      <section className="service-history-header">
        <div>
          <h1>Service History</h1>
          <p>
            Track every confirmed record for {vehicleName(vehicle)}, then inspect it by component, timeline, or table.
          </p>
        </div>
        <div className="service-history-actions">
          <button className="vehicle-select-chip" type="button">
            <Car size={16} aria-hidden="true" />
            <span>{vehicleName(vehicle)}</span>
            {vehicleSubtitle(vehicle) && <small>{vehicleSubtitle(vehicle)}</small>}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <Link className="button-link-secondary" to={`/vehicles/${vehicleId}/share`}>
            <Share2 size={16} aria-hidden="true" />
            Share History
          </Link>
          <Link className="button-link" to={`/service-input/${vehicleId}`}>
            <Plus size={16} aria-hidden="true" />
            Add Record
          </Link>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="history-summary-grid">
        <SummaryCard icon={FileText} label="Total Records" value={records.length} sub="all sources" tone="blue" />
        <SummaryCard icon={Calendar} label="Last Service" value={latestRecord ? formatDate(latestRecord.serviceDate) : 'None yet'} sub={latestRecord?.serviceType} tone="cyan" />
        <SummaryCard icon={Gauge} label="Odometer" value={odometer != null ? Number(odometer).toLocaleString() : '-'} sub="km" tone="purple" />
        <SummaryCard icon={Share2} label="Total Spent" value={formatMoney(totalCost).replace('.00', '')} sub="saved records" tone="green" />
        <SummaryCard icon={AlertTriangle} label="Needs Review" value={needsReviewCount} sub={needsReviewCount === 1 ? 'record' : 'records'} tone={needsReviewCount ? 'orange' : 'gray'} />
      </section>

      {needsReviewCount > 0 && (
        <section className="figma-attention-banner">
          <AlertTriangle size={19} aria-hidden="true" />
          <div>
            <strong>{needsReviewCount} record need your attention</strong>
            <p>Some AI-extracted fields have low confidence or are in draft state. Review them to keep your history accurate and shareable.</p>
          </div>
          <button type="button" onClick={() => { setActiveTab('records'); setSourceFilter('all'); }}>
            Review now
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="figma-history-tabs" aria-label="Service history sections">
        <button className={activeTab === 'records' ? 'active' : ''} type="button" onClick={() => setActiveTab('records')}>
          <History size={16} aria-hidden="true" />
          All Records
          <span>{records.length}</span>
        </button>
        <button className={activeTab === 'upcoming' ? 'active' : ''} type="button" onClick={() => setActiveTab('upcoming')}>
          <CalendarClock size={16} aria-hidden="true" />
          Upcoming & Reminders
          {suggestions.length > 0 && <span>{suggestions.length}</span>}
        </button>
        <button className={activeTab === 'warranty' ? 'active' : ''} type="button" onClick={() => setActiveTab('warranty')}>
          <ShieldCheck size={16} aria-hidden="true" />
          Warranty & Coverage
        </button>
      </section>

      {activeTab === 'records' && (
        <>
      <section className="service-history-toolbar rich-history-toolbar">
        <label className="history-search-field">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by service type, part, shop, work performed, or notes..."
          />
        </label>
        <button className={`button-link-secondary history-filter-button ${showFilters ? 'active' : ''}`} type="button" onClick={() => setShowFilters((value) => !value)}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && <span className="history-filter-count">{activeFilterCount}</span>}
        </button>
        <div className="history-view-toggle history-view-toggle-wide">
          <button className={viewMode === 'parts-map' ? 'active' : ''} type="button" onClick={() => setViewMode('parts-map')}>
            <Car size={17} aria-hidden="true" />
            Parts Map
          </button>
          <button className={viewMode === 'timeline' ? 'active' : ''} type="button" onClick={() => setViewMode('timeline')}>
            <LayoutGrid size={17} aria-hidden="true" />
            Timeline
          </button>
          <button className={viewMode === 'table' ? 'active' : ''} type="button" onClick={() => setViewMode('table')}>
            <Table2 size={17} aria-hidden="true" />
            Table
          </button>
        </div>
        {showFilters && (
          <div className="history-filter-panel rich-history-filter-panel figma-filter-panel">
            <label>
              Date from
              <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
            </label>
            <label>
              Date to
              <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
            </label>
            <label>
              Category
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All</option>
                {sources.map((source) => (
                  <option key={source} value={source}>{sourceLabel(source)}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Shop / Service Center
              <select value={shopFilter} onChange={(event) => setShopFilter(event.target.value)}>
                <option value="all">All</option>
                {shops.map((shop) => (
                  <option key={shop} value={shop}>{shop}</option>
                ))}
              </select>
            </label>
            <label>
              Cost range (PHP)
              <div className="figma-filter-range">
                <input inputMode="numeric" placeholder="Min" value={costMinFilter} onChange={(event) => setCostMinFilter(event.target.value)} />
                <input inputMode="numeric" placeholder="Max" value={costMaxFilter} onChange={(event) => setCostMaxFilter(event.target.value)} />
              </div>
            </label>
            <label>
              Odometer (km)
              <div className="figma-filter-range">
                <input inputMode="numeric" placeholder="Min" value={odometerMinFilter} onChange={(event) => setOdometerMinFilter(event.target.value)} />
                <input inputMode="numeric" placeholder="Max" value={odometerMaxFilter} onChange={(event) => setOdometerMaxFilter(event.target.value)} />
              </div>
            </label>
            <div className="figma-filter-toggles">
              <FilterToggle label="Casa records only" checked={casaOnlyFilter} onChange={setCasaOnlyFilter} />
              <FilterToggle label="Has attachments" checked={hasAttachmentsFilter} onChange={setHasAttachmentsFilter} />
              <FilterToggle label="Has AI-suggested fields" checked={hasAiFilter} onChange={setHasAiFilter} />
              <FilterToggle label="Has reference numbers" checked={hasRefsFilter} onChange={setHasRefsFilter} />
            </div>
            <button className="history-clear-filters" type="button" onClick={clearFilters}>
              <X size={15} aria-hidden="true" />
              Clear all
            </button>
          </div>
        )}
      </section>

      <div className="history-result-summary">
        <strong>{filteredRecords.length} of {records.length} records</strong>
        <span>{sortOrder === 'oldest' ? 'Oldest first' : 'Newest first'}</span>
      </div>

      {loading ? (
        <p className="muted">Loading service history...</p>
      ) : records.length === 0 ? (
        <section className="history-empty-state">
          <h2>No confirmed service records yet</h2>
          <p>Confirmed service records for this vehicle will appear here.</p>
          <Link className="button-link" to={`/service-input/${vehicleId}`}>
            Add Service Record
          </Link>
        </section>
      ) : filteredRecords.length === 0 ? (
        <section className="history-empty-state refined-history-empty">
          <Calendar size={38} aria-hidden="true" />
          <h2>No records match your filters</h2>
          <p>Try a different search term or clear the current filters.</p>
          <button className="button-secondary" type="button" onClick={clearFilters}>
            Clear Filters
          </button>
        </section>
      ) : viewMode === 'parts-map' ? (
        <PartsMap
          records={filteredRecords}
          vehicleLabel={vehicleName(vehicle)}
          odometer={odometer || 0}
          onSelectRecord={setSelectedRecord}
          onOpenRecord={(recordId) => navigate(`/vehicles/${vehicleId}/history/${recordId}`)}
          onShare={() => navigate(`/vehicles/${vehicleId}/share`)}
        />
      ) : viewMode === 'timeline' ? (
        <section className="history-two-column">
          <div className="service-timeline refined-service-timeline rich-service-timeline">
            {groupedRecords.map((group) => (
              <div className="history-month-group" key={group.label}>
                <div className="history-month-label">
                  <span>{group.label}</span>
                  <i />
                  <small>{group.records.length} record{group.records.length === 1 ? '' : 's'}</small>
                </div>
                {group.records.map((record) => (
                  <article className="service-timeline-item" key={record.recordId}>
                    <span className="timeline-marker" aria-hidden="true" />
                    <div className="timeline-card refined-timeline-card rich-timeline-card">
                      <div className="timeline-card-header">
                        <div>
                          <span className="history-date">{formatDate(record.serviceDate)}</span>
                          <h2>{record.serviceType || 'Service record'}</h2>
                          <p>{normalizeText(record.shopName, 'Shop not provided')}</p>
                        </div>
                        <div className="history-badge-row">
                          <span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span>
                          <span className={badgeClass(record.status)}>{record.status}</span>
                        </div>
                      </div>
                      <p className="history-record-description">{formatParts(record.partsReplaced)}</p>
                      <div className="history-facts">
                        <span>{record.category || 'General'}</span>
                        <span>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</span>
                        <span>{formatMoney(record.totalCost)}</span>
                      </div>
                      {Array.isArray(record.relatedComponents) && record.relatedComponents.length > 0 && (
                        <div className="classification-badge-row compact">
                          {record.relatedComponents.slice(0, 4).map((component) => (
                            <span className="field-confidence-badge field-confidence-high" key={component}>{component}</span>
                          ))}
                        </div>
                      )}
                      <div className="rich-record-actions">
                        <button type="button" onClick={() => setSelectedRecord(record)}>
                          Preview
                        </button>
                        <Link className="history-view-link" to={`/vehicles/${vehicleId}/history/${record.recordId}`}>
                          View details
                          <Eye size={15} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
          <InsightsRail records={records} suggestions={suggestions} vehicleId={vehicleId} />
        </section>
      ) : (
        <section className="history-two-column">
          <div className="history-table-shell refined-history-table" aria-label="Service records table">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Reference #</th>
                  <th>Category</th>
                  <th>Shop / Service Center</th>
                  <th>Odometer</th>
                  <th>Cost</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.recordId} onClick={() => setSelectedRecord(record)}>
                    <td>{formatDate(record.serviceDate)}</td>
                    <td>
                      <strong>{record.serviceType || 'Service record'}</strong>
                    </td>
                    <td>{record.referenceNumber || record.orNumber || '—'}</td>
                    <td>
                      <span className={badgeClass(record.category)}>{record.category || 'General'}</span>
                      {Array.isArray(record.relatedComponents) && record.relatedComponents[0] && (
                        <small className="table-component-hint">{record.relatedComponents.slice(0, 2).join(', ')}</small>
                      )}
                    </td>
                    <td>{normalizeText(record.shopName, 'Shop not provided')}</td>
                    <td>{record.odometer != null ? `${Number(record.odometer).toLocaleString()} km` : 'No odometer'}</td>
                    <td>{formatMoney(record.totalCost)}</td>
                    <td><span className={badgeClass(record.sourceInputMethod)}>{sourceLabel(record.sourceInputMethod)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InsightsRail records={records} suggestions={suggestions} vehicleId={vehicleId} />
        </section>
      )}
        </>
      )}

      {activeTab === 'upcoming' && (
        <UpcomingAndReminders suggestions={suggestions} records={records} vehicleId={vehicleId} />
      )}

      {activeTab === 'warranty' && (
        <WarrantyCoverage records={records} vehicleId={vehicleId} />
      )}

      <MiniRecordDrawer record={selectedRecord} vehicleId={vehicleId} onClose={() => setSelectedRecord(null)} />
    </main>
  );
}
