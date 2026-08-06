#!/usr/bin/env python3
"""
Automated analysis script for Aesthetic Rebellion / Dylesmavis Shopify products.
Generates CSV rows with visual description, 12 tags, marketing copy, gender, and collections.
"""

import json
import csv
import re
import sys

# ─── COLLECTION KEYWORD RULES ───────────────────────────────────────────────
COLLECTION_RULES = {
    "StreetsmART": ["graffiti", "tag art", "street art", "urban art", "spray paint",
                    "sticker bomb", "collage", "newsprint", "banksy", "hip-hop", "hip hop",
                    "street", "city art", "urban collage", "tag"],
    "Boundless Bleeds": ["all-over print", "all over print", "aop", "full-bleed",
                         "full bleed", "sublimation", "edge-to-edge", "premium aop",
                         "all over", "boundless"],
    "Primal Prints": ["animal", "botanical", "floral", "flora", "jungle", "tropical",
                      "nature", "leaf", "leaves", "petal", "bloom", "garden", "butterfly",
                      "wildflower", "wildlife", "creature", "critter", "insect", "bird",
                      "furry", "feline", "canine", "dragon", "fauna", "forest",
                      "mushroom", "coral", "sea life", "jellyfish", "leopard", "tiger",
                      "snake", "wolf", "fox", "bears", "floral cotton", "botanical"],
    "Static Frequency": ["electric", "neon", "lightning", "glitch", "cyber", "digital",
                         "frequency", "wave", "pixel", "matrix", "circuit", "tech",
                         "cyberpunk", "static", "vortex", "glitchcore", "electric blue",
                         "laser", "spectrum collapse", "vapor", "vaporwave", "y2k",
                         "holographic", "iridescent", "chrome", "liquid glitch", "marble glitch"],
    "Cognitive Drift": ["psychedelic", "trippy", "spiral", "kaleidoscope", "tie-dye",
                        "swirl", "hypnotic", "mind-melt", "mind melting", "trance",
                        "consciousness", "hallucin", "visionary", "abstract swirl",
                        "cognitive", "drift", "lsd", "psilocybin", "sacred", "fractals",
                        "fractal", "tie dye", "mandala spiral", "rainbow swirl"],
    "Cosmic Debris": ["space", "galaxy", "cosmic", "void", "debris", "nebula", "star",
                      "moon", "planet", "space punk", "dark matter", "astro punk",
                      "space capsule", "retro futurist", "alien", "ufo", "orbit",
                      "constellation", "meteor", "dark cosmic"],
    "Maximalist Motifs": ["maximalist", "pattern on pattern", "dense print", "overload",
                          "eclectic", "complex pattern", "multi-motif", "bold print",
                          "heavy print", "loud print", "busy pattern", "layered pattern",
                          "maximalism", "statement piece"],
    "Transcendent Artifacts": ["sacred geometry", "mandala", "spiritual", "chakra",
                               "meditation", "om", "mystic", "mystical", "temple",
                               "artifact", "celestial symbol", "ancient", "rune",
                               "transcend", "consciousness", "third eye", "aura"],
    "Quantum Bloom": ["floral", "bloom", "flower", "petal", "botanical", "garden",
                      "quantum", "flora", "wildflower", "meadow", "spring blossom",
                      "rose", "daisy", "orchid", "lily", "blossom", "botanical art"],
    "Chromatic Overload": ["rainbow", "chromatic", "vivid", "neon", "spectrum",
                           "color spectrum", "ultra color", "full spectrum", "vibrant",
                           "bright", "vivid color", "color explosion", "chromatic therapy",
                           "color wave", "paint pile", "paint splatter", "painted"],
    "Color Riot": ["multicolor", "color explosion", "color chaos", "riot", "vivid",
                   "kaleidoscope color", "color wheel", "rainbow melt", "color burst",
                   "tie dye", "paint drip", "splatter color", "multi color"],
    "Hyperdensity": ["ultra-dense", "intricate", "hyper-detailed", "complex", "dense",
                     "hyperdensity", "detailed pattern", "micro-pattern", "fine print",
                     "packed", "ultra dense"],
    "Astral Syntax": ["astral", "cosmic", "galaxy", "universe", "celestial", "space art",
                      "interstellar", "nebula art", "star field", "astronomy", "astrological",
                      "astro", "cosmic syntax", "space syntax"],
    "Avant-Kindergarden™": ["kidlike", "childlike", "cartoon", "cute", "kawaii", "candy",
                            "playful", "fun print", "bubbly", "whimsical", "bright candy",
                            "laffy taffy", "candy wrapper", "sticker book", "collage cute",
                            "mini", "kids", "children", "youth", "junior", "baby",
                            "furry little", "friends"],
    "Ocular Opulence": ["eye", "optical", "illusion", "lens", "visual", "optic",
                        "psychedelic eye", "eye art", "third eye", "all-seeing eye",
                        "ocular", "opulence", "eye pattern"],
    "Vibe-Checked Vectors": ["vector", "geometric", "minimal", "clean line", "svg",
                             "geometric pattern", "line art", "abstract geometry",
                             "triangles", "hexagon", "grid", "blueprint", "isometric",
                             "retro geometric"],
    "Tacticolor": ["tactile", "texture", "3d effect", "emboss", "velvet", "textured",
                   "dimensional", "relief", "tacticolor"],
    "Hypnagogic": ["dream", "dreamscape", "surreal", "hypnagogic", "trance", "lucid",
                   "somnambulant", "liminal", "ethereal", "dream state"]
}

