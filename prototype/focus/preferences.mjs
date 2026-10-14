export const DESIGNS = [
  {id: "liquid", name: "Liquid", description: "Soft mineral surfaces, sculpted controls, quiet cyan."},
  {id: "glass", name: "Glass", description: "Luminous violet, transparent islands, a lighter touch."},
  {id: "paper", name: "Paper", description: "Warm editorial type, flat surfaces, fine ink lines."},
  {id: "studio", name: "Studio", description: "Compact mono type, precise outlines, a mint accent."},
];

export const MENU_STYLES = [
  {id: "soft", name: "Soft", description: "The current sculpted disc, for comparison."},
  {id: "pie", name: "Slices", description: "Solid pie wedges. The shape makes each target explicit."},
  {id: "halo", name: "Halo", description: "An airy icon ring. Labels appear as you explore; tab names stay visible."},
  {id: "petals", name: "Petals", description: "Floating individual buttons, with space between their surfaces."},
  {id: "type", name: "Type", description: "Words first. Minimal icons, no heavy disc, quiet selection marks."},
];

export function prototypePreferences(saved = {}) {
  const value = saved && typeof saved === "object" ? saved : {};
  return {
    design: DESIGNS.some(design => design.id === value.design) ? value.design : "liquid",
    menuStyle: MENU_STYLES.some(style => style.id === value.menuStyle) ? value.menuStyle : "pie",
    theme: ["dark", "light", "system"].includes(value.theme) ? value.theme : "dark",
    dwell: [70, 140, 250].includes(value.dwell) ? value.dwell : 140,
    gestures: typeof value.gestures === "boolean" ? value.gestures : true,
  };
}

export function needsGestureLayer({designMode, hasFrame, frameAccessible}) {
  return designMode && hasFrame && !frameAccessible;
}
