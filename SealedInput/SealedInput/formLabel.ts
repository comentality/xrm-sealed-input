import { Box, FormLabel, Placement, SpanColumns, labelPlacement } from "./sealedInput";

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

interface Sibling {
  cell: Box;
  label: Box;
  area: Box;
  /** Where the label sits relative to the control area. */
  position: Placement;
}

/** A sibling cell's label and control area, when both are on show. */
function sibling(container: Element): Sibling | null {
  const label = cellLabel(container, null);
  if (!label || !visible(label)) return null;
  // The label's wrapper is followed by the control area.
  const area = label.parentElement?.nextElementSibling;
  if (!area || !visible(area)) return null;
  const l = box(label);
  const a = box(area);
  return { cell: box(container), label: l, area: a, position: labelPlacement(l, a) };
}

/**
 * The section's columns that this cell spans, read from the neighbouring
 * cells: one that starts where this cell starts but ends before it (the
 * first column), and one that starts inside this cell (the next column).
 * Edges are measured from the control's own left edge. Null when the cell
 * takes one column, or the neighbours cannot be told.
 */
function spanColumns(root: HTMLElement, own: Box, siblings: Sibling[]): SpanColumns | null {
  const left = root.getBoundingClientRect().left;
  const first = siblings.find((s) => Math.abs(s.cell.left - own.left) <= 1 && s.cell.right < own.right - 1);
  const later = siblings.filter((s) => s.cell.left > own.left + 1 && s.cell.left < own.right - 1 && s.cell.right <= own.right + 1);
  const second = later.sort((a, b) => a.cell.left - b.cell.left)[0];
  if (!first || !second) return null;
  return {
    firstEnd: Math.round(first.area.right - left),
    secondLabel: Math.round(second.label.left - left),
    secondArea: Math.round(second.area.left - left),
  };
}

/** What the form shows for this control's cell, or null outside a recognised form cell. */
export function readFormLabel(root: HTMLElement): FormLabel | null {
  const container = root.closest(CONTAINER);
  if (!container) return null;
  const own = box(container);
  const section = container.closest("section") ?? container.parentElement;
  const siblings = section
    ? Array.from(section.querySelectorAll(CONTAINER))
        .filter((c) => c !== container)
        .map(sibling)
        .filter((s): s is Sibling => s !== null)
    : [];
  const span = spanColumns(root, own, siblings);
  const label = cellLabel(container, root);
  if (label && visible(label)) return { shown: true, position: labelPlacement(box(label), box(root)), labelWidth: null, span };
  // Label hidden for this cell: borrow the position and the label column from
  // another cell in the section. The column is measured from where this
  // control starts, which is the cell's left edge or thereabouts.
  const p = siblings[0];
  if (!p) return { shown: false, position: null, labelWidth: null, span };
  const ownOffset = box(root).left - own.left;
  const areaOffset = p.area.left - p.cell.left;
  const labelWidth = p.position === "inline" ? Math.max(0, Math.round(areaOffset - ownOffset)) : null;
  return { shown: false, position: p.position, labelWidth, span };
}
