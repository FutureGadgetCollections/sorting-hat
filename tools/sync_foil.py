#!/usr/bin/env python3
"""Sync the `foil:true` flags on every commander deck JSON to MTGJSON.

For each deck JSON under ../static/data/decks/ that carries an
`mtgjson_id` field, fetch the matching MTGJSON deck file and copy each
card's `isFoil` value onto our entry (matched by lowercased setCode +
collector_number, defaulting to the deck's set_code when an entry
omits its `set` field).

Adds `foil:true` for cards MTGJSON marks foil; removes a stale
`foil:true` if MTGJSON disagrees. Idempotent — re-running on synced
decks reports zero changes.

Usage (from anywhere):
    python tools/sync_foil.py            # sync all decks with mtgjson_id
    python tools/sync_foil.py --check    # exit non-zero if any deck is stale
"""
from __future__ import annotations
import argparse, io, json, sys, time, urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DECKS_DIR  = SCRIPT_DIR.parent / 'static' / 'data' / 'decks'
MTGJSON_URL = 'https://mtgjson.com/api/v5/decks/{name}.json'
UA = 'sorting-hat/sync_foil'


def fetch_mtgjson(name: str) -> dict:
    req = urllib.request.Request(
        MTGJSON_URL.format(name=name),
        headers={'User-Agent': UA, 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def foil_keys(deck_json: dict) -> set[tuple[str, str]]:
    """Returns set of (set_code_lower, card_number) tuples that MTGJSON
    marks isFoil=true."""
    data = deck_json.get('data', deck_json)
    out = set()
    for section in ('commander', 'mainBoard'):
        for c in data.get(section) or []:
            if c.get('isFoil') and c.get('number') and c.get('setCode'):
                out.add((c['setCode'].lower(), c['number']))
    return out


def sync_deck(path: Path, *, check_only: bool) -> int:
    deck = json.load(io.open(path, encoding='utf-8'))
    mtgjson_id = deck.get('mtgjson_id')
    if not mtgjson_id:
        print(f'  {path.name}: skip (no mtgjson_id)')
        return 0

    try:
        mj = fetch_mtgjson(mtgjson_id)
    except Exception as e:
        print(f'  {path.name}: fetch FAIL {e}')
        return 0

    foil_set = foil_keys(mj)
    deck_set = deck['set_code']
    plus_foil = minus_foil = 0
    for entry in deck['cards']:
        entry_set = entry.get('set', deck_set).lower()
        is_foil_now = bool(entry.get('foil'))
        should_be_foil = (entry_set, entry['card_number']) in foil_set
        if should_be_foil and not is_foil_now:
            entry['foil'] = True
            plus_foil += 1
        elif (not should_be_foil) and is_foil_now:
            del entry['foil']
            minus_foil += 1

    changes = plus_foil + minus_foil
    if changes and not check_only:
        with io.open(path, 'w', encoding='utf-8') as f:
            json.dump(deck, f, indent=2, ensure_ascii=False)
    status = 'STALE' if check_only and changes else ('updated' if changes else 'ok')
    print(f'  {path.name}: {status:<7s}  +foil={plus_foil}  -foil={minus_foil}  (mtgjson={mtgjson_id})')
    return changes


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    p.add_argument('--check', action='store_true',
                   help='Report deltas without writing; exit 1 if any deck is stale.')
    args = p.parse_args(argv)

    paths = sorted(DECKS_DIR.glob('*.json'))
    print(f'Scanning {len(paths)} deck JSONs...')
    total = 0
    for path in paths:
        total += sync_deck(path, check_only=args.check)
        time.sleep(0.15)  # courtesy delay between MTGJSON requests
    print(f'\nTotal foil flag changes: {total}')
    if args.check and total > 0:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