# Gender rules
GIRLS_KEYWORDS = ["crop top", "bodycon", "dress", "kaftan", "kimono", "swimsuit",
                  "one-piece", "bikini", "skirt", "blouse", "corset", "bustier",
                  "women's", "womens", "ladies", "girlfriend", "girl", "feminine",
                  "girls", "contessa", "goddess", "queen"]
GUYS_KEYWORDS = ["men's", "mens", "him", "his", "boyfriend", "guy", "men ",
                 "male", "gents", "cargo shorts", "board shorts", "baseball cap"]
YOUTH_TYPES = ["kids hoodie", "children", "youth", "junior", "toddler", "baby", "mini"]
HOME_TYPES = ["duvet", "tablecloth", "shower curtain", "pillowcase", "throw blanket",
              "wall decor", "ceiling fan", "tapestry", "bedding", "home decor",
              "bed cover", "blanket", "rug", "curtain"]
ACCESSORY_TYPES = ["phone case", "fanny pack", "bandana", "beanie", "bucket hat",
                   "baseball cap", "snapback", "scarf", "gloves", "eyewear",
                   "eyeglass", "sunglasses", "cooler bag", "tote bag", "backpack",
                   "keychain", "lanyard", "beach towel", "pet bed", "socks"]

# Trending Spring 2026 terms
TRENDING = [
    "dopamine dressing", "eclectic maximalism", "wearable art movement",
    "weird girl aesthetic", "art kid fashion", "festival core 2026",
    "chromatic therapy", "post-internet fashion", "neuro-spicy style",
    "main character energy", "quiet chaos aesthetic", "serotonin boost fashion",
    "hyperpop streetwear", "vivid aura aesthetic"
]

# Evergreen terms
EVERGREEN = [
    "all over print", "AOP fashion", "festival outfit", "rave wear",
    "psychedelic clothing", "streetwear", "statement piece", "graphic print",
    "bold print", "alt fashion", "maximalist fashion", "indie aesthetic",
    "wearable art", "burning man outfit", "EDM festival", "unique gift",
    "unisex fashion", "plus size fashion"
]

