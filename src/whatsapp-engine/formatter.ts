/**
 * WhatsApp Mobile Card & Message Formatter
 * Generates clean, monospace, mobile-aligned cards for WhatsApp using standard WhatsApp formatting:
 * *bold*, _italic_, ~strike~, ```monospace```
 */

export function unescapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

export function formatCurrencyAmount(amount: string | number, currency = 'USD'): string {
  const curr = (currency || 'USD').toUpperCase().trim();
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  const formattedNum = isNaN(num)
    ? String(amount)
    : (num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, ''));

  if (curr === 'INR') return `₹${formattedNum} INR`;
  if (curr === 'USD') return `$${formattedNum}`;
  if (curr === 'EUR') return `€${formattedNum}`;
  if (curr === 'RUB') return `${formattedNum} ₽`;
  return `${formattedNum} ${curr}`;
}

/**
 * Converts raw Markdown table into WhatsApp card blocks
 */
export function convertMarkdownTableToWhatsAppCards(tableLines: string[]): string {
  if (!tableLines || tableLines.length < 2) return tableLines ? tableLines.join('\n') : '';

  const parseCells = (line: string) =>
    line
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, '|').trim());

  const rawHeaders = parseCells(tableLines[0]);
  const headers = rawHeaders.map((h) => h.replace(/\*\*/g, '').toLowerCase());
  const dataRows = tableLines.slice(1).filter((l) => !/^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(l));

  const badges = ['🥇', '🥈', '🥉', '🔹', '🔹', '🔹', '🔹', '🔹', '🔹', '🔹'];
  const cards: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = parseCells(dataRows[i]);
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (cells[idx] || '').replace(/\*\*/g, '').trim();
    });

    let serviceId = '';
    let name = '';
    let rate = '';
    let min = '';
    let max = '';

    for (const [rawKey, val] of Object.entries(rowObj)) {
      if (!val) continue;
      const key = rawKey.toLowerCase();
      if (key.includes('service id') || key === 'id' || key === 'service_id' || key === 'service') {
        serviceId = val;
      } else if (key.includes('name') || key.includes('title')) {
        name = val;
      } else if (key.includes('rate') || key.includes('price') || key.includes('cost')) {
        rate = val;
      } else if (key.includes('min')) {
        min = val;
      } else if (key.includes('max')) {
        max = val;
      }
    }

    const badge = badges[i] || '🔹';
    let card = `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (serviceId) {
      card += `${badge} *#${serviceId}* — ${name || 'Service'}\n`;
    } else {
      card += `${badge} ${name || 'Service'}\n`;
    }
    if (rate) card += `💰 *Rate:* ${rate} / 1k\n`;
    if (min || max) card += `📊 *Min / Max:* ${min || '1'} — ${max || 'N/A'}\n`;
    card += `━━━━━━━━━━━━━━━━━━━━━`;
    cards.push(card);
  }

  return cards.join('\n\n');
}

/**
 * Converts HTML and Markdown into clean WhatsApp-compatible text
 */
export function formatWhatsAppMessage(raw: string): string {
  if (!raw) return '';

  let out = raw;

  // 1. Protect code blocks ```code```
  const codeBlocks: string[] = [];
  out = out.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
    codeBlocks.push(`\`\`\`${code.trim()}\`\`\``);
    return `@@@WA_CODEBLOCK_${codeBlocks.length - 1}@@@`;
  });

  // 2. Protect inline code `code`
  const inlineCodes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => {
    inlineCodes.push(`\`${code}\``);
    return `@@@WA_INLINE_${inlineCodes.length - 1}@@@`;
  });

  // 3. Convert markdown pipe tables into WhatsApp card blocks if present
  const lines = out.split('\n');
  const tableLines: string[] = [];
  let inTable = false;
  const processedLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableLines.push(line);
    } else {
      if (inTable) {
        processedLines.push(convertMarkdownTableToWhatsAppCards(tableLines));
        tableLines.length = 0;
        inTable = false;
      }
      processedLines.push(line);
    }
  }
  if (inTable) {
    processedLines.push(convertMarkdownTableToWhatsAppCards(tableLines));
  }
  out = processedLines.join('\n');

  // 4. Convert markdown links [label](url) -> label (url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');

  // 5. Convert markdown list bullets (* or - at start of line) to clean bullet symbols
  out = out.replace(/^[*-]\s+/gm, '• ');

  // 6. Round floating decimal balances/rates with >=3 decimals down to 2 decimals
  out = out.replace(/(\d+\.\d{3,})\s*(INR|USD|EUR|RUB)/gi, (_m, num, curr) => {
    const rounded = Number(num).toFixed(2);
    return `${rounded} ${curr.toUpperCase()}`;
  });

  // 7. Convert markdown single-asterisk italics (*text*) to WhatsApp italics (_text_)
  // Note: Uses lookahead/lookbehind so it does not touch markdown double asterisks (**bold**)
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_');

  // 8. Convert markdown bold (**text** or __text__) to WhatsApp bold (*text*)
  out = out.replace(/\*\*(.*?)\*\*/g, '*$1*');
  out = out.replace(/__(.*?)__/g, '*$1*');

  // 9. Convert standard HTML tags to WhatsApp formatting
  out = out
    .replace(/<b>(.*?)<\/b>/gi, '*$1*')
    .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '_$1_')
    .replace(/<em>(.*?)<\/em>/gi, '_$1_')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, '```$1```')
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ''); // Strip any remaining tags

  // 10. Restore protected code blocks and inline code
  out = out.replace(/@@@WA_INLINE_(\d+)@@@/g, (_m, idx) => inlineCodes[Number(idx)] || '');
  out = out.replace(/@@@WA_CODEBLOCK_(\d+)@@@/g, (_m, idx) => codeBlocks[Number(idx)] || '');

  // 11. Unescape HTML entities
  out = unescapeHtml(out);

  // 12. Clean consecutive empty lines
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

export interface FormattedSmmService {
  id?: string | number;
  service?: string | number;
  name: string;
  rate: string | number;
  min: string | number;
  max: string | number;
  category?: string;
}

/**
 * Formats a list of SMM services into WhatsApp cards
 */
export function formatWhatsAppServicesList(
  services: FormattedSmmService[],
  currency = 'USD'
): string {
  if (!services || services.length === 0) {
    return '_No matching services found in the catalog._';
  }

  const badges = ['🥇', '🥈', '🥉', '🔹', '🔹', '🔹', '🔹', '🔹', '🔹', '🔹'];
  const cards = services.map((s, idx) => {
    const serviceId = s.id || s.service || 'N/A';
    const name = s.name;
    const category = s.category ? `📁 _${s.category}_\n` : '';
    const rate = formatCurrencyAmount(s.rate, currency);
    const min = String(s.min);
    const max = String(s.max);
    const badge = badges[idx] || '🔹';

    return (
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${badge} *#${serviceId}* — ${name}\n` +
      `${category}` +
      `💰 *Rate:* ${rate} / 1k\n` +
      `📦 *Min / Max:* ${min} — ${max}\n` +
      `━━━━━━━━━━━━━━━━━━━━━`
    );
  });

  return cards.join('\n\n');
}
