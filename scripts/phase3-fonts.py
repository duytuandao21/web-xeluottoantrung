"""Encode fonts without subsetting; verify all tables except WOFF2 container metadata."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'artifacts/font-tools'))
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

records = []
for filename, family in [('SF-Pro-Display-Regular.otf', 'body'), ('SF-Pro-Display-Bold.otf', 'tieude'), ('OpenSans-Semibold.ttf', 'menu')]:
    source = root / 'public/assets/fonts' / filename
    font = TTFont(source, lazy=True, recalcTimestamp=False)
    temporary = source.with_suffix('.woff2.tmp')
    font.flavor = 'woff2'
    font.flavorData = WOFF2FlavorData(transformedTables=set())
    font.save(temporary)
    encoded = temporary.read_bytes()
    digest = hashlib.sha256(encoded).hexdigest()
    target = source.with_name(f'{source.stem}.{digest[:12]}.woff2')
    if target.exists():
        assert target.read_bytes() == encoded, 'Never overwrite a published font'
        temporary.unlink()
    else:
        temporary.rename(target)
    original = TTFont(source, lazy=True, recalcTimestamp=False)
    compressed = TTFont(target, lazy=True, recalcTimestamp=False)
    removed = sorted(set(original.reader.keys()) - set(compressed.reader.keys()))
    # WOFF2 requires removal of an invalidated container-level digital signature.
    assert removed in ([], ['DSIG'])
    assert set(compressed.reader.keys()) == set(original.reader.keys()) - set(removed)
    tables = []
    for tag in original.reader.keys():
        if tag in removed:
            continue
        left, right = original.reader[tag], compressed.reader[tag]
        # WOFF2 sets head.flags bit 11; the container checksum is recalculated.
        # Neither changes outlines, metrics, names, cmap or shaping tables.
        if tag == 'head':
            assert int.from_bytes(right[16:18], 'big') == (int.from_bytes(left[16:18], 'big') | 0x800)
            right = right[:16] + left[16:18] + right[18:]
            left, right = left[:8] + left[12:], right[:8] + right[12:]
        assert left == right, f'Font table changed: {filename}/{tag}'
        tables.append(str(tag))
    records.append({'src': '/assets/fonts/' + target.name, 'sha256': digest,
                    'original': '/assets/fonts/' + filename, 'family': family,
                    'beforeBytes': source.stat().st_size, 'afterBytes': len(encoded),
                    'glyphCount': original['maxp'].numGlyphs, 'preservedTables': tables,
                    'containerOnlyChanges': ['head checksumAdjustment', 'head flags bit 11'] + removed})
    print(f'{filename}: {source.stat().st_size} -> {len(encoded)} bytes; visual tables preserved; container-only changes verified')
    original.close(); compressed.close(); font.close()
(root / 'config/versioned-fonts.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
out = root.parent / 'toi-uu-hieu-suat-website/phase-3'
out.mkdir(parents=True, exist_ok=True)
(out / 'font-conversion.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
