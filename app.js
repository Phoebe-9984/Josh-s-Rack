(() => {
  'use strict';
  const Core = window.RackCore;
  const STORAGE_KEY = 'rack-elevation-designer-v1';
  const U_HEIGHT = 26;
  const HISTORY_LIMIT = 60;
  const PRESETS = [
    { name:'Patch Panel', size:1, category:'Patch', color:'#7c3aed', face:'front' },
    { name:'Network Switch', size:1, category:'Network', color:'#2563eb', face:'front' },
    { name:'Router / Firewall', size:1, category:'Network', color:'#0891b2', face:'front' },
    { name:'Rack Server', size:2, category:'Compute', color:'#475569', face:'front' },
    { name:'Storage Array', size:3, category:'Storage', color:'#c2410c', face:'front' },
    { name:'UPS', size:3, category:'Power', color:'#15803d', face:'front' },
    { name:'PDU', size:1, category:'Power', color:'#16a34a', face:'rear' },
    { name:'Blanking Panel', size:1, category:'Other', color:'#64748b', face:'front' }
  ];
  const CATEGORY_COLORS = { Network:'#2563eb', Patch:'#7c3aed', Compute:'#475569', Power:'#15803d', Storage:'#c2410c', Other:'#64748b' };

  let state = loadState();
  let selectedId = null;
  let history = [];
  let future = [];
  let drag = null;
  let messageTimer = null;

  const $ = id => document.getElementById(id);
  const els = {
    projectName:$('projectName'), rackUnits:$('rackUnits'), rackWidth:$('rackWidth'), rackId:$('rackId'), location:$('location'),
    numberFromTop:$('numberFromTop'), rackCanvas:$('rackCanvas'), rackStats:$('rackStats'), saveStatus:$('saveStatus'),
    equipmentForm:$('equipmentForm'), emptyInspector:$('emptyInspector'), selectionBadge:$('selectionBadge'), equipmentList:$('equipmentList'),
    equipmentCount:$('equipmentCount'), messageBar:$('messageBar'), exportMenu:$('exportMenu'), importFile:$('importFile')
  };

  init();

  function init() {
    buildPresets();
    buildLegend();
    bindEvents();
    syncSettingsFields();
    render();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const candidate = Core.normalizeState(JSON.parse(raw));
        if (!Core.validateState(candidate).length) return candidate;
      }
    } catch (error) { console.warn('Could not load saved rack project.', error); }
    return Core.defaultState();
  }

  function snapshot() { return JSON.stringify(state); }
  function pushHistory() {
    history.push(snapshot());
    if (history.length > HISTORY_LIMIT) history.shift();
    future = [];
    updateHistoryButtons();
  }
  function restore(serialized) {
    state = Core.normalizeState(JSON.parse(serialized));
    if (selectedId && !state.equipment.some(x => x.id === selectedId)) selectedId = null;
    syncSettingsFields();
    commit(false);
  }
  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restore(history.pop());
    showMessage('Undid the last change.', 'info');
  }
  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restore(future.pop());
    showMessage('Redid the last change.', 'info');
  }
  function updateHistoryButtons() {
    $('undoBtn').disabled = !history.length;
    $('redoBtn').disabled = !future.length;
  }

  function commit(withRender = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.saveStatus.textContent = 'Saved locally';
    els.saveStatus.style.background = '#d1fae5';
    if (withRender) render(); else { render(); updateHistoryButtons(); }
  }

  function bindEvents() {
    $('applyRackBtn').addEventListener('click', applyRackSettings);
    $('newBtn').addEventListener('click', newProject);
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('customEquipmentBtn').addEventListener('click', () => openAddDialog());
    $('newEqPlacement').addEventListener('change', event => $('manualStartLabel').classList.toggle('hidden', event.target.value !== 'manual'));
    $('addEquipmentForm').addEventListener('submit', addCustomEquipment);
    $('equipmentForm').addEventListener('submit', saveInspector);
    $('deleteBtn').addEventListener('click', deleteSelected);
    $('duplicateBtn').addEventListener('click', duplicateSelected);
    $('eqColor').addEventListener('input', e => $('eqColorText').value = e.target.value);
    $('eqColorText').addEventListener('input', e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $('eqColor').value = e.target.value; });
    document.querySelectorAll('[data-face]').forEach(button => button.addEventListener('click', () => {
      state.activeFace = button.dataset.face;
      selectedId = null;
      commit();
    }));
    $('zoom').addEventListener('input', e => {
      $('zoomValue').value = e.target.value + '%';
      els.rackCanvas.style.transform = `scale(${Number(e.target.value) / 100})`;
    });
    $('exportMenuBtn').addEventListener('click', e => { e.stopPropagation(); els.exportMenu.classList.toggle('hidden'); });
    els.exportMenu.addEventListener('click', e => { if (e.target.dataset.export) { runExport(e.target.dataset.export); els.exportMenu.classList.add('hidden'); } });
    document.addEventListener('click', () => els.exportMenu.classList.add('hidden'));
    $('importBtn').addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', importProject);
    els.rackCanvas.addEventListener('pointerdown', beginDrag);
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('keydown', keyboardShortcuts);
  }

  function keyboardShortcuts(event) {
    const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.shiftKey ? redo() : undo(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { selectedId = null; render(); }
    if (!editing && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); deleteSelected(); }
  }

  function buildPresets() {
    $('presetGrid').innerHTML = '';
    PRESETS.forEach(preset => {
      const button = document.createElement('button');
      button.className = 'preset'; button.style.setProperty('--preset-color', preset.color);
      button.innerHTML = `<strong>${Core.escapeHtml(preset.name)}</strong><span>${preset.size}U · ${Core.escapeHtml(preset.face)}</span>`;
      button.addEventListener('click', () => addPreset(preset));
      $('presetGrid').appendChild(button);
    });
  }

  function buildLegend() {
    $('legend').innerHTML = Object.entries(CATEGORY_COLORS).map(([name,color]) => `<div class="legend-item"><span class="swatch" style="background:${color}"></span>${name}</div>`).join('');
  }

  function syncSettingsFields() {
    els.projectName.value = state.projectName;
    els.rackUnits.value = state.rackUnits;
    els.rackWidth.value = state.rackWidth;
    els.rackId.value = state.rackId;
    els.location.value = state.location;
    els.numberFromTop.checked = state.numberFromTop;
  }

  function applyRackSettings() {
    const units = Math.max(6, Math.min(52, Number.parseInt(els.rackUnits.value, 10) || 42));
    const outside = state.equipment.find(item => item.start + item.size - 1 > units);
    if (outside) {
      showMessage(`Cannot resize to ${units}U: “${outside.name}” extends through U${outside.start + outside.size - 1}.`, 'error');
      els.rackUnits.value = state.rackUnits; return;
    }
    pushHistory();
    state.projectName = els.projectName.value.trim() || 'Untitled rack';
    state.rackUnits = units;
    state.rackWidth = Number(els.rackWidth.value);
    state.rackId = els.rackId.value.trim();
    state.location = els.location.value.trim();
    state.numberFromTop = els.numberFromTop.checked;
    commit();
    showMessage('Rack settings applied.', 'success');
  }

  function newProject() {
    if (state.equipment.length && !window.confirm('Start a new rack project? The current project remains available only if you exported it.')) return;
    pushHistory();
    state = Core.defaultState(); selectedId = null; syncSettingsFields(); commit();
  }

  function addPreset(preset) {
    pushHistory();
    const result = Core.addItem(state, Object.assign({}, preset, { id:Core.uid() }));
    if (!result.ok) { history.pop(); updateHistoryButtons(); showMessage(result.error, 'error'); return; }
    selectedId = result.item.id;
    if (!Core.itemOccupiesFace(result.item, state.activeFace)) state.activeFace = result.item.face === 'rear' ? 'rear' : 'front';
    commit(); showMessage(`${preset.name} added at U${result.item.start}.`, 'success');
  }

  function openAddDialog() {
    $('newEqName').value = 'New device'; $('newEqSize').value = 1; $('newEqPlacement').value = 'auto';
    $('manualStartLabel').classList.add('hidden'); $('newEqStart').max = state.rackUnits; $('newEqFace').value = state.activeFace;
    $('newEqCategory').value = 'Network'; $('newEqColor').value = '#2563eb';
    $('equipmentDialog').showModal(); setTimeout(() => $('newEqName').select(), 0);
  }

  function addCustomEquipment(event) {
    event.preventDefault();
    const submitter = event.submitter;
    if (submitter && submitter.value === 'cancel') { $('equipmentDialog').close(); return; }
    const item = {
      id:Core.uid(), name:$('newEqName').value.trim() || 'New device', size:Number($('newEqSize').value),
      face:$('newEqFace').value, category:$('newEqCategory').value, color:$('newEqColor').value
    };
    const manual = $('newEqPlacement').value === 'manual';
    pushHistory();
    const result = Core.addItem(state, item, manual ? Number($('newEqStart').value) : null);
    if (!result.ok) { history.pop(); updateHistoryButtons(); showMessage(result.error, 'error'); return; }
    selectedId = result.item.id; state.activeFace = item.face === 'rear' ? 'rear' : state.activeFace;
    $('equipmentDialog').close(); commit(); showMessage(`${item.name} added at U${result.item.start}.`, 'success');
  }

  function render() {
    renderRack(); renderStats(); renderInspector(); renderEquipmentList(); updateHistoryButtons();
    document.querySelectorAll('[data-face]').forEach(b => b.classList.toggle('active', b.dataset.face === state.activeFace));
  }

  function renderRack() {
    const visible = state.equipment.filter(item => Core.itemOccupiesFace(item, state.activeFace));
    const rows = [];
    for (let visual = 0; visual < state.rackUnits; visual++) {
      const label = state.numberFromTop ? visual + 1 : state.rackUnits - visual;
      rows.push(`<div class="u-row${label % 5 === 0 ? ' major' : ''}" data-visual="${visual}"><span class="u-label left">${label}U</span><span class="u-label right">${label}U</span></div>`);
    }
    const holes = Array.from({length:state.rackUnits}, (_,visual) => `<i class="rail-hole" style="top:${visual * U_HEIGHT + 11}px"></i>`).join('');
    const blocks = visible.map(item => equipmentBlockHtml(item)).join('');
    const title = Core.escapeHtml(state.projectName);
    const details = [state.rackId, state.location, `${state.rackUnits}U · ${state.rackWidth}-inch`].filter(Boolean).map(Core.escapeHtml).join(' · ');
    els.rackCanvas.innerHTML = `
      <div class="rack-title-card"><div><h2>${title}</h2><p>${details}</p></div><span class="face-badge">${state.activeFace.toUpperCase()} ELEVATION</span></div>
      <div class="rack-shell" style="height:${state.rackUnits * U_HEIGHT + 6}px">
        <div class="rack-rail left">${holes}</div>
        <div class="u-column">${rows.join('')}${blocks}</div>
        <div class="rack-rail right">${holes}</div>
      </div>
      <div class="rack-footer"><span>U1 ${state.numberFromTop ? 'at top' : 'at bottom'}</span><span>Generated by Rack Elevation Designer</span></div>`;
  }

  function itemTop(item) {
    return state.numberFromTop ? (item.start - 1) * U_HEIGHT : (state.rackUnits - (item.start + item.size - 1)) * U_HEIGHT;
  }

  function equipmentBlockHtml(item) {
    const selected = item.id === selectedId ? ' selected' : '';
    const locked = item.locked ? ' locked' : '';
    const end = item.start + item.size - 1;
    const range = item.size === 1 ? `U${item.start}` : `U${item.start}–U${end}`;
    return `<div class="equipment-block${selected}${locked}" data-id="${Core.escapeHtml(item.id)}" style="--eq-color:${item.color};top:${itemTop(item)}px;height:${item.size * U_HEIGHT}px" title="${Core.escapeHtml(item.name)} · ${range}">
      <div class="eq-inner"><span class="eq-leds"><i></i><i></i><i></i></span><span class="eq-text"><strong>${Core.escapeHtml(item.name)}</strong><span>${range} · ${item.size}U · ${Core.escapeHtml(item.category)}</span></span>${item.locked ? '<span class="eq-lock">●</span>' : ''}</div>
    </div>`;
  }

  function renderStats() {
    const used = Core.usedUnits(state, state.activeFace);
    const percent = Math.round(used / state.rackUnits * 100);
    const count = state.equipment.filter(item => Core.itemOccupiesFace(item, state.activeFace)).length;
    els.rackStats.innerHTML = `<span class="stat"><strong>${used}U</strong> used</span><span class="stat"><strong>${state.rackUnits-used}U</strong> free</span><span class="stat"><strong>${percent}%</strong> occupied</span><span class="stat"><strong>${count}</strong> visible</span>`;
  }

  function renderInspector() {
    const item = state.equipment.find(x => x.id === selectedId);
    els.emptyInspector.classList.toggle('hidden', Boolean(item));
    els.equipmentForm.classList.toggle('hidden', !item);
    els.selectionBadge.textContent = item ? `U${item.start}–U${item.start + item.size - 1}` : 'None selected';
    els.selectionBadge.classList.toggle('neutral', !item);
    if (!item) return;
    $('eqName').value = item.name; $('eqSize').value = item.size; $('eqStart').value = item.start; $('eqStart').max = state.rackUnits;
    $('eqFace').value = item.face; $('eqCategory').value = item.category; $('eqColor').value = item.color; $('eqColorText').value = item.color;
    $('eqAsset').value = item.asset; $('eqNotes').value = item.notes; $('eqLocked').checked = item.locked;
  }

  function renderEquipmentList() {
    const sorted = state.equipment.slice().sort((a,b) => b.start - a.start || a.name.localeCompare(b.name));
    els.equipmentCount.textContent = `${sorted.length} item${sorted.length === 1 ? '' : 's'}`;
    els.equipmentList.innerHTML = sorted.length ? sorted.map(item => {
      const range = item.size === 1 ? `U${item.start}` : `U${item.start}–${item.start+item.size-1}`;
      return `<button class="list-item${item.id === selectedId ? ' selected' : ''}" data-list-id="${Core.escapeHtml(item.id)}"><span class="list-color" style="background:${item.color}"></span><span><strong>${Core.escapeHtml(item.name)}</strong><small>${Core.escapeHtml(item.face)} · ${item.size}U · ${Core.escapeHtml(item.category)}</small></span><span class="list-u">${range}</span></button>`;
    }).join('') : '<div class="empty-state"><p>No equipment added yet.</p></div>';
    els.equipmentList.querySelectorAll('[data-list-id]').forEach(button => button.addEventListener('click', () => {
      selectedId = button.dataset.listId;
      const item = state.equipment.find(x => x.id === selectedId);
      if (item && !Core.itemOccupiesFace(item, state.activeFace)) state.activeFace = item.face === 'rear' ? 'rear' : 'front';
      render();
    }));
  }

  function selectItem(id) { selectedId = id; render(); }

  function saveInspector(event) {
    event.preventDefault();
    if (!selectedId) return;
    const changes = {
      name:$('eqName').value.trim() || 'Unnamed equipment', size:Number($('eqSize').value), start:Number($('eqStart').value),
      face:$('eqFace').value, category:$('eqCategory').value, color:$('eqColorText').value,
      asset:$('eqAsset').value.trim(), notes:$('eqNotes').value.trim(), locked:$('eqLocked').checked
    };
    pushHistory();
    const result = Core.updateItem(state, selectedId, changes);
    if (!result.ok) { history.pop(); updateHistoryButtons(); showMessage(result.error, 'error'); return; }
    commit(); showMessage('Equipment updated.', 'success');
  }

  function deleteSelected() {
    const item = state.equipment.find(x => x.id === selectedId); if (!item) return;
    pushHistory(); state.equipment = state.equipment.filter(x => x.id !== selectedId); selectedId = null; commit();
    showMessage(`${item.name} removed.`, 'success');
  }

  function duplicateSelected() {
    const item = state.equipment.find(x => x.id === selectedId); if (!item) return;
    pushHistory();
    const copy = Object.assign({}, item, { id:Core.uid(), name:item.name + ' copy', locked:false });
    const result = Core.addItem(state, copy);
    if (!result.ok) { history.pop(); updateHistoryButtons(); showMessage(result.error, 'error'); return; }
    selectedId = result.item.id; commit(); showMessage(`Duplicate added at U${result.item.start}.`, 'success');
  }

  function beginDrag(event) {
    const block = event.target.closest('.equipment-block');
    if (!block) return;
    const item = state.equipment.find(x => x.id === block.dataset.id); if (!item) return;
    selectedId = item.id;
    if (item.locked) { render(); showMessage('This equipment is position-locked. Clear “Lock position” to move it.', 'error'); return; }
    const column = block.parentElement;
    drag = { item, block, column, startY:event.clientY, originalStart:item.start, candidate:item.start, moved:false };
    block.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag) return;
    const scale = Number($('zoom').value) / 100;
    const deltaVisual = Math.round((event.clientY - drag.startY) / (U_HEIGHT * scale));
    if (Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    let candidate = state.numberFromTop ? drag.originalStart + deltaVisual : drag.originalStart - deltaVisual;
    candidate = Math.max(1, Math.min(state.rackUnits - drag.item.size + 1, candidate));
    drag.candidate = candidate;
    const previewTop = state.numberFromTop ? (candidate - 1) * U_HEIGHT : (state.rackUnits - (candidate + drag.item.size - 1)) * U_HEIGHT;
    let preview = drag.column.querySelector('.drop-preview');
    if (!preview) { preview = document.createElement('div'); preview.className = 'drop-preview'; drag.column.appendChild(preview); }
    preview.style.top = previewTop + 'px'; preview.style.height = drag.item.size * U_HEIGHT + 'px';
    const collision = Core.getCollision(state, Object.assign({}, drag.item, {start:candidate}), drag.item.id);
    preview.style.borderColor = collision ? '#dc2626' : '#0f766e'; preview.style.background = collision ? '#ef444433' : '#14b8a633';
  }

  function endDrag() {
    if (!drag) return;
    const { item, candidate, moved } = drag;
    drag.column.querySelector('.drop-preview')?.remove();
    drag = null;
    if (!moved) { selectItem(item.id); return; }
    const collision = Core.getCollision(state, Object.assign({}, item, {start:candidate}), item.id);
    if (collision) { showMessage(collision.message, 'error'); render(); return; }
    if (candidate !== item.start) { pushHistory(); item.start = candidate; commit(); showMessage(`${item.name} moved to U${candidate}.`, 'success'); }
    else render();
  }

  function showMessage(text, type) {
    clearTimeout(messageTimer); els.messageBar.textContent = text; els.messageBar.classList.remove('hidden');
    const colors = type === 'success' ? ['#ecfdf3','#6ce9a6','#027a48'] : type === 'info' ? ['#eff8ff','#84caff','#175cd3'] : ['#fff7ed','#fdba74','#9a3412'];
    els.messageBar.style.background = colors[0]; els.messageBar.style.borderColor = colors[1]; els.messageBar.style.color = colors[2];
    messageTimer = setTimeout(() => els.messageBar.classList.add('hidden'), 4200);
  }

  function importProject(event) {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = Core.normalizeState(JSON.parse(reader.result));
        const errors = Core.validateState(imported);
        if (errors.length) throw new Error(errors.slice(0,3).join(' '));
        pushHistory(); state = imported; selectedId = null; syncSettingsFields(); commit(); showMessage(`Imported “${state.projectName}”.`, 'success');
      } catch (error) { showMessage(`Import failed: ${error.message}`, 'error'); }
    };
    reader.readAsText(file);
  }

  function runExport(kind) {
    if (kind === 'print') { window.print(); return; }
    if (kind === 'json') { downloadText(`${safeName(state.projectName)}.rack.json`, JSON.stringify(state, null, 2), 'application/json'); return; }
    if (kind === 'csv') { downloadText(`${safeName(state.projectName)}-equipment.csv`, '\ufeff' + Core.toCsv(state), 'text/csv;charset=utf-8'); return; }
    const svg = buildSvg();
    if (kind === 'svg') { downloadText(`${safeName(state.projectName)}-${state.activeFace}.svg`, svg, 'image/svg+xml'); return; }
    if (kind === 'png') exportPng(svg);
  }

  function safeName(value) { return (value || 'rack-elevation').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'rack-elevation'; }
  function downloadText(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type})); const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildSvg() {
    const W = 720, marginTop = 112, rackX = 96, rail = 46, innerW = 440, rackH = state.rackUnits * U_HEIGHT;
    const H = marginTop + rackH + 76;
    const visible = state.equipment.filter(item => Core.itemOccupiesFace(item, state.activeFace));
    const esc = Core.escapeHtml;
    const lines = [];
    for (let visual=0; visual<state.rackUnits; visual++) {
      const y = marginTop + visual * U_HEIGHT; const label = state.numberFromTop ? visual+1 : state.rackUnits-visual;
      lines.push(`<rect x="${rackX+rail}" y="${y}" width="${innerW}" height="${U_HEIGHT}" fill="${label%2 ? '#e8edf3':'#dce3eb'}" stroke="#94a3b8" stroke-width="1"/><text x="${rackX+31}" y="${y+17}" text-anchor="end" class="ul">${label}U</text><text x="${rackX+rail+innerW+15}" y="${y+17}" class="ul">${label}U</text>`);
    }
    const blocks = visible.map(item => {
      const y = marginTop + itemTop(item); const h = item.size * U_HEIGHT; const end = item.start + item.size - 1;
      const range = item.size===1 ? `U${item.start}` : `U${item.start}–U${end}`;
      return `<g><rect x="${rackX+rail+7}" y="${y+2}" width="${innerW-14}" height="${h-4}" rx="5" fill="${item.color}" stroke="#172033" stroke-width="2"/><circle cx="${rackX+rail+22}" cy="${y+h/2}" r="3" fill="#bef264"/><circle cx="${rackX+rail+31}" cy="${y+h/2}" r="3" fill="#bef264"/><text x="${rackX+rail+43}" y="${y+h/2+1}" dominant-baseline="middle" class="eq">${esc(item.name)}</text><text x="${rackX+rail+innerW-15}" y="${y+h/2+1}" text-anchor="end" dominant-baseline="middle" class="range">${range} · ${item.size}U</text></g>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>.title{font:700 24px Arial;fill:#172033}.sub{font:12px Arial;fill:#667085}.badge{font:700 11px Arial;fill:#fff;letter-spacing:1.5px}.ul{font:700 10px Arial;fill:#475467}.eq{font:700 12px Arial;fill:#fff}.range{font:10px Arial;fill:#fff}</style><rect width="100%" height="100%" fill="#fff"/><text x="${rackX}" y="42" class="title">${esc(state.projectName)}</text><text x="${rackX}" y="64" class="sub">${esc([state.rackId,state.location,`${state.rackUnits}U · ${state.rackWidth}-inch`].filter(Boolean).join(' · '))}</text><rect x="${rackX+rail+innerW-115}" y="28" width="115" height="28" rx="4" fill="#334155"/><text x="${rackX+rail+innerW-57}" y="46" text-anchor="middle" class="badge">${state.activeFace.toUpperCase()}</text><rect x="${rackX}" y="${marginTop-3}" width="${rail}" height="${rackH+6}" rx="7" fill="#253141" stroke="#111827" stroke-width="3"/><rect x="${rackX+rail+innerW}" y="${marginTop-3}" width="${rail}" height="${rackH+6}" rx="7" fill="#253141" stroke="#111827" stroke-width="3"/>${lines.join('')}${blocks}<text x="${rackX}" y="${H-28}" class="sub">U1 ${state.numberFromTop?'at top':'at bottom'} · ${visible.length} items · ${Core.usedUnits(state,state.activeFace)}U used</text><text x="${W-rackX}" y="${H-28}" text-anchor="end" class="sub">Rack Elevation Designer</text></svg>`;
  }

  function exportPng(svg) {
    const blob = new Blob([svg], {type:'image/svg+xml'}); const url = URL.createObjectURL(blob); const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = image.width * 2; canvas.height = image.height * 2;
      const ctx = canvas.getContext('2d'); ctx.scale(2,2); ctx.drawImage(image,0,0);
      canvas.toBlob(png => { const pngUrl=URL.createObjectURL(png); const a=document.createElement('a'); a.href=pngUrl; a.download=`${safeName(state.projectName)}-${state.activeFace}.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(pngUrl),1000); }, 'image/png');
      URL.revokeObjectURL(url);
    };
    image.onerror = () => { URL.revokeObjectURL(url); showMessage('PNG export failed. Try SVG export instead.', 'error'); };
    image.src = url;
  }
})();
