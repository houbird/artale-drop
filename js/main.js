import { highlight, isBoss, getDisplayName, matchesKeyword } from "./helpers.js";

const state = {
  dropData: {},
  mobData: {},
  nameToIdMap: {},
  bossTime: {},
  spawnMap: {},
  area: {},
  aliasMap: {},
  selectedRegions: new Set(),
  selectedResistances: new Set(),
  currentEntries: [],
  currentPage: 0,
  pageSize: getPageSize(),
};

const els = {
  search: document.getElementById('search'),
  minLv: document.getElementById('min-lv'),
  maxLv: document.getElementById('max-lv'),
  container: document.getElementById('drop-container'),
  resultInfo: document.getElementById('result-info'),
  toggleFiltered: document.getElementById('toggle-filtered'),
  toggleNameHover: document.getElementById('toggle-name-hover'),
  regionBoxes: document.getElementById('region-checkboxes'),
  resistanceBoxes: document.getElementById('resistance-checkboxes'),
};

function getPageSize() {
  const w = window.innerWidth;
  if (w >= 3840) return 40;
  if (w >= 2560) return 30;
  if (w >= 1536) return 25;
  if (w >= 1280) return 20;
  return 14;
}

window.addEventListener('resize', () => {
  state.pageSize = getPageSize();
});

async function loadData() {
  const [drop, mob, itemMap, boss, mapData, mapExc, area, alias] = await Promise.all([
    fetch('drop_data.json').then(r => r.json()),
    fetch('mob.json').then(r => r.json()),
    fetch('item.json').then(r => r.json()),
    fetch('boss_time.json').then(r => r.json()),
    fetch('map.json').then(r => r.json()),
    fetch('map_exception.json').then(r => r.json()),
    fetch('area.json').then(r => r.json()),
    fetch('alias.json').then(r => r.json()),
  ]);

  state.bossTime = boss;
  state.mobData = mob;
  state.area = area;
  state.aliasMap = alias;

  state.nameToIdMap = Object.fromEntries(
    Object.entries(itemMap).map(([id, name]) => [name, id])
  );

  state.spawnMap = buildSpawnMap(mapData, mapExc);

  state.dropData = Object.fromEntries(
    Object.entries(drop).map(([monster, items]) => {
      const sorted = items.slice().sort((a, b) => {
        const aId = parseInt(state.nameToIdMap[a] ?? '0');
        const bId = parseInt(state.nameToIdMap[b] ?? '0');
        const aEquip = isEquip(aId);
        const bEquip = isEquip(bId);
        if (aEquip && !bEquip) return -1;
        if (!aEquip && bEquip) return 1;
        return (aId || 0) - (bId || 0);
      });
      return [monster, sorted];
    })
  );

  initRegions();
  initResistances();
  refresh();
}

function buildSpawnMap(mapData, mapExc) {
  const result = {};
  for (const [monster, maps] of Object.entries(mapData)) {
    const obj = {};
    for (const [mapName, value] of Object.entries(maps)) {
      if (mapExc[mapName] !== undefined) {
        if (mapExc[mapName] !== 'INVALID') obj[mapExc[mapName]] = value;
        continue;
      }
      const [region, ...rest] = mapName.split('：');
      if (mapExc[region] === 'INVALID') continue;
      const correctRegion = mapExc[region] || region;
      const correctName = [correctRegion, ...rest].join('：');
      obj[correctName] = value;
    }
    if (Object.keys(obj).length) result[monster] = obj;
  }
  return result;
}

function initRegions() {
  const regions = new Set();
  Object.values(state.spawnMap).forEach(maps => {
    Object.keys(maps).forEach(m => regions.add(m.split('：')[0]));
  });
  for (const [region, def] of Object.entries(state.area)) {
    if (!regions.has(region)) continue;
    const label = document.createElement('label');
    label.style.marginRight = '8px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = region;
    cb.checked = def === 1;
    if (cb.checked) state.selectedRegions.add(region);
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedRegions.add(region);
      else state.selectedRegions.delete(region);
      refresh();
    });
    label.append(cb, ` ${region}`);
    els.regionBoxes.appendChild(label);
  }
}

