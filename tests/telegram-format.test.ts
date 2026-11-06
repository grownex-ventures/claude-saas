import { describe, it, expect } from 'vitest';
import { formatTelegramHtml, cleanPlainText, escapeHtml } from '../src/common/utils/telegram-format.js';

describe('Telegram Message Styler & Formatter Suite', () => {
  it('escapes raw HTML entities safely', () => {
    expect(escapeHtml('<script>alert("xss")</script> & "fun"')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt; &amp; "fun"'
    );
  });

  it('converts markdown bold to Telegram HTML <b> tags', () => {
    const input = 'Your account balance is **12.34 INR**.';
    expect(formatTelegramHtml(input)).toBe('Your account balance is <b>12.34 INR</b>.');
  });

  it('converts markdown italics to Telegram HTML <i> tags', () => {
    const input = 'This package has *Lifetime Guarantee*.';
    expect(formatTelegramHtml(input)).toBe('This package has <i>Lifetime Guarantee</i>.');
  });

  it('converts inline code and code blocks to <code> tags', () => {
    const input = 'Use `/services 4343` to lookup details.';
    expect(formatTelegramHtml(input)).toBe('Use <code>/services 4343</code> to lookup details.');
  });

  it('converts markdown links to <a> tags', () => {
    const input = 'Visit [our dashboard](https://mysmmpanel.com) now.';
    expect(formatTelegramHtml(input)).toBe('Visit <a href="https://mysmmpanel.com">our dashboard</a> now.');
  });

  it('converts messy bullet lists into clean bullet cards with bold titles', () => {
    const input =
      '* **ID 4511:** Includes Likes + 5% Reposts — *Rate: $27.51 / 1k*\n' +
      '* **ID 4512:** Includes Likes + 10% Reposts — *Rate: $31.21 / 1k*';

    const formatted = formatTelegramHtml(input);
    expect(formatted).toContain('• <b>ID 4511:</b> Includes Likes + 5% Reposts — <i>Rate: $27.51 / 1k</i>');
    expect(formatted).toContain('• <b>ID 4512:</b> Includes Likes + 10% Reposts — <i>Rate: $31.21 / 1k</i>');
  });

  it('cleanPlainText strips markdown symbols cleanly for fallback', () => {
    const input = '**ID 4511:** *Rate: $27.51* `code` [link](https://test.com)';
    const clean = cleanPlainText(input);
    expect(clean).toBe('ID 4511: Rate: $27.51 code link');
  });
});
