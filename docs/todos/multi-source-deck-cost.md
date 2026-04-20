# Multi-source deck cost

## Status

The builder page's "Cost to buy" card renders five rows:

| Row | Source | State |
|---|---|---|
| Custom | user-editable input; drives the ROI calc | ✅ wired |
| TCGPlayer market | `tcgplayer-latest-prices.json` keyed on `prodDef.tcgplayer_id` | ✅ wired |
| Mana Pool market | `manapool-latest-prices.json` keyed on `prodDef.tcgplayer_id` | ⚠ wired but sparse (MP rarely stocks sealed precons) |
| Lowest listing (with shipping) | — | ❌ stub — needs scraper change |
| Lowest legit seller (Gold Star / Hobby Shop / WPN) | — | ❌ stub — needs seller metadata |

ROI on the EV card is computed as
`(after-fees EV − customCost) / customCost`, per marketplace. The Custom
row defaults to TCGPlayer market × multiplier; users override it via the
input or the **Use** button on any priced row.

## Why this matters

ROI is only as good as the cost assumption. Two buyers staring at the
same precon may have very different ROI stories: one grabbed it from a
Gold Star seller during a dip for $24, another paid sticker on TCGPlayer
for $39. We want to surface the realistic range, so the user can put
the right cost basis into Custom.

## Data gaps

### Lowest listing (with shipping)

Right now the TCGPlayer scraper only captures `market_price`,
`listed_median`, `avg_daily_sold`, `seller_count`. It does **not**
capture the single cheapest active listing, nor that listing's shipping
cost.

What we need:

- `lowest_listing_price` — dollars
- `lowest_listing_shipping` — dollars (0 if free)
- `lowest_listing_seller_name` — string (for the UI tooltip)

Source: TCGPlayer product page's "Listings" tab — sorted by Price +
Shipping ascending. Scraper change is in
`collection-market-tracker-backend/scripts/tcgplayer_prices/`; new
columns go on `market_data.tcgplayer_price_history` with a weekly
snapshot cadence.

### Lowest legit seller

Definition: lowest listing whose seller satisfies at least one of:

1. **Gold Star seller** — TCGPlayer flag, visible on the listing row.
2. **Certified Hobby Shop** — TCGPlayer flag.
3. **WPN network** — from the Wizards Play Network directory (not in
   the TCGPlayer listing, has to be cross-referenced by seller name or
   store address).

What we need:

- `lowest_legit_price`, `lowest_legit_shipping`, `lowest_legit_seller_name`
- A sidecar table of seller metadata: `(seller_name, is_gold_star,
  is_certified_hobby_shop, is_wpn)`. WPN membership comes from
  scraping/importing `locator.wizards.com` periodically.

## Recommended phasing

1. **Lowest listing (with shipping)** — extend the TCGPlayer scraper to
   grab the top-of-listings row + shipping cost during the weekly pass.
   Zero new infrastructure; single BQ schema migration. Unblocks one of
   the two stub rows.
2. **Seller metadata** — one-off scrape of the top N TCGPlayer sealed-
   precon sellers' Gold Star / Hobby Shop flags; monthly refresh of
   WPN directory. Join at scrape time to emit
   `lowest_legit_*` alongside `lowest_listing_*`.
3. **Mana Pool lowest listing** — MP's listings page is public; same
   shape as TCGPlayer once (1) is stable. Low priority until MP
   inventory for sealed precons is meaningful.
4. **eBay** — deferred. Highest price volatility but also highest
   reseller noise; wire only after (1) + (2) prove out the UX.
5. **Amazon / Card Kingdom / Star City Games / TCGDirect** — previously
   sketched as additional "buy from" rows. Still candidates but lower
   priority than the lowest-listing signals above, which are
   higher-signal for ROI.

## Output format

Each row's data lives in a flat JSON array in the data repo. For
TCGPlayer-sourced fields we extend the existing
`tcgplayer-latest-prices.json` shape:

```json
{
  "tcgplayer_id": 541246,
  "market_price": 28.49,
  "lowest_listing_price": 24.99,
  "lowest_listing_shipping": 3.99,
  "lowest_listing_seller": "CardShark 9000",
  "lowest_legit_price": 26.50,
  "lowest_legit_shipping": 3.99,
  "lowest_legit_seller": "Your LGS",
  "lowest_legit_flags": ["gold_star", "wpn"]
}
```

Consuming side — `builder.js:renderCostTable` — already has the two
stub rows in place; populating them is a pure data change once the
scraper produces the fields.

## UI slot-in

- `#cost-rows` is already rendered by `builder.js:renderCostTable` with
  all 5 rows. Populating the stub rows is a ~10-line code change
  (remove the two `stubRow(...)` calls, replace with `sourceRow(...)`
  reading from the new prices payload).
- The Custom row semantics don't change.
- Consider a "best deal" badge marking the cheapest populated source
  (lowest total including shipping) as the most obvious "Use" target.
