/**
 * Preservation knowledge base for the "ways to keep it" feature.
 *
 * Design contract (safety-critical):
 *   - This file NEVER stores or returns processing times, temperatures, or pressures.
 *   - The UI teaches the method + the hazard, then links out to a tested process.
 *   - Crop-level safety flags below are the source of truth for warnings, so they are
 *     deterministic data rather than model-generated text.
 *
 * Source of safety facts: National Center for Home Food Preservation (nchfp.uga.edu),
 * USDA Complete Guide to Home Canning, CDC, and USDA FSIS. The `testedProcessUrl`s point
 * to those. NOTE: extension sites occasionally restructure URLs — verify each link against
 * the live site before launch (a simple CI link-check is recommended).
 *
 * Intended location: app/lib/preservation/preservation-data.ts
 */

export type Mechanism =
  | "remove-water"
  | "acidify"
  | "keep-cold"
  | "heat-seal"
  | "bind-water";

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  "remove-water": "Remove the water",
  acidify: "Make it acidic",
  "keep-cold": "Keep it cold",
  "heat-seal": "Heat it & seal it",
  "bind-water": "Bind the water",
};

export type Difficulty = "easy" | "moderate" | "involved";

/** note = good-to-know · caution = do-this-or-quality/safety-suffers · critical = can-be-lethal */
export type SafetySeverity = "note" | "caution" | "critical";

export interface SafetyNote {
  severity: SafetySeverity;
  text: string;
}

/** 1 = a few days · 5 = a year or more. Drives the "keeps" gauge. */
export type KeepingTier = 1 | 2 | 3 | 4 | 5;

export interface PreservationMethod {
  id: string;
  name: string;
  mechanism: Mechanism;
  /** One plain sentence: what the method does to stop spoilage. No steps. */
  shortDescription: string;
  /** The "around the world" line — set in serif italic in the UI. */
  aroundTheWorld: string;
  keepsLabel: string;
  keepsTier: KeepingTier;
  difficulty: Difficulty;
  safety: SafetyNote;
  testedProcessUrl: string;
  sourceLabel: string;
}

/** A method as it applies to a specific crop (method + optional crop overrides). */
export interface CropMethod {
  methodId: string;
  recommended?: boolean;
  /** Crop-specific aside, e.g. "no blanching needed" or "dilly beans". */
  cropNote?: string;
  keepsLabelOverride?: string;
  keepsTierOverride?: KeepingTier;
  safetyOverride?: SafetyNote;
}

export type Acidity = "high" | "borderline" | "low";

export interface Crop {
  slug: string;
  name: string;
  /** Latin name — used as a small serif-italic flourish, field-guide style. */
  botanicalName: string;
  season: string;
  acidity: Acidity;
  /** No USDA/NCHFP-tested home-canning process exists (e.g. summer squash). */
  canningNotRecommended?: boolean;
  methods: CropMethod[];
}

// ---------------------------------------------------------------------------
// METHODS
// ---------------------------------------------------------------------------

