/**
 * 🚀 香港 Game 價紀錄器 - Firebase + 訪客獨立沙盒模組化引擎 (v10+ 穩定快載版)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFJcMizl3CeAfzY5PgWKTzfDEPtqV552E",
  authDomain: "game-tracker-web-6c537.firebaseapp.com",
  projectId: "game-tracker-web-6c537",
  storageBucket: "game-tracker-web-6c537.firebasestorage.app",
  messagingSenderId: "1055963907479",
  appId: "1:1055963907479:web:de5ef583bb3e7bf598f0d2",
  measurementId: "G-2YLL05DKFV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 🚀 核心控制旗標：追蹤當前是否為「離線訪客模式」
let isGuestMode = false;     

let games = [];              
let currentUser = null;      
let unsubscribeFirestore = null; 
let isSignUpMode = false;    

let currentTab = 'price'; 
let currentViewMode = localStorage.getItem('hk_game_view_mode') || 'list'; 
let currentTheme = localStorage.getItem('hk_game_theme') || 'dark';

let currentActivePriceInput = null;
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;
let blockClickUntil = 0; 
let activeSwipeContainer = null;

(function() {
    const savedTheme = localStorage.getItem('hk_game_theme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-theme');
})();

function formatDate(timestamp) {
    if (!timestamp) return '無更新紀錄';
    const d = new Date(timestamp);
    return `📅 Last Update: ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Firebase 狀態核心監聽器
onAuthStateChanged(auth, (user) => {
    // 🚀 安全阻斷器：如果使用者主動選擇了訪客模式，不允許 Firebase 自動覆蓋狀態
    if (isGuestMode) return;

    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const displayEmail = document.getElementById('displayUserEmail');
    const userAvatar = document.getElementById('userAvatarIcon');
    const statusLabel = document.getElementById('userStatusLabel');
    const logoutLabel = document.getElementById('logoutLabel');

    if (user) {
        currentUser = user;
        isGuestMode = false;
        if (displayEmail) displayEmail.innerText = user.email;
        if (userAvatar) userAvatar.innerText = "👤";
        if (statusLabel) statusLabel.innerText = "Logged In As";
        if (logoutLabel) logoutLabel.innerText = "退出目前的雲端登入狀態";
        
        if (authScreen) authScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        startFirestoreListener(user.uid);
    } else {
        currentUser = null;
        if (unsubscribeFirestore) { unsubscribeFirestore(); unsubscribeFirestore = null; }
        games = [];
        if (appContainer) appContainer.style.display = 'none';
        if (authScreen) authScreen.style.display = 'flex';
        hideLoadingOverlay(); 
    }
});

// 🚀 [新設] 訪客模式激活入口
function handleGuestMode() {
    isGuestMode = true;
    currentUser = null;
    if (unsubscribeFirestore) { unsubscribeFirestore(); unsubscribeFirestore = null; }

    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const displayEmail = document.getElementById('displayUserEmail');
    const userAvatar = document.getElementById('userAvatarIcon');
    const statusLabel = document.getElementById('userStatusLabel');
    const logoutLabel = document.getElementById('logoutLabel');

    // UI 轉向提示為本地單機版
    if (displayEmail) displayEmail.innerText = "Offline Guest User";
    if (userAvatar) userAvatar.innerText = "🤖";
    if (statusLabel) statusLabel.innerText = "Current Mode";
    if (logoutLabel) logoutLabel.innerText = "退出並清除目前訪客緩存視窗";

    if (authScreen) authScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';

    // 🚀 直接從 LocalStorage 讀取數據快照
    games = JSON.parse(localStorage.getItem('hk_game_prices_v5')) || [];
    renderGames();
    hideLoadingOverlay();
}

function startFirestoreListener(uid) {
    const gamesCollectionRef = collection(db, "users", uid, "games");
    const q = query(gamesCollectionRef, orderBy("date", "desc"));

    unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        games = [];
        snapshot.forEach((doc) => {
            games.push({ id: doc.id, ...doc.data() });
        });
        renderGames();
        hideLoadingOverlay();
    }, (error) => {
        console.error("Firestore 讀取錯誤:", error);
        hideLoadingOverlay();
    });
}

function hideLoadingOverlay() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.visibility = 'hidden'; }, 300);
    }
}

async function handleAuthAction() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) { alert('請填寫完整電郵及密碼！'); return; }
    if (password.length < 6) { alert('密碼長度最少需要 6 個字元！'); return; }

    const loader = document.getElementById('loadingOverlay');
    if (loader) { loader.style.visibility = 'visible'; loader.style.opacity = '1'; }

    try {
        isGuestMode = false; // 強制解除訪客模式標記
        if (isSignUpMode) {
            await createUserWithEmailAndPassword(auth, email, password);
            alert('🎉 帳戶註冊成功並已自動登入！');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error(error);
        alert('❌ 驗證失敗: ' + translateAuthError(error.code));
        if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader.style.visibility = 'hidden'; }, 300); }
    }
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('btnAuthMain');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('btnAuthToggle');

    if (isSignUpMode) {
        if (title) title.innerText = "註冊全新帳戶";
        if (btn) btn.innerText = "✨ 建立帳戶並登入";
        if (toggleText) toggleText.innerText = "已有帳戶？";
        if (toggleBtn) toggleBtn.innerText = "立即登入";
    } else {
        if (title) title.innerText = "登入你的帳戶";
        if (btn) btn.innerText = "🔓 驗證並登入帳戶";
        if (toggleText) toggleText.innerText = "未有帳戶？";
        if (toggleBtn) toggleBtn.innerText = "立即註冊新帳戶";
    }
}

// 🚀 安全登出 / 退出訪客模式分流處理器
async function handleLogout() {
    const msg = isGuestMode ? '確定要關閉訪客模式並返回登入主頁嗎？' : '確定要安全登出當前帳戶嗎？';
    if (confirm(msg)) {
        if (isGuestMode) {
            // A. 清空訪客局部狀態
            isGuestMode = false;
            games = [];
            const appContainer = document.getElementById('appContainer');
            const authScreen = document.getElementById('authScreen');
            if (appContainer) appContainer.style.display = 'none';
            if (authScreen) authScreen.style.display = 'flex';
            renderGames();
        } else {
            // B. 走雲端登出
            try {
                await signOut(auth);
            } catch (error) {
                alert('登出失敗！');
            }
        }
    }
}

function translateAuthError(code) {
    switch (code) {
        case 'auth/invalid-credential': return '電郵或密碼不正確，請重新檢查。';
        case 'auth/email-already-in-use': return '此電郵已被其他帳戶註冊使用。';
        case 'auth/invalid-email': return '請輸入正確格式的電郵地址。';
        case 'auth/weak-password': return '密碼安全強度太弱。';
        default: return '伺服器連線異常，請稍後再試。';
    }
}

function renderGames() {
    const listEl = document.getElementById('gameList');
    const tipsEl = document.getElementById('emptyTips');
    if (!listEl || currentTab === 'settings') return;

    listEl.innerHTML = '';
    let hasVisibleGame = false;
    const searchBar = document.getElementById('searchBar');
    const searchKeyword = searchBar ? searchBar.value.toLowerCase().trim() : '';

    games.forEach((game) => {
        if (currentTab === 'bought' && !game.isBought) return;
        if (currentTab === 'price' && game.isBought) return;
        if (searchKeyword && !game.name.toLowerCase().includes(searchKeyword)) return;

        hasVisibleGame = true;

        const swipeContainer = document.createElement('div');
        swipeContainer.className = 'swipe-container';
        swipeContainer.id = `swipe_id_${game.id}`;

        const actionBtnHtml = `
            <div class="swipe-action-btn delete" onclick="event.stopPropagation(); deleteGameDirect('${game.id}')">🗑️ 刪除</div>
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
            <div class="game-row" id="row_id_${game.id}" 
                 onclick="openEditModal('${game.id}')"
                 ontouchstart="handleTouchStart(event)" 
                 ontouchmove="handleTouchMove(event, '${game.id}')" 
                 ontouchend="handleTouchEnd(event, '${game.id}')">
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
        tipsEl.style.display = (!hasVisibleGame) ? 'block' : 'none';
    }
}

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

function handleTouchStart(e) {
    if (currentViewMode === 'grid') return;
    if (activeSwipeContainer) {
        const openRow = activeSwipeContainer.querySelector('.game-row');
        if (openRow) openRow.style.transform = 'translateX(0px)';
        activeSwipeContainer = null;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
}

function handleTouchMove(e, docId) {
    if (currentViewMode === 'grid') return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = touchStartX - currentX; 
    const diffY = touchStartY - currentY;
    
    if (!isSwiping && Math.abs(diffY) > Math.abs(diffX)) return; 
    if (Math.abs(diffX) < 15 && !isSwiping) return;
    
    isSwiping = true;
    const row = document.getElementById(`row_id_${docId}`);
    if (!row) return;

    if (diffX > 0) {
        const moveX = Math.min(diffX, 80);
        row.style.transform = `translateX(-${moveX}px)`;
        e.preventDefault(); 
    } else {
        row.style.transform = 'translateX(0px)';
    }
}

function handleTouchEnd(e, docId) {
    if (currentViewMode === 'grid') return;
    const row = document.getElementById(`row_id_${docId}`);
    const container = document.getElementById(`swipe_id_${docId}`);
    if (!row || !container) return;
    
    const currentX = e.changedTouches[0].clientX;
    const diffX = touchStartX - currentX;

    if (isSwiping && diffX > 45) {
        row.style.transform = 'translateX(-80px)';
        activeSwipeContainer = container;
        blockClickUntil = Date.now() + 100; 
    } else {
        row.style.transform = 'translateX(0px)';
        activeSwipeContainer = null;
        if (isSwiping) blockClickUntil = Date.now() + 100; 
    }
    touchStartX = 0; touchStartY = 0; isSwiping = false;
}

function openEditModal(docId) {
    if (Date.now() < blockClickUntil) return;
    const row = document.getElementById(`row_id_${docId}`);
    if (row && row.style.transform !== 'translateX(0px)' && row.style.transform !== '') {
        row.style.transform = 'translateX(0px)';
        activeSwipeContainer = null;
        return;
    }

    activeSwipeContainer = null;
    const game = games.find(g => g.id === docId);
    if (!game) return;
    
    document.getElementById('modalTitle').innerText = "修改格價資料";
    document.getElementById('editIndex').value = docId; 
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

// 🚀 表單修改儲存控制器 (新增自適應雙分流：Guest 寫入 LocalStorage vs Auth 寫入 Firestore)
async function handleFormSubmit() {
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
    
    const docId = document.getElementById('editIndex').value;
    const statusBought = (document.getElementById('gIsBought').value === "true");
    const coverVal = document.getElementById('gCover').value.trim();
    
    const dataPayload = {
        name: name,
        cover: coverVal,
        isBought: statusBought,
        date: Date.now(),
        prices: pricesData
    };

    // A. 訪客模式分流處理 (寫入本地儲存)
    if (isGuestMode) {
        if (docId === "") {
            // 生成一個高質量的本地唯一客製 id 字串
            const localId = 'local_' + Date.now() + Math.random().toString(36).substr(2, 5);
            games.push({ id: localId, ...dataPayload });
        } else {
            const idx = games.findIndex(g => g.id === docId);
            if (idx !== -1) games[idx] = { id: docId, ...dataPayload };
        }
        localStorage.setItem('hk_game_prices_v5', JSON.stringify(games));
        closeModal();
        return;
    }

    // B. 雲端驗證分流處理
    if (!currentUser) return;
    const loader = document.getElementById('loadingOverlay');
    if (loader) { loader.style.visibility = 'visible'; loader.style.opacity = '1'; }

    try {
        if (docId === "") {
            const ref = collection(db, "users", currentUser.uid, "games");
            await addDoc(ref, dataPayload);
        } else {
            const ref = doc(db, "users", currentUser.uid, "games", docId);
            await updateDoc(ref, dataPayload);
        }
        closeModal();
    } catch (error) {
        console.error(error);
        alert('雲端儲存出錯！');
        if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader.style.visibility = 'hidden'; }, 300); }
    }
}

// 🚀 刪除處理器 (分流：Guest 移除 LocalStorage 條目 vs Auth 移除 Firestore 條目)
async function deleteGameDirect(docId) {
    const game = games.find(g => g.id === docId);
    const gameName = game ? game.name : "此遊戲";

    if (confirm(`確定要永久移除 "${gameName}" 嗎？`)) {
        // A. 訪客離線刪除
        if (isGuestMode) {
            games = games.filter(g => g.id !== docId);
            localStorage.setItem('hk_game_prices_v5', JSON.stringify(games));
            renderGames();
            activeSwipeContainer = null;
            return;
        }

        // B. 雲端同步刪除
        if (!currentUser) return;
        const loader = document.getElementById('loadingOverlay');
        if (loader) { loader.style.visibility = 'visible'; loader.style.opacity = '1'; }
        try {
            const ref = doc(db, "users", currentUser.uid, "games", docId);
            await deleteDoc(ref);
        } catch (error) {
            console.error(error);
            alert('刪除失敗！');
            if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader.style.visibility = 'hidden'; }, 300); }
        }
    } else {
        const row = document.getElementById(`row_id_${docId}`);
        if (row) row.style.transform = 'translateX(0px)';
    }
    activeSwipeContainer = null;
}

function openBackupModal() {
    const jsonStr = JSON.stringify(games, null, 2);
    const textarea = document.getElementById('backupTextarea');
    if (textarea) textarea.value = jsonStr;
    document.getElementById('backupModal').style.display = 'flex';
}
function closeBackupModal() { document.getElementById('backupModal').style.display = 'none'; }
function copyBackupData() {
    const textarea = document.getElementById('backupTextarea');
    if (!textarea) return;
    textarea.select();
    navigator.clipboard.writeText(textarea.value).then(() => { alert('📋 快照複製成功！'); });
}

function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('hk_game_view_mode', mode); 
    document.getElementById('btnListView').classList.toggle('active', mode === 'list');
    document.getElementById('btnGridView').classList.toggle('active', mode === 'grid');
    const listEl = document.getElementById('gameList');
    if (listEl) {
        if (mode === 'grid') listEl.classList.add('grid-view');
        else listEl.classList.remove('grid-view');
    }
    renderGames();
}
function initTheme() {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) themeBtn.innerText = "☀️ Light Mode";
    } else {
        document.body.classList.remove('light-theme');
        if (themeBtn) themeBtn.innerText = "🌙 Dark Mode";
    }
}
function toggleTheme() {
    currentTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    localStorage.setItem('hk_game_theme', currentTheme);
    initTheme();
}
function updateScraperLinks() {
    const gName = document.getElementById('gName');
    const fullName = gName ? gName.value.trim() : '';
    const googleLnk = document.getElementById('lnkGoogle');
    if (!googleLnk) return;
    if (!fullName) { googleLnk.href = "#"; return; }
    googleLnk.href = `https://www.google.com/search?q=${encodeURIComponent(fullName + " 香港 價錢")}`;
}
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
function closeModal() { 
    document.getElementById('gameModal').style.display = 'none'; 
    hideCustomKeyboard(); 
    renderGames();
}

function startAppInitialization() {
    initTheme();
    setViewMode(currentViewMode);
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startAppInitialization);
} else {
    startAppInitialization();
}

// 全域模組橋接器
window.handleAuthAction = handleAuthAction;
window.handleGuestMode = handleGuestMode; // 🚀 注入訪客模式到全域
window.toggleAuthMode = toggleAuthMode;
window.handleLogout = handleLogout;
window.switchTab = switchTab;
window.setViewMode = setViewMode;
window.toggleTheme = toggleTheme;
window.renderGames = renderGames;
window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.handleFormSubmit = handleFormSubmit;
window.addPriceRowWithScroll = addPriceRowWithScroll;
window.toggleCondition = toggleCondition;
window.activatePriceKeyboard = activatePriceKeyboard;
window.hideCustomKeyboard = hideCustomKeyboard;
window.handleKeyPress = handleKeyPress;
window.handleKeyDone = handleKeyDone;
window.openBackupModal = openBackupModal;
window.closeBackupModal = closeBackupModal;
window.copyBackupData = copyBackupData;
window.updateScraperLinks = updateScraperLinks;
