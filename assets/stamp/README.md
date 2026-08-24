# The ten stamps

The stamp card's artwork is the ten Sacred Treasures of Isonokami
(十種神宝), one per slot, in the order of the supplied reference drawing:

| # | id       | name                      |          |
|---|----------|---------------------------|----------|
| 01| oki      | Okitsu Kagami             | 沖津鏡     |
| 02| hetsu    | Hetsu Kagami              | 辺津鏡     |
| 03| tsurugi  | Yatsuka no Tsurugi        | 八握剣     |
| 04| iku      | Iku Tama                  | 生玉      |
| 05| makaru   | Makarukaeshi Tama         | 死辺玉     |
| 06| taru     | Taru Tama                 | 足玉      |
| 07| chika    | Chikaeshi Tama            | 道返玉     |
| 08| hebi     | Hebi no Hire              | 蛇比礼     |
| 09| hachi    | Hachi no Hire             | 蜂比礼     |
| 10| kusagusa | Kusagusa no Mono no Hire  | 品物之比礼  |

## These are reconstructions, not designs

Each path was traced from a supplied reference bitmap, not drawn by eye
and not interpreted. `tools-trace-stamps.py` binarises the reference,
follows every ink/paper boundary exactly along the pixel lattice —
outer edges and interior cutouts alike — smooths the staircase with two
rounds of corner cutting and simplifies with Ramer–Douglas–Peucker. The
result agrees with the reference at a mean intersection-over-union of
0.997, worst case 0.989.

Nothing is normalised between symbols. They do not share a weight, a
density, a stroke width, a frame or a silhouette, because the reference
does not: `taru` and `chika` are wide and sparse, the three scarves are
dense, `oki` is tall and narrow, and the two jewels carry fringes of
hairlines. The only uniform thing is outer display size — each symbol is
scaled so its longest side is 58 of the 64-unit viewBox and centred
there, which is what lets ten differently-proportioned marks sit in one
grid of square slots. A wide symbol stays wide and simply occupies less
of its slot; that is the reference's proportion, not a defect.

`fill-rule="evenodd"` is required. The contours are traced independently
and nested, so a ring inside a solid reads as a hole with no winding
bookkeeping. A stroke must never be added: at this scale a one-unit
stroke closes the fine openings and the reconstruction becomes a blob.

## What the application actually renders

The app does not load these files. `01-core.js` carries the same path
data in its `STAMPS` table and inlines it, which is how every other mark
in the product works and what keeps the page a single file. These SVGs
are the artwork of record — for reuse in print, slides or anywhere
outside the app — and they are generated from the same trace, so they do
not drift.

## Regenerating

`tools-trace-stamps.py` needs the reference bitmap, which is not stored
here: it is a third-party illustration and redistributing it in the
repository is not ours to do. Place it at `ref/ten.png` relative to the
script and run it; it prints the per-symbol contour counts and writes
`traced.json`. The reference is expected to be the ten symbols laid out
in two rows of five, on white, in the order above — the script locates
each one by ink profile rather than by hard-coded coordinates.
