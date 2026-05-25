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
