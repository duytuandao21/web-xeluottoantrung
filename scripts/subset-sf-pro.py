"""Build append-only SF Unicode-text faces; keep original supplementary PUA faces.

Run from Web: python scripts/subset-sf-pro.py
Uses the existing local fontTools/Brotli tooling; no application dependency.
"""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "artifacts/font-tools"))
from fontTools import subset
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

OUT = ROOT / "artifacts/font-optimization"
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = ROOT / "config/versioned-fonts.json"
records = json.loads(MANIFEST.read_text(encoding="utf-8"))
results = []
css = {}

for weight, family in [("Regular", "body"), ("Bold", "tieude")]:
    original_path = f"/assets/fonts/SF-Pro-Display-{weight}.otf"
    original_record = next(row for row in records if row["original"] == original_path and "unicodeRange" not in row)
    full_bytes = (ROOT / "public" / original_record["src"].lstrip("/")).read_bytes()
    assert hashlib.sha256(full_bytes).hexdigest() == original_record["sha256"]
    source = TTFont(ROOT / "public" / original_path.lstrip("/"), recalcBBoxes=False, recalcTimestamp=False)
    font = TTFont(ROOT / "public" / original_path.lstrip("/"), recalcBBoxes=False, recalcTimestamp=False)
    cmap = source.getBestCmap()
    text_points = {cp for cp in cmap if cp < 0x100000}
    pua_points = set(cmap) - text_points
    assert pua_points and all(0x100000 <= cp <= 0x10FFFD for cp in pua_points)
    options = subset.Options()
    options.retain_gids = True
    options.glyph_names = True
    options.layout_features = ["*"]
    options.layout_scripts = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.hinting = True
    options.passthrough_tables = True
    options.prune_unicode_ranges = False
    options.harfbuzz_repacker = False
    subsetter = subset.Subsetter(options=options)
    # Keep the terminal GID as well, so passthrough Apple tables retain their
    # original glyph-index domain. No renumbering of retained glyphs.
    subsetter.populate(unicodes=text_points, glyphs=[source.getGlyphOrder()[-1]])
    subsetter.subset(font)
    font["OS/2"] = copy.deepcopy(source["OS/2"])
    font["name"] = copy.deepcopy(source["name"])
    for table in ["MERG", "bsln", "meta", "trak"]:
        font[table] = copy.deepcopy(source[table])
    font.flavor = "woff2"
    data = io.BytesIO()
    font.save(data)
    encoded = data.getvalue()
    digest = hashlib.sha256(encoded).hexdigest()
    filename = f"SF-Pro-Display-{weight}-UnicodeText.{digest[:12]}.woff2"
    target = ROOT / "public/assets/fonts" / filename
    candidate = TTFont(io.BytesIO(encoded), recalcBBoxes=False, recalcTimestamp=False)
    assert candidate.getBestCmap() == {cp: name for cp, name in cmap.items() if cp in text_points}
    assert candidate["maxp"].numGlyphs == source["maxp"].numGlyphs
    assert set(candidate.keys()) == set(source.keys())
    names = lambda f: sorted((n.platformID, n.platEncID, n.langID, n.nameID, n.toBytes()) for n in f["name"].names)
    assert names(candidate) == names(source), "Font naming records changed"
    for table in ["OS/2", "MERG", "bsln", "meta", "trak"]:
        assert candidate.getTableData(table) == source.getTableData(table), table
    for table, fields in {"head": ["unitsPerEm", "xMin", "yMin", "xMax", "yMax", "macStyle"],
                          "hhea": ["ascent", "descent", "lineGap", "advanceWidthMax", "caretSlopeRise", "caretSlopeRun"]}.items():
        for field in fields:
            assert getattr(candidate[table], field) == getattr(source[table], field), (table, field)
    old_glyphs, new_glyphs = source.getGlyphSet(), candidate.getGlyphSet()
    for name in subsetter.glyphs_retained:
        assert candidate.getGlyphID(name) == source.getGlyphID(name)
        assert candidate["hmtx"][name] == source["hmtx"][name]
        a, b = RecordingPen(), RecordingPen()
        old_glyphs[name].draw(a)
        new_glyphs[name].draw(b)
        assert a.value == b.value, f"Outline changed: {weight}/{name}"
    if target.exists():
        assert target.read_bytes() == encoded, "Never overwrite a published font version"
    else:
        target.write_bytes(encoded)
    entry = {"src": f"/assets/fonts/{filename}", "sha256": digest, "original": original_path,
             "family": family, "beforeBytes": len(full_bytes), "afterBytes": len(encoded),
             "unicodeRange": "U+0-FFFFF", "glyphCount": candidate["maxp"].numGlyphs,
             "retainedGlyphs": len(subsetter.glyphs_retained)}
    existing = next((row for row in records if row["src"] == entry["src"]), None)
    if existing:
        assert existing == entry
    else:
        records.append(entry)
    css[family] = entry
    results.append({**entry, "originalWoff2": original_record["src"], "textCodepoints": sorted(text_points),
                    "extendedCodepoints": sorted(pua_points), "fullCoverageCodepoints": len(cmap),
                    "verifiedOutlinesAndAdvances": len(subsetter.glyphs_retained),
                    "preservedTables": ["name", "OS/2", "MERG", "bsln", "meta", "trak"],
                    "hintingKept": True, "allLayoutFeaturesKept": True})
    print(f"{family}: {len(full_bytes)} -> {len(encoded)} bytes; {len(text_points)} text codepoints; {len(pua_points)} supplementary PUA codepoints keep original file", flush=True)

# Only replace the two original font-face blocks (or their generated pairs).
# All surrounding CSS and the Open Sans face stay byte-for-byte unchanged.
style_path = ROOT / "public/assets/css/style.css"
raw = style_path.read_bytes()
for family, entry in css.items():
    full = next(row for row in records if row["original"] == entry["original"] and "unicodeRange" not in row)
    short_full = "../fonts/" + full["src"].rsplit("/", 1)[-1]
    original = "../fonts/" + entry["original"].rsplit("/", 1)[-1]
    short_text = "../fonts/" + entry["src"].rsplit("/", 1)[-1]
    old = (f"@font-face {{\n    font-family: '{family}';\n    src: url('{short_full}') format('woff2'), url('{original}') format('opentype');\n}}").encode()
    new = (f"@font-face {{\n    font-family: '{family}';\n    src: url('{short_full}') format('woff2'), url('{original}') format('opentype');\n    unicode-range: U+100000-10FFFF;\n}}\n"
           f"@font-face {{\n    font-family: '{family}';\n    src: url('{short_text}') format('woff2'), url('{short_full}') format('woff2'), url('{original}') format('opentype');\n    unicode-range: U+0-FFFFF;\n}}").encode()
    # Preserve the existing line endings of each block.
    if old in raw:
        raw = raw.replace(old, new, 1)
    elif old.replace(b"\n", b"\r\n") in raw:
        raw = raw.replace(old.replace(b"\n", b"\r\n"), new.replace(b"\n", b"\r\n"), 1)
    else:
        assert new in raw or new.replace(b"\n", b"\r\n") in raw, f"Font CSS context changed: {family}"
style_path.write_bytes(raw)
MANIFEST.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "subsets.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
print("PASS: complete original cmap coverage through disjoint text/PUA ranges; original assets retained", flush=True)
