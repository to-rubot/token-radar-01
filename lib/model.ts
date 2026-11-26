// Token launch radar, model v2: one sealed snapshot in, one ranked board out.
//
// What the board claims: if a pre-token protocol's record stayed as it is, what would its launch be
// worth, and what should a reader do to farm it before it issues? The board never predicts whether
// or when a token is issued, and it says a protocol "records no token", never that it has none:
// DefiLlama's record is the input, not proof.
//
// The value model is calibrated by the snapshot itself, not by a hand-kept list of names:
//
//   peers      Every protocol whose token already trades gives one observation of what the market
//              pays per dollar of TVL: mcap_usd / tvl_usd. The model takes the median of those
//              ratios inside the protocol's own category (shrunk toward the global median when a
//              category has few live peers, clamped to [0.03, 1.5]) as the base multiple. A lending
//              market is therefore priced like lending markets, a DEX like DEXes.
//   implied    = tvl_usd x peer_multiple x growth x maturity x breadth, rounded to whole dollars.
//   growth     = 1 + clamp(change_7d, -60, +150) / 100 x 0.45: a hot week lifts the claim, a bad
//              week cuts it, and one absurd print (the snapshot's largest is +4448%) cannot run away.
//   maturity   = 0.55 + 0.45 x ln(1 + age_days) / ln(1 + 1460): surviving years with no token is
//              evidence a launch would be taken seriously; the log shape pays for the first year
//              most. An unreported listing date scores as 365 days.
//   breadth    = 1 + 0.03 x min(chains - 1, 5): a protocol live on more chains has more holders to
//              distribute a launch to, worth at most +15%.
//
// The board is the watchlist (the floor, all of it) plus every rankable pre-token protocol below
// the floor: the radar keeps the whole early field, not a top slice. Protocols above the floor that
// the watchlist rule left out (wrapped, staked, bridged or versioned products of tokens that already
// trade) stay out: they are not launches waiting to happen. A row whose own record still looks
// product-like is flagged `product_like` so the detail view can warn the reader to verify it.
//
// Farm plans are playbooks per category, parameterised by the protocol's own record: its first
// chain sets the gas budget, its TVL sets the capital tier, its age sets the hold window. Every
// step states what it costs and how long it takes. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra_chains: number;
  peer_shrinkage: number;
  peer_small_sample_extra: number;
  peer_min_ratio: number;
  peer_max_ratio: number;
  multiple_floor: number;
  multiple_cap: number;
  range_low_factor: number;
  range_high_factor: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_extra_chains: 5,
  peer_shrinkage: 8,
  peer_small_sample_extra: 6,
  peer_min_ratio: 0.01,
  peer_max_ratio: 20,
  multiple_floor: 0.03,
  multiple_cap: 1.5,
  range_low_factor: 0.55,
  range_high_factor: 1.8,
};

