[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/to-rubot/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/to-rubot/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar — token-radar-01 entry

Entry for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01)
("Build the best token launch radar", $1,325 in USDC).

A token launch radar: it reads the sealed DefiLlama protocol snapshot, finds the protocols that
record no token yet, prices what each one's launch would be worth if its record stayed as it is,
ranks them, and hands the reader a dashboard — the ranked board, a detail view for every protocol
with the model's factor breakdown, filters, and a concrete farm plan for every row. It never
predicts whether or when a token is issued; a protocol here *records* no token, which is the
snapshot's record, not proof that none exists.

## The model (radar-2)

Implied value is calibrated by the snapshot itself, never by a hand-kept list of names:

- **Peer multiple** — every live-token protocol in the snapshot gives one observation of what the
  market pays per dollar of TVL (`mcap_usd / tvl_usd`). A pre-token protocol is priced at the
  median of its own category, shrunk toward the global median (x0.252 from 115 peers on this
  snapshot) when the category has few peers, hardest when it has one or two.
- **Growth** — the 7-day TVL change, clamped to −60%…+150%, weighted 0.45, so one absurd week
  cannot carry a ranking.
- **Maturity** — a log curve over the days the protocol has run with no token (unreported listing
  dates score as 365 days): surviving years is evidence a launch would be taken seriously.
- **Breadth** — +3% per chain beyond the first, up to five.

`implied = TVL × peer × growth × maturity × breadth`, with a ×0.55…×1.8 range shown per row.

The board is the snapshot's 40-protocol watchlist (all of it — the floor) plus **every** rankable
pre-token protocol below the $50M floor: 226 rows on this snapshot. Protocols above the floor that
the watchlist rule left out are wrapped, staked, bridged or versioned products of tokens that
already trade, so they stay off the board; rows whose own record still looks product-like are
flagged "verify first" in the dashboard.

Farm plans are category playbooks (lending, DEX, bridge, staking, derivatives, curators, RWA,
prediction, insurance, chains…) parameterised by the protocol's own record: its first chain sets
the gas budget, its TVL the capital tier, its age the hold window. Every step states its cost and
its time, and the strings in `board.json` are exactly the strings the dashboard shows.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only, no install, no network. In the grader's container the
program reads `/input/snapshot.json` and writes `/output/` (`board.json`, `data.js`, `dashboard/`,
`screenshots/`, `dossier.json`). The run is deterministic: two runs over the same snapshot write
the same bytes.

## Layout

- `main.ts` — the entrypoint the grader runs.
- `lib/model.ts` — the value model, the board builder and the farm playbooks.
- `dashboard/` — the static page (board, detail drawer, filters, live-token peer view). No network.
- `screenshots/` — the board, a detail view and a filtered view, captured from this dashboard.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte as the kit ships it.

## License

MIT (see `LICENSE`).
