const assert = require('node:assert/strict');
const core = require('../core.js');

function test(name, fn) {
  try { fn(); console.log('✓', name); }
  catch (error) { console.error('✗', name); throw error; }
}

test('default state is a normalized empty 42U rack', () => {
  const state = core.defaultState();
  assert.equal(state.rackUnits, 42);
  assert.deepEqual(state.equipment, []);
});

test('adds equipment to first free bottom-up position', () => {
  const state = core.defaultState();
  assert.equal(core.addItem(state, { name:'Switch', size:1, face:'front' }).item.start, 1);
  assert.equal(core.addItem(state, { name:'Server', size:2, face:'front' }).item.start, 2);
  assert.equal(core.usedUnits(state, 'front'), 3);
});

test('front and rear equipment may occupy the same units', () => {
  const state = core.defaultState();
  assert.equal(core.addItem(state, { name:'Front', size:2, face:'front' }, 5).ok, true);
  assert.equal(core.addItem(state, { name:'Rear', size:2, face:'rear' }, 5).ok, true);
  assert.equal(core.validateState(state).length, 0);
});

test('both-face equipment collides with either face', () => {
  const state = core.defaultState();
  core.addItem(state, { name:'PDU', size:2, face:'both' }, 10);
  const result = core.addItem(state, { name:'Switch', size:1, face:'rear' }, 11);
  assert.equal(result.ok, false);
  assert.match(result.error, /overlaps/);
});

test('out-of-bounds placement is rejected', () => {
  const state = core.normalizeState({ rackUnits: 12 });
  const result = core.addItem(state, { name:'Large', size:4, face:'front' }, 10);
  assert.equal(result.ok, false);
  assert.match(result.error, /U1 and U12/);
});

test('equipment update validates collisions and preserves old state on failure', () => {
  const state = core.defaultState();
  const a = core.addItem(state, { name:'A', size:2 }, 1).item;
  core.addItem(state, { name:'B', size:2 }, 3);
  const result = core.updateItem(state, a.id, { start:3 });
  assert.equal(result.ok, false);
  assert.equal(state.equipment.find(x => x.id === a.id).start, 1);
});

test('normalization clamps rack and equipment values', () => {
  const state = core.normalizeState({ rackUnits:99, rackWidth:22, equipment:[{name:'X',size:99,start:-5,color:'bad'}] });
  assert.equal(state.rackUnits, 52);
  assert.equal(state.rackWidth, 19);
  assert.equal(state.equipment[0].size, 20);
  assert.equal(state.equipment[0].start, 1);
  assert.equal(state.equipment[0].color, '#475569');
});

test('CSV escapes commas, quotes, and newlines', () => {
  const state = core.defaultState();
  core.addItem(state, { name:'Switch, "Core"', size:1, notes:'A\nB' }, 1);
  const csv = core.toCsv(state);
  assert.match(csv, /"Switch, ""Core"""/);
  assert.match(csv, /"A\nB"/);
});

console.log('All core tests passed.');
