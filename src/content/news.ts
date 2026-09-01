export type NewsArticle = {
  slug: string;
  effectId: string;
  effectName: string;
  category: string;
  title: string;
  dek: string;
  description: string;
  publishedAt: string;
  readMinutes: number;
  image: string;
  imageAlt: string;
  imageCaption: string;
  keywords: string[];
  tldr: string;
  satireDisclosure: string;
  dispatch: string[];
  explanation: string[];
  steps: string[];
  parameters: { control: string; purpose: string; low: string; high: string; sweetSpot: string }[];
  uses: { title: string; body: string }[];
  quote: string;
  quoteAttribution: string;
  downloadHref: string;
  product: { name: string; href: string; copy: string };
  sources: { label: string; href: string; note: string }[];
  relatedEffects: string[];
  faqs: { question: string; answer: string }[];
};

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    slug: "sort-your-pixels-before-they-sort-you",
    effectId: "pixelSort",
    effectName: "Pixel Sort",
    category: "Effect School",
    title: "Sort Your Pixels Before They Sort You",
    dek: "A practical field guide to brightness-driven smearing, why the internet fell for it, and how to weaponize it without making visual oatmeal.",
    description: "Learn what pixel sorting is, where the glitch-art technique came from, and how to use Ether-MOSH Pixel Sort for video, print, projection, patterns, and motion graphics.",
    publishedAt: "2026-08-31T08:00:00-07:00",
    readMinutes: 6,
    image: "/news/pixel-sort-bureaucracy.jpg",
    imageAlt: "Fictional workers sorting black, white, and magenta pixels beneath a portrait stretched into horizontal pixel-sort streaks",
    imageCaption: "The Department of Pixel Labor denies that brightness has become a caste system. The pixels have retained counsel.",
    keywords: ["pixel sorting", "pixel sort effect", "glitch art", "Ether-MOSH Pixel Sort", "how to pixel sort", "real-time GPU effects"],
    tldr: "Pixel sorting reorders selected pixels along an axis according to brightness or color. Ether-MOSH uses a fast GPU interpretation: Threshold decides which luminance regions move, and Amount decides how far the horizontal smear travels.",
    satireDisclosure: "The department, workers, and labor dispute are fictional. The technique, controls, history, and production advice are real.",
    dispatch: [
      "At 08:14 this morning, the fictional Department of Pixel Labor announced that every bright pixel had been reassigned three hundred columns east. Dark pixels were told to remain calm and stop asking what happened to the cheekbone.",
      "Commissioner Gary Raster—an invented man with the confidence of a printer driver—called the streaking ‘a routine organizational event.’ He is lying. It is pixel sorting, it looks fantastic, and restraint is the only thing keeping your portrait from becoming artisanal horizontal soup.",
    ],
    explanation: [
      "Classic pixel sorting selects runs of pixels using a threshold, orders those pixels by a value such as brightness, and writes them back along a row or column. Kim Asendorf's 2010 ASDFPixelSort Processing script exposed white, black, bright, and dark threshold modes and helped establish the technique's modern visual vocabulary.",
      "Ether-MOSH is built for live performance, so its shader measures luminance, opens a soft gate around Threshold, and applies a noisy horizontal displacement scaled by Amount. You get the recognizable bright-region streaks at interactive speed, with the source still legible underneath.",
    ],
    steps: [
      "Open MOSH, load a high-contrast portrait, skyline, product image, or clip, then open the FX panel.",
      "Choose Data Corruption and add Pixel Sort. Start with Amount near 0.30 and Threshold near 0.55.",
      "Lower Threshold until the important highlights begin to streak. If the whole frame moves, crawl back from the ledge.",
      "Raise Amount for longer travel. Stack RGB Shift or Film Grain after it for separation and texture.",
      "Export a still for print, or record a short loop while animating one control slowly. One deliberate move beats twelve frantic knob confessions.",
    ],
    parameters: [
      { control: "Amount", purpose: "Distance and strength of the horizontal smear", low: "Source stays legible", high: "Long wrapping streaks", sweetSpot: "0.25–0.60" },
      { control: "Threshold", purpose: "Luminance gate deciding which regions move", low: "More of the frame qualifies", high: "Only bright regions qualify", sweetSpot: "0.35–0.65" },
      { control: "Source contrast", purpose: "Separation before the effect", low: "Soft cloudy movement", high: "Crisp streak boundaries", sweetSpot: "Strong subject edges" },
    ],
    uses: [
      { title: "Print + pattern", body: "Build a bold still and test a 3×3 repeat before committing to fabric or wallpaper. Streaks crossing a tile edge can become excellent seams or deeply stupid seams." },
      { title: "Projection + venue", body: "Use faces, architecture, or typography with obvious light-dark structure. Slow Amount changes read across a room; micro-jitter dies on the LED wall." },
      { title: "Vector + Lottie", body: "Pixel Sort is raster by nature. Trace only the strongest streak silhouettes for vector shapes, or feed a short high-contrast loop into a masked Lottie sticker." },
      { title: "Museum + education", body: "Compare MOSH output with the original ASDFPixelSort code to show how literal sorting and shader displacement can share a visual language while using different machinery." },
    ],
    quote: "Pixel sorting is not about destroying the image. It is about revealing the hierarchy the image was already hiding, then shoving that hierarchy sideways.",
    quoteAttribution: "The completely unauthorized MOSH field manual",
    downloadHref: "/news/downloads/pixel-sort-field-card.md",
    product: {
      name: "Liquid Glitch Beanie",
      href: "https://aestheticrebellion.store/products/liquid-glitch-beanie",
      copy: "Mandatory paid interruption: the Liquid Glitch Beanie at aestheticrebellion.store will not improve your threshold decisions. It will, however, make your skull look like it has better layer management. Capitalism has entered the tutorial wearing knitwear.",
    },
    sources: [
      { label: "Kim Asendorf — ASDFPixelSort", href: "https://github.com/kimasendorf/ASDFPixelSort", note: "Original 2010 Processing script and threshold modes." },
      { label: "Ether-MOSH Effect Registry", href: "/effects", note: "Current effect parameters, descriptions, and GLSL source." },
    ],
    relatedEffects: ["rgbShift", "filmGrain", "halftone", "photocopy"],
    faqs: [
      { question: "Is Ether-MOSH doing literal pixel sorting?", answer: "It is a real-time GPU interpretation. Luminance thresholds and horizontal displacement create the visual language without freezing live playback for a full CPU sort." },
      { question: "What images work best with Pixel Sort?", answer: "High-contrast portraits, architecture, night lights, bold type, and footage with clear silhouettes give the threshold useful structure to grab." },
      { question: "Can I use Pixel Sort for print?", answer: "Yes. Export a high-resolution still, inspect streak edges at 100%, proof the physical size, and use the print-ready 300 DPI export path." },
      { question: "Where is Pixel Sort in Ether-MOSH?", answer: "Open the FX panel, select Data Corruption, and add Pixel Sort. Desktop users can also open the command palette and search for it." },
    ],
  },
  {
    slug: "halftone-is-not-a-phase-mom",
    effectId: "halftone",
    effectName: "Halftone",
    category: "Print Crimes",
    title: "Halftone Is Not a Phase, Mom—Put These Dots Everywhere",
    dek: "How tiny ink dots faked continuous tone, conquered mass media, and escaped into your live visual stack wearing no pants and four process colors.",
    description: "Learn halftone printing history and practical Ether-MOSH Halftone settings for posters, patterns, motion graphics, projection, and print production.",
    publishedAt: "2026-08-31T08:05:00-07:00",
    readMinutes: 5,
    image: "/news/halftone-press-revolt.jpg",
    imageAlt: "A fictional historic print shop filled with cyan, magenta, yellow, and black halftone dots escaping from a screened portrait",
    imageCaption: "Management asked the dots to return to a regular screen. The magenta delegation demanded dental.",
    keywords: ["halftone effect", "halftone printing", "CMYK dots", "Ether-MOSH Halftone", "print design", "halftone tutorial"],
    tldr: "Halftoning simulates continuous tone with regularly spaced dots whose size carries tonal information. Ether-MOSH turns that print logic into an animated GPU effect; Amount blends it in and Dot Size moves from fine texture to giant graphic circles.",
    satireDisclosure: "The dot uprising and its labor demands are fictional. The print history, process explanation, MOSH controls, and production cautions are real.",
    dispatch: [
      "A fictional press foreman named Dolores Registration lost control of the cyan plate at lunch. By two o'clock magenta had unionized, yellow was inside the ventilation system, and black was carrying the composition while everybody else took credit.",
      "Traditional printing cannot lay down a smooth little fog of half-black ink on command. It prints ink or no ink. Tiny dots of changing size trick the eye into reading shades between those states.",
    ],
    explanation: [
      "The Library of Congress describes halftone photomechanical prints as reproductions distinguished by dot or line patterns created with a screen, used to reproduce continuous-tone originals such as photographs. Commercial halftone reproduction arrived in the 1880s and changed illustrated publishing.",
      "Process color separates cyan, magenta, yellow, and black screens at different angles. Ether-MOSH borrows that logic in a live three-channel shader and uses Dot Size plus Amount to move between photograph and graphic field.",
    ],
    steps: [
      "Load an image with simple lighting and recognizable midtones, then add Halftone from Color.",
      "Set Amount around 0.45 and Dot Size around 0.25 so the image remains a picture instead of becoming upholstery.",
      "Raise Dot Size for posters, projection, thumbnails, or coarse comic energy. Lower it for editorial texture and faces.",
      "Add Duotone to control the palette, or Photocopy after it for filthy repro edges.",
      "For print, export a proof and inspect it at final physical size. Your monitor is not your press and it has been lying to you since birth.",
    ],
    parameters: [
      { control: "Amount", purpose: "Blend between source and screened result", low: "Subtle print texture", high: "Dots dominate", sweetSpot: "0.40–0.78" },
      { control: "Dot Size", purpose: "Screen scale from fine to coarse", low: "Fine editorial screen", high: "Large graphic dots", sweetSpot: "Match output size" },
      { control: "Output scale", purpose: "How dots survive reproduction", low: "Fine detail may alias", high: "Coarse dots hold at distance", sweetSpot: "Proof at 100%" },
    ],
    uses: [
      { title: "Posters + packaging", body: "Use enough dot size to survive the final stock and viewing distance. A microscopic screen that vanishes in print is unpaid prepress performance art." },
      { title: "Patterns + textiles", body: "Large dots become repeat motifs; fine screens create texture. Test seams, garment scale, and separation before repeating the incident across six yards of polyester." },
      { title: "Projection + LED", body: "Coarser settings survive imperfect panels and distance. Animate Dot Size gently with bass for a breathing surface instead of a strobing eye exam." },
      { title: "Education + archives", body: "Compare a MOSH frame with a scanned newspaper under magnification: the same idea—tone encoded by marks—moves from print history into real-time graphics." },
    ],
    quote: "A halftone dot is a binary decision pretending to be nuance. Relatable, honestly.",
    quoteAttribution: "Dolores Registration, fictional foreman and real mood",
    downloadHref: "/news/downloads/halftone-field-card.md",
    product: {
      name: "Aesthetic Rebellion Word Cloud Bucket Hat",
      href: "https://aestheticrebellion.store/products/aesthetic-rebellion-word-cloud-bucket-hat",
      copy: "Aggressively visible sponsorship: aestheticrebellion.store would like to place the Aesthetic Rebellion Word Cloud Bucket Hat directly between you and financial maturity. It is reversible, because even product placement deserves two screen angles.",
    },
    sources: [
      { label: "Library of Congress — Halftone photomechanical prints", href: "https://www.loc.gov/pictures/item/tgm004832/", note: "Definition, reproduction use, and commercial-era context." },
      { label: "Adobe — Prepress terminology", href: "https://www.adobe.com/studio/print/pdf/prepress_terms.pdf", note: "Halftone screening and process-color dot arrays." },
      { label: "Ether-MOSH Effect Registry", href: "/effects", note: "Current parameters and shader source." },
    ],
    relatedEffects: ["duotone", "photocopy", "crossHatch", "moire"],
    faqs: [
      { question: "What is a halftone effect?", answer: "It represents continuous tones with discrete dots. Larger or denser dots read darker; smaller or separated dots read lighter." },
      { question: "Is MOSH Halftone a press-ready CMYK separation?", answer: "No. It is a live visual effect inspired by process-screen logic, not a replacement for professional separation, trapping, ink limits, or a physical proof." },
      { question: "What Dot Size should I use?", answer: "Use finer dots for detailed editorial texture and larger dots for posters, patterns, projections, or anything viewed at a distance." },
      { question: "Where is Halftone in Ether-MOSH?", answer: "Open the FX panel, select Color, and add Halftone. Its two controls are Amount and Dot Size." },
    ],
  },
  {
    slug: "make-moire-before-moire-makes-you-sick",
    effectId: "moire",
    effectName: "Moire",
    category: "Optical Incident",
    title: "Make Moire Before Moire Makes You Sick",
    dek: "Two innocent grids walk into a frame, disagree by four percent, and produce a giant beat pattern that now owns the venue.",
    description: "Understand moire interference and learn practical Ether-MOSH Moire settings for op art, projection mapping, live visuals, print proofs, patterns, and education.",
    publishedAt: "2026-08-31T08:10:00-07:00",
    readMinutes: 5,
    image: "/news/moire-optical-hearing.jpg",
    imageAlt: "A fictional optical hearing where overlapping fine line grids create a large moire wave behind a tribunal",
    imageCaption: "The tribunal ruled that the grids were individually harmless and collectively a pain in the ass.",
    keywords: ["moire effect", "moire pattern", "optical interference", "Ether-MOSH Moire", "op art", "projection mapping effects"],
    tldr: "Moire is a large interference pattern created when similar repeating grids overlap with a slight change in angle, spacing, or scale. Ether-MOSH animates two near-matching grids; Amount controls visibility and Pitch controls frequency.",
    satireDisclosure: "The Department of Optical Incidents and tribunal are fictional. The interference physics, cultural references, accessibility note, and MOSH workflow are real.",
    dispatch: [
      "The Department of Optical Incidents convened an emergency hearing after two grids were seen overlapping without a permit. Each looked boring alone. Together they generated a rolling wave large enough to swallow the municipal logo.",
      "Expert witness Dr. Patty Repeat—fabricated, overqualified, and furious—explained that nobody added the big wave. It emerged from the small mismatch between the patterns. The room requested a recess. The pattern requested a higher Pitch setting.",
    ],
    explanation: [
      "Moire appears when similar periodic structures overlap with a slight difference in angle, spacing, or scale. Their alignments create a larger beat pattern. It can be a camera or print artifact, a measurement tool, a material-science phenomenon, or the entire damn artwork.",
      "MoMA discusses optical interference in Liz Deschenes's Moire #25, while NIST describes moire in stacked atomic layers. Ether-MOSH recreates the mechanism with two fine grids: one rotates and runs at a slightly different frequency, producing a moving coarse field.",
    ],
    steps: [
      "Load a high-contrast image with broad shapes. Fine striped fabric may summon a second, less cooperative moire.",
      "Add Moire from Geometry. Begin with Amount around 0.25 and Pitch around 0.35.",
      "Increase Pitch until the grids resolve at your actual output size. Do not judge a venue loop in a postage-stamp preview like a tiny coward.",
      "Raise Amount until the pattern supports the source. Add Duotone for control or Bloom for luminous projection.",
      "Test on the real display, projector, camera, and print process. Resampling can create interference your laptop never showed you.",
    ],
    parameters: [
      { control: "Amount", purpose: "Visibility of the interference treatment", low: "Quiet shimmer", high: "Pattern dominates", sweetSpot: "0.18–0.62" },
      { control: "Pitch", purpose: "Frequency of the two source grids", low: "Broad calm structure", high: "Dense volatile field", sweetSpot: "Output-dependent" },
      { control: "Scale + camera", purpose: "Adds sensor and resampling interactions", low: "Stable in one context", high: "Secondary moire", sweetSpot: "Test final hardware" },
    ],
    uses: [
      { title: "Live installation", body: "Project onto simple surfaces first, then introduce architecture. Slow Pitch changes make a static wall feel volumetric without requiring a headset waiver." },
      { title: "Print + pattern", body: "Use moire intentionally only after physical proofing. The press, paper, screen ruling, scanner, and social thumbnail may each generate their own opinion." },
      { title: "Motion + performance", body: "Map Amount conservatively to audio and let Pitch drift. Rapid high-contrast changes can be uncomfortable, so keep an accessible low-intensity state." },
      { title: "Museum + education", body: "Layer two printed transparencies and rotate one by hand, then compare the analog beat pattern with Ether-MOSH. The principle becomes obvious without a paragraph wearing a lab coat." },
    ],
    quote: "Moire is what happens when repetition develops a disagreement and makes it everybody's problem.",
    quoteAttribution: "Dr. Patty Repeat, not a real doctor or person",
    downloadHref: "/news/downloads/moire-field-card.md",
    product: {
      name: "Chromatic Sweep Reversible Bucket Hat",
      href: "https://aestheticrebellion.store/products/chromatic-sweep-reversible-bucket-hat",
      copy: "Here comes the shameless sponsorship beam: the Chromatic Sweep Reversible Bucket Hat from aestheticrebellion.store contains enough competing color movement to make a moire grid file a restraining order. Please admire the nerve of inserting a hat into optical science.",
    },
    sources: [
      { label: "MoMA — Surface and Light: Liz Deschenes", href: "https://www.moma.org/explore/inside_out/2012/07/12/surface-and-light-liz-deschenes/", note: "Moiré as interference, misregistration, and photographic artwork." },
      { label: "NIST — Moiré Patterns Open Up More Possibilities", href: "https://www.nist.gov/news-events/news/2019/02/moire-patterns-open-more-possibilities-quantum-information", note: "Interference from overlaid periodic structures in material science." },
      { label: "Ether-MOSH Effect Registry", href: "/effects", note: "Current parameters and shader source." },
    ],
    relatedEffects: ["halftone", "duotone", "bloom", "feedbackTunnel"],
    faqs: [
      { question: "What causes a moire pattern?", answer: "Two similar repeating patterns overlap with a small difference in angle, spacing, or scale. Their periodic alignments form a larger visible beat pattern." },
      { question: "Is moire always a mistake?", answer: "No. It can be an unwanted artifact, but artists, designers, scientists, and engineers also use it intentionally." },
      { question: "Can I print MOSH Moire artwork?", answer: "Yes, but proof it physically. Scaling, screen ruling, paper, camera sensors, and later resampling can introduce additional interference." },
      { question: "Where is Moire in Ether-MOSH?", answer: "Open the FX panel, select Geometry, and add Moire. Start at low Amount and adjust Pitch at final output size." },
    ],
  },
];

export const NEWS_ARTICLES_BY_SLUG = new Map(NEWS_ARTICLES.map((article) => [article.slug, article]));
export const latestNewsArticles = [...NEWS_ARTICLES].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
export const newsArticlePath = (article: NewsArticle) => `/news/${article.slug}`;
