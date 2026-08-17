export function serviceTextLines(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      return [text];
    }
  }

  return [text];
}

export function formatServiceText(value, fallback = 'Not provided') {
  const lines = serviceTextLines(value);
  return lines.length ? lines.join('\n') : fallback;
}

export function formatServiceTextInline(value, fallback = '-') {
  const lines = serviceTextLines(value);
  return lines.length ? lines.join(', ') : fallback;
}

// --- Service line item ("services" array) helpers ---
// A service_draft/service_record now carries `services: [{ itemId, serviceType,
// serviceCategory, partsReplaced, laborPerformed, lineCost, sortOrder }, ...]`
// instead of one flat serviceType/partsReplaced/laborPerformed string set. These helpers
// format that array for display/search without needing a full ServiceItemsList render.

export function serviceItemsArray(services) {
  return Array.isArray(services) ? services.filter(Boolean) : [];
}

/**
 * Short label for a record/draft's services, e.g. "Oil change" or "Oil change +2 more".
 * Used for card/table/detail titles that previously showed the single serviceType scalar.
 */
export function serviceItemsSummaryLabel(services, fallback = 'Service record') {
  const items = serviceItemsArray(services);
  if (!items.length) return fallback;
  const first = String(items[0]?.serviceType || '').trim() || fallback;
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

/** Flattened, lower-case-friendly text across every item, for search/filter/component inference. */
export function serviceItemsSearchText(services) {
  return serviceItemsArray(services)
    .map((item) => [item.serviceType, item.serviceCategory, item.partsReplaced, item.laborPerformed]
      .filter(Boolean)
      .join(' '))
    .join(' ');
}

/** All parts-replaced text across every item, formatted as one inline/multi-line string. */
export function serviceItemsPartsText(services, fallback = 'Not provided') {
  const parts = serviceItemsArray(services).map((item) => item.partsReplaced).filter(Boolean);
  return parts.length ? parts.join('\n') : fallback;
}

export function serviceItemsPartsInline(services, fallback = '-') {
  const parts = serviceItemsArray(services).map((item) => item.partsReplaced).filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}

/** All labor-performed text across every item, formatted as one inline/multi-line string. */
export function serviceItemsLaborText(services, fallback = 'Not provided') {
  const labor = serviceItemsArray(services).map((item) => item.laborPerformed).filter(Boolean);
  return labor.length ? labor.join('\n') : fallback;
}

export function serviceItemsLaborInline(services, fallback = '-') {
  const labor = serviceItemsArray(services).map((item) => item.laborPerformed).filter(Boolean);
  return labor.length ? labor.join(', ') : fallback;
}

/** Distinct serviceType values found across every item of every record, for filter dropdowns. */
export function uniqueServiceTypes(records) {
  const seen = new Set();
  (records || []).forEach((record) => {
    serviceItemsArray(record?.services).forEach((item) => {
      const type = String(item?.serviceType || '').trim();
      if (type) seen.add(type);
    });
  });
  return [...seen];
}

/** True if any item in the record's services array has the given serviceType. */
export function recordHasServiceType(record, serviceType) {
  if (!serviceType) return true;
  return serviceItemsArray(record?.services).some((item) => item.serviceType === serviceType);
}