# Product type to trending tag mapping
TYPE_TRENDING = {
    "hoodie": ["art kid fashion", "main character energy", "hyperpop streetwear", "festival core 2026"],
    "sweatshirt": ["art kid fashion", "eclectic maximalism", "main character energy", "serotonin boost fashion"],
    "t-shirt": ["dopamine dressing", "post-internet fashion", "weird girl aesthetic", "vivid aura aesthetic"],
    "shirt": ["dopamine dressing", "wearable art movement", "eclectic maximalism", "chromatic therapy"],
    "pants": ["dopamine dressing", "eclectic maximalism", "art kid fashion", "main character energy"],
    "shorts": ["festival core 2026", "dopamine dressing", "chromatic therapy", "vivid aura aesthetic"],
    "boots": ["weird girl aesthetic", "art kid fashion", "quiet chaos aesthetic", "main character energy"],
    "hat": ["main character energy", "festival core 2026", "art kid fashion", "hyperpop streetwear"],
    "cap": ["main character energy", "festival core 2026", "art kid fashion", "hyperpop streetwear"],
    "beanie": ["main character energy", "post-internet fashion", "quiet chaos aesthetic", "hyperpop streetwear"],
    "bucket hat": ["festival core 2026", "main character energy", "weird girl aesthetic", "vivid aura aesthetic"],
    "dress": ["weird girl aesthetic", "wearable art movement", "dopamine dressing", "chromatic therapy"],
    "kimono": ["wearable art movement", "eclectic maximalism", "weird girl aesthetic", "chromatic therapy"],
    "kaftan": ["wearable art movement", "eclectic maximalism", "serotonin boost fashion", "quiet chaos aesthetic"],
    "crop top": ["weird girl aesthetic", "dopamine dressing", "festival core 2026", "vivid aura aesthetic"],
    "bomber": ["art kid fashion", "main character energy", "eclectic maximalism", "quiet chaos aesthetic"],
    "jacket": ["eclectic maximalism", "art kid fashion", "main character energy", "wearable art movement"],
    "phone case": ["post-internet fashion", "dopamine dressing", "neuro-spicy style", "vivid aura aesthetic"],
    "fanny pack": ["festival core 2026", "main character energy", "dopamine dressing", "chromatic therapy"],
    "bandana": ["festival core 2026", "weird girl aesthetic", "art kid fashion", "vivid aura aesthetic"],
    "swimsuit": ["chromatic therapy", "dopamine dressing", "festival core 2026", "vivid aura aesthetic"],
    "joggers": ["hyperpop streetwear", "dopamine dressing", "eclectic maximalism", "serotonin boost fashion"],
    "polo": ["eclectic maximalism", "wearable art movement", "chromatic therapy", "art kid fashion"],
    "henley": ["eclectic maximalism", "art kid fashion", "main character energy", "post-internet fashion"],
    "button": ["wearable art movement", "eclectic maximalism", "dopamine dressing", "chromatic therapy"],
    "snapback": ["hyperpop streetwear", "festival core 2026", "post-internet fashion", "main character energy"],
    "duvet": ["dopamine dressing", "serotonin boost fashion", "wearable art movement", "chromatic therapy"],
    "tablecloth": ["dopamine dressing", "eclectic maximalism", "serotonin boost fashion", "chromatic therapy"],
    "shower curtain": ["dopamine dressing", "weird girl aesthetic", "serotonin boost fashion", "eclectic maximalism"],
    "blanket": ["serotonin boost fashion", "dopamine dressing", "wearable art movement", "quiet chaos aesthetic"],
    "towel": ["dopamine dressing", "festival core 2026", "vivid aura aesthetic", "chromatic therapy"],
    "scarf": ["weird girl aesthetic", "wearable art movement", "eclectic maximalism", "dopamine dressing"],
    "gloves": ["weird girl aesthetic", "wearable art movement", "quiet chaos aesthetic", "art kid fashion"],
    "default": ["dopamine dressing", "eclectic maximalism", "main character energy", "festival core 2026"]
}

# Product type to evergreen tag mapping
TYPE_EVERGREEN = {
    "hoodie": ["all over print", "AOP fashion", "streetwear", "graphic print", "bold print",
               "alt fashion", "wearable art", "festival outfit", "maximalist fashion", "unique gift"],
    "boots": ["all over print", "AOP fashion", "statement piece", "alt fashion", "wearable art",
              "graphic print", "festival outfit", "indie aesthetic", "unique gift", "maximalist fashion"],
    "hat": ["all over print", "AOP fashion", "festival outfit", "streetwear", "statement piece",
            "graphic print", "alt fashion", "unique gift", "indie aesthetic", "EDM festival"],
    "beanie": ["all over print", "AOP fashion", "streetwear", "statement piece", "graphic print",
               "alt fashion", "unique gift", "indie aesthetic", "festival outfit", "maximalist fashion"],
    "dress": ["all over print", "AOP fashion", "wearable art", "festival outfit", "indie aesthetic",
              "statement piece", "graphic print", "alt fashion", "maximalist fashion", "unique gift"],
    "phone case": ["AOP fashion", "statement piece", "graphic print", "alt fashion", "indie aesthetic",
                   "unique gift", "maximalist fashion", "bold print", "wearable art", "streetwear"],
    "default": ["all over print", "AOP fashion", "festival outfit", "rave wear", "streetwear",
                "statement piece", "graphic print", "bold print", "alt fashion", "maximalist fashion",
                "indie aesthetic", "wearable art", "unique gift", "EDM festival"]
}

