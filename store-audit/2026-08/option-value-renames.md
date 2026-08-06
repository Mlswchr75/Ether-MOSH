# §5 — "White" option value resolution

Every product below previously had a `Color` option whose only value was the
supplier default `White`. The new value is taken from the print name already in
the product title, per the handoff's naming guidance, so it stays useful in cart
and order emails.

| Product | Color option value now | Product ID |
|---|---|---|
| All-Over Print Canvas Sneakers — Black Rubber Sole | All-Over Print | 9575026950371 |
| All-Over Print Flat Brim Cap — Adjustable Polyester | All-Over Print | 9572682924259 |
| All-Over Print Lantern Pants — Poly Waffle · P68KT | All-Over Print | 9574842368227 |
| All-Over Print Lantern Pants — Poly Waffle · P68L5 | All-Over Print | 9574844924131 |
| All-Over Print Lantern Pants — Poly Waffle · P68LB | All-Over Print | 9574845513955 |
| All-Over Print Men's Casual Lapel Long Sleeve Shirt — 140GSM Slub Cotton | All-Over Print | 9581502333155 |
| All-Over Print Windproof Hooded Shell — 140gsm · P5VFJ | All-Over Print | 9572769497315 |
| All-Over Print Windproof Hooded Shell — 140gsm · P64WH | All-Over Print | 9574164168931 |
| All-Over Print Zip Up Hoodie With Pocket — Interlock | White | 9581511770339 |
| All-Over Print Zip Up Hoodie With Pocket — Interlock | Interlock Print | 9581516783843 |
| Biomorphic Mosaic Mark 11 Zip Hoodie — Mandala Cell AOP Fleece | Biomorphic Mosaic | 9552844423395 |
| Blue Hour Collage Cooling Sports Towel — Abstract AOP by Dyles Mavis | Blue Hour Collage | 9552844062947 |
| Blush Branch Camo Hoodie — Pink Camouflage AOP Pullover | Blush Branch Camo | 9561410371811 |
| Blush Branch Camo Maxi Skirt — Pink Camouflage Chiffon | Blush Branch Camo | 9561436291299 |
| Carnival Tie-Dye Raglan Tee — Rainbow AOP Round Neck | Carnival Tie-Dye | 9528488493283 |
| Channel Static Hoodie — Retro TV Grid AOP Fleece Pullover | Channel Static | 9556264681699 |
| Chromatic Sweep Reversible Bucket Hat — Full-Spectrum Abstract Expressionist AOP | Chromatic Sweep | 9528488624355 |
| Coastal Tribal Weave Polo — Geometric AOP Heavyweight Shirt | Coastal Tribal Weave | 9559485841635 |
| Dockyard Dusk Borg Fleece Coat — Industrial Skyline AOP | Dockyard Dusk | 9528488296675 |
| Doodle Riot Kids Tee — Maximalist Scribble Collage AOP | Doodle Riot | 9561410502883 |
| Ember Spiral Canvas Print — Tie-Dye AOP Framed Wall Art | Ember Spiral | 9556304986339 |
| Fireball Cosmos Kids Tee — Meteor Shower AOP Crew Neck | Fireball Cosmos | 9561440780515 |
| Frisco Sticker Collage Mesh Top — City Postcard AOP Long Sleeve | Frisco Sticker Collage | 9563828158691 |
| Gilded Hour Baroque Tee — Ornate AOP Loose Fit Top | Gilded Hour Baroque | 9493168193763 |
| Golden Hour Spiral Hoodie — Tie-Dye Swirl AOP Fleece Pullover | Golden Hour Spiral | 9556265042147 |
| Graffiti Wildstyle Reversible Bucket Hat — Double-Sided AOP | Graffiti Wildstyle | 9528488591587 |
| Halftone Drift Tee — Dot Matrix Wave AOP Cotton Crew | Halftone Drift | 9528488689891 |
| Kaleidoscope Bubble Bloom Hoodie — Rainbow Paint AOP Pullover | Kaleidoscope Bubble Bloom | 9561410207971 |
| Liquid Marble Swirl Cargo Pants — Rainbow AOP Straight Leg | Liquid Marble Swirl | 9528488526051 |
| Molten Prism Wave Hoodie — Liquid Ripple AOP Pullover | Molten Prism Wave | 9561437405411 |
| Nova Impact Hoodie — Cosmic Detonation AOP Fleece Pullover | Nova Impact | 9556302463203 |
| Paint Slash Zip-Up Hoodie — Graffiti Brushstroke AOP Fleece | Paint Slash | 9561437470947 |
| Pastel Pebble Bloom Polo — Abstract Dot AOP Heavyweight Shirt | Pastel Pebble Bloom | 9559441178851 |
| Pop Graffiti Greeting Reversible Bucket Hat — Street Art Word Collage Double-Sided AOP | Pop Graffiti Greeting | 9552896229603 |
| Sherbet Spiral Fleece Coat | Sherbet Spiral | 9552890626275 |
| Solar Burst Hoodie — Radial Tie-Dye AOP Fleece Pullover | Solar Burst | 9556267073763 |
| Splatter Bloom Hoodie — Paint Drip Burst AOP Fleece Pullover | Splatter Bloom | 9556302692579 |
| Urban Brushstroke Artist Zip Jacket | Urban Brushstroke | 9175879778531 |
| Urban Graffiti Combat Boots | Urban Graffiti | 9188175184099 |

## Deliberately NOT renamed — real colorways

These 9 products have a multi-value `Color` option where `White` sits alongside
genuine garment colors. Renaming would have destroyed real merchandising data.

| Product | Color values |
|---|---|
| Chromatic Grid Art Tee | Black / Blue Jean / White |
| Vintage Crown Jewel Swimsuit | Black / Navy / White |
| Vibrant Abstract AOP Full-Zip Hoodie | Black / White |
| Pearl Prism One-Piece Swimsuit | Black / Light Pink / Navy / Ocean / White |
| Colorful Mosaic EVA Clogs | Black / White |
| Psychedelic Eye Zip Hoodie | Black / White |
| Painted Curls Tie-Dye Duvet Set | Black / White |
| F Minimalism Slogan Tee | Black / Heather Aqua / Heather Kelly / Team Purple / White / Yellow |
| All-Over Print Zip Up Hoodie (ARCHIVED duplicate) | White |

## Separate bug found, not fixed

`Urban Brushstroke Artist Zip Jacket` (9175879778531) has an option **named
"Print" that contains sizes** (S–5XL), while its second option is `Color`. The
PDP therefore reads "Print: S". Renaming the option itself changes the variant
structure, so this was left for a deliberate decision rather than fixed silently.
