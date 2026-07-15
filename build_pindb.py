#!/usr/bin/env python3
"""
Pre-compute pincode → constituency mapping offline.

Strategy (same as the site's old voting logic, but done once at build time):
  1. For each PIN, collect ALL individual office lat/lons (not just the median).
  2. Run point-in-polygon for every office coordinate.
  3. Majority-vote: whichever constituency appears most often wins.
  4. Minimum confidence: >50% of mappable offices must agree.

Result: pinmap.json  — {"110001": ["NEW DELHI", "DELHI"], ...}
This replaces both pindb.json (lat/lon lookup) AND the runtime point-in-polygon.
The website becomes a pure O(1) dict lookup — zero spatial math, zero ambiguity.
"""

import csv, io, json, statistics, sys, urllib.request
from collections import Counter
from shapely.geometry import Point, shape

CSV_URL   = 'https://raw.githubusercontent.com/dropdevrahul/pincodes-india/master/pincode.csv'
GEO_URL   = ('https://gist.githack.com/planemad/1e2b63f6b9806970db749f19980ffd25'
             '/raw/d0b13d1b8df9c4f9b88e16de1271661ff6b64923'
             '/india_pc_2024_simplified.geojson')
OUT_FILE  = 'pinmap.json'
FALLBACK_FILE = 'pindb.json'  # keeps lat/lon for GPS & constituency-name search


def fetch(url, label):
    print(f'Fetching {label} ...', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.88'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def build_shapely_features(geojson):
    """Return list of (shapely_geom, pc_name, st_name) tuples."""
    features = []
    for f in geojson['features']:
        props = f['properties']
        name  = props.get('PC_NAME') or props.get('pc_name') or props.get('name', '')
        state = props.get('ST_NAME') or props.get('st_name') or props.get('state', '')
        try:
            geom = shape(f['geometry'])
            features.append((geom, name.upper(), state.upper()))
        except Exception:
            pass
    return features


def find_constituency(shapely_features, lon, lat):
    pt = Point(lon, lat)
    for geom, name, state in shapely_features:
        if geom.contains(pt):
            return name, state
    return None, None


def build_pin_offices(raw_csv):
    """Group offices by PIN → list of (lat, lon, state_name)."""
    reader = csv.DictReader(io.StringIO(raw_csv))
    groups = {}
    for row in reader:
        pin = row.get('Pincode', '').strip()
        if not pin or len(pin) != 6 or not pin.isdigit():
            continue
        try:
            lat = float(row['Latitude'])
            lon = float(row['Longitude'])
        except (ValueError, KeyError):
            continue
        if not (-5 < lat < 40 and 60 < lon < 100):
            continue
        groups.setdefault(pin, []).append((lat, lon, row.get('StateName', '').strip().upper()))
    return groups


def main():
    raw_csv = fetch(CSV_URL, 'India Post CSV').decode('utf-8', errors='replace')
    raw_geo = fetch(GEO_URL, 'constituency GeoJSON')
    geojson = json.loads(raw_geo)

    print('Building shapely index...', flush=True)
    shapely_features = build_shapely_features(geojson)
    print(f'  {len(shapely_features)} constituency polygons loaded.', flush=True)

    print('Grouping offices by PIN...', flush=True)
    pin_offices = build_pin_offices(raw_csv)
    print(f'  {len(pin_offices)} unique PINs.', flush=True)

    pinmap = {}   # pin → [constituency, state]
    pindb  = {}   # pin → [lat, lon, state, district]  (keep for GPS / name search)

    total = len(pin_offices)
    for i, (pin, offices) in enumerate(pin_offices.items()):
        if i % 2000 == 0:
            print(f'  {i}/{total}...', flush=True)

        # Build constituency votes from all offices
        votes = Counter()
        for lat, lon, _ in offices:
            name, state = find_constituency(shapely_features, lon, lat)
            if name:
                votes[(name, state)] += 1

        if votes:
            (winner_name, winner_state), top_count = votes.most_common(1)[0]
            total_mapped = sum(votes.values())
            confidence = top_count / total_mapped
            if confidence >= 0.5:  # majority agreement
                pinmap[pin] = [winner_name, winner_state]

        # Also maintain the centroid for GPS fallback
        lats = [o[0] for o in offices]
        lons = [o[1] for o in offices]
        state_name = offices[0][2].title() if offices else ''
        pindb[pin] = [
            round(statistics.median(lats), 5),
            round(statistics.median(lons), 5),
            state_name,
        ]

    print(f'\nResults: {len(pinmap)}/{total} PINs resolved to a constituency.', flush=True)

    with open(OUT_FILE, 'w') as f:
        json.dump(pinmap, f, separators=(',', ':'))
    sz = len(json.dumps(pinmap, separators=(',', ':')))
    print(f'Wrote {OUT_FILE}  ({sz/1024:.1f} KB uncompressed)', flush=True)

    with open(FALLBACK_FILE, 'w') as f:
        json.dump(pindb, f, separators=(',', ':'))
    sz2 = len(json.dumps(pindb, separators=(',', ':')))
    print(f'Wrote {FALLBACK_FILE}  ({sz2/1024:.1f} KB uncompressed)', flush=True)

    # Sample check
    for pin in ['110001', '400001', '700001', '600001', '500001']:
        print(f'  {pin}: {pinmap.get(pin, "NOT FOUND")}', flush=True)


if __name__ == '__main__':
    main()
