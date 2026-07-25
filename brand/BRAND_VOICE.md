# Aesthetic Rebellion — Brand Voice Spec

**Status:** awaiting owner approval. Once approved, autonomous content runs use this
as the sole authority and publish without further review.

**Derived from**, not invented for, existing store copy. Reference exemplars:

- Product pages: `exotic-bloom-boho-duster-jacket`, `dockyard-dusk-borg-fleece-coat`,
  `channel-static-hoodie`, `sherbet-spiral-fleece-coat`
- Editorial: the five published `News` essays (cargo shorts, giraffe hoodie dress,
  kimono robe, festival hoodie, Quantum Bloom)

Artist / signature name: **Dyles Mavis**. Store: aestheticrebellion.store.

---

## Core stance

Maximalist wearable art for people whose outfit causes an "oh" moment. The joke is
always *with* the customer, never at them. Loud on the outside, sincere underneath.
Every piece is an original composition — the copy's job is to make that legible
against a market of generic print-on-demand.

Two registers. Do not blend them.

---

## Register A — Product page

Fixed nine-part structure. Follow the order.

1. **Bold scene opener.** One sentence, present tense, drops the reader into a
   moment. Not a feature. Examples that work:
   - "Golden hour hits the festival grounds, and every camera turns your way."
   - "The dock at closing time, when the cranes go still and the sky catches fire."
   - "Every screen tuned to a different channel, all playing at once."

2. **Name the piece + what the print does**, using one simile. "catches light like
   a lens flare." "flowing behind you like you commissioned the sunset."

3. **`Why this beats [the specific boring alternative]:`** Name the dull competitor
   by category — *the beige cardigan*, *a plain oversized coat*, *a plain graphic
   hoodie*. Concede what most of them do ("most 'boho' layers whisper", "most
   statement outerwear leans on silhouette alone", "a single chest print gets seen
   once"), then the differentiator, crediting **Dyles Mavis**, and land on depth:
   "a print with actual depth, not a repeating swatch."

4. **`Q: [natural buyer question]?`** as an H3. This is the SEO surface. Answer in
   one or two sentences, usually opening "Yes —".

5. **`🎨 Why you'll reach for it constantly`** — 5–6 bullets. Each is one concrete
   feature with a benefit clause, em-dash joined. Include the full-bleed claim
   ("wrap every panel, no dead zones") and the inclusive size range.

6. **`📋 Materials & specs`** — 3–4 terse bullets. Fabric, print method, silhouette,
   size range. Always "printed on demand." Always dye sublimation phrased as a
   durability win: "vivid color that won't crack or peel."

7. **`[emoji] Who it's for`** — exactly three bullets, each a **specific character
   sketch**. Never a demographic. This is the highest-signal section; match this
   quality bar:
   - "The friend who plans her festival fits in a spreadsheet and needs a layer for
     the 2am temperature drop"
   - "An art teacher who refuses to dress like the faculty lounge"
   - "A gift for the person who already owns every plain puffer"
   - "The friend who still owns a working VCR on purpose"

8. **`FAQ`** — 4–5 H3 questions drawn from: true to size / what fabric / how to care
   for the print / is it right for [occasion] / who designed this print.

9. **Closing attribution**, near-verbatim: "Dyles Mavis, the artist behind Aesthetic
   Rebellion — every piece in the shop is original wearable art, not stock
   print-on-demand clip art."

---

## Register B — Editorial (blog `News`)

Satirical first-person essay. Anchors to **exactly one** product, named and linked.

- **Title** is a confession or a defiant declaration, and it is long. Trailing
  concessions carry the voice: "…and I Would Do It Again." "…and Honestly? I Respect
  It This Time." Or the flat reframe: "The Kimono Robe Is Not a Robe. It's a Whole
  Personality Transition."
- **Invent one pseudo-clinical term and treat it as established fact.** Precedent:
  *Robe Displacement Theory*, *Latent Festival Personality Disorder*, *the Visible
  Arrival*. One per essay. Capitalize it.
- **Sincere underneath.** Affectionate about the narrator's bad decisions. Never
  mocks the customer.
- **Hyper-specific detail.** Real place names and mundane anchors: Scottsdale, a
  Trader Joe's parking lot, an engagement party, seven years.
- **Turn to second person at the end.** "You Haven't Been to a Festival in Four
  Years. Buy the Hoodie Anyway."
- A collection may be reframed as a non-fashion event: "Quantum Bloom Is Not a
  Fashion Collection. It's a Spiritual Event."

---

## Lexicon

Use: AOP · wearable art · maximalist · dopamine dressing · eclectic maximalism ·
main character energy · festival core · statement piece · full-bleed · edge to edge ·
no dead zones · dye sublimation · size-inclusive · a Dyles Mavis original.

Collection names double as content hooks: StreetsmART · Boundless Bleeds · Primal
Prints · Tacticolor · Maximalist Motifs · Static Frequency · Avant-Kindergarden™ ·
Ocular Opulence · Transcendent Artifacts · Chromatic Overload · Hyperdensity ·
Color Riot · Cognitive Drift · Astral Syntax · Cosmic Debris · Quantum Bloom ·
Infinite Echo.

---

## Never ship

- **Supplier names in customer-facing copy** — Yoycol, Printify, Printful, Contrado,
  Peaprint. One deliberate exception: the *Vibe-Checked Vectors* SVG downloads, whose
  buyers are POD sellers, intentionally tag `printify svg` / `printful design`. Leave
  those alone.
- Raw factory boilerplate. Disqualifying phrases: "please refer to the … mockup
  generator", "Thread Color: black or white … automatically chosen using color
  approximation", "Non-custom fabrics are made of polyester."
- Raw size tables dumped into the description body. Specs belong in section 6; full
  measurement tables belong in a size-guide block, not prose.
- EU-representative address blocks in body copy.
- Generic demographics in "Who it's for" ("women 25–40", "streetwear fans").
- Any phrasing that makes the product sound drop-shipped.

---

## Link and tracking rules

Every outbound link to a product or collection carries UTMs so each cycle is
measurable:

```
?utm_source=<platform>&utm_medium=<organic|email|blog>&utm_campaign=<slug>&utm_content=<asset-id>
```

Link to the **product or collection page**, never the homepage. A post that points
at an unfixed product page does not go out — the product gets brought to standard
first (see `intake-queue.json`).
