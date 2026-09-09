import { Box, FormLabel, labelPlacement } from "./sealedInput";

// Reads the form's own cell label from the DOM around the control. Unified
// Interface puts each field in a container whose data-id ends in
// "FieldSectionItemContainer", with the cell label as a <label> whose id ends
// in "-field-label" next to the control area. None of this is a documented
// API; when it is not there, the answer is null and the caller falls back.

const CONTAINER = '[data-id$="FieldSectionItemContainer"]';

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden";
}

/** The cell label inside a field container, ignoring anything inside `except`. */
function cellLabel(container: Element, except: Element | null): HTMLLabelElement | null {
  const labels = Array.from(container.querySelectorAll("label")).filter((l) => !except?.contains(l));
  return labels.find((l) => l.id.endsWith("-field-label")) ?? labels[0] ?? null;
}

/** Where a sibling cell's label sits relative to that cell's control area. */
function siblingPlacement(container: Element): FormLabel["position"] {
  const label = cellLabel(container, null);
  if (!label || !visible(label)) return null;
  // The label's wrapper is followed by the control area.
  const area = label.parentElement?.nextElementSibling;
  if (!area || !visible(area)) return null;
  return labelPlacement(box(label), box(area));
}

/** What the form shows for this control's cell, or null outside a recognised form cell. */
export function readFormLabel(root: HTMLElement): FormLabel | null {
  const container = root.closest(CONTAINER);
  if (!container) return null;
  const label = cellLabel(container, root);
  if (label && visible(label)) return { shown: true, position: labelPlacement(box(label), box(root)) };
  // Label hidden for this cell: borrow the position from another cell in the section.
  const section = container.closest("section") ?? container.parentElement;
  const siblings = section ? Array.from(section.querySelectorAll(CONTAINER)).filter((c) => c !== container) : [];
  for (const s of siblings) {
    const p = siblingPlacement(s);
    if (p) return { shown: false, position: p };
  }
  return { shown: false, position: null };
}