# Marketing copy templates by keyword
COPY_TEMPLATES = {
    "graffiti": [
        "The streets called — they want their art back. Too bad, it's yours now.",
        "Carry the city on your back. Wear the walls that shaped you.",
        "Your outfit IS the gallery. No admission required.",
        "The spray can is mightier than the sword. Wear the proof.",
        "Tag everything, including the algorithm."
    ],
    "psychedelic": [
        "Reality is optional. Fashion is mandatory.",
        "Your aura called — it wants to be seen from orbit.",
        "Wear what your pineal gland dreams about.",
        "Not a vibe. A seismic event.",
        "Close your eyes. Open your wardrobe. Same difference."
    ],
    "floral": [
        "Wear the whole garden. Let the sidewalk be your runway.",
        "Flora is your armor. Bloom where you stand.",
        "Every petal is a plot twist.",
        "The garden escaped. You're wearing the evidence.",
        "Why carry flowers when you can wear them?"
    ],
    "spiral": [
        "Wear the spiral. Become the spiral.",
        "The universe expands. So does your wardrobe.",
        "Infinite pattern, infinite potential. Wear it.",
        "Every rotation is a revolution.",
        "Get lost in the swirl. Never come back."
    ],
    "neon": [
        "No streetlight? You ARE the streetlight.",
        "Glow different. Burn brighter.",
        "Your drip is a public service announcement.",
        "When you walk in, the room adjusts its brightness.",
        "Electric wasn't built to be hidden."
    ],
    "space": [
        "Designed by the cosmos. Worn by the fearless.",
        "The universe wanted a spokesperson. Here you are.",
        "Orbit optional. Statement mandatory.",
        "Dress like you're from the next dimension.",
        "Astral projection, but make it fashion."
    ],
    "animal": [
        "Predator energy. Prey aesthetic. Complete confusion.",
        "Born wild, dressed wilder.",
        "The jungle didn't come to you. You went to it.",
        "Wear your wild. Own your pack.",
        "Feral is a vibe. This is proof."
    ],
    "abstract": [
        "Art shouldn't stay on walls. Let it walk.",
        "This isn't clothing. It's an argument for color.",
        "Your body is the canvas. Act accordingly.",
        "Curated chaos for the aesthetically enlightened.",
        "When mundane isn't in your vocabulary."
    ],
    "tie-dye": [
        "Hand-dipped in the universe.",
        "No two alike. Like you.",
        "Tie-dye never left. It was waiting for you.",
        "The counterculture grew up. Still wears tie-dye.",
        "60s called. They said keep it."
    ],
    "home": [
        "Your walls should scream as loud as your fit.",
        "Dopamine decor for the aesthetically unhinged.",
        "Make your space as bold as your personality.",
        "Home is where the art is. Make it loud.",
        "Interior design, exterior attitude."
    ],
    "accessory": [
        "The details make the drip.",
        "Every outfit has a finishing move. This is it.",
        "Accessories: the punctuation of fashion.",
        "Small format. Maximum impact.",
        "You had the fit. Now complete it."
    ],
    "default": [
        "Wear what others can't explain.",
        "The future of fashion isn't quiet.",
        "Curated chaos for the aesthetically enlightened.",
        "Art shouldn't stay on walls. Let it walk.",
        "Not a look. A statement of existence."
    ]
}