function initResistances() {
  const labels = { H: '聖', F: '火', I: '冰', S: '毒', L: '雷' };
  const values = { '3': '加成' };
  const types = new Set();
  Object.values(state.mobData).forEach(info => {
    const res = info[9];
    if (!res || res === 'ALL2') return;
    let i = 0;
    while (i < res.length) {
      if (res[i] === 'H' && res[i + 1] === 'S') {
        types.add('HS');
        i += 2;
        continue;
      }
      const type = res[i];
      const val = res[i + 1];
      if (type === 'P' || val !== '3') { i += 2; continue; }
      if (labels[type] && values[val]) types.add(`${type}${val}`);
      i += 2;
    }
  });

  const order = { F3:1, S3:2, I3:3, L3:4, H3:5, HS:6 };
  [...types].sort((a,b)=>(order[a]||99)-(order[b]||99)).forEach(res => {
    const label = document.createElement('label');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.value = res;
    btn.textContent = res === 'HS' ? '可治癒' : `${labels[res[0]]}${values[res[1]]}`;
    btn.addEventListener('click', () => {
      if (btn.classList.toggle('selected')) state.selectedResistances.add(res);
      else state.selectedResistances.delete(res);
      refresh();
    });
    label.appendChild(btn);
    els.resistanceBoxes.appendChild(label);
  });
}

function updateResultInfo() {
  const total = state.currentEntries.length;
  const loaded = els.container.querySelectorAll('.monster-card').length;
  const remain = Math.max(0, total - loaded);
  if (els.resultInfo)
    els.resultInfo.textContent = `總數 ${total}，已載入 ${loaded}，未載入 ${remain}`;
}

function filterRegion(monster) {
  const maps = state.spawnMap[monster];
  if (!maps || state.selectedRegions.size === 0) return true;
  return Object.keys(maps).some(map => state.selectedRegions.has(map.split('：')[0]));
}

function filterResistance(monster) {
  if (state.selectedResistances.size === 0) return true;
  const res = state.mobData[monster]?.[9];
  if (!res) return false;
  const needed = [...state.selectedResistances];
  let i = 0;
  const found = new Set();
  while (i < res.length) {
    if (res[i] === 'H' && res[i+1] === 'S') {
      if (needed.includes('HS')) found.add('HS');
      i += 2; continue;
    }
    const pair = res[i]+res[i+1];
    if (needed.includes(pair)) found.add(pair);
    i += 2;
  }
  return needed.every(n => found.has(n));
}

function applyFilters() {
  const keyword = els.search.value.trim();
  const minLv = parseInt(els.minLv.value) || 0;
  const maxLv = parseInt(els.maxLv.value) || Infinity;

  state.currentEntries = Object.entries(state.dropData).filter(([monster, items]) => {
    const lv = state.mobData[monster]?.[0] ?? 0;
    if (lv < minLv || lv > maxLv) return false;
    if (!filterRegion(monster)) return false;
    if (!filterResistance(monster)) return false;
    if (!keyword) return true;
    const monsterMatch = matchesKeyword(monster, keyword, state.aliasMap, state.bossTime);
    const matched = items.some(item => matchesKeyword(item, keyword, state.aliasMap, state.bossTime));
    return monsterMatch || matched;
  });

  state.currentPage = 0;
}

function renderNextPage() {
  const start = state.currentPage * state.pageSize;
  const slice = state.currentEntries.slice(start, start + state.pageSize);
  if (!slice.length) return updateResultInfo();

  const frag = document.createDocumentFragment();
  slice.forEach(([monster, items]) => frag.appendChild(renderCard(monster, items)));
  els.container.appendChild(frag);
  state.currentPage++;
  updateResultInfo();
}

function renderCard(monster, items) {
  const frag = document.createElement('div');
  frag.className = 'monster-card';

  const img = document.createElement('img');
  img.src = `image/${encodeURIComponent(monster)}.png`;
  img.loading = 'lazy';
  img.alt = monster;
  img.className = 'monster-image';
  frag.appendChild(img);

  const title = document.createElement('div');
  title.className = 'monster-name';
  title.innerHTML = highlight(getDisplayName(monster, state.aliasMap, state.bossTime), els.search.value.trim());
  frag.appendChild(title);

  if (state.mobData[monster]) {
    frag.appendChild(buildAttr(monster));
  }

  const onlyMatched = els.toggleFiltered.checked && els.search.value.trim();
  const itemsToShow = onlyMatched ? items.filter(i => matchesKeyword(i, els.search.value.trim(), state.aliasMap, state.bossTime)) : items;
  frag.appendChild(buildItems(itemsToShow));

  return frag;
}

