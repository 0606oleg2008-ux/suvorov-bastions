// ================================================================
//  НАСТРОЙКИ
// ================================================================
const CONFIG = {
    numHouses: 8,
    houseSize: 50,
};
// ================================================================

// --------------------------------------------------------------
// 1. ЗАГРУЗКА ФОТО (локально, не синхронизируется)
// --------------------------------------------------------------
const MAP_BG_KEY = 'mapBackgroundImage';
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const scene = document.getElementById('scene');

function loadBackground() {
    const saved = localStorage.getItem(MAP_BG_KEY);
    if (saved) {
        scene.style.backgroundImage = `url(${saved})`;
        scene.style.backgroundSize = 'cover';
        document.getElementById('emptyHint').style.display = 'none';
    }
}
loadBackground();

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        localStorage.setItem(MAP_BG_KEY, dataUrl);
        scene.style.backgroundImage = `url(${dataUrl})`;
        scene.style.backgroundSize = 'cover';
        document.getElementById('emptyHint').style.display = 'none';
    };
    reader.readAsDataURL(file);
    this.value = '';
});

// --------------------------------------------------------------
// 2. ДОМА (СИНХРОНИЗАЦИЯ С СЕРВЕРОМ)
// --------------------------------------------------------------
let isFrozen = false;
let houses = [];
let houseElements = [];
let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0, dragOffsetY = 0;

function generateDefaultPositions() {
    const positions = [];
    const cols = 4;
    const rows = 2;
    const spacingX = 150;
    const spacingY = 150;
    const startX = 100;
    const startY = 100;
    for (let i = 0; i < CONFIG.numHouses; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.push({ id: i + 1, x: startX + col * spacingX, y: startY + row * spacingY, angle: 0 });
    }
    return positions;
}

// Принудительная загрузка с сервера
async function loadHousePositionsFromServer() {
    try {
        const resp = await fetch('/api/houses');
        if (!resp.ok) throw new Error('Server error');
        const positions = await resp.json();
        if (positions && positions.length === CONFIG.numHouses) {
            localStorage.setItem('housesPositions', JSON.stringify(positions));
            return positions;
        }
    } catch(e) {
        console.warn('Ошибка загрузки позиций с сервера, используем localStorage');
    }
    // Fallback localStorage
    let positions = localStorage.getItem('housesPositions');
    if (positions) {
        try {
            positions = JSON.parse(positions);
            if (positions.length === CONFIG.numHouses) {
                return positions;
            }
        } catch(e) {}
    }
    // Если ничего нет – генерируем и сохраняем на сервер
    const defaultPos = generateDefaultPositions();
    await saveHousePositionsToServer(defaultPos);
    return defaultPos;
}

async function saveHousePositionsToServer(positions) {
    try {
        await fetch('/api/houses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(positions)
        });
        localStorage.setItem('housesPositions', JSON.stringify(positions));
    } catch(e) {
        console.warn('Ошибка сохранения позиций на сервер');
    }
}

async function syncHousePositions() {
    const positions = houses.map(h => ({ id: h.id, x: h.x, y: h.y, angle: h.angle || 0 }));
    await saveHousePositionsToServer(positions);
}

function createHouseElement(house, delay, withEvents = true) {
    const div = document.createElement('div');
    div.className = 'house-marker';
    div.dataset.id = house.id;
    div.style.left = house.x + 'px';
    div.style.top = house.y + 'px';
    const angle = house.angle || 0;
    div.style.transform = `rotate(${angle}deg) translateY(30px) scale(0.9)`;
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    div.innerHTML = `<span class="marker-label">#${house.id}</span>`;
    
    if (withEvents && !isFrozen) {
        // Перетаскивание
        div.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            isDragging = true;
            dragTarget = this;
            const rect = this.getBoundingClientRect();
            const sceneRect = scene.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            this.classList.add('dragging');
            e.preventDefault();
        });
        // Вращение колёсиком
        div.addEventListener('wheel', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? 5 : -5;
            const id = parseInt(this.dataset.id);
            const house = houses.find(h => h.id === id);
            if (house) {
                house.angle = (house.angle || 0) + delta;
                this.style.transform = `rotate(${house.angle}deg) translateY(0) scale(1)`;
                syncHousePositions();
                updateChartAndTable();
            }
        }, { passive: false });
    }
    
    div.addEventListener('click', function(e) {
        if (isDragging) return;
        const id = parseInt(this.dataset.id);
        openPanel(id);
    });
    
    setTimeout(() => {
        div.style.opacity = '1';
        div.style.transform = `rotate(${angle}deg) translateY(0) scale(1)`;
    }, delay * 1000);
    
    return div;
}

function recreateHousesWithoutEvents() {
    const container = document.getElementById('housesContainer');
    container.innerHTML = '';
    houseElements = [];
    houses.forEach((house, idx) => {
        const el = createHouseElement(house, idx * 0.08, false);
        container.appendChild(el);
        houseElements.push(el);
    });
}

async function initHouses() {
    const positions = await loadHousePositionsFromServer();
    houses = positions.map(p => ({ id: p.id, x: p.x, y: p.y, angle: p.angle || 0 }));
    const container = document.getElementById('housesContainer');
    container.innerHTML = '';
    houseElements = [];
    houses.forEach((house, idx) => {
        const el = createHouseElement(house, idx * 0.08, !isFrozen);
        container.appendChild(el);
        houseElements.push(el);
    });
    updateHouseColors();
}

// Инициализация при загрузке
initHouses();

document.addEventListener('mousemove', function(e) {
    if (isFrozen || !isDragging || !dragTarget) return;
    const sceneRect = scene.getBoundingClientRect();
    let newX = e.clientX - sceneRect.left - dragOffsetX;
    let newY = e.clientY - sceneRect.top - dragOffsetY;
    newX = Math.max(0, Math.min(newX, sceneRect.width - CONFIG.houseSize));
    newY = Math.max(0, Math.min(newY, sceneRect.height - CONFIG.houseSize));
    dragTarget.style.left = newX + 'px';
    dragTarget.style.top = newY + 'px';
    const id = parseInt(dragTarget.dataset.id);
    const house = houses.find(h => h.id === id);
    if (house) { house.x = newX; house.y = newY; }
});

