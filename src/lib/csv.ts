// Celda CSV segura: neutraliza fórmulas de Excel en datos de usuarias.
export function csvCell(val: unknown): string {
  const s = val === null || val === undefined ? "" : String(val);
  const needsQuote = /[",\n\r]/.test(s);
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (needsQuote || neutralized !== s) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}
