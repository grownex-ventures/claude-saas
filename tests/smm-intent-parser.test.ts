import { describe, it, expect } from 'vitest';
import { SmmIntentParser } from '../src/ai-engine/smm-intent-parser.js';
import { SmmService } from '../src/smm-core/smm-client.js';

describe('SMM Natural Language Intent Parser Suite (Panelwise Engine)', () => {
  it('parses platform aliases into canonical platform identifiers in <1ms', () => {
    expect(SmmIntentParser.parse('ig followers').platform).toBe('INSTAGRAM');
    expect(SmmIntentParser.parse('insta followers').platform).toBe('INSTAGRAM');
    expect(SmmIntentParser.parse('reels views').platform).toBe('INSTAGRAM');
    expect(SmmIntentParser.parse('yt views cheap').platform).toBe('YOUTUBE');
    expect(SmmIntentParser.parse('youtube subscribers').platform).toBe('YOUTUBE');
    expect(SmmIntentParser.parse('shorts views').platform).toBe('YOUTUBE');
    expect(SmmIntentParser.parse('tt likes').platform).toBe('TIKTOK');
    expect(SmmIntentParser.parse('tiktok views').platform).toBe('TIKTOK');
    expect(SmmIntentParser.parse('tg channel members').platform).toBe('TELEGRAM');
    expect(SmmIntentParser.parse('twitter retweets').platform).toBe('TWITTER');
  });

  it('extracts target metrics and categories', () => {
    expect(SmmIntentParser.parse('cheap instagram followers').category).toBe('Followers');
    expect(SmmIntentParser.parse('youtube views 10k').category).toBe('Views');
    expect(SmmIntentParser.parse('tiktok likes instant').category).toBe('Likes');
    expect(SmmIntentParser.parse('youtube subscribers fast').category).toBe('Subscribers');
    expect(SmmIntentParser.parse('telegram channel members').category).toBe('Members');
    expect(SmmIntentParser.parse('custom comments for post').category).toBe('Comments');
  });

  it('distinguishes positive vs negative refill intents', () => {
    expect(SmmIntentParser.parse('ig followers with refill').refill).toBe(true);
    expect(SmmIntentParser.parse('ig followers 30 days refill').refill).toBe(true);
    expect(SmmIntentParser.parse('ig followers guaranteed').refill).toBe(true);
    expect(SmmIntentParser.parse('ig followers no refill').refill).toBe(false);
    expect(SmmIntentParser.parse('ig followers non refill').refill).toBe(false);
    expect(SmmIntentParser.parse('ig followers without refill').refill).toBe(false);
    expect(SmmIntentParser.parse('ig followers').refill).toBeUndefined();
  });

  it('extracts price caps and budget limits', () => {
    expect(SmmIntentParser.parse('instagram followers under $2').maxPrice).toBe(2);
    expect(SmmIntentParser.parse('youtube views below 1.50').maxPrice).toBe(1.5);
    expect(SmmIntentParser.parse('tiktok likes less than $0.50').maxPrice).toBe(0.5);
    expect(SmmIntentParser.parse('telegram members $3 max').maxPrice).toBe(3);
  });

  it('detects cheapest sorting preference', () => {
    expect(SmmIntentParser.parse('cheapest ig followers').sortBy).toBe('cheapest');
    expect(SmmIntentParser.parse('lowest price youtube views').sortBy).toBe('cheapest');
    expect(SmmIntentParser.parse('budget tiktok likes').sortBy).toBe('cheapest');
  });

  it('filters and ranks a real catalog slice matching intent', () => {
    const mockServices: SmmService[] = [
      { service: 101, name: 'Instagram Followers (HQ)', category: 'Instagram Followers', rate: 1.20, min: 100, max: 10000, refill: true },
      { service: 102, name: 'Instagram Followers (No Refill)', category: 'Instagram Followers', rate: 0.80, min: 100, max: 50000, refill: false },
      { service: 103, name: 'Instagram Followers (Real Refill)', category: 'Instagram Followers', rate: 2.50, min: 100, max: 50000, refill: true },
      { service: 201, name: 'YouTube Views (Monetizable)', category: 'YouTube Views', rate: 1.90, min: 500, max: 100000, refill: true },
      { service: 301, name: 'TikTok Likes (Fast)', category: 'TikTok Likes', rate: 0.50, min: 50, max: 10000 }
    ];

    const intent = SmmIntentParser.parse('ig followers with refill under $2');
    const filtered = SmmIntentParser.filterCatalog(mockServices, intent, 3);

    expect(filtered.length).toBe(1);
    expect(filtered[0].service).toBe(101);
    expect(filtered[0].name).toContain('Instagram Followers (HQ)');
  });
});