function buildAttr(monster) {
  const [lv,hp,mp,exp,pdef,mdef,eva,acc] = state.mobData[monster];
  const res = state.mobData[monster][9];
  const container = document.createElement('div');
  container.className = 'monster-attr';

  container.appendChild(createAttrBox(`等級：${lv}`, true));
  container.appendChild(createAttrBox(formatHP(hp)));
  container.appendChild(createAttrBox(`MP：${mp}`));
  container.appendChild(createAttrBox(`經驗：${exp}`));
  container.appendChild(createAttrBox(`迴避：${eva}`));
  container.appendChild(createAttrBox(`物理防禦：${pdef}`));
  container.appendChild(createAttrBox(`魔法防禦：${mdef}`));
  container.appendChild(createAttrBox(`命中需求：${acc}`, true));

  const resBox = buildResistance(res);
  if (resBox) container.appendChild(resBox);

  const maps = state.spawnMap[monster];
  if (maps) container.appendChild(buildSpawn(maps));

  if (state.bossTime[monster]) {
    container.appendChild(createAttrBox(`重生時間：${state.bossTime[monster]}`, true));
  }
  return container;
}

function formatHP(hp) {
  if (String(hp).includes('(')) {
    const formatted = String(hp).replace('(', '<br><span style="font-size:0.9em">(');
    return `HP：${formatted}</span>`;
  }
  return `HP：${hp}`;
}

function createAttrBox(text, full=false) {
  const div = document.createElement('div');
  div.className = 'attr-box' + (full ? ' fullwidth' : '');
  if (text.includes('<br') || text.includes('<span')) {
    div.innerHTML = text;
    div.style.whiteSpace = 'normal';
    div.style.lineHeight = '1.4';
  } else {
    div.textContent = text;
  }
  return div;
}

function buildResistance(resText) {
  if (!resText) return null;
  const buffList = [];
  const resistList = [];
  if (resText === 'ALL2') {
    const span = document.createElement('span');
    span.className = 'resistance-tag resistance-all2';
    span.textContent = '物攻/魔法屬性減半';
    resistList.push(span.outerHTML);
  } else {
    for (let i=0;i<resText.length;) {
      if (resText[i]==='H' && resText[i+1]==='S') {
        const span=document.createElement('span');
        span.className='resistance-tag resistance-heal';
        span.textContent='可治癒';
        buffList.push(span.outerHTML); i+=2; continue;
      }
      const type=resText[i], val=resText[i+1];
      const tMap={H:['聖','holy'],F:['火','fire'],I:['冰','ice'],S:['毒','poison'],L:['雷','lightning']};
      const vMap={1:'無效',2:'減半',3:'加成'};
      if(tMap[type]&&vMap[val]){
        const span=document.createElement('span');
        span.className=`resistance-tag resistance-${tMap[type][1]}`;
        span.textContent=`${tMap[type][0]}${vMap[val]}`;
        (val==='3'?buffList:resistList).push(span.outerHTML);
      }
      i+=2;
    }
  }
  if(!buffList.length && !resistList.length) return null;
  const box=document.createElement('div');
  box.className='attr-box fullwidth';
  if(buffList.length){
    const div=document.createElement('div');
    div.style.marginBottom='4px';
    div.style.display='flex';
    div.style.alignItems='center';
    div.style.gap='8px';
    div.style.flexWrap='wrap';
    div.style.justifyContent='center';
    const t=document.createElement('span');
    t.textContent='屬性加成：';
    const tags=document.createElement('div');
    tags.style.display='flex';
    tags.style.flexWrap='wrap';
    tags.style.gap='4px';
    tags.style.justifyContent='center';
    tags.style.flex='1';
    tags.innerHTML=buffList.join('');
    div.append(t,tags);
    box.appendChild(div);
  }
  if(resistList.length){
    const div=document.createElement('div');
    div.style.display='flex';
    div.style.alignItems='center';
    div.style.gap='8px';
    div.style.flexWrap='wrap';
    div.style.justifyContent='center';
    const t=document.createElement('span');
    t.textContent='屬性抗性：';
    const tags=document.createElement('div');
    tags.style.display='flex';
    tags.style.flexWrap='wrap';
    tags.style.gap='4px';
    tags.style.justifyContent='center';
    tags.style.flex='1';
    tags.innerHTML=resistList.join('');
    div.append(t,tags);
    box.appendChild(div);
  }
  return box;
}