def get_copy_template(title_lower, ptype_lower, idx=0):
    if any(w in title_lower for w in ["graffiti", "street art", "sticker bomb", "urban", "tag art"]):
        return COPY_TEMPLATES["graffiti"][idx % len(COPY_TEMPLATES["graffiti"])]
    elif any(w in title_lower for w in ["spiral", "swirl", "vortex", "kaleidoscope"]):
        return COPY_TEMPLATES["spiral"][idx % len(COPY_TEMPLATES["spiral"])]
    elif any(w in title_lower for w in ["floral", "flower", "botanical", "garden", "bloom", "petal", "wildflower"]):
        return COPY_TEMPLATES["floral"][idx % len(COPY_TEMPLATES["floral"])]
    elif any(w in title_lower for w in ["psychedelic", "trippy", "tie-dye", "tie dye", "mandala"]):
        if "tie" in title_lower:
            return COPY_TEMPLATES["tie-dye"][idx % len(COPY_TEMPLATES["tie-dye"])]
        return COPY_TEMPLATES["psychedelic"][idx % len(COPY_TEMPLATES["psychedelic"])]
    elif any(w in title_lower for w in ["neon", "electric", "glitch", "cyber", "lightning", "laser"]):
        return COPY_TEMPLATES["neon"][idx % len(COPY_TEMPLATES["neon"])]
    elif any(w in title_lower for w in ["space", "galaxy", "cosmic", "astral", "nebula", "planet"]):
        return COPY_TEMPLATES["space"][idx % len(COPY_TEMPLATES["space"])]
    elif any(w in title_lower for w in ["animal", "fauna", "beast", "wolf", "tiger", "leopard", "snake", "jungle", "furry", "pet"]):
        return COPY_TEMPLATES["animal"][idx % len(COPY_TEMPLATES["animal"])]
    elif any(w in ptype_lower for w in ["tablecloth", "duvet", "shower", "pillow", "blanket", "decor", "wall", "towel"]):
        return COPY_TEMPLATES["home"][idx % len(COPY_TEMPLATES["home"])]
    elif any(w in ptype_lower for w in ["case", "bag", "hat", "beanie", "bandana", "scarf", "glove", "glasses"]):
        return COPY_TEMPLATES["accessory"][idx % len(COPY_TEMPLATES["accessory"])]
    elif any(w in title_lower for w in ["abstract", "maximalist", "bold", "vivid", "chromatic", "color"]):
        return COPY_TEMPLATES["abstract"][idx % len(COPY_TEMPLATES["abstract"])]
    else:
        return COPY_TEMPLATES["default"][idx % len(COPY_TEMPLATES["default"])]

def get_gender(title, ptype):
    title_l = title.lower()
    ptype_l = ptype.lower()

    # Youth detection
    if any(w in title_l or w in ptype_l for w in ["kids ", "children", "child", "youth ", "junior", "toddler", "mini maximalist", "kids hoodie"]):
        return "Youth"

    # Check for girl-specific items
    is_girls = any(w in title_l or w in ptype_l for w in GIRLS_KEYWORDS)
    is_guys = any(w in title_l or w in ptype_l for w in GUYS_KEYWORDS)

    if ptype_l in ["dress", "crop top", "swimsuit", "kaftan", "long gloves"]:
        return "Girls"
    if "men's" in title_l or "mens " in title_l or ptype_l == "cargo pants":
        if not any(w in title_l for w in ["unisex", "all gender", "gender"]):
            return "Guys"

    if is_girls and not is_guys:
        return "Girls"
    elif is_guys and not is_girls:
        return "Guys"
    else:
        return "Guys+Girls"  # default to unisex for AOP brand

def get_collections(title, ptype, tags_existing):
    title_l = title.lower()
    ptype_l = ptype.lower()
    tags_l = " ".join(tags_existing).lower() if tags_existing else ""
    combined = title_l + " " + ptype_l + " " + tags_l

    scores = {}
    for coll, keywords in COLLECTION_RULES.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > 0:
            scores[coll] = score

    # Sort by score
    sorted_colls = sorted(scores.items(), key=lambda x: -x[1])

    # Always include Boundless Bleeds for wearable AOP items
    wearable_types = ["hoodie", "sweatshirt", "t-shirt", "shirt", "pants", "shorts",
                      "boots", "dress", "kimono", "kaftan", "jacket", "bomber", "crop top",
                      "joggers", "leggings", "swimsuit", "bucket hat", "cap", "beanie",
                      "snapback", "top", "henley", "polo", "blazer", "zip-up"]
    is_wearable = any(w in ptype_l for w in wearable_types)

    result = [c for c, s in sorted_colls]

    # Ensure Boundless Bleeds for wearable items
    if is_wearable and "Boundless Bleeds" not in result:
        result.insert(0, "Boundless Bleeds")

    # Ensure Maximalist Motifs for maximalist items
    if "maximalist" in combined and "Maximalist Motifs" not in result:
        result.append("Maximalist Motifs")

    # Always ensure at least 3 collections
    if len(result) < 3:
        # Fill with most relevant generic collections
        if "Chromatic Overload" not in result:
            result.append("Chromatic Overload")
        if len(result) < 3 and "Color Riot" not in result:
            result.append("Color Riot")
        if len(result) < 3 and "Maximalist Motifs" not in result:
            result.append("Maximalist Motifs")

    return result[:6]  # cap at 6

