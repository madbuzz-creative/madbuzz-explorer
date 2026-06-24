import "@phosphor-icons/web/regular";

const WEIGHT_SUFFIX = {
  bold: "-bold",
  duotone: "-duotone",
  fill: "-fill",
  light: "-light",
  thin: "-thin",
  regular: "",
};

/** CSS classes for a Phosphor font icon, e.g. `ph ph-arrow-clockwise`. */
export function phClass(name, weight = "regular") {
  const suffix = WEIGHT_SUFFIX[weight] ?? "";
  const iconName = suffix ? `${name}${suffix}` : name;
  return `ph ph-${iconName}`;
}

/** Inline `<i>` element using the Phosphor web font. */
export function phIconElement(name, { weight = "regular", sizeClass = "ph-icon--sm", className = "" } = {}) {
  const el = document.createElement("i");
  el.className = [phClass(name, weight), "ph-icon", sizeClass, className].filter(Boolean).join(" ");
  el.setAttribute("aria-hidden", "true");
  return el;
}

/**
 * Build an inline SVG element from raw markup.
 * Import icons explicitly for tree-shaking, e.g.:
 * `import icon from "@phosphor-icons/core/assets/regular/arrow-clockwise.svg?raw"`
 */
export function phSvgFromMarkup(markup, { sizeClass = "ph-icon--sm", className = "" } = {}) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const svg = template.content.firstElementChild;
  svg.setAttribute("class", ["ph-icon", sizeClass, className].filter(Boolean).join(" "));
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

/** Load a single SVG icon from `@phosphor-icons/core` (tree-shaken). */
export async function phSvgElement(name, { weight = "regular", sizeClass = "ph-icon--sm", className = "" } = {}) {
  const suffix = WEIGHT_SUFFIX[weight] ?? "";
  const fileName = suffix ? `${name}${suffix}` : name;
  const { default: markup } = await import(
    `@phosphor-icons/core/assets/${weight}/${fileName}.svg?raw`
  );
  return phSvgFromMarkup(markup, { sizeClass, className });
}
