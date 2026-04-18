# Sorting Hat — tools

One-off / on-demand maintenance scripts. Stdlib-only Python; no
dependencies to install.

## sync_foil.py — keep deck `foil:true` flags in sync with MTGJSON

The builder uses the `foil:true` flag on each deck-JSON entry to pick
between non-foil and foil pricing. The authoritative source for which
cards a precon ships as foil is MTGJSON's per-deck `isFoil` field
(same data feeding theexpectedvalue.com).

This script reads every deck JSON, looks up its `mtgjson_id`, fetches
the matching MTGJSON deck, and copies each card's `isFoil` onto our
entry — adding `foil:true` for new foils and stripping it if MTGJSON
disagrees.

```bash
# Run from the repo root.
python tools/sync_foil.py          # sync everything; writes changes in place
python tools/sync_foil.py --check  # report stale decks; exit 1 if any
```

### Adding a new deck

When you add a new commander deck JSON under `static/data/decks/`,
include the matching MTGJSON deck filename (without `.json`) as
`mtgjson_id`:

```json
{
  "game": "mtg",
  "set_code": "...",
  "product_type": "commander-deck-...",
  "name": "...",
  "mtgjson_id": "DeckName_SET",
  "cards": [...]
}
```

You can find the MTGJSON id by browsing
<https://mtgjson.com/downloads/all-decks/> or by checking the
`fileName` field in
<https://theexpectedvalue.com/commander-ev/data/commander-decks-local.json>.

Decks without an `mtgjson_id` are skipped — not an error.