document.addEventListener('mouseup', function() {
    if (isFrozen) { isDragging = false; dragTarget = null; return; }
    if (isDragging && dragTarget) {
        dragTarget.classList.remove('dragging');
        syncHousePositions();
        updateChartAndTable();
    }
    isDragging = false;
    dragTarget = null;
});

// --------------------------------------------------------------
// 3. ДОРОГА (СИНХРОНИЗАЦИЯ)
// --------------------------------------------------------------
let isDrawingRoad = false;
let roadPoints = [];
let roadPath = null;
const svg = document.getElementById('roadSvg');
const drawRoadBtn = document.getElementById('drawRoadBtn');
const clearRoadBtn = document.getElementById('clearRoadBtn');
const drawingHint = document.getElementById('drawingHint');

async function loadRoadFromServer() {
    try {
        const resp = await fetch('/api/road');
        if (!resp.ok) throw new Error('Server error');
        const points = await resp.json();
        if (points && points.length >= 2) {
            roadPoints = points;
            localStorage.setItem('roadPoints', JSON.stringify(points));
            drawRoadPath();
            return true;
        }
    } catch(e) {
        console.warn('Ошибка загрузки дороги с сервера');
    }
    // Fallback localStorage
    const saved = localStorage.getItem('roadPoints');
    if (saved) {
        try {
            const points = JSON.parse(saved);
            if (points && points.length >= 2) {
                roadPoints = points;
                drawRoadPath();
                return true;
            }
        } catch(e) {}
    }
    return false;
}

async function saveRoadToServer(points) {
    try {
        await fetch('/api/road', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(points)
        });
        localStorage.setItem('roadPoints', JSON.stringify(points));
    } catch(e) {
        console.warn('Ошибка сохранения дороги на сервер');
    }
}

function drawRoadPath() {
    if (roadPoints.length < 2) {
        if (roadPath) { roadPath.remove(); roadPath = null; }
        return;
    }
    let pathData = 'M' + roadPoints.map(p => `${p.x},${p.y}`).join(' L');
    if (roadPath) {
        roadPath.setAttribute('d', pathData);
    } else {
        const ns = 'http://www.w3.org/2000/svg';
        roadPath = document.createElementNS(ns, 'path');
        roadPath.setAttribute('d', pathData);
        roadPath.setAttribute('stroke', '#7f8c8d');
        roadPath.setAttribute('stroke-width', '8');
        roadPath.setAttribute('stroke-linecap', 'round');
        roadPath.setAttribute('stroke-linejoin', 'round');
        roadPath.setAttribute('fill', 'none');
        roadPath.setAttribute('style', 'pointer-events:none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));');
        svg.appendChild(roadPath);
    }
}

function onSceneClick(e) {
    if (isFrozen || !isDrawingRoad) return;
    const rect = scene.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    roadPoints.push({ x, y });
    drawRoadPath();
    localStorage.setItem('roadPoints', JSON.stringify(roadPoints));
    if (roadPoints.length === 1) {
        drawingHint.textContent = 'Кликните для добавления точек. Двойной клик — завершить.';
    }
}

function onSceneDblClick(e) {
    if (isFrozen || !isDrawingRoad) return;
    isDrawingRoad = false;
    drawingHint.style.display = 'none';
    drawRoadBtn.textContent = '🛣️ Перерисовать дорогу';
    if (roadPoints.length < 2) {
        if (roadPath) { roadPath.remove(); roadPath = null; }
        localStorage.removeItem('roadPoints');
        roadPoints = [];
    } else {
        saveRoadToServer(roadPoints);
    }
    scene.removeEventListener('click', onSceneClick);
    scene.removeEventListener('dblclick', onSceneDblClick);
}

drawRoadBtn.addEventListener('click', function() {
    if (isFrozen) return;
    if (roadPath) { roadPath.remove(); roadPath = null; localStorage.removeItem('roadPoints'); roadPoints = []; }
    isDrawingRoad = true;
    roadPoints = [];
    drawingHint.style.display = 'block';
    drawingHint.textContent = 'Кликните на карте: первая точка дороги.';
    this.textContent = '⏳ Рисуем...';
    scene.addEventListener('click', onSceneClick);
    scene.addEventListener('dblclick', onSceneDblClick);
});

clearRoadBtn.addEventListener('click', function() {
    if (isFrozen) return;
    if (roadPath) { roadPath.remove(); roadPath = null; }
    roadPoints = [];
    localStorage.removeItem('roadPoints');
    saveRoadToServer([]);
    drawRoadBtn.textContent = '🛣️ Рисовать дорогу';
    drawingHint.style.display = 'none';
    isDrawingRoad = false;
    scene.removeEventListener('click', onSceneClick);
    scene.removeEventListener('dblclick', onSceneDblClick);
});

// Загружаем дорогу при старте
(async function initRoad() {
    await loadRoadFromServer();
})();

document.getElementById('resetHousesBtn').addEventListener('click', async function() {
    if (isFrozen) return;
    const positions = generateDefaultPositions();
    houses = positions.map(p => ({ id: p.id, x: p.x, y: p.y, angle: p.angle || 0 }));
    await saveHousePositionsToServer(positions);
    const container = document.getElementById('housesContainer');
    container.innerHTML = '';
    houseElements = [];
    houses.forEach((house, idx) => {
        const el = createHouseElement(house, idx * 0.08, !isFrozen);
        container.appendChild(el);
        houseElements.push(el);
    });
    updateHouseColors();
    updateChartAndTable();
});

// --------------------------------------------------------------
// 4. РАБОТА С ДАННЫМИ (сервер)
// --------------------------------------------------------------
const API_URL = '/api/data';

