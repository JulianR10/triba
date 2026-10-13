// Escape a CSV cell and neutralize spreadsheet formula prefixes.
export function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(raw) || neutralized !== raw) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}