export const METHODS: Record<string, PreservationMethod> = {
  "cold-storage": {
    id: "cold-storage",
    name: "Cool, dark storage",
    mechanism: "keep-cold",
    shortDescription:
      "Hold the produce at cellar or fridge temperature to slow spoilage down.",
    aroundTheWorld:
      "Root cellars, clamps, buried onggi pots in Korea, cool granary rooms.",
    keepsLabel: "days to a few months",
    keepsTier: 2,
    difficulty: "easy",
    safety: {
      severity: "note",
      text: "Cold slows microbes, it doesn't kill them — sort often and use the softest pieces first.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/store/",
    sourceLabel: "NCHFP — Storing",
  },
  freezing: {
    id: "freezing",
    name: "Freezing",
    mechanism: "keep-cold",
    shortDescription:
      "Freeze to halt microbial and enzyme activity until you're ready to use it.",
    aroundTheWorld:
      "A modern staple wherever freezers reach; the everyday keeper.",
    keepsLabel: "8–18 months at 0°F",
    keepsTier: 4,
    difficulty: "easy",
    safety: {
      severity: "caution",
      text: "Blanch most vegetables first to hold color and texture. Freezing doesn't kill bacteria, so thawed produce is perishable again.",
    },
    testedProcessUrl:
      "https://nchfp.uga.edu/how/freeze/freeze-general-information/blanching-vegetables/",
    sourceLabel: "NCHFP — Freezing & blanching",
  },
  drying: {
    id: "drying",
    name: "Drying & dehydrating",
    mechanism: "remove-water",
    shortDescription:
      "Pull out moisture so bacteria, yeast, and mold have nothing to grow in.",
    aroundTheWorld:
      "Sun-dried tomatoes, strung chiles, Nordic stockfish, dried fruit and herbs.",
    keepsLabel: "6–12 months airtight",
    keepsTier: 4,
    difficulty: "moderate",
    safety: {
      severity: "caution",
      text: "Dry until water activity is at or below 0.85. Don't sun-dry low-acid vegetables — use a dehydrator.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/dry/",
    sourceLabel: "NCHFP — Drying",
  },
  fermentation: {
    id: "fermentation",
    name: "Lacto-fermentation",
    mechanism: "acidify",
    shortDescription:
      "Let the vegetable's own bacteria turn its sugars into acid that keeps it.",
    aroundTheWorld:
      "Kimchi in Korea, sauerkraut in Germany, tsukemono in Japan, kraut everywhere.",
    keepsLabel: "months, refrigerated",
    keepsTier: 3,
    difficulty: "moderate",
    safety: {
      severity: "note",
      text: "Use about 2% salt and keep everything submerged under the brine. A finished ferment reaches pH 4.6 or below.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/ferment/",
    sourceLabel: "NCHFP — Fermenting",
  },
  "vinegar-pickling": {
    id: "vinegar-pickling",
    name: "Vinegar pickling",
    mechanism: "acidify",
    shortDescription:
      "Steep in vinegar to bring the food below the safe acidity line.",
    aroundTheWorld:
      "Achar in South Asia, torshi in the Levant, dill pickles and cornichons.",
    keepsLabel: "up to a year, processed",
    keepsTier: 4,
    difficulty: "moderate",
    safety: {
      severity: "caution",
      text: "Use vinegar of at least 5% acidity and a tested ratio — don't cut the vinegar for taste.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/pickle/",
    sourceLabel: "NCHFP — Pickling",
  },
  "water-bath-canning": {
    id: "water-bath-canning",
    name: "Boiling-water / steam canning",
    mechanism: "heat-seal",
    shortDescription:
      "Heat-process sealed jars in boiling water — for high-acid foods only.",
    aroundTheWorld: "Jams, bottled summer fruit, acidified tomatoes.",
    keepsLabel: "a year or more, sealed",
    keepsTier: 5,
    difficulty: "involved",
    safety: {
      severity: "caution",
      text: "Only safe for high-acid foods (pH 4.6 or below). Acidify borderline foods like tomatoes with bottled lemon juice or citric acid.",
    },
    testedProcessUrl:
      "https://nchfp.uga.edu/how/can/general-information/ensuring-safe-canned-foods/",
    sourceLabel: "NCHFP — Ensuring safe canned foods",
  },
  "pressure-canning": {
    id: "pressure-canning",
    name: "Pressure canning",
    mechanism: "heat-seal",
    shortDescription:
      "Pressure-process to reach 240°F, the only home method that destroys botulism spores.",
    aroundTheWorld:
      "The safe route for canned vegetables, beans, and meats since the 20th century.",
    keepsLabel: "a year or more, sealed",
    keepsTier: 5,
    difficulty: "involved",
    safety: {
      severity: "critical",
      text: "Required for all low-acid foods. Boiling water cannot destroy botulism spores — never water-bath low-acid vegetables, and don't use an electric multi-cooker for canning.",
    },
    testedProcessUrl:
      "https://www.cdc.gov/botulism/prevention/home-canned-foods.html",
    sourceLabel: "CDC — Home-canned foods",
  },
  "sugar-preserves": {
    id: "sugar-preserves",
    name: "Sugar preserves",
    mechanism: "bind-water",
    shortDescription:
      "Cook with sugar to tie up moisture; most preserves are also high-acid.",
    aroundTheWorld:
      "Marmalade, fruit butters, candied citrus, honey-packed fruit.",
    keepsLabel: "a year or more, sealed",
    keepsTier: 5,
    difficulty: "moderate",
    safety: {
      severity: "note",
      text: "Sugar is structural for shelf storage — don't reduce it below a tested recipe.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/can/",
    sourceLabel: "NCHFP — Sweet spreads",
  },
  "salt-and-oil": {
    id: "salt-and-oil",
    name: "Salt-curing & oil-packing",
    mechanism: "bind-water",
    shortDescription:
      "Heavy salt draws water out by osmosis; oil-packing seals out air.",
    aroundTheWorld:
      "Preserved lemons, salt-packed capers, vegetable confit.",
    keepsLabel: "salt: months · oil: days",
    keepsTier: 2,
    difficulty: "moderate",
    safety: {
      severity: "critical",
      text: "Garlic or vegetables in oil can grow botulism — refrigerate and use within a few days. Never store oil-packed produce at room temperature.",
    },
    testedProcessUrl: "https://nchfp.uga.edu/how/cure-smoke/",
    sourceLabel: "NCHFP — Curing & smoking",
  },
};

// ---------------------------------------------------------------------------
// CROPS  (a starter set of common summer-stand produce)
// ---------------------------------------------------------------------------

export const CROPS: Record<string, Crop> = {
  tomatoes: {
    slug: "tomatoes",
    name: "Tomatoes",
    botanicalName: "Solanum lycopersicum",
    season: "Mid–late summer",
    acidity: "borderline",
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "No blanching needed — freeze whole and the skins slip off later." },
      { methodId: "drying", recommended: true, cropNote: "Halve and dehydrate for sun-dried-style tomatoes." },
      { methodId: "water-bath-canning", recommended: true, cropNote: "Must be acidified first — bottled lemon juice or citric acid." },
      { methodId: "fermentation", cropNote: "Lacto-fermented salsa and green tomatoes." },
      { methodId: "cold-storage", keepsLabelOverride: "about a week, ripe" },
    ],
  },
  cucumbers: {
    slug: "cucumbers",
    name: "Cucumbers",
    botanicalName: "Cucumis sativus",
    season: "Early–mid summer",
    acidity: "low",
    canningNotRecommended: true,
    methods: [
      { methodId: "fermentation", recommended: true, cropNote: "The classic sour/half-sour brined pickle." },
      { methodId: "vinegar-pickling", recommended: true, cropNote: "Dill and bread-and-butter pickles." },
      { methodId: "cold-storage", keepsLabelOverride: "about a week, refrigerated" },
    ],
  },
  peppers: {
    slug: "peppers",
    name: "Peppers & chiles",
    botanicalName: "Capsicum annuum",
    season: "Late summer",
    acidity: "low",
    methods: [
      { methodId: "drying", recommended: true, cropNote: "Chiles dry beautifully to a very low water activity." },
      { methodId: "freezing", recommended: true, cropNote: "No blanching needed — slice and freeze." },
      { methodId: "fermentation", cropNote: "The base for fermented hot sauce." },
      { methodId: "vinegar-pickling", cropNote: "Pickled jalapeños and banana peppers." },
      { methodId: "pressure-canning", cropNote: "Plain (un-pickled) peppers are low-acid — pressure only." },
    ],
  },
  "summer-squash": {
    slug: "summer-squash",
    name: "Summer squash & zucchini",
    botanicalName: "Cucurbita pepo",
    season: "All summer",
    acidity: "low",
    canningNotRecommended: true,
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "Shred for baking, or blanch slices." },
      { methodId: "drying", recommended: true, cropNote: "Thin slices make squash chips." },
      { methodId: "vinegar-pickling", recommended: true, cropNote: "Bread-and-butter zucchini." },
      { methodId: "fermentation", cropNote: "Lacto-fermented squash spears." },
    ],
  },
  "green-beans": {
    slug: "green-beans",
    name: "Green & snap beans",
    botanicalName: "Phaseolus vulgaris",
    season: "Mid summer",
    acidity: "low",
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "Blanch, then freeze — the everyday keeper." },
      { methodId: "vinegar-pickling", recommended: true, cropNote: "Dilly beans — acidified, so water-bath safe." },
      { methodId: "drying", cropNote: "\u201CLeather britches\u201D — a traditional dried snap bean." },
      { methodId: "pressure-canning", cropNote: "The only safe way to can plain beans." },
    ],
  },
  marionberries: {
    slug: "marionberries",
    name: "Marionberries & blackberries",
    botanicalName: "Rubus L.",
    season: "High summer",
    acidity: "high",
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "Freeze on a tray first so they don't clump." },
      { methodId: "sugar-preserves", recommended: true, cropNote: "Jam, seedless preserves, and syrup." },
      { methodId: "water-bath-canning", recommended: true, cropNote: "High-acid — boiling-water canning is fine." },
      { methodId: "drying", cropNote: "Purée into fruit leather." },
      { methodId: "cold-storage", keepsLabelOverride: "2–3 days, refrigerated", keepsTierOverride: 1 },
    ],
  },
  peaches: {
    slug: "peaches",
    name: "Peaches & plums",
    botanicalName: "Prunus persica",
    season: "Late summer",
    acidity: "high",
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "Slice and toss with a little lemon to hold color." },
      { methodId: "water-bath-canning", recommended: true, cropNote: "High-acid — classic canned summer fruit." },
      { methodId: "drying", recommended: true, cropNote: "Dried peach and plum halves." },
      { methodId: "sugar-preserves", cropNote: "Jam, butter, and chutney." },
    ],
  },
  "leafy-greens": {
    slug: "leafy-greens",
    name: "Kale, chard & cooking greens",
    botanicalName: "Brassica oleracea",
    season: "Spring–fall",
    acidity: "low",
    methods: [
      { methodId: "freezing", recommended: true, cropNote: "Blanch briefly, then freeze in portions." },
      { methodId: "drying", recommended: true, cropNote: "Kale chips, or dry and crush into a green powder." },
      { methodId: "cold-storage", recommended: true, keepsLabelOverride: "5–7 days, refrigerated", keepsTierOverride: 1 },
      { methodId: "pressure-canning", cropNote: "Greens are low-acid — pressure only." },
    ],
  },
};

// ---------------------------------------------------------------------------
// RESOLVER
// ---------------------------------------------------------------------------

export interface ResolvedMethod extends PreservationMethod {
  recommended: boolean;
  cropNote?: string;
}

export interface CropPreservation {
  crop: Crop;
  /** Recommended methods first, then the rest. */
  methods: ResolvedMethod[];
  /** Crop-level banner derived from acidity + canning flags. null = no banner. */
  headline: SafetyNote | null;
}

function headlineFor(crop: Crop): SafetyNote | null {
  if (crop.acidity === "low" && crop.canningNotRecommended) {
    return {
      severity: "caution",
      text: "No tested home-canning process exists for this — freeze, pickle, or dry it instead.",
    };
  }
  if (crop.acidity === "low") {
    return {
      severity: "critical",
      text: "Low-acid food — if you can it, pressure canning only. Boiling-water canning cannot make these safe.",
    };
  }
  if (crop.acidity === "borderline") {
    return {
      severity: "caution",
      text: "Borderline acidity — acidify with bottled lemon juice or citric acid before water-bath canning.",
    };
  }
  return {
    severity: "note",
    text: "High-acid food — boiling-water canning, freezing, and drying are all straightforward.",
  };
}

/** Resolve a crop slug into its full preservation card data. */
export function getPreservationForCrop(slug: string): CropPreservation | null {
  const crop = CROPS[slug];
  if (!crop) return null;

  const methods: ResolvedMethod[] = crop.methods.map((cm) => {
    const base = METHODS[cm.methodId];
    if (!base) {
      throw new Error(`Unknown preservation method "${cm.methodId}" on crop "${slug}"`);
    }
    return {
      ...base,
      recommended: cm.recommended ?? false,
      cropNote: cm.cropNote,
      keepsLabel: cm.keepsLabelOverride ?? base.keepsLabel,
      keepsTier: cm.keepsTierOverride ?? base.keepsTier,
      safety: cm.safetyOverride ?? base.safety,
    };
  });

  // Recommended first; otherwise keep author order.
  methods.sort((a, b) => Number(b.recommended) - Number(a.recommended));

  return { crop, methods, headline: headlineFor(crop) };
}

/** Authoritative sources to surface in the UI footer. */
export const PRESERVATION_SOURCES = [
  { label: "National Center for Home Food Preservation", url: "https://nchfp.uga.edu/" },
  { label: "USDA Complete Guide to Home Canning", url: "https://nchfp.uga.edu/publications/publications_usda/" },
  { label: "CDC — Botulism & home-canned foods", url: "https://www.cdc.gov/botulism/prevention/home-canned-foods.html" },
  { label: "USDA FSIS — Clostridium botulinum", url: "https://www.fsis.usda.gov/food-safety/foodborne-illness-and-disease/illnesses-and-pathogens/botulism" },
  { label: "WSU Extension — Food preservation (Washington)", url: "https://extension.wsu.edu/foodsafety/home-food-preservation/" },
] as const;