function buildSpawn(maps) {
  const mapList = Object.keys(maps);
  const summary = `出沒地圖（${mapList.length}張）`;
  const box = document.createElement('div');
  box.className='attr-box fullwidth';
  box.style.cursor='pointer';
  const summarySpan=document.createElement('span');
  summarySpan.textContent='▶ '+summary;
  summarySpan.style.userSelect='none';
  summarySpan.style.cursor='pointer';
  const detailSpan=document.createElement('span');
  detailSpan.innerHTML=mapList.map(m=>`<div style='text-align:left' class="map-name">${m.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('');
  detailSpan.style.display='none';
  detailSpan.style.marginTop='0.5em';
  detailSpan.style.marginLeft='0.5em';
  detailSpan.style.color='#aaa';
  detailSpan.style.userSelect='text';
  box.append(summarySpan,detailSpan);
  box.addEventListener('click',e=>{
    if(window.getSelection().toString()||e.target.classList.contains('map-name'))return;
    e.stopPropagation();
    const show=detailSpan.style.display==='block';
    detailSpan.style.display=show?'none':'block';
    summarySpan.textContent=(show?'▶ ':'▼ ')+summary;
  });
  return box;
}

function buildItems(items) {
  const onlyImage = els.toggleNameHover.checked;
  const container = document.createElement('div');
  if (onlyImage) container.className = 'only-image-mode';

  const groups = {equip:[],use:[],etc:[],other:[]};
  items.forEach(item => {
    const div=document.createElement('div');
    div.className=onlyImage?'hide-text':'item';
    const img=document.createElement('img');
    img.src=`image/${encodeURIComponent(item)}.png`;
    img.loading='lazy';
    img.alt=item;
    img.className='item-icon';
    const id=parseInt(state.nameToIdMap[item]??'0');
    const equip=isEquip(id);
    if(els.search.value.trim()&&matchesKeyword(item,els.search.value.trim(),state.aliasMap,state.bossTime))
      img.classList.add('highlighted');
    const span=document.createElement('span');
    span.innerHTML=highlight(getDisplayName(item,state.aliasMap,state.bossTime),els.search.value.trim());
    const a=document.createElement('a');
    a.href=`https://maplesaga.com/library/cn/permalink/${equip?'equip':'item'}/${id}`;
    a.target='_blank';
    a.style.color='inherit';
    a.style.textDecoration='none';
    a.append(img,span);
    div.appendChild(a);
    if(equip) groups.equip.push(div);
    else if(id>=2000000 && id<=2999999) groups.use.push(div);
    else if(id>=4000000 && id<=4999999) groups.etc.push(div);
    else groups.other.push(div);
  });

  const addGroup=(arr,border)=>{
    if(!arr.length) return;
    const box=document.createElement('div');
    box.style.border=`1px solid ${border}`;
    box.style.padding='4px';
    box.style.marginBottom='6px';
    arr.forEach(i=>box.appendChild(i));
    container.appendChild(box);
  };

  addGroup(groups.equip,'#42aaff');
  addGroup(groups.use,'#42ff42');
  addGroup(groups.etc,'#ffaa42');
  groups.other.forEach(i=>container.appendChild(i));

  return container;
}

function isEquip(id){
  return (id>=1000001 && id<=1999999)||(id>=2060000 && id<=2079999)||(id>=2330000 && id<=2339999);
}

function refresh() {
  els.container.innerHTML = '';
  applyFilters();
  renderNextPage();
}

window.addEventListener('scroll', () => {
  const top = window.pageYOffset || document.documentElement.scrollTop;
  const disclaimer = document.querySelector('.disclaimer');
  if (top <= 0) disclaimer.classList.remove('hidden');
  else if (top > (window.lastScrollTop || 0)) disclaimer.classList.add('hidden');
  const distance = document.documentElement.scrollHeight - (top + window.innerHeight);
  if (distance <= window.innerHeight) renderNextPage();
  window.lastScrollTop = top;
});

els.search.addEventListener('input', debounce(refresh, 300));
els.toggleFiltered.addEventListener('change', debounce(refresh, 300));
els.toggleNameHover.addEventListener('change', debounce(refresh, 300));
els.minLv.addEventListener('input', debounce(refresh, 300));
els.maxLv.addEventListener('input', debounce(refresh, 300));

document.getElementById('share-btn').addEventListener('click', () => {
  const url = new URL(window.location.href);
  url.searchParams.set('searchkey', els.search.value);
  navigator.clipboard.writeText(url.toString()).then(() => alert('已複製分享連結！'));
});

function debounce(fn, delay){
  let timer; return (...args)=>{clearTimeout(timer); timer=setTimeout(()=>fn.apply(this,args), delay);};
}

loadData().catch(e=>{
  els.container.textContent = '載入失敗：' + e;
});