async function loadAllData() {
    try {
        const resp = await fetch(API_URL);
        if (!resp.ok) throw new Error('Server error');
        return await resp.json();
    } catch (e) {
        console.warn('Ошибка загрузки с сервера, используем localStorage');
        const saved = localStorage.getItem('buildingData');
        if (saved) {
            try { return JSON.parse(saved); } catch (ex) {}
        }
        return {};
    }
}

async function saveAllData(data) {
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        localStorage.setItem('buildingData', JSON.stringify(data));
    } catch (e) {
        console.warn('Ошибка сохранения на сервер, сохраняем в localStorage');
        localStorage.setItem('buildingData', JSON.stringify(data));
    }
}

async function getHouseData(houseId) {
    const all = await loadAllData();
    if (!all[houseId]) {
        all[houseId] = { name: `Бастион №${houseId}`, plan_start: '', plan_end: '', fact_start: '', fact_end: '', floors: [] };
        await saveAllData(all);
    }
    return all[houseId];
}

async function setHouseData(houseId, houseData) {
    const all = await loadAllData();
    all[houseId] = houseData;
    await saveAllData(all);
    updateChartAndTable();
}

// --------------------------------------------------------------
// 5. ПАНЕЛЬ
// --------------------------------------------------------------
let currentHouseId = null;
const panel = document.getElementById('panel');
const closeBtn = document.getElementById('closePanel');
const houseIdDisplay = document.getElementById('houseIdDisplay');
const houseNameInput = document.getElementById('houseNameInput');
const housePlanStart = document.getElementById('housePlanStart');
const housePlanEnd = document.getElementById('housePlanEnd');
const houseFactStart = document.getElementById('houseFactStart');
const houseFactEnd = document.getElementById('houseFactEnd');
const floorsContainer = document.getElementById('floorsContainer');
const addFloorBtn = document.getElementById('addFloorBtn');
const saveBtn = document.getElementById('saveDataBtn');

async function openPanel(houseId) {
    currentHouseId = houseId;
    houseIdDisplay.textContent = houseId;
    const data = await getHouseData(houseId);
    houseNameInput.value = data.name || `Бастион №${houseId}`;
    housePlanStart.value = data.plan_start || '';
    housePlanEnd.value = data.plan_end || '';
    houseFactStart.value = data.fact_start || '';
    houseFactEnd.value = data.fact_end || '';
    await renderFloors(houseId);
    panel.classList.add('active');
}

function closePanel() {
    panel.classList.remove('active');
    currentHouseId = null;
}
closeBtn.addEventListener('click', closePanel);

async function saveHouseFields() {
    if (currentHouseId === null) return;
    const data = await getHouseData(currentHouseId);
    data.name = houseNameInput.value || `Бастион №${currentHouseId}`;
    data.plan_start = housePlanStart.value || '';
    data.plan_end = housePlanEnd.value || '';
    data.fact_start = houseFactStart.value || '';
    data.fact_end = houseFactEnd.value || '';
    await setHouseData(currentHouseId, data);
}

houseNameInput.addEventListener('change', saveHouseFields);
housePlanStart.addEventListener('change', saveHouseFields);
housePlanEnd.addEventListener('change', saveHouseFields);
houseFactStart.addEventListener('change', saveHouseFields);
houseFactEnd.addEventListener('change', saveHouseFields);

// --------------------------------------------------------------
// 6. РЕНДЕРИНГ ЭТАПОВ (без изменений)
// --------------------------------------------------------------
async function renderFloors(houseId) {
    const data = await getHouseData(houseId);
    const floors = data.floors || [];
    floorsContainer.innerHTML = '';
    if (floors.length === 0) {
        floorsContainer.innerHTML = '<p style="color:#888; font-style:italic;">Нет этапов. Нажмите "+ Добавить этап".</p>';
    } else {
        for (let index = 0; index < floors.length; index++) {
            const floor = floors[index];
            const block = createFloorBlock(floor, index, houseId);
            floorsContainer.appendChild(block);
        }
    }
}

