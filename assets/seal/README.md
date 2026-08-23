# The seal

`seal-source.png` is the artwork exactly as supplied — byte-for-byte, not
re-encoded. Keep it that way; everything else here is derived from it.

It arrived as an 800×800 RGBA PNG with the transparency checkerboard
**baked into the pixels**: alpha is 255 everywhere, and the background is a
20px #FFFFFF / #EBEBEB check rather than actual transparency. Its luminance
histogram is cleanly bimodal — 34% of pixels below 32, 64% sitting on the two
check tones, and only 1.8% in between — so the mark itself is crisp and only
the ground needed recovering.

`seal-alpha.png` is that same artwork with the ground keyed back out to real
alpha. Nothing about the mark's shape was altered: pixels at or above
luminance 230 became transparent, pixels at or below 20 kept their original
RGB at full opacity, and the 1.8% between the two got a linear ramp, which is
the antialiasing the original edge already had.

## What the app actually draws

The UI does not load either PNG. `seal()` in `01-core.js` draws the mark as
SVG path geometry traced from this artwork, because the seal is rendered at a
dozen sizes from a 16px slot to a full-screen impact frame, and it has to
invert cleanly on ink as well as paper.

Measured off `seal-alpha.png`, in units of the 50-unit viewBox radius:

| part  | geometry                                          |
|-------|---------------------------------------------------|
| core  | solid disc, r 8.03                                |
| ring  | continuous annulus, 35.83 → 43.44                 |
| blade | four congruent spiral arms, core → ring, every 90° |

The artwork is four-fold symmetric — rotating it 90° against itself agrees to
98.99%, against 60° and 120° only ~69% — so one blade is stored and reused
three times.

Rendering the SVG back to an 800×800 raster and comparing it with
`seal-alpha.png` scores **0.976 intersection-over-union**. What remains is
sub-pixel disagreement along the edges: the source is a lossy copy with soft
edges and the comparison thresholds hard.

`seal.svg` is that same geometry as a standalone file, for anywhere outside
the app that needs the mark.

## If you have a cleaner original

Drop it in as `seal-source.png` (or an SVG) and the trace can be re-derived.
The measurements above came from a compressed copy; a clean export would
tighten them.
