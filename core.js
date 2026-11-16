(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RackCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const VALID_FACES = ['front', 'rear', 'both'];

  function uid() {
    return 'eq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function asInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeItem(raw) {
    return {
      id: String(raw.id || uid()),
      name: String(raw.name || 'Unnamed equipment').slice(0, 60),
      size: Math.max(1, Math.min(20, asInt(raw.size, 1))),
      start: Math.max(1, asInt(raw.start, 1)),
      face: VALID_FACES.includes(raw.face) ? raw.face : 'front',
      category: String(raw.category || 'Other').slice(0, 30),
      color: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#475569',
      asset: String(raw.asset || '').slice(0, 40),
      notes: String(raw.notes || '').slice(0, 300),
      locked: Boolean(raw.locked)
    };
  }

  function defaultState() {
    return {
      version: VERSION,
      projectName: 'Network Rack A',
      rackUnits: 42,
      rackWidth: 19,
      rackId: 'RACK-A01',
      location: '',
      numberFromTop: false,
      activeFace: 'front',
      equipment: []
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    const state = Object.assign({}, base, raw || {});
    state.version = VERSION;
    state.projectName = String(state.projectName || base.projectName).slice(0, 80);
    state.rackUnits = Math.max(6, Math.min(52, asInt(state.rackUnits, 42)));
    state.rackWidth = asInt(state.rackWidth, 19) === 23 ? 23 : 19;
    state.rackId = String(state.rackId || '').slice(0, 30);
    state.location = String(state.location || '').slice(0, 50);
    state.numberFromTop = Boolean(state.numberFromTop);
    state.activeFace = state.activeFace === 'rear' ? 'rear' : 'front';
    state.equipment = Array.isArray(state.equipment) ? state.equipment.map(normalizeItem) : [];
    return state;
  }

  function itemOccupiesFace(item, face) {
    return item.face === face || item.face === 'both';
  }

  function rangesOverlap(aStart, aSize, bStart, bSize) {
    return aStart <= bStart + bSize - 1 && bStart <= aStart + aSize - 1;
  }

  function getCollision(state, candidate, ignoreId) {
    const end = candidate.start + candidate.size - 1;
    if (candidate.start < 1 || end > state.rackUnits) {
      return { type: 'bounds', message: `Equipment must fit between U1 and U${state.rackUnits}.` };
    }
    const hit = state.equipment.find(item => {
      if (item.id === ignoreId) return false;
      const sharesFace = candidate.face === 'both' || item.face === 'both' || candidate.face === item.face;
      return sharesFace && rangesOverlap(candidate.start, candidate.size, item.start, item.size);
    });
    return hit ? { type: 'collision', item: hit, message: `Placement overlaps “${hit.name}” at U${hit.start}–U${hit.start + hit.size - 1}.` } : null;
  }

  function findFirstAvailable(state, size, face) {
    size = Math.max(1, asInt(size, 1));
    for (let start = 1; start <= state.rackUnits - size + 1; start++) {
      const candidate = { start, size, face: face || 'front' };
      if (!getCollision(state, candidate)) return start;
    }
    return null;
  }

  function addItem(state, raw, preferredStart) {
    const item = normalizeItem(raw);
    item.start = preferredStart == null ? findFirstAvailable(state, item.size, item.face) : asInt(preferredStart, 1);
    if (item.start == null) return { ok: false, error: `No contiguous ${item.size}U space is available on the ${item.face} face.` };
    const collision = getCollision(state, item);
    if (collision) return { ok: false, error: collision.message };
    state.equipment.push(item);
    return { ok: true, item };
  }

  function updateItem(state, id, changes) {
    const index = state.equipment.findIndex(item => item.id === id);
    if (index < 0) return { ok: false, error: 'Equipment not found.' };
    const updated = normalizeItem(Object.assign({}, state.equipment[index], changes, { id }));
    const collision = getCollision(state, updated, id);
    if (collision) return { ok: false, error: collision.message };
    state.equipment[index] = updated;
    return { ok: true, item: updated };
  }

  function usedUnits(state, face) {
    const occupied = new Set();
    state.equipment.filter(item => itemOccupiesFace(item, face)).forEach(item => {
      for (let u = item.start; u < item.start + item.size; u++) occupied.add(u);
    });
    return occupied.size;
  }

  function validateState(state) {
    const errors = [];
    const ids = new Set();
    state.equipment.forEach((item, index) => {
      if (ids.has(item.id)) errors.push(`Item ${index + 1} has a duplicate ID.`);
      ids.add(item.id);
      const collision = getCollision(state, item, item.id);
      if (collision) errors.push(`${item.name}: ${collision.message}`);
    });
    for (let i = 0; i < state.equipment.length; i++) {
      for (let j = i + 1; j < state.equipment.length; j++) {
        const a = state.equipment[i], b = state.equipment[j];
        const sharesFace = a.face === 'both' || b.face === 'both' || a.face === b.face;
        if (sharesFace && rangesOverlap(a.start, a.size, b.start, b.size)) errors.push(`${a.name} overlaps ${b.name}.`);
      }
    }
    return errors;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function csvCell(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(state) {
    const headers = ['Name','Start U','End U','Height (U)','Face','Category','Asset Tag','Notes'];
    const rows = state.equipment.slice().sort((a,b) => b.start - a.start).map(item => [item.name,item.start,item.start + item.size - 1,item.size,item.face,item.category,item.asset,item.notes]);
    return [headers].concat(rows).map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  return { VERSION, uid, defaultState, normalizeState, normalizeItem, itemOccupiesFace, rangesOverlap, getCollision, findFirstAvailable, addItem, updateItem, usedUnits, validateState, escapeHtml, toCsv };
});
