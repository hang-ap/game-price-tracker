/**
 * 香港 Game 價紀錄器 - 核心動力腳本 (深/淺雙色切換優化版)
 */

// 1. 立即同步顯示模式 (Dark / Light Mode)
(function() {
    const savedTheme = localStorage.getItem('hk_game_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
})();

// 內置示範數據
const advancedTestTemplate = [
    { 
        name: "魔物獵人 荒野 Monster Hunter Wilds", 
        cover: "https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=150", 
        isBought: false,
        date: 1718788400000, 
        prices: [
            { platform: "ps5", condition: "一手", note: "黃金商場A舖", price: "418" },
            { platform: "ps5", condition: "一手", note: "信和中心地庫", price: "399" }
        ]
    }
];

// 全域狀態初始化
let games = JSON.parse(localStorage.getItem('hk_game_prices_v5')) || advancedTestTemplate;
let currentTab = 'price'; 
let currentViewMode = localStorage.getItem('hk_game_view_mode') || 'list'; 
let currentTheme = localStorage.getItem('hk_game_theme') || 'dark';

let currentActivePriceInput = null;
let touchStartX = 0;
let activeSwipeContainer = null;

// 時間解析格式化
function formatDate(timestamp) {
    if (!timestamp) return '無更新紀錄';
    const d = new Date(timestamp);
    return `📅 Last Update: ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 🚀 核心優化：更精準的 Dark / Light Mode 切換與 Button 文字同步
function initTheme() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) {
            themeBtn.innerText = "☀️ Light Mode";
            themeBtn.style.background = "var(--lime-accent)";
            themeBtn.style.color = "#11120f";
        }
    } else {
        document.body.classList.remove('light-theme');
        if (themeBtn) {
            themeBtn.innerText = "🌙 Dark Mode";
            themeBtn.style.background = "var(--charcoal-dark)";
            themeBtn.style.color = "var(--text-inverse)";
        }
    }
}

function toggleTheme() {
    currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    localStorage.setItem('hk_game_theme', currentTheme);
    initTheme();
}

// 設置排版架構
function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('hk_game_view_mode', mode); 
    
    const listBtn = document.getElementById('btnListView');
    const gridBtn = document.getElementById('btnGridView');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    
    const listEl = document.getElementById('gameList');
    if (listEl) {
        if (mode === 'grid') { listEl.classList.add('grid-view'); } 
        else { listEl.classList.remove('grid-view'); }
    }
    renderGames();
}

// 數據繪製排序：最新排最頂
function renderGames() {
    const listEl = document.getElementById('gameList');
    const tipsEl = document.getElementById('emptyTips');
    if (!listEl || currentTab === 'settings') return;

    listEl.innerHTML = '';
    let hasVisibleGame = false;
    const searchBar = document.getElementById('searchBar');
    const searchKeyword = searchBar ? searchBar.value.toLowerCase().trim() : '';

    games.sort((a, b) => (b.date || 0) - (a.date || 0));

    games.forEach((game, realIndex) => {
        if (currentTab === 'bought' && !game.isBought) return;
        if (currentTab === 'price' && game.isBought) return;
        if (searchKeyword && !game.name.toLowerCase().includes(searchKeyword)) return;

        hasVisibleGame = true;

        const swipeContainer = document.createElement('div');
        swipeContainer.className = 'swipe-container';
        swipeContainer.id = `swipe_id_${realIndex}`;

        const actionBtnHtml = `
            <div class="swipe-action-btn delete" onclick="event.stopPropagation(); deleteGameDirect(${realIndex})">🗑️ 刪除</div>
            <div class="swipe-action-btn edit" onclick="event.stopPropagation(); openEditModal(${realIndex})">📝 編輯</div>
        `;

        let minPriceValue = Infinity;
        let minPriceIndex = -1;

        if (game.prices && game.prices.length > 0) {
            game.prices.forEach((p, pIdx) => {
                if (p.price && p.price.trim() !== "") {
                    const numericPrice = parseFloat(p.price);
                    if (!isNaN(numericPrice) && numericPrice < minPriceValue) {
                        minPriceValue = numericPrice;
                        minPriceIndex = pIdx;
                    }
                }
            });
        }

        let pricesHtml = '';
        if (game.prices && game.prices.length > 0) {
            if (currentViewMode === 'grid') {
                if (minPriceIndex !== -1 && minPriceValue !== Infinity) {
                    const p = game.prices[minPriceIndex];
                    pricesHtml = `
                        <div class="main-price-item cheapest-row" style="justify-content: center; margin-top: auto;">
                            <span class="platform-badge badge-${p.platform}">${p.platform}</span>
                            <span class="price-num is-cheapest" style="margin-left: 4px;">$${p.price}</span>
                        </div>
                    `;
                } else {
                    const p = game.prices[0];
                    pricesHtml = `
                        <div class="main-price-item" style="justify-content: center; margin-top: auto;">
                            <span class="platform-badge badge-${p.platform}">${p.platform}</span>
                            <span class="price-num" style="margin-left: 4px;">$${p.price || '-'}</span>
                        </div>
                    `;
                }
            } else {
                game.prices.forEach((p, pIdx) => {
                    const condClass = p.condition === '二手' ? 'badge-used' : 'badge-new';
                    const isCheapest = (pIdx === minPriceIndex && minPriceValue !== Infinity);
                    const cheapestRowClass = isCheapest ? 'cheapest-row' : '';
                    const cheapestNumClass = isCheapest ? 'is-cheapest' : '';
                    const cheapestBadge = isCheapest ? '★ ' : '';

                    pricesHtml += `
                        <div class="main-price-item ${cheapestRowClass}">
                            <div>
                                <span class="platform-badge badge-${p.platform}">${p.platform}</span>
                                <span class="condition-badge ${condClass}">${p.condition || '一手'}</span>
                                <span class="price-source">${p.note || ''}</span>
                            </div>
                            <span class="price-num ${cheapestNumClass}">${cheapestBadge}$${p.price || '-'}</span>
                        </div>
                    `;
                });
            }
        } else {
            pricesHtml = `<div class="price-source" style="${currentViewMode === 'grid' ? 'text-align:center;' : ''}">無價格紀錄</div>`;
        }

        const coverHtml = game.cover 
            ? `<img src="${game.cover}" class="game-cover-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
               <span class="game-cover-placeholder" style="display:none;">🎮</span>`
            : `<span class="game-cover-placeholder">🎮</span>`;

        swipeContainer.innerHTML = `
            ${actionBtnHtml}
            <div class="game-row" id="row_id_${realIndex}" 
                 ontouchstart="handleTouchStart(event)" 
                 ontouchmove="handleTouchMove(event, ${realIndex})" 
                 ontouchend="handleTouchEnd(event, ${realIndex})">
                <div class="game-cover-wrapper">${coverHtml}</div>
                <div class="game-right-info">
                    <div class="game-row-title">${game.name}</div>
                    <span class="game-row-date">${formatDate(game.date)}</span>
                    <div class="game-row-prices-container">${pricesHtml}</div>
                </div>
            </div>
        `;
        listEl.appendChild(swipeContainer);
    });

    if (tipsEl) {
        if (!hasVisibleGame) {
            tipsEl.style.display = 'block';
        } else {
            tipsEl.style.display = 'none';
        }
    }
}

// 切換分頁
function switchTab(tab) {
    currentTab = tab;
    
    document.getElementById('btnTabPrice').classList.toggle('active', tab === 'price');
    document.getElementById('btnTabBought').classList.toggle('active', tab === 'bought');
    document.getElementById('btnTabSettings').classList.toggle('active', tab === 'settings');
    
    const gameListEl = document.getElementById('gameList');
    const viewToggleEl = document.getElementById('viewToggleArea');
    const settingsPageEl = document.getElementById('settingsPage');
    const tipsEl = document.getElementById('emptyTips');
    const bottomBarEl = document.getElementById('bottomActionBar');
    const searchContainerEl = document.getElementById('searchContainer');

    if (tab === 'settings') {
        if (gameListEl) gameListEl.style.display = 'none';
        if (viewToggleEl) viewToggleEl.style.display = 'none';
        if (searchContainerEl) searchContainerEl.style.display = 'none'; 
        if (tipsEl) tipsEl.style.display = 'none';
        if (bottomBarEl) bottomBarEl.style.display = 'none';
        if (settingsPageEl) settingsPageEl.style.display = 'flex';
    } else {
        if (settingsPageEl) settingsPageEl.style.display = 'none';
        if (searchContainerEl) searchContainerEl.style.display = 'block'; 
        if (gameListEl) gameListEl.style.display = (currentViewMode === 'grid') ? 'grid' : 'flex';
        if (viewToggleEl) viewToggleEl.style.display = 'flex';
        if (bottomBarEl) bottomBarEl.style.display = (tab === 'bought') ? 'none' : 'flex'; 
        if (activeSwipeContainer) activeSwipeContainer = null;
        renderGames();
    }
}

// iOS 微滑動交互手勢
function handleTouchStart(e) {
    if (currentViewMode === 'grid') return;
    if (activeSwipeContainer) {
        const openRow = activeSwipeContainer.querySelector('.game-row');
        if (openRow) openRow.style.transform = 'translateX(0px)';
    }
    touchStartX = e.touches[0].clientX;
}

function handleTouchMove(e, index) {
    if (currentViewMode === 'grid') return;
    const currentX = e.touches[0].clientX;
    const diffX = touchStartX - currentX; 
    const row = document.getElementById(`row_id_${index}`);

    if (!row) return;

    if (diffX > 10) { 
        const moveX = Math.min(diffX, 80);
        row.style.transform = `translateX(-${moveX}px)`;
        e.preventDefault();
    } else if (diffX < -10) { 
        const moveX = Math.min(Math.abs(diffX), 80);
        row.style.transform = `translateX(${moveX}px)`;
        e.preventDefault();
    }
}

function handleTouchEnd(e, index) {
    if (currentViewMode === 'grid') return;
    const row = document.getElementById(`row_id_${index}`);
    const container = document.getElementById(`swipe_id_${index}`);
    if (!row || !container) return;
    
    const currentX = e.changedTouches[0].clientX;
    const diffX = touchStartX - currentX;

    if (diffX > 40) {
        row.style.transform = 'translateX(-80px)';
        activeSwipeContainer = container;
    } else if (diffX < -40) {
        row.style.transform = 'translateX(80px)';
        activeSwipeContainer = container;
    } else {
        row.style.transform = 'translateX(0px)';
        activeSwipeContainer = null;
    }
    touchStartX = 0;
}

// 數據備份還原
function openBackupModal() {
    const jsonStr = JSON.stringify(games, null, 2);
    document.getElementById('backupModalTitle').innerText = "本地名單數據匯出備份";
    const textarea = document.getElementById('backupTextarea');
    if (textarea) {
        textarea.value = jsonStr;
        textarea.readOnly = true; 
    }
    document.getElementById('btnCopyBackup').style.display = 'block';
    document.getElementById('btnConfirmRestore').style.display = 'none';
    document.getElementById('backupModal').style.display = 'flex';
}

function openRestoreModal() {
    document.getElementById('backupModalTitle').innerText = "導入外部數據清單還原";
    const textarea = document.getElementById('backupTextarea');
    if (textarea) {
        textarea.value = '';
        textarea.readOnly = false; 
        textarea.placeholder = "請貼上你之前備份產生的 JSON 字串數據...";
    }
    document.getElementById('btnCopyBackup').style.display = 'none';
    document.getElementById('btnConfirmRestore').style.display = 'block';
    document.getElementById('backupModal').style.display = 'flex';
}

function closeBackupModal() { document.getElementById('backupModal').style.display = 'none'; }

function copyBackupData() {
    const textarea = document.getElementById('backupTextarea');
    if (!textarea) return;
    textarea.select();
    navigator.clipboard.writeText(textarea.value).then(() => {
        alert('📋 複製成功！請妥善粘貼保存於備忘錄中。');
    }).catch(() => { alert('請手動全選進行複製。'); });
}

function confirmRestoreData() {
    const textarea = document.getElementById('backupTextarea');
    if (!textarea) return;
    const inputTxt = textarea.value.trim();
    if (!inputTxt) { alert('請先貼上備份數據！'); return; }
    try {
        const parsedData = JSON.parse(inputTxt);
        if (Array.isArray(parsedData)) {
            if (confirm('⚠️ 警告：此動作將完全覆蓋當前手機上的數據。確定執行？')) {
                games = parsedData;
                localStorage.setItem('hk_game_prices_v5', JSON.stringify(games));
                closeBackupModal();
                if (document.getElementById('searchBar')) document.getElementById('searchBar').value = '';
                switchTab('price'); 
                alert('🎉 數據還原覆蓋成功！');
            }
        } else { alert('❌ 格式校驗錯誤：不符合名單標準。'); }
    } catch (error) { alert('❌ 解析失敗：\n' + error.message); }
}

function updateScraperLinks() {
    const gName = document.getElementById('gName');
    const fullName = gName ? gName.value.trim() : '';
    const googleLnk = document.getElementById('lnkGoogle');
    if (!googleLnk) return;
    if (!fullName) { googleLnk.href = "#"; return; }
    googleLnk.href = `https://www.google.com/search?q=${encodeURIComponent(fullName + " 香港 價錢")}`;
}

// 價格操作器
function addPriceRow(platform = 'switch', condition = '一手', note = '', price = '') {
    const area = document.getElementById('dynamicPriceArea');
    if (!area) return { inputPrice: null, id: null };
    const rowId = 'p_row_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const rowDiv = document.createElement('div');
    rowDiv.className = 'edit-price-row';
    rowDiv.id = rowId;
    const btnClass = condition === '二手' ? 'toggle-used' : 'toggle-new';

    rowDiv.innerHTML = `
        <select class="select-platform">
            <option value="switch" ${platform==='switch'?'selected':''}>Switch</option>
            <option value="ps5" ${platform==='ps5'?'selected':''}>PS5</option>
            <option value="ps4" ${platform==='ps4'?'selected':''}>PS4</option>
            <option value="xbox" ${platform==='xbox'?'selected':''}>Xbox</option>
            <option value="pc" ${platform==='pc'?'selected':''}>PC</option>
        </select>
        <button type="button" class="btn-toggle-condition ${btnClass}" onclick="toggleCondition(this)">${condition}</button>
        <input type="text" class="input-note" placeholder="店舖/備註" value="${note}" onfocus="hideCustomKeyboard()">
        <input type="text" class="input-price" placeholder="價錢" value="${price}" readonly onclick="activatePriceKeyboard(this, '${rowId}')">
        <button type="button" class="btn-remove-price" onclick="document.getElementById('${rowId}').remove()">🗑️</button>
    `;
    area.appendChild(rowDiv);
    return { inputPrice: rowDiv.querySelector('.input-price'), id: rowId };
}

function addPriceRowWithScroll(platform, condition, note, price) {
    const rowInfo = addPriceRow(platform, condition, note, price);
    if (!rowInfo.id) return;
    setTimeout(() => {
        if (document.getElementById('modalBody')) document.getElementById('modalBody').style.paddingBottom = '340px';
        const targetRow = document.getElementById(rowInfo.id);
        if (targetRow) targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        activatePriceKeyboard(rowInfo.inputPrice, rowInfo.id);
    }, 100);
}

function toggleCondition(btn) {
    if (btn.innerText === '一手') {
        btn.innerText = '二手'; btn.classList.remove('toggle-new'); btn.classList.add('toggle-used');
    } else {
        btn.innerText = '一手'; btn.classList.remove('toggle-used'); btn.classList.add('toggle-new');
    }
}

function activatePriceKeyboard(inputEl, rowId) {
    document.querySelectorAll('.edit-price-row').forEach(el => el.classList.remove('active-row'));
    currentActivePriceInput = inputEl;
    const row = document.getElementById(rowId);
    if (row) row.classList.add('active-row');
    
    if (document.getElementById('btnMainSubmit')) document.getElementById('btnMainSubmit').style.display = 'none';
    if (document.getElementById('customKeyboard')) document.getElementById('customKeyboard').style.display = 'grid'; 
    if (document.getElementById('modalBody')) document.getElementById('modalBody').style.paddingBottom = '340px';
    
    document.activeElement.blur();
    setTimeout(() => { if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
}

function hideCustomKeyboard() {
    if (document.getElementById('customKeyboard')) document.getElementById('customKeyboard').style.display = 'none'; 
    if (document.getElementById('btnMainSubmit')) document.getElementById('btnMainSubmit').style.display = 'block'; 
    document.querySelectorAll('.edit-price-row').forEach(el => el.classList.remove('active-row'));
    currentActivePriceInput = null;
    if (document.getElementById('modalBody')) document.getElementById('modalBody').style.paddingBottom = '30px';
}

function handleKeyPress(e, key) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!currentActivePriceInput) return;
    if (key === 'BACK') { currentActivePriceInput.value = currentActivePriceInput.value.slice(0, -1); } 
    else if (key === 'CLEAR') { currentActivePriceInput.value = ''; } 
    else {
        if (currentActivePriceInput.value === '0') currentActivePriceInput.value = '';
        currentActivePriceInput.value += key;
    }
}

function handleKeyDone(e) { if (e) { e.preventDefault(); e.stopPropagation(); } hideCustomKeyboard(); }

function openAddModal() {
    document.getElementById('modalTitle').innerText = "新增遊戲紀錄";
    document.getElementById('editIndex').value = "";
    document.getElementById('gIsBought').value = "false"; 
    document.getElementById('dynamicPriceArea').innerHTML = '';
    document.getElementById('gameForm').reset();
    updateScraperLinks();
    document.getElementById('gameModal').style.display = 'flex';
    addPriceRow('switch', '一手', '', '');
    hideCustomKeyboard();
}

function openEditModal(index) {
    const row = document.getElementById(`row_id_${index}`);
    if (row) row.style.transform = 'translateX(0px)';
    activeSwipeContainer = null;

    const game = games[index];
    document.getElementById('modalTitle').innerText = "修改格價資料";
    document.getElementById('editIndex').value = index;
    document.getElementById('gName').value = game.name;
    document.getElementById('gCover').value = game.cover || '';
    document.getElementById('gIsBought').value = game.isBought ? "true" : "false";
    updateScraperLinks();

    const priceArea = document.getElementById('dynamicPriceArea');
    if (priceArea) {
        priceArea.innerHTML = '';
        if (game.prices && game.prices.length > 0) {
            game.prices.forEach(p => { addPriceRow(p.platform, p.condition || '一手', p.note, p.price); });
        } else {
            addPriceRow('switch', '一手', '', '');
        }
    }
    document.getElementById('gameModal').style.display = 'flex';
    hideCustomKeyboard(); 
}

function closeModal() { 
    document.getElementById('gameModal').style.display = 'none'; 
    hideCustomKeyboard(); 
    renderGames();
}

function handleFormSubmit() {
    const name = document.getElementById('gName').value.trim();
    if (!name) { alert('請輸入有效遊戲名稱！'); return; }

    const priceRows = document.querySelectorAll('.edit-price-row');
    const pricesData = [];
    priceRows.forEach(row => {
        const platform = row.querySelector('.select-platform').value;
        const condition = row.querySelector('.btn-toggle-condition').innerText;
        const note = row.querySelector('.input-note').value.trim();
        const price = row.querySelector('.input-price').value.trim();
        pricesData.push({ platform, condition, note, price });
    });
    
    const index = document.getElementById('editIndex').value;
    const statusBought = (document.getElementById('gIsBought').value === "true");
    const coverVal = document.getElementById('gCover').value.trim();
    
    if (index === "") {
        games.push({ name: name, cover: coverVal, isBought: statusBought, date: Date.now(), prices: pricesData }); 
    } else {
        games[index].name = name;
        games[index].cover = coverVal;
        games[index].isBought = statusBought;
        games[index].date = Date.now(); 
        games[index].prices = pricesData;
    }

    localStorage.setItem('hk_game_prices_v5', JSON.stringify(games));
    if (document.getElementById('searchBar')) document.getElementById('searchBar').value = '';
    switchTab(currentTab); 
    closeModal();
}

function deleteGameDirect(index) {
    const row = document.getElementById(`row_id_${index}`);
    if (confirm(`確定要將 "${games[index].name}" 自手機中刪除？`)) {
        games.splice(index, 1);
        localStorage.setItem('hk_game_prices_v5', JSON.stringify(games));
        renderGames();
    } else {
        if (row) row.style.transform = 'translateX(0px)';
    }
    activeSwipeContainer = null;
}

// 綁定生命週期 Hook
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setViewMode(currentViewMode);
});

window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => { loader.style.visibility = 'hidden'; }, 300);
        }
    }, 600);
});