import { SmmService } from '../smm-core/smm-client.js';

export interface SmmSearchIntent {
  isSearch: boolean;
  platform?: string;
  category?: string;
  refill?: boolean;
  maxPrice?: number;
  sortBy?: 'cheapest' | 'rate';
  queryTerms: string[];
  rawQuery: string;
}

/**
 * High-performance deterministic Natural Language SMM Search Intent Parser.
 * Executes on CPU in <0.5ms with zero LLM tokens.
 */
export class SmmIntentParser {
  private static readonly PLATFORM_MAP: Record<string, string> = {
    ig: 'INSTAGRAM',
    insta: 'INSTAGRAM',
    instagram: 'INSTAGRAM',
    reels: 'INSTAGRAM',
    yt: 'YOUTUBE',
    youtube: 'YOUTUBE',
    shorts: 'YOUTUBE',
    tt: 'TIKTOK',
    tiktok: 'TIKTOK',
    tg: 'TELEGRAM',
    telegram: 'TELEGRAM',
    tw: 'TWITTER',
    twitter: 'TWITTER',
    x: 'TWITTER',
    fb: 'FACEBOOK',
    facebook: 'FACEBOOK',
    spotify: 'SPOTIFY',
    linkedin: 'LINKEDIN',
    threads: 'THREADS',
    discord: 'DISCORD',
    twitch: 'TWITCH',
    snapchat: 'SNAPCHAT'
  };

  private static readonly METRIC_MAP: Record<string, string> = {
    followers: 'Followers',
    follower: 'Followers',
    likes: 'Likes',
    like: 'Likes',
    views: 'Views',
    view: 'Views',
    subscribers: 'Subscribers',
    subscriber: 'Subscribers',
    subs: 'Subscribers',
    members: 'Members',
    member: 'Members',
    comments: 'Comments',
    comment: 'Comments',
    shares: 'Shares',
    share: 'Shares',
    reposts: 'Reposts',
    repost: 'Reposts',
    saves: 'Saves',
    save: 'Saves',
    watchtime: 'Watch Time',
    'watch time': 'Watch Time',
    retweets: 'Retweets',
    retweet: 'Retweets'
  };

