# The Sorting Hat

A public-facing tool for box/case breakers: pick a sealed product, configure
quantities and listing fields, and download a TCGPlayer mass-upload CSV
pre-populated with every card in the precon deck or set.

## Stack

- **Hugo** + custom theme (`themes/sorting-hat/`), Bootstrap 5
- **Deploy:** GitHub Pages via `.github/workflows/deploy.yml`
- **Data reads:** card metadata + market prices loaded at runtime from the
  `collection-market-tracker-data` repo (GCS first, GitHub Raw fallback).
  TCGPlayer prices via `tcgplayer-latest-prices.json`; MTG Mana Pool prices
  via `manapool-latest-prices.json` (used for smart-routed CSV exports)
- **Deck composition:** committed JSON files under `data/decks/` — manual edits,
  no runtime third-party API dependency

## Local dev

```bash
hugo server
```

## Adding a new product

1. Add an entry under the appropriate game/set in `data/sets.json`.
2. Drop a new `data/decks/<game>-<set_code>-<product_type>.json` with:
   ```json
   {
     "game": "mtg",
     "set_code": "fic",
     "product_type": "commander-deck-counter-blitz-final-fantasy-x",
     "cards": [
       {"card_number": "1", "quantity": 1},
       ...
     ]
   }
   ```
3. Card metadata (TCGPlayer ID, name, rarity, market price) is joined at
   runtime from `single-cards.json` + `tcgplayer-latest-prices.json` in the
   data repo, keyed by `(game, set_code, card_number)`.

## Future: auth + paywall

Firebase init is scaffolded in `static/js/firebase-init.js` (no-op until
`HUGO_PARAMS_FIREBASE_*` env vars are set). When ready:

1. Wire Firebase Google sign-in into the index page.
2. Add Stripe Checkout + a Cloud Function (or extend the existing backend) to
   set custom claims after payment.
3. Move deck JSONs behind an authenticated endpoint on the existing Cloud Run
   API (`collection-market-tracker`) so they aren't trivially fetchable.