def get_utility_collections(title, ptype):
    ptype_l = ptype.lower()
    title_l = title.lower()
    utils = []

    if any(w in ptype_l or w in title_l for w in ["duvet", "tablecloth", "shower curtain",
                                                    "pillowcase", "throw blanket", "wall decor",
                                                    "ceiling fan", "tapestry", "bed cover",
                                                    "blanket", "rug", "curtain", "pet bed",
                                                    "tablecloth", "beach towel", "home decor"]):
        utils.append("Home & Living")

    if any(w in ptype_l or w in title_l for w in ["phone case", "fanny pack", "bandana",
                                                    "bucket hat", "baseball cap", "snapback",
                                                    "scarf", "gloves", "eyewear", "eyeglass",
                                                    "sunglasses", "cooler bag", "tote bag",
                                                    "backpack", "beach towel", "socks",
                                                    "beanie", "hat", "cap", "bandana"]):
        utils.append("Accessories")

    return "|".join(utils)

def get_tags(title, ptype, idx):
    title_l = title.lower()
    ptype_l = ptype.lower()

    # Get trending tags (3-4)
    trending_selected = []
    for key, tags_list in TYPE_TRENDING.items():
        if key in ptype_l or key in title_l:
            trending_selected = tags_list[:4]
            break
    if not trending_selected:
        trending_selected = TYPE_TRENDING["default"][:4]

    # Get evergreen tags (6-8)
    evergreen_selected = []
    for key, tags_list in TYPE_EVERGREEN.items():
        if key in ptype_l:
            evergreen_selected = tags_list[:8]
            break
    if not evergreen_selected:
        evergreen_selected = TYPE_EVERGREEN["default"][:8]

    # Add type-specific tags
    specific_tags = []
    if "graffiti" in title_l or "street art" in title_l or "sticker bomb" in title_l:
        specific_tags = ["graffiti streetwear", "street art clothing"]
    elif "psychedelic" in title_l or "trippy" in title_l:
        specific_tags = ["psychedelic fashion", "trippy AOP outfit"]
    elif "tie-dye" in title_l or "tie dye" in title_l:
        specific_tags = ["tie dye festival wear", "handcrafted dye art"]
    elif "floral" in title_l or "botanical" in title_l or "wildflower" in title_l:
        specific_tags = ["botanical print clothing", "floral AOP fashion"]
    elif "abstract" in title_l or "maximalist" in title_l:
        specific_tags = ["abstract art clothing", "maximalist AOP outfit"]
    elif "neon" in title_l or "electric" in title_l or "glitch" in title_l:
        specific_tags = ["neon streetwear", "glitch aesthetic fashion"]
    elif "space" in title_l or "cosmic" in title_l or "galaxy" in title_l:
        specific_tags = ["cosmic fashion", "space art clothing"]
    elif "animal" in title_l or "leopard" in title_l or "tiger" in title_l:
        specific_tags = ["animal print AOP", "wild creature fashion"]
    else:
        specific_tags = ["bold AOP outfit", "unique print clothing"]

    # Add product-type specific tag
    if "kids" in title_l or "children" in ptype_l:
        specific_tags.append("kids AOP fashion")
    elif "home" in ptype_l or any(w in ptype_l for w in ["duvet", "curtain", "blanket"]):
        specific_tags = ["dopamine home decor", "maximalist home accessories"]

    all_tags = trending_selected + evergreen_selected[:8] + specific_tags

    # Deduplicate and get 12
    seen = set()
    unique = []
    for t in all_tags:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
        if len(unique) >= 12:
            break

    # Pad to 12 if needed
    while len(unique) < 12:
        extra = EVERGREEN[len(unique) % len(EVERGREEN)]
        if extra.lower() not in seen:
            unique.append(extra)
            seen.add(extra.lower())
        else:
            break

    return unique[:12]

