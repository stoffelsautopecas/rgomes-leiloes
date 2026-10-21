// BR Code field 59: Merchant Name (Banco Central, Manual BR Code).
// This reads the payload label, not the bank's verified account-holder name.
export function pixReceiverName(payload) {
  const code = String(payload || '').trim();
  if (!code.startsWith('000201')) return '';
  let offset = 0;
  let name = '';
  while (offset < code.length) {
    const header = code.slice(offset, offset + 4);
    if (!/^\d{4}$/.test(header)) return '';
    const tag = header.slice(0, 2);
    const length = Number(header.slice(2));
    offset += 4;
    if (offset + length > code.length) return '';
    const value = code.slice(offset, offset + length);
    if (tag === '59') {
      if (name || length < 1 || length > 25) return '';
      name = value.trim();
    }
    offset += length;
  }
  return name;
}
