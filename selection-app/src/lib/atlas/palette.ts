/**
 * Globe colour schemes. Kept free of three.js so pages can pick a palette
 * without pulling the WebGL engine into their bundle (the engine itself is
 * imported lazily by AtlasGlobe.tsx).
 */

/** Colours for one class of pin: label ink, dot fill, stem line and dot glow. */
export interface PinInk {
  label: string;
  dot: string;
  stem: string;
  /** box-shadow on the dot (blurs start at the edge of its transparent hit-area border) */
  glow: string;
  /**
   * Optional 1px ring drawn tight against the dot's edge, for a light dot on
   * a light sea. Drawn as an outline pulled inside the hit-area border, since
   * a box-shadow spread would sit 8px out from the dot.
   */
  ring?: string;
}

/**
 * Everything the engine colours: the texture canvases (base and zoom patch),
 * the atmosphere halo and the pin/label DOM. Geometry, camera and behaviour
 * are palette-independent.
 */
export interface GlobePalette {
  ocean: string;
  land: string;
  coast: string;
  graticule: string;
  /** Radial halo behind the sphere: inner stop, 55% stop, outer stop. */
  halo: [string, string, string];
  /** Shadow under the label text (sub-pin labels never carry one). */
  labelShadow: string;
  pin: {
    selected: PinInk;
    /** Featured (shortlist) destinations at rest. */
    emphasised: PinInk;
    /** Featured places within a selected country. */
    sub: PinInk;
    other: PinInk;
  };
}

const MINT = "#A7E6D7";

/** The Tier 1 Atlas globe: near-black sea, lighter land, white and mint pins. */
export const DARK_PALETTE: GlobePalette = {
  ocean: "#10171A",
  land: "#2A3438",
  coast: "rgba(255,255,255,0.18)",
  graticule: "rgba(167,230,215,0.07)",
  halo: ["rgba(167,230,215,0.22)", "rgba(167,230,215,0.06)", "rgba(167,230,215,0)"],
  labelShadow: "0 1px 6px rgba(6,8,9,0.8)",
  pin: {
    selected: { label: MINT, dot: MINT, stem: "rgba(167,230,215,0.8)", glow: "0 0 8px rgba(167,230,215,0.9)" },
    emphasised: { label: "rgba(255,255,255,0.95)", dot: "rgba(167,230,215,0.95)", stem: "rgba(255,255,255,0.6)", glow: "0 0 6px rgba(167,230,215,0.55)" },
    sub: { label: "rgba(255,255,255,0.72)", dot: "rgba(167,230,215,0.8)", stem: "rgba(255,255,255,0.35)", glow: "0 0 4px rgba(167,230,215,0.4)" },
    other: { label: "rgba(255,255,255,0.55)", dot: "rgba(255,255,255,0.45)", stem: "rgba(255,255,255,0.3)", glow: "0 0 3px rgba(255,255,255,0.25)" },
  },
};

/**
 * The Tier 2 Personalised globe: light sea, darker muted land. Mint is not
 * legible on the light sea, so labels and stems use the design system's ink
 * (#1D1D1D) and graphite (#555759); dots stay mint with a 1px dark ring.
 */
export const LIGHT_PALETTE: GlobePalette = {
  ocean: "#BCE0E4",
  land: "#8FA6A4",
  coast: "rgba(255,255,255,0.5)",
  graticule: "rgba(29,29,29,0.08)",
  halo: ["rgba(167,230,215,0.3)", "rgba(167,230,215,0.06)", "rgba(167,230,215,0)"],
  labelShadow: "0 1px 6px rgba(255,255,255,0.7)",
  pin: {
    selected: { label: "#1D1D1D", dot: MINT, stem: "rgba(29,29,29,0.8)", glow: "0 0 10px rgba(167,230,215,1)", ring: "rgba(29,29,29,0.55)" },
    emphasised: {
      label: "rgba(29,29,29,0.95)",
      dot: "rgba(167,230,215,0.95)",
      stem: "rgba(29,29,29,0.55)",
      glow: "0 0 6px rgba(167,230,215,0.7)",
      ring: "rgba(29,29,29,0.45)",
    },
    sub: { label: "rgba(29,29,29,0.75)", dot: "rgba(167,230,215,0.85)", stem: "rgba(29,29,29,0.4)", glow: "0 0 4px rgba(167,230,215,0.6)", ring: "rgba(29,29,29,0.4)" },
    other: { label: "rgba(85,87,89,0.85)", dot: "rgba(167,230,215,0.7)", stem: "rgba(85,87,89,0.4)", glow: "0 0 4px rgba(167,230,215,0.5)", ring: "rgba(29,29,29,0.35)" },
  },
};
