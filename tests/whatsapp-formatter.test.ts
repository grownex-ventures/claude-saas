import { describe, it, expect } from 'vitest';
import {
  formatWhatsAppMessage,
  formatCurrencyAmount,
  formatWhatsAppServicesList,
  unescapeHtml,
  convertMarkdownTableToWhatsAppCards
} from '../src/whatsapp-engine/formatter.js';

describe('WhatsApp Formatter Suite', () => {
  it('correctly unescapes HTML entities', () => {
    expect(unescapeHtml('&lt;b&gt;Test &amp; Co&#039;s&quot;&lt;/b&gt;')).toBe("<b>Test & Co's\"</b>");
  });

  it('formats currency correctly', () => {
    expect(formatCurrencyAmount(10.5, 'USD')).toBe('$10.5');
    expect(formatCurrencyAmount(500, 'INR')).toBe('₹500 INR');
    expect(formatCurrencyAmount(25, 'EUR')).toBe('€25');
  });

  it('transforms HTML/Markdown to WhatsApp markup', () => {
    const input = '<strong>Notice:</strong> Please <i>check</i> your <code>API_KEY</code>.';
    const formatted = formatWhatsAppMessage(input);
    expect(formatted).toBe('*Notice:* Please _check_ your `API_KEY`.');
  });

  it('converts markdown tables into WhatsApp mobile cards', () => {
    const table = [
      '| Service ID | Name | Rate | Min | Max |',
      '| --- | --- | --- | --- | --- |',
      '| 101 | Instagram Followers | $1.20 | 50 | 10000 |'
    ];
    const cards = convertMarkdownTableToWhatsAppCards(table);
    expect(cards).toContain('*#101* — Instagram Followers');
    expect(cards).toContain('Rate:* $1.20 / 1k');
    expect(cards).toContain('Min / Max:* 50 — 10000');
  });

  it('formats services list into structured cards', () => {
    const services = [
      { id: '1', name: 'YouTube Views', rate: 2.5, min: 100, max: 50000, category: 'YouTube' }
    ];
    const result = formatWhatsAppServicesList(services, 'USD');
    expect(result).toContain('*#1* — YouTube Views');
    expect(result).toContain('📁 _YouTube_');
    expect(result).toContain('💰 *Rate:* $2.5 / 1k');
  });
});
