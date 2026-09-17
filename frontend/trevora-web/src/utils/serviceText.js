
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

export function serviceItemsPartsInline(services, fallback = '-') {
  const parts = serviceItemsArray(services).map((item) => item.partsReplaced).filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}