def make_visual_description(title, ptype, existing_tags):
    title_l = title.lower()
    ptype_l = ptype.lower()

    # Extract key design terms from title
    design_terms = []

    # Color/pattern descriptors
    colors = []
    for color in ["rainbow", "neon", "electric blue", "hot pink", "acid yellow", "crimson",
                  "pastel", "multicolor", "black", "white", "red", "blue", "green", "purple",
                  "gold", "silver", "chrome", "iridescent"]:
        if color in title_l:
            colors.append(color)

    # Pattern type
    pattern_type = "all-over print"
    if "graffiti" in title_l:
        pattern_type = "graffiti-style street art print"
    elif "tie-dye" in title_l or "tie dye" in title_l:
        pattern_type = "hand-dyed spiral tie-dye pattern"
    elif "psychedelic" in title_l:
        pattern_type = "psychedelic full-coverage print"
    elif "abstract" in title_l:
        pattern_type = "abstract art AOP print"
    elif "floral" in title_l or "botanical" in title_l:
        pattern_type = "dense botanical/floral AOP illustration"
    elif "geometric" in title_l or "vector" in title_l:
        pattern_type = "geometric vector art print"
    elif "collage" in title_l or "sticker bomb" in title_l:
        pattern_type = "collage-style sticker bomb print"
    elif "spiral" in title_l or "swirl" in title_l:
        pattern_type = "concentric swirl/spiral full-bleed print"
    elif "marble" in title_l or "liquid" in title_l:
        pattern_type = "liquid marble fluid art print"
    elif "space" in title_l or "galaxy" in title_l:
        pattern_type = "space/galaxy cosmic art print"
    elif "animal" in title_l or "leopard" in title_l:
        pattern_type = "animal motif all-over print"

    color_str = ", ".join(colors) if colors else "vivid multicolor"

    return f"{pattern_type.capitalize()} in {color_str} tones; full edge-to-edge sublimation coverage on {ptype}"

def analyze_product(line_num, product, idx):
    pid = product['id'].replace('gid://shopify/Product/', '')
    title = product['title']
    ptype = product.get('type', 'Apparel')
    price = product.get('price', '0.00')
    img = product.get('img', 'no-image')
    existing_tags = product.get('tags', [])

    title_l = title.lower()
    ptype_l = ptype.lower()

    visual_desc = make_visual_description(title, ptype, existing_tags)
    tags = get_tags(title, ptype, idx)
    marketing = get_copy_template(title_l, ptype_l, idx)
    gender = get_gender(title, ptype)
    collections = get_collections(title, ptype, existing_tags)
    utility = get_utility_collections(title, ptype)

    row = [
        pid, title, ptype, price, img, visual_desc,
        tags[0] if len(tags) > 0 else "",
        tags[1] if len(tags) > 1 else "",
        tags[2] if len(tags) > 2 else "",
        tags[3] if len(tags) > 3 else "",
        tags[4] if len(tags) > 4 else "",
        tags[5] if len(tags) > 5 else "",
        tags[6] if len(tags) > 6 else "",
        tags[7] if len(tags) > 7 else "",
        tags[8] if len(tags) > 8 else "",
        tags[9] if len(tags) > 9 else "",
        tags[10] if len(tags) > 10 else "",
        tags[11] if len(tags) > 11 else "",
        marketing, gender, "|".join(collections), utility
    ]
    return row

if __name__ == "__main__":
    # Process specified line ranges and append to CSV
    ranges = []
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            start, end = arg.split('-')
            ranges.append((int(start), int(end)))
    else:
        ranges = [(21, 178), (219, 394), (435, 472)]

    output_file = '/home/user/Mlswchr75/shopify_analysis_spreadsheet.csv'

    products = []
    with open('/home/user/Mlswchr75/products_master.jsonl') as f:
        for i, line in enumerate(f, 1):
            for start, end in ranges:
                if start <= i <= end:
                    products.append((i, json.loads(line)))
                    break

    print(f"Processing {len(products)} products...")

    with open(output_file, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for idx, (line_num, product) in enumerate(products):
            row = analyze_product(line_num, product, idx)
            writer.writerow(row)

    print(f"Done. Appended {len(products)} rows to {output_file}")
