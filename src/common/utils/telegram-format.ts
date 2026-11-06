/**
 * Telegram Message Styler & HTML Formatter
 * Converts standard Markdown (bold, italic, code, links, lists) into Telegram-compliant HTML
 * with safe entity escaping and clean typographic hierarchy.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatTelegramHtml(text: string): string {
  if (!text) return '';

  // 1. Normalize line endings and trim
  let result = text.replace(/\r\n/g, '\n').trim();

  // 2. Protect existing code blocks: ```code``` using collision-free placeholders
  const codeBlocks: string[] = [];
  result = result.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_match, code) => {
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `@@@CODEBLOCK${codeBlocks.length - 1}@@@`;
  });

  // 3. Protect inline code: `code`
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (_match, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `@@@INLINECODE${inlineCodes.length - 1}@@@`;
  });

  // 4. Protect markdown links: [text](url)
  const links: string[] = [];
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    return `@@@LINK${links.length - 1}@@@`;
  });

  // 5. Escape remaining raw HTML special chars
  result = escapeHtml(result);

  // 6. Convert Bold: **text** or __text__
  result = result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  result = result.replace(/__(.*?)__/g, '<b>$1</b>');

  // 7. Convert Italic: *text* or _text_ (when not part of a word or emoji)
  result = result.replace(/(^|[\s(])\*([^*\n]+)\*([\s).,!?:;]|$)/g, '$1<i>$2</i>$3');
  result = result.replace(/(^|[\s(])_([^_\n]+)_([\s).,!?:;]|$)/g, '$1<i>$2</i>$3');

  // 8. Convert list bullets: '* ' or '- ' at beginning of line
  result = result.replace(/^[*-]\s+/gm, '• ');

  // 9. Restore links, inline codes, code blocks
  result = result.replace(/@@@LINK(\d+)@@@/g, (_match, idx) => links[Number(idx)] || '');
  result = result.replace(/@@@INLINECODE(\d+)@@@/g, (_match, idx) => inlineCodes[Number(idx)] || '');
  result = result.replace(/@@@CODEBLOCK(\d+)@@@/g, (_match, idx) => codeBlocks[Number(idx)] || '');

  return result;
}

export function cleanPlainText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*([\s).,!?:;]|$)/g, '$1$2$3')
    .replace(/(^|[\s(])_([^_\n]+)_([\s).,!?:;]|$)/g, '$1$2$3')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[*-]\s+/gm, '• ')
    .trim();
}