  /**
   * Parses natural language query into strongly-typed SMM intent in <0.5ms on CPU.
   */
  static parse(query: string): SmmSearchIntent {
    const raw = (query || '').trim();
    const lower = raw.toLowerCase();
    const clean = lower.replace(/[^a-z0-9\s$.]/g, ' ');

    let platform: string | undefined;
    for (const [alias, canonical] of Object.entries(this.PLATFORM_MAP)) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(clean)) {
        platform = canonical;
        break;
      }
    }

    let category: string | undefined;
    for (const [alias, canonical] of Object.entries(this.METRIC_MAP)) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(clean)) {
        category = canonical;
        break;
      }
    }

    // Refill detection
    let refill: boolean | undefined;
    if (/\b(with\s*refill|30\s*days?\s*refill|guaranteed|warranty|refillable|auto\s*refill)\b/i.test(clean)) {
      refill = true;
    } else if (/\b(no\s*refill|non\s*refill|without\s*refill|no\s*drop|non\s*drop)\b/i.test(clean)) {
      refill = false;
    } else if (/\brefill\b/i.test(clean) && !/\b(no|non|without)\b/i.test(clean)) {
      refill = true;
    }

    // Price cap extraction (under $2, below 1.5, < 50 cents, max $3)
    let maxPrice: number | undefined;
    const priceMatch =
      clean.match(/(?:under|below|max|less\s*than|<|\bup\s*to)\s*\$?([0-9]+(?:\.[0-9]+)?)/i) ||
      clean.match(/\$([0-9]+(?:\.[0-9]+)?)\s*(?:max|or\s*less|budget)/i);
    if (priceMatch && priceMatch[1]) {
      const parsed = parseFloat(priceMatch[1]);
      if (!isNaN(parsed) && parsed > 0) {
        maxPrice = parsed;
      }
    }

    // Sort by cheapest
    const sortBy = /\b(cheap|cheapest|lowest|budget|low\s*cost|best\s*rate)\b/i.test(clean) ? 'cheapest' : 'rate';

    // Is it a search query?
    const hasSearchKeyword = /\b(service|services|price|prices|rate|rates|cost|catalog|buy|get|purchase|show|list)\b/i.test(clean);
    const isSearch = Boolean(platform || category || hasSearchKeyword);

    // Extract significant query tokens
    const queryTerms = clean
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !['show', 'me', 'the', 'what', 'are', 'your', 'list', 'all', 'how', 'much', 'for', 'can', 'i', 'get', 'with', 'under', 'and'].includes(w));

    return {
      isSearch,
      platform,
      category,
      refill,
      maxPrice,
      sortBy,
      queryTerms,
      rawQuery: raw
    };
  }

  /**
   * Filters and ranks catalog services matching the structured intent.
   * Returns top matching services sorted by price.
   */
  static filterCatalog(services: SmmService[], intent: SmmSearchIntent, limit = 3): SmmService[] {
    if (!Array.isArray(services) || services.length === 0) return [];

    const candidates = services.filter((s) => {
      const nameLower = (s.name || '').toLowerCase();
      const catLower = (s.category || '').toLowerCase();
      const combined = `${nameLower} ${catLower}`;

      // 1. Platform constraint
      if (intent.platform) {
        const plat = intent.platform.toLowerCase();
        if (!combined.includes(plat)) {
          // Check common aliases
          if (plat === 'instagram' && !(combined.includes('ig') || combined.includes('insta') || combined.includes('reels'))) return false;
          if (plat === 'youtube' && !(combined.includes('yt') || combined.includes('shorts'))) return false;
          if (plat === 'tiktok' && !combined.includes('tt')) return false;
          if (plat === 'telegram' && !combined.includes('tg')) return false;
          if (plat === 'twitter' && !(combined.includes('tw') || combined.includes(' x '))) return false;
          if (!['instagram', 'youtube', 'tiktok', 'telegram', 'twitter'].includes(plat)) return false;
        }
      }

      // 2. Category / Metric constraint
      if (intent.category) {
        const cat = intent.category.toLowerCase();
        if (!combined.includes(cat)) {
          if (cat === 'subscribers' && !(combined.includes('subs') || combined.includes('subscribers') || combined.includes('members'))) return false;
          if (cat === 'followers' && !(combined.includes('follower') || combined.includes('followers'))) return false;
          if (cat === 'views' && !(combined.includes('view') || combined.includes('views') || combined.includes('plays'))) return false;
          if (cat === 'likes' && !(combined.includes('like') || combined.includes('likes') || combined.includes('hearts'))) return false;
          if (!['subscribers', 'followers', 'views', 'likes'].includes(cat)) return false;
        }
      }

      // 3. Refill constraint
      if (intent.refill !== undefined) {
        const isExplicitNoRefill = s.refill === false || /\b(no\s*refill|non\s*refill|without\s*refill)\b/i.test(combined);
        const hasPositiveRefill = Boolean(s.refill) || (/\b(with\s*refill|refill|guarantee|warranty)\b/i.test(combined) && !isExplicitNoRefill);

        if (intent.refill === true && (isExplicitNoRefill || !hasPositiveRefill)) return false;
        if (intent.refill === false && hasPositiveRefill) return false;
      }

      // 4. Max Price constraint
      const numRate = typeof s.rate === 'number' ? s.rate : parseFloat(String(s.rate || '0'));
      if (intent.maxPrice !== undefined && !isNaN(numRate)) {
        if (numRate > intent.maxPrice) return false;
      }

      // 5. Query terms fallback if neither platform nor category specified
      if (!intent.platform && !intent.category && intent.queryTerms.length > 0) {
        const matchesTerm = intent.queryTerms.some((t) => combined.includes(t));
        if (!matchesTerm) return false;
      }

      return true;
    });

    // Sort by price ascending
    candidates.sort((a, b) => {
      const rateA = typeof a.rate === 'number' ? a.rate : parseFloat(String(a.rate || '0')) || 0;
      const rateB = typeof b.rate === 'number' ? b.rate : parseFloat(String(b.rate || '0')) || 0;
      return rateA - rateB;
    });

    return candidates.slice(0, limit);
  }
}
