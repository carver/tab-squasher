// Where the chip goes. position: fixed is relative to the layout viewport,
// which on a phone can be larger than the part of the page on screen (a
// wide page, pinch zoom, the sliding toolbar), so the chip follows the
// visual viewport instead.

/** The fields of VisualViewport placement needs, all in CSS px of the layout viewport. */
export interface View {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
}

/** Margins from the bottom-right of the screen, in unzoomed px. Bottom clears Firefox's toolbar. */
const MARGIN_RIGHT = 16;
const MARGIN_BOTTOM = 80;

/** The chip's bottom-right corner in layout viewport px, and the scale that undoes zoom. */
export function placeChip(view: View): { right: number; bottom: number; size: number } {
  const size = 1 / view.scale;
  return {
    right: view.offsetLeft + view.width - MARGIN_RIGHT * size,
    bottom: view.offsetTop + view.height - MARGIN_BOTTOM * size,
    size,
  };
}