/** The model's version label: the dashboard names it and the board carries it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 32;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  product_like: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan, verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  product_like: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  peer_multiple: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** The peer calibration the dashboard states: one global multiple and one per category used. */
export interface PeerTable {
  global_multiple: number;
  global_count: number;
  categories: { category: string; peers: number; multiple: number }[];
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  peers: PeerTable;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_tvl_usd: number;
  total_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from the listing date to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, computed on a sorted copy so runs are byte-identical. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the early radar may rank: pre-token, not an exchange, not versioned. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Staking Pool']);
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a pre-token record still looks like a product of a token that already trades. Such a row
 * can be farmed like any other, but its "launch" may never be its own, so the dashboard warns.
 */
export function isProductLike(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (PRODUCT_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIX.test(p.name);
}

/** The peer multiples implied by the snapshot's live-token protocols, global and per category. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; globalCount: number; byCategory: Map<string, { peers: number; multiple: number }> } {
  const ratios: number[] = [];
  const perCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (ratio < model.peer_min_ratio || ratio > model.peer_max_ratio) continue;
    ratios.push(ratio);
    if (p.category !== null) {
      const list = perCategory.get(p.category) ?? [];
      list.push(ratio);
      perCategory.set(p.category, list);
    }
  }
  const globalRaw = ratios.length > 0 ? median(ratios) : 0.25;
  const global = Math.min(model.multiple_cap, Math.max(model.multiple_floor, globalRaw));
  const byCategory = new Map<string, { peers: number; multiple: number }>();
  for (const [category, list] of perCategory) {
    // A category with one or two live peers is an anecdote, not a market: shrink it harder toward
    // the global median so a single richly priced peer cannot carry a whole category's board.
    const k = model.peer_shrinkage + Math.max(0, 3 - list.length) * model.peer_small_sample_extra;
    const shrunk = (list.length * median(list) + k * global) / (list.length + k);
    byCategory.set(category, {
      peers: list.length,
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk)),
    });
  }
  return { global, globalCount: ratios.length, byCategory };
}

/** The base multiple one protocol gets: its category's shrunk median, or the global median. */
function peerFor(p: SnapshotProtocol, peers: ReturnType<typeof peerMultiples>): { multiple: number; count: number } {
  if (p.category !== null) {
    const entry = peers.byCategory.get(p.category);
    if (entry !== undefined) return { multiple: entry.multiple, count: entry.peers };
  }
  return { multiple: peers.global, count: peers.globalCount };
}

/** Every multiplier and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peers: ReturnType<typeof peerMultiples>,
  model: ModelConstants = MODEL,
): { implied: number; low: number; high: number; peerMultiple: number; peerCount: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (Math.log(1 + Math.max(0, ageForModel)) / Math.log(1 + model.maturity_days));
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const peer = peerFor(protocol, peers);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peer.multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    low: Math.max(1, Math.round(implied * model.range_low_factor)),
    high: Math.round(implied * model.range_high_factor),
    peerMultiple: peer.multiple,
    peerCount: peer.count,
    growthPct,
    growthMult,
    maturityMult,
    breadthMult,
    age,
  };
}

// ------------------------------------------------------------------ farm plans

/** A gas budget phrase for the chain a position lives on: L1s cost dollars, L2s cost cents. */
function gasFor(chain: string): { one: string; weekly: string } {
  switch (chain) {
    case 'Ethereum':
      return { one: 'about $12 of gas', weekly: 'about $6 of gas a week' };
    case 'Bitcoin':
      return { one: 'about $6 of network fees', weekly: 'about $3 of fees a week' };
    case 'Solana':
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'Monad':
    case 'Hyperliquid L1':
      return { one: 'under $1 of gas', weekly: 'under $1 of gas a week' };
    case 'Binance':
    case 'Avalanche':
    case 'Polygon':
      return { one: 'about $1 of gas', weekly: 'about $1 of gas a week' };
    default:
      return { one: 'about $2 of gas', weekly: 'about $2 of gas a week' };
  }
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols need a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The category playbook: the core position, the second qualifying action and its standing risk. */
function playbookFor(p: SnapshotProtocol, capital: number, chain: string): { core: string; second: string; risk: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) {
    return {
      core: `Supply $${capital} of USDC as collateral to ${name} on ${chain}, then borrow about 40% of it once and repay within the week to register both sides of the market.`,
      second: `Vote in one ${name} governance or incentive poll if the app offers one, and keep the supplied position untouched between weekly checks.`,
      risk: `Watch the health factor weekly: keep it above 1.6 so a volatile week cannot liquidate the position while it qualifies.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager')) {
    return {
      core: `Add $${capital} of liquidity to ${name}'s deepest stable or major pair on ${chain}, split evenly on both sides, and keep the LP position open.`,
      second: `Route one small swap a week through ${name} itself rather than an aggregator, so the wallet shows both providing and trading activity.`,
      risk: `Prefer the stable or major pair: a volatile pair can impermanent-loss more than any launch allocation is likely to repay.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then spend the bridged funds in one app on the far side instead of bridging straight back.`,
      second: `Repeat the crossing in the opposite direction once a month with a smaller amount, so the wallet is active on both sides of the bridge.`,
      risk: `Bridge in one transaction you can afford to wait on: crossings can take from minutes to days, and a stuck transfer is resolved with the bridge, never a third party.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      core: `Stake $${capital} worth of the chain's staking asset through ${name} on ${chain} and hold the receipt token in the same wallet.`,
      second: `Restake or delegate the receipt once if ${name} offers a second layer, and claim any staking rewards into the same wallet rather than selling them.`,
      risk: `Note the unbonding period before you stake: exits can take days to weeks, so never stake funds you may need inside that window.`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('interest rate')) {
    return {
      core: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged pair (long and short of similar size) so the account trades without directional risk.`,
      second: `Place and cancel one limit order a week and let one small trade settle, so the wallet shows real order-book activity, not only deposits.`,
      risk: `Keep leverage at 1x and the position small: the goal is a qualifying history, and a liquidation ends the position and the history with it.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) {
    return {
      core: `Deposit $${capital} of USDC into one curated ${name} vault on ${chain}, choosing the vault with the longest track record rather than the highest advertised yield.`,
      second: `Move a small part of the position to a second ${name} vault once, so the wallet holds more than a single deposit in its history.`,
      risk: `Read the vault's curator and strategy note before depositing: curated vaults lend onward, and their risk is the strategy's, not the chain's.`,
    };
  }
  if (c.includes('rwa') || c.includes('stable') || c.includes('basis') || c.includes('btc')) {
    return {
      core: `Mint or deposit $${capital} of ${name}'s yield-bearing asset on ${chain} through its own app and hold the asset in the farming wallet.`,
      second: `Use the minted asset once in a supported money market or pool if ${name} lists one, so the wallet shows the asset at work, not only minted.`,
      risk: `Check the redemption terms before minting: some yield assets redeem on a schedule or with a notice period, not instantly.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund ${name} with $${capital} and take one position on each side of two different markets, sized so either outcome leaves most of the stake intact.`,
      second: `Settle every position at expiry instead of selling early, so the wallet's history shows complete market cycles.`,
      risk: `Treat the stake as spent: prediction positions can settle at zero, so size them as a cost of farming, never as an investment.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy for its full term.`,
      second: `Renew or extend the cover once before it lapses, so the wallet shows a continuing relationship rather than a single purchase.`,
      risk: `Buy cover only for real exposure: a policy on nothing still costs its premium and qualifies for very little.`,
    };
  }
  if (c.includes('chain')) {
    return {
      core: `Bridge $${capital} of USDC to ${chain} and hold it in the farming wallet, then use two native apps on the chain so the wallet is a resident, not a passer-by.`,
      second: `Pay gas on ${chain} at least once a week with a small transfer or swap, building a steady activity history on the chain itself.`,
      risk: `Keep the bridge receipt and first transaction hashes: proving an early, continuous presence is the whole value of farming a young chain.`,
    };
  }
  return {
    core: `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open between weekly checks.`,
    second: `Make the protocol's second core action once (a vote, a second deposit or a claim of accrued rewards) so the wallet is more than a single deposit.`,
    risk: `Start with the smallest tier for one week first: confirm deposits, withdrawals and the app's own pages all work before committing the full amount.`,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a hand-written list of names.
 * The same strings go to board.json and to the dashboard's data, so page and board cannot disagree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const book = playbookFor(p, capital, chain);
  const verify = isProductLike(p)
    ? `Before adding more, verify on the protocol's own pages that ${p.name} is a protocol in its own right and not a wrapped or staked product of a token that already trades; its record here names no token of its own.`
    : `Open the protocol's own points or rewards page from its app and confirm how activity is counted; claim only from links the app itself publishes.`;
  return [
    stepText(
      `Create a fresh wallet for ${p.name} that holds only the funds you plan to farm, fund it from your main wallet in one transfer, and keep its seed phrase offline.`,
      `${gas.one} to fund and make the first transaction`,
      '10 minutes',
    ),
    stepText(book.core, `$${capital} of capital and ${gas.one}`, '15 minutes to set up'),
    stepText(book.second, `${gas.weekly.split(' a week')[0]} a week at most`, '10 minutes a week'),
    stepText(
      `Hold the position for at least ${hold} days, checking it once a week, so the activity appears in more than one weekly snapshot of the protocol.`,
      `the $${capital} stays in the position for the whole window`,
      `${hold} days`,
    ),
    stepText(book.risk, 'nothing to check, and it protects the position', '5 minutes a week'),
    stepText(verify, 'no fee to check, and never pay anyone to claim or verify', '10 minutes'),
    stepText(
      `Log the wallet, dates and transaction hashes in a farm log, and set a monthly reminder to re-check ${p.name}'s own channels for a launch or points announcement.`,
      'nothing but the log itself',
      '5 minutes, then 5 minutes a month',
    ),
  ];
}

// ------------------------------------------------------------------ board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol below the floor, not a top slice of them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug));
  for (const p of early) chosen.set(p.slug, p);

  const peers = peerMultiples(snapshot, model);
  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, peers, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watch.has(s.p.slug),
    product_like: isProductLike(s.p),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    model: {
      peer_multiple: round4(s.v.peerMultiple),
      peer_count: s.v.peerCount,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's comparison view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the same figures and the same farm plan board.json carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    product_like: row.product_like,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  const peerTable: PeerTable = {
    global_multiple: round4(peers.global),
    global_count: peers.globalCount,
    categories: [...peers.byCategory.entries()]
      .map(([category, v]) => ({ category, peers: v.peers, multiple: round4(v.multiple) }))
      .sort((a, b) => b.peers - a.peers || bySlugAsc(a.category, b.category)),
  };
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    peers: peerTable,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_tvl_usd: board.reduce((sum, r) => sum + r.tvl_usd, 0),
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board carries a slug twice';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const ordered = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) if (ordered[i]!.implied_value_usd > ordered[i - 1]!.implied_value_usd) return `row ${ordered[i]!.slug} outranks ${ordered[i - 1]!.slug} on implied value`;
  if (board.length >= 2 && ordered[0]!.implied_value_usd === ordered[ordered.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const len = s.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