function createFloorBlock(floor, index, houseId) {
    const div = document.createElement('div');
    div.className = 'floor-block';
    div.dataset.floorIndex = index;

    const header = document.createElement('div');
    header.className = 'floor-header';
    const title = document.createElement('h4');
    const stageName = floor.name || `Этап ${index+1}`;
    title.textContent = stageName;
    const shifts = floor.shifts || [];
    const totalShifts = shifts.length;
    const totalWorkers = shifts.reduce((sum, s) => sum + (s.workers || 0), 0);
    const summary = document.createElement('span');
    summary.className = 'shifts-summary';
    summary.textContent = `(Смен: ${totalShifts}, Человек: ${totalWorkers})`;
    title.appendChild(summary);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-floor';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const data = await getHouseData(houseId);
        data.floors.splice(index, 1);
        await setHouseData(houseId, data);
        await renderFloors(houseId);
    });
    header.appendChild(title);
    header.appendChild(removeBtn);
    div.appendChild(header);

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Название этапа:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Например: Фундамент, Подвал...';
    nameInput.value = floor.name || '';
    nameInput.addEventListener('change', async function() {
        const data = await getHouseData(houseId);
        data.floors[index].name = this.value || `Этап ${index+1}`;
        await setHouseData(houseId, data);
        title.textContent = data.floors[index].name;
        const sh = data.floors[index].shifts || [];
        const totalSh = sh.length;
        const totalW = sh.reduce((sum, s) => sum + (s.workers || 0), 0);
        title.querySelector('.shifts-summary').textContent = `(Смен: ${totalSh}, Человек: ${totalW})`;
    });
    nameLabel.appendChild(nameInput);
    div.appendChild(nameLabel);

    const descLabel = document.createElement('label');
    descLabel.textContent = 'Описание работ:';
    const descText = document.createElement('textarea');
    descText.rows = 2;
    descText.value = floor.description || '';
    descText.addEventListener('change', async function() {
        const data = await getHouseData(houseId);
        data.floors[index].description = this.value;
        await setHouseData(houseId, data);
    });
    descLabel.appendChild(descText);
    div.appendChild(descLabel);

    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Статус этапа:';
    const statusSelect = document.createElement('select');
    const statuses = [
        { value: 'not_started', text: '❌ Не начат' },
        { value: 'in_progress', text: '🔄 В процессе' },
        { value: 'completed', text: '✅ Завершён' }
    ];
    statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.value;
        opt.textContent = s.text;
        if (floor.status === s.value) opt.selected = true;
        statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', async function() {
        const data = await getHouseData(houseId);
        data.floors[index].status = this.value;
        await setHouseData(houseId, data);
        updateChartAndTable();
    });
    statusLabel.appendChild(statusSelect);
    div.appendChild(statusLabel);

    const datesDiv = document.createElement('div');
    datesDiv.className = 'dates-row';
    const dateFields = [
        { key: 'plan_start', label: '📅 План начала' },
        { key: 'plan_end', label: '📅 План окончания' },
        { key: 'fact_start', label: '📅 Факт начала' },
        { key: 'fact_end', label: '📅 Факт окончания' }
    ];
    dateFields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'date-group';
        const label = document.createElement('label');
        label.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'date';
        input.value = floor[field.key] || '';
        input.addEventListener('change', async function() {
            const data = await getHouseData(houseId);
            data.floors[index][field.key] = this.value;
            await setHouseData(houseId, data);
            updateChartAndTable();
        });
        group.appendChild(label);
        group.appendChild(input);
        datesDiv.appendChild(group);
    });
    div.appendChild(datesDiv);

    // --- Смены ---
    const shiftContainer = document.createElement('div');
    shiftContainer.style.marginTop = '12px';
    const shiftGroup = document.createElement('div');
    shiftGroup.className = 'shift-group';
    const shiftTitle = document.createElement('div');
    shiftTitle.className = 'group-title';
    shiftTitle.innerHTML = `<span>⏰ Смены</span> <span class="badge">${totalShifts} смен, ${totalWorkers} чел.</span>`;
    shiftGroup.appendChild(shiftTitle);
    const shiftList = document.createElement('div');
    shiftList.className = 'shift-list';
    shiftGroup.appendChild(shiftList);

    function renderShifts() {
        shiftList.innerHTML = '';
        if (!floor.shifts) floor.shifts = [];
        const shifts = floor.shifts;
        if (shifts.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#999';
            empty.style.fontSize = '12px';
            empty.textContent = 'Нет смен';
            shiftList.appendChild(empty);
        } else {
            shifts.forEach((s, idx) => {
                const item = document.createElement('div');
                item.className = 'shift-item';
                item.innerHTML = `
                    <span class="shift-name">${s.name || 'Смена'}</span>
                    <span class="shift-details">${s.date || ''} — ${s.workers || 0} чел.</span>
                    <button class="remove-shift" data-idx="${idx}">✕</button>
                `;
                item.querySelector('.remove-shift').addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const data = await getHouseData(houseId);
                    data.floors[index].shifts.splice(idx, 1);
                    await setHouseData(houseId, data);
                    await renderFloors(houseId);
                    updateChartAndTable();
                });
                shiftList.appendChild(item);
            });
        }
        const form = document.createElement('div');
        form.className = 'shift-form';
        form.innerHTML = `
            <input type="text" class="sf-name" placeholder="Название смены">
            <input type="date" class="sf-date">
            <input type="number" class="sf-workers" placeholder="Человек" step="1" min="1">
            <button class="sf-btn">💾 Сохранить</button>
        `;
        form.querySelector('.sf-btn').addEventListener('click', async function() {
            const nameInput = form.querySelector('.sf-name');
            const dateInput = form.querySelector('.sf-date');
            const workersInput = form.querySelector('.sf-workers');
            const name = nameInput.value.trim() || 'Смена';
            const date = dateInput.value || '';
            const workers = parseInt(workersInput.value) || 1;
            if (workers < 1) { alert('Количество человек должно быть больше 0'); return; }
            const data = await getHouseData(houseId);
            if (!data.floors[index].shifts) data.floors[index].shifts = [];
            data.floors[index].shifts.push({ name, date, workers });
            await setHouseData(houseId, data);
            await renderFloors(houseId);
            updateChartAndTable();
        });
        shiftList.appendChild(form);
    }
    renderShifts();
    shiftContainer.appendChild(shiftGroup);
    div.appendChild(shiftContainer);

    // --- Работы ---
    const workContainer = document.createElement('div');
    workContainer.style.marginTop = '12px';

    const plannedGroup = document.createElement('div');
    plannedGroup.className = 'work-group';
    const plannedTitle = document.createElement('div');
    plannedTitle.className = 'group-title';
    plannedTitle.innerHTML = `<span>📋 Планируемые работы</span> <span class="badge badge-planned">План</span>`;
    plannedGroup.appendChild(plannedTitle);
    const plannedList = document.createElement('div');
    plannedList.className = 'work-list';
    plannedGroup.appendChild(plannedList);

    const completedGroup = document.createElement('div');
    completedGroup.className = 'work-group';
    const completedTitle = document.createElement('div');
    completedTitle.className = 'group-title';
    completedTitle.innerHTML = `<span>✅ Выполненные работы</span> <span class="badge badge-completed">Факт</span>`;
    completedGroup.appendChild(completedTitle);
    const completedList = document.createElement('div');
    completedList.className = 'work-list';
    completedGroup.appendChild(completedList);

    function renderPlannedWorks() {
        plannedList.innerHTML = '';
        if (!floor.plannedWorks) floor.plannedWorks = [];
        const works = floor.plannedWorks;
        if (works.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#999';
            empty.style.fontSize = '12px';
            empty.textContent = 'Нет планируемых работ';
            plannedList.appendChild(empty);
        } else {
            works.forEach((w, idx) => {
                const item = document.createElement('div');
                item.className = 'work-item';
                item.innerHTML = `
                    <span class="work-name">${w.name || 'Без названия'}</span>
                    <span class="work-details">${w.quantity || 0} ${w.unit || ''}</span>
                    <button class="remove-work" data-idx="${idx}">✕</button>
                `;
                item.querySelector('.remove-work').addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const data = await getHouseData(houseId);
                    data.floors[index].plannedWorks.splice(idx, 1);
                    const completedWorks = data.floors[index].completedWorks || [];
                    data.floors[index].completedWorks = completedWorks.filter(cw => cw.plannedWorkId !== w.id);
                    await setHouseData(houseId, data);
                    await renderFloors(houseId);
                    updateChartAndTable();
                });
                plannedList.appendChild(item);
            });
        }
        const form = document.createElement('div');
        form.className = 'work-form';
        form.innerHTML = `
            <input type="text" class="wf-name" placeholder="Название работы">
            <input type="number" class="wf-qty" placeholder="Кол-во" step="any">
            <select class="wf-unit">
                <option value="шт">шт</option>
                <option value="м²">м²</option>
                <option value="м³">м³</option>
                <option value="кг">кг</option>
                <option value="т">т</option>
                <option value="л">л</option>
                <option value="м">м</option>
                <option value="км">км</option>
                <option value="шт.">шт.</option>
                <option value="уп.">уп.</option>
            </select>
            <button class="wf-btn">💾 Сохранить</button>
        `;
        form.querySelector('.wf-btn').addEventListener('click', async function() {
            const nameInput = form.querySelector('.wf-name');
            const qtyInput = form.querySelector('.wf-qty');
            const unitSelect = form.querySelector('.wf-unit');
            const name = nameInput.value.trim();
            const qty = parseFloat(qtyInput.value);
            const unit = unitSelect.value;
            if (!name || isNaN(qty) || qty <= 0) {
                alert('Введите корректное название и количество (больше 0)');
                return;
            }
            const data = await getHouseData(houseId);
            if (!data.floors[index].plannedWorks) data.floors[index].plannedWorks = [];
            const works = data.floors[index].plannedWorks;
            const newId = Date.now() + Math.random();
            works.push({ id: newId, name, quantity: qty, unit });
            await setHouseData(houseId, data);
            await renderFloors(houseId);
            updateChartAndTable();
        });
        plannedList.appendChild(form);
    }

    function renderCompletedWorks() {
        completedList.innerHTML = '';
        if (!floor.plannedWorks) floor.plannedWorks = [];
        if (!floor.completedWorks) floor.completedWorks = [];
        const planned = floor.plannedWorks;
        const completed = floor.completedWorks;
        const grouped = {};
        completed.forEach(cw => {
            const id = cw.plannedWorkId;
            if (!grouped[id]) grouped[id] = { ...cw, quantity: 0 };
            grouped[id].quantity += cw.quantity;
        });
        const groupedItems = Object.values(grouped);
        if (groupedItems.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#999';
            empty.style.fontSize = '12px';
            empty.textContent = 'Нет выполненных работ';
            completedList.appendChild(empty);
        } else {
            groupedItems.forEach((cw, idx) => {
                const plannedWork = planned.find(p => p.id === cw.plannedWorkId);
                const name = plannedWork ? plannedWork.name : (cw.name || 'Работа (удалена)');
                const total = plannedWork ? plannedWork.quantity : 0;
                const unit = plannedWork ? plannedWork.unit : (cw.unit || '');
                const done = cw.quantity || 0;
                const progress = total > 0 ? Math.min((done / total) * 100, 100) : 0;
                const item = document.createElement('div');
                item.className = 'work-item';
                item.innerHTML = `
                    <span class="work-name">${name}</span>
                    <span class="work-details">${done} из ${total} ${unit}</span>
                    <div class="progress-bar"><div class="fill" style="width:${progress}%"></div></div>
                    <button class="remove-work" data-cw-idx="${idx}">✕</button>
                `;
                item.querySelector('.remove-work').addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const data = await getHouseData(houseId);
                    const idToRemove = cw.plannedWorkId;
                    data.floors[index].completedWorks = data.floors[index].completedWorks.filter(cw => cw.plannedWorkId !== idToRemove);
                    await setHouseData(houseId, data);
                    await renderFloors(houseId);
                    updateChartAndTable();
                });
                completedList.appendChild(item);
            });
        }
        if (planned.length > 0) {
            const form = document.createElement('div');
            form.className = 'work-form';
            const select = document.createElement('select');
            select.className = 'wf-name';
            select.style.flex = '2';
            planned.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.quantity} ${p.unit})`;
                select.appendChild(opt);
            });
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.className = 'wf-qty';
            qtyInput.placeholder = 'Выполнено';
            qtyInput.step = 'any';
            const btn = document.createElement('button');
            btn.className = 'wf-btn complete';
            btn.textContent = '✅ Сохранить';
            form.appendChild(select);
            form.appendChild(qtyInput);
            form.appendChild(btn);
            btn.addEventListener('click', async function() {
                const selectedId = parseFloat(select.value);
                const done = parseFloat(qtyInput.value);
                if (isNaN(done) || done <= 0) {
                    alert('Введите корректное количество (больше 0)');
                    return;
                }
                const data = await getHouseData(houseId);
                if (!data.floors[index].plannedWorks) data.floors[index].plannedWorks = [];
                if (!data.floors[index].completedWorks) data.floors[index].completedWorks = [];
                const plannedWork = data.floors[index].plannedWorks.find(p => p.id === selectedId);
                if (!plannedWork) {
                    alert('Выбранная работа не найдена');
                    return;
                }
                const alreadyDone = data.floors[index].completedWorks
                    .filter(cw => cw.plannedWorkId === selectedId)
                    .reduce((sum, cw) => sum + (cw.quantity || 0), 0);
                if (alreadyDone + done > plannedWork.quantity) {
                    alert(`Общее количество выполненных работ (${alreadyDone + done}) не может превышать плановое (${plannedWork.quantity})`);
                    return;
                }
                let existing = data.floors[index].completedWorks.find(cw => cw.plannedWorkId === selectedId);
                if (existing) {
                    existing.quantity += done;
                } else {
                    data.floors[index].completedWorks.push({
                        plannedWorkId: selectedId,
                        name: plannedWork.name,
                        unit: plannedWork.unit,
                        quantity: done
                    });
                }
                await setHouseData(houseId, data);
                await renderFloors(houseId);
                updateChartAndTable();
            });
            completedList.appendChild(form);
        } else {
            const msg = document.createElement('div');
            msg.style.color = '#999';
            msg.style.fontSize = '12px';
            msg.textContent = 'Сначала добавьте планируемые работы';
            completedList.appendChild(msg);
        }
    }

    renderPlannedWorks();
    renderCompletedWorks();

    workContainer.appendChild(plannedGroup);
    workContainer.appendChild(completedGroup);
    div.appendChild(workContainer);

    return div;
}

addFloorBtn.addEventListener('click', async function() {
    if (currentHouseId === null) return;
    const data = await getHouseData(currentHouseId);
    const newFloor = {
        name: `Этап ${(data.floors.length || 0) + 1}`,
        description: '',
        status: 'not_started',
        plan_start: '',
        plan_end: '',
        fact_start: '',
        fact_end: '',
        shifts: [],
        plannedWorks: [],
        completedWorks: []
    };
    data.floors.push(newFloor);
    await setHouseData(currentHouseId, data);
    await renderFloors(currentHouseId);
});

saveBtn.addEventListener('click', function() {
    saveHouseFields();
    alert('Данные сохранены!');
});

// --------------------------------------------------------------
// 7. ЦВЕТ ДОМОВ
// --------------------------------------------------------------
async function updateHouseColors() {
    const allData = await loadAllData();
    houseElements.forEach(el => {
        const id = parseInt(el.dataset.id);
        const data = allData[id];
        if (!data) return;
        const floors = data.floors || [];
        const total = floors.length;
        const completed = floors.filter(f => f.status === 'completed').length;
        const progress = total > 0 ? completed / total : 0;
        const red = Math.round(255 - progress * 255);
        const green = Math.round(progress * 255);
        const blue = 50;
        el.style.background = `rgb(${red}, ${green}, ${blue})`;
        el.style.borderColor = progress >= 0.5 ? '#27ae60' : (progress > 0 ? '#f39c12' : '#2c3e50');
    });
}

// --------------------------------------------------------------
// 8. ГРАФИК И ТАБЛИЦА
// --------------------------------------------------------------
let chartInstance = null;

function getStatusText(status) {
    const map = {
        'not_started': '❌ Не начат',
        'in_progress': '🔄 В процессе',
        'completed': '✅ Завершён'
    };
    return map[status] || 'Неизвестно';
}

function getStatusClass(status) {
    const map = {
        'not_started': 'status-not_started',
        'in_progress': 'status-in_progress',
        'completed': 'status-completed'
    };
    return map[status] || 'status-unknown';
}

function getExecutionStatus(floor) {
    const planStart = floor.plan_start || '';
    const planEnd = floor.plan_end || '';
    const factStart = floor.fact_start || '';
    const factEnd = floor.fact_end || '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!planStart && !planEnd) return 'Неизвестно';
    try {
        const planStartDate = planStart ? new Date(planStart + 'T00:00:00') : null;
        const planEndDate = planEnd ? new Date(planEnd + 'T00:00:00') : null;
        const factStartDate = factStart ? new Date(factStart + 'T00:00:00') : null;
        const factEndDate = factEnd ? new Date(factEnd + 'T00:00:00') : null;
        if (factEndDate) {
            if (planEndDate) {
                if (factEndDate <= planEndDate) return '✅ Успеваем';
                else return '⚠️ Отстаём';
            } else return '✅ Завершён (без плана)';
        }
        if (factStartDate) {
            if (planEndDate) {
                if (factStartDate > planEndDate) return '🔴 Просрочен';
                else if (today > planEndDate) return '🔴 Просрочен';
                else return '⏳ В процессе';
            } else return '⏳ В процессе';
        }
        if (planStartDate) {
            if (today > planStartDate) return '🔴 Просрочен';
            else return '⏳ Ожидание';
        }
        return 'Неизвестно';
    } catch { return 'Ошибка дат'; }
}

function getExecutionClass(status) {
    if (status.includes('Успеваем') || status.includes('Завершён')) return 'exec-on-time';
    if (status.includes('Отстаём')) return 'exec-behind';
    if (status.includes('Спешим')) return 'exec-ahead';
    if (status.includes('Просрочен')) return 'exec-overdue';
    if (status.includes('В процессе') || status.includes('Ожидание')) return 'exec-in-progress';
    return 'exec-unknown';
}

async function updateChartAndTable() {
    const allData = await loadAllData();
    const houseIds = Object.keys(allData).filter(k => k !== 'frozen').sort((a,b) => a-b);

    const labels = houseIds.map(id => {
        const data = allData[id];
        return data.name || `Дом #${id}`;
    });
    const floorCounts = houseIds.map(id => {
        return allData[id].floors ? allData[id].floors.length : 0;
    });

    const ctx = document.getElementById('progressChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, '#3498db');
    gradient.addColorStop(1, '#2ecc71');

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Завершённые этапы',
                data: floorCounts,
                backgroundColor: gradient,
                borderColor: '#2980b9',
                borderWidth: 2,
                borderRadius: 6,
                hoverBackgroundColor: '#e67e22',
                hoverBorderColor: '#d35400',
                barPercentage: 0.7,
                categoryPercentage: 0.8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { size: 14, weight: 'bold' }, color: '#2c3e50', usePointStyle: true, pointStyle: 'rectRounded' }
                },
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.95)',
                    titleColor: '#ecf0f1',
                    bodyColor: '#ecf0f1',
                    borderColor: '#3498db',
                    borderWidth: 2,
                    cornerRadius: 10,
                    padding: 16,
                    displayColors: false,
                    callbacks: {
                        title: function(context) { return context[0].label; },
                        label: function(context) {
                            const houseId = context.dataIndex + 1;
                            const data = allData[houseId];
                            if (!data) return '';
                            let lines = [];
                            lines.push(`🏠 ${data.name || `Бастион №${houseId}`}`);
                            let totalShifts = 0, totalWorkers = 0;
                            const floors = data.floors || [];
                            floors.forEach(f => {
                                const shifts = f.shifts || [];
                                totalShifts += shifts.length;
                                shifts.forEach(s => totalWorkers += (s.workers || 0));
                            });
                            lines.push(`⏰ Смен: ${totalShifts}, Человек: ${totalWorkers}`);
                            if (floors.length === 0) {
                                lines.push('📋 Нет этапов');
                            } else {
                                lines.push(`📋 Этапы (${floors.length}):`);
                                floors.forEach((f, idx) => {
                                    const statusText = getStatusText(f.status);
                                    const execStatus = getExecutionStatus(f);
                                    let line = `   ${idx+1}. ${f.name || `Этап ${idx+1}`} ${statusText} | ${execStatus}`;
                                    if (f.description) line += ` — ${f.description}`;
                                    if (f.plan_start) line += ` | План: ${f.plan_start}`;
                                    if (f.plan_end) line += ` → ${f.plan_end}`;
                                    if (f.fact_start) line += ` | Факт: ${f.fact_start}`;
                                    if (f.fact_end) line += ` → ${f.fact_end}`;
                                    const shifts = f.shifts || [];
                                    if (shifts.length) {
                                        const shiftStr = shifts.map(s => `${s.name} (${s.date}): ${s.workers} чел.`).join('; ');
                                        line += ` | Смены: ${shiftStr}`;
                                    }
                                    const planned = f.plannedWorks || [];
                                    const completed = f.completedWorks || [];
                                    if (planned.length) {
                                        const plannedStr = planned.map(p => `${p.name} (${p.quantity} ${p.unit})`).join(', ');
                                        line += ` | План: ${plannedStr}`;
                                    }
                                    if (completed.length) {
                                        const grouped = {};
                                        completed.forEach(cw => {
                                            const id = cw.plannedWorkId;
                                            if (!grouped[id]) grouped[id] = { ...cw, quantity: 0 };
                                            grouped[id].quantity += cw.quantity;
                                        });
                                        const progressStr = Object.values(grouped).map(cw => {
                                            const p = planned.find(pl => pl.id === cw.plannedWorkId);
                                            const name = p ? p.name : (cw.name || 'Работа');
                                            const total = p ? p.quantity : 0;
                                            const unit = p ? p.unit : (cw.unit || '');
                                            return `${name}: ${cw.quantity} из ${total} ${unit}`;
                                        }).join(', ');
                                        line += ` | Выполнено: ${progressStr}`;
                                    }
                                    lines.push(line);
                                });
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 12 }, color: '#7f8c8d' },
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    title: { display: true, text: 'Количество этапов', font: { size: 14, weight: 'bold' }, color: '#2c3e50' }
                },
                x: {
                    grid: { display: false, drawBorder: true, borderColor: '#bdc3c7' },
                    ticks: { font: { size: 12, weight: '600' }, color: '#2c3e50' },
                    title: { display: true, text: 'Объекты', font: { size: 14, weight: 'bold' }, color: '#2c3e50' }
                }
            },
            onAfterDraw: function(chart) {
                const ctx = chart.ctx;
                chart.data.datasets.forEach(function(dataset, i) {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach(function(bar, index) {
                        const data = dataset.data[index];
                        if (data > 0) {
                            ctx.fillStyle = '#2c3e50';
                            ctx.font = 'bold 14px Segoe UI';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(data, bar.x, bar.y - 6);
                        }
                    });
                });
            }
        }
    });

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    houseIds.forEach(id => {
        const data = allData[id];
        const floors = data.floors || [];
        let stagesHtml = '', planDatesHtml = '', factDatesHtml = '', execStatusesHtml = '', plannedWorksHtml = '', completedWorksHtml = '';
        let totalShifts = 0, totalWorkers = 0;
        floors.forEach(f => {
            const shifts = f.shifts || [];
            totalShifts += shifts.length;
            shifts.forEach(s => totalWorkers += (s.workers || 0));
        });

        if (floors.length === 0) {
            stagesHtml = '<span style="color:#999;">—</span>';
            planDatesHtml = '<span style="color:#999;">—</span>';
            factDatesHtml = '<span style="color:#999;">—</span>';
            execStatusesHtml = '<span style="color:#999;">—</span>';
            plannedWorksHtml = '<span style="color:#999;">—</span>';
            completedWorksHtml = '<span style="color:#999;">—</span>';
        } else {
            const stageItems = floors.map(f => {
                const statusText = getStatusText(f.status);
                const statusClass = getStatusClass(f.status);
                return `<span class="stage-item"><span class="status-badge ${statusClass}">${statusText}</span>${f.name ? `<span style="font-weight:500;">${f.name}</span>` : ''}</span>`;
            });
            stagesHtml = stageItems.join(' ');

            const planItems = floors.map(f => {
                let text = '';
                if (f.plan_start) text += f.plan_start;
                if (f.plan_end) text += (text ? ' → ' : '') + f.plan_end;
                return text ? `<span class="date-chip">${text}</span>` : '';
            }).filter(Boolean);
            planDatesHtml = planItems.length ? planItems.join(' ') : '<span style="color:#999;">—</span>';

            const factItems = floors.map(f => {
                let text = '';
                if (f.fact_start) text += f.fact_start;
                if (f.fact_end) text += (text ? ' → ' : '') + f.fact_end;
                return text ? `<span class="date-chip">${text}</span>` : '';
            }).filter(Boolean);
            factDatesHtml = factItems.length ? factItems.join(' ') : '<span style="color:#999;">—</span>';

            const execItems = floors.map(f => {
                const status = getExecutionStatus(f);
                const cls = getExecutionClass(status);
                return `<span class="exec-status ${cls}">${status}</span>`;
            });
            execStatusesHtml = execItems.join(' ');

            const plannedParts = [];
            floors.forEach(f => {
                const planned = f.plannedWorks || [];
                planned.forEach(p => { plannedParts.push(`${p.name} (${p.quantity} ${p.unit})`); });
            });
            plannedWorksHtml = plannedParts.length ? plannedParts.map(p => `<span class="material-chip">${p}</span>`).join(' ') : '<span style="color:#999;">—</span>';

            const completedParts = [];
            floors.forEach(f => {
                const planned = f.plannedWorks || [];
                const completed = f.completedWorks || [];
                const grouped = {};
                completed.forEach(cw => {
                    const id = cw.plannedWorkId;
                    if (!grouped[id]) grouped[id] = { ...cw, quantity: 0 };
                    grouped[id].quantity += cw.quantity;
                });
                Object.values(grouped).forEach(cw => {
                    const plannedWork = planned.find(p => p.id === cw.plannedWorkId);
                    const name = plannedWork ? plannedWork.name : (cw.name || 'Работа');
                    const total = plannedWork ? plannedWork.quantity : 0;
                    const unit = plannedWork ? plannedWork.unit : (cw.unit || '');
                    completedParts.push(`${name}: ${cw.quantity} из ${total} ${unit}`);
                });
            });
            completedWorksHtml = completedParts.length ? completedParts.map(p => `<span class="material-chip">${p}</span>`).join(' ') : '<span style="color:#999;">—</span>';
        }

        let housePlan = '';
        if (data.plan_start) housePlan += data.plan_start;
        if (data.plan_end) housePlan += (housePlan ? ' → ' : '') + data.plan_end;
        if (!housePlan) housePlan = '—';
        let houseFact = '';
        if (data.fact_start) houseFact += data.fact_start;
        if (data.fact_end) houseFact += (houseFact ? ' → ' : '') + data.fact_end;
        if (!houseFact) houseFact = '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="house-id">#${id}</span></td>
            <td class="house-name">${data.name || `Бастион №${id}`}</td>
            <td><span class="date-chip">${housePlan}</span></td>
            <td><span class="date-chip">${houseFact}</span></td>
            <td>${totalShifts}</td>
            <td>${totalWorkers}</td>
            <td>${floors.length}</td>
            <td>${stagesHtml}</td>
            <td>${execStatusesHtml}</td>
            <td>${plannedWorksHtml}</td>
            <td>${completedWorksHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --------------------------------------------------------------
// 9. ЗАМОРОЗКА (серверная)
// --------------------------------------------------------------
async function applyFreezeUI() {
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('drawRoadBtn').style.display = 'none';
    document.getElementById('clearRoadBtn').style.display = 'none';
    document.getElementById('resetHousesBtn').style.display = 'none';
    document.getElementById('freezeBtn').style.display = 'none';
    if (isDrawingRoad) {
        isDrawingRoad = false;
        drawingHint.style.display = 'none';
        drawRoadBtn.textContent = '🛣️ Рисовать дорогу';
        scene.removeEventListener('click', onSceneClick);
        scene.removeEventListener('dblclick', onSceneDblClick);
    }
    recreateHousesWithoutEvents();
}

async function checkFreezeStatus() {
    const data = await loadAllData();
    isFrozen = data.frozen || false;
    if (isFrozen) {
        await applyFreezeUI();
    }
}

document.getElementById('freezeBtn').addEventListener('click', async function() {
    if (isFrozen) return;
    try {
        const resp = await fetch('/api/freeze', { method: 'POST' });
        if (resp.ok) {
            isFrozen = true;
            await applyFreezeUI();
            alert('🔒 Положение домов и дороги заморожено!');
        } else {
            alert('Ошибка при заморозке');
        }
    } catch (e) {
        alert('Ошибка соединения с сервером');
    }
});

// --------------------------------------------------------------
// 10. ИНИЦИАЛИЗАЦИЯ (главная)
// --------------------------------------------------------------
(async function init() {
    await checkFreezeStatus();

    const all = await loadAllData();
    if (Object.keys(all).filter(k => k !== 'frozen').length === 0) {
        const testData = {
            1: { name: 'Бастион №1', plan_start: '2025-01-10', plan_end: '2025-03-01', fact_start: '2025-01-12', fact_end: '', floors: [{ name: 'Фундамент', description: 'Заливка бетона', status: 'completed', plan_start: '2025-01-10', plan_end: '2025-02-15', fact_start: '2025-01-12', fact_end: '2025-02-10', shifts: [{ name: 'Дневная', date: '2025-01-12', workers: 5 }, { name: 'Ночная', date: '2025-01-13', workers: 3 }], plannedWorks: [{ id: 1, name: 'Штукатурка', quantity: 1000, unit: 'м²' }], completedWorks: [{ plannedWorkId: 1, name: 'Штукатурка', unit: 'м²', quantity: 200 }] }] },
            2: { name: 'Бастион №2', plan_start: '2025-02-01', plan_end: '2025-04-01', fact_start: '2025-02-05', fact_end: '', floors: [{ name: 'Подвал', description: 'Гидроизоляция', status: 'in_progress', plan_start: '2025-02-20', plan_end: '2025-03-25', fact_start: '2025-02-22', shifts: [{ name: 'Основная', date: '2025-02-22', workers: 4 }], plannedWorks: [{ id: 2, name: 'Битум', quantity: 50, unit: 'кг' }], completedWorks: [{ plannedWorkId: 2, name: 'Битум', unit: 'кг', quantity: 20 }] }] },
            3: { name: 'Бастион №3', floors: [] },
            4: { name: 'Бастион №4', floors: [] },
            5: { name: 'Бастион №5', floors: [] },
            6: { name: 'Бастион №6', floors: [] },
            7: { name: 'Бастион №7', floors: [] },
            8: { name: 'Бастион №8', floors: [] }
        };
        testData.frozen = false;
        await saveAllData(testData);
    }
    await updateChartAndTable();
    await updateHouseColors();
})();
