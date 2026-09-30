const wrap = value => ((value + 180) % 360 + 360) % 360 - 180;
const span = bounds => bounds[3] - bounds[1] === 360 ? 360 : (bounds[3] - bounds[1] + 360) % 360;

export function containsBounds(outer, inner) {
  if (!outer || inner[0] < outer[0] || inner[2] > outer[2]) return false;
  const width = span(outer);
  return width === 360 || ((inner[1] - outer[1] + 360) % 360) + span(inner) <= width + 1e-8;
}

export function bufferedBounds(bounds) {
  const height = bounds[2] - bounds[0], width = span(bounds);
  return [Math.max(-90, bounds[0] - height * .25), width * 1.5 >= 360 ? -180 : wrap(bounds[1] - width * .25),
    Math.min(90, bounds[2] + height * .25), width * 1.5 >= 360 ? 180 : wrap(bounds[3] + width * .25)];
}

// Keep the previous successful result through loading/failure, but accept an
// authoritative empty result (including deletions). Never cross account scopes.
export function retainMapResult(previous, page, scope) {
  if (!page.loading && !page.error) return {scope, items:page.items};
  if (page.items.length) return {scope, items:page.items};
  return previous?.scope === scope ? previous : {scope, items:[]};
}

export function reconcileMarkers(index, pins, {create, update, remove}) {
  const ids = new Set(pins.map(pin => pin.id));
  for (const [id, marker] of index) if (!ids.has(id)) { remove(marker); index.delete(id); }
  for (const pin of pins) {
    let marker = index.get(pin.id);
    if (!marker) { marker = create(pin); index.set(pin.id, marker); }
    update(marker, pin);
  }
}
