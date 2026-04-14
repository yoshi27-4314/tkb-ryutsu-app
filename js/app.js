/**
 * ファーストエイト業務アプリ - メインJS
 * テイクバック流通事業 テスト運用版
 */

// ====== 作業中データの保持（リロード・戻る対策） ======
const SESSION_KEY = 'f8_working_session';

function saveWorkingSession() {
  const session = {
    currentItem: currentItem,
    currentCategory: currentCategory,
    currentBundle: currentBundle,
    cameraStep: cameraStep,
    multiPhotos: multiPhotos,
    currentTab: currentTab,
    timestamp: Date.now(),
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch(e) { /* sessionStorage容量超過時は無視 */ }
}

function restoreWorkingSession() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return false;
    const session = JSON.parse(saved);
    // 30分以上前のデータは破棄
    if (Date.now() - session.timestamp > 30 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    currentItem = session.currentItem || {};
    currentCategory = session.currentCategory;
    currentBundle = session.currentBundle || 'single';
    cameraStep = session.cameraStep || 0;
    multiPhotos = session.multiPhotos || [null,null,null,null,null];
    // 写真プレビューを復元
    for (let i = 0; i < 5; i++) {
      if (multiPhotos[i]) {
        const preview = document.getElementById('multiPreview' + (i+1));
        const slot = document.getElementById('photoSlot' + (i+1));
        if (preview) { preview.src = multiPhotos[i]; preview.style.display = 'block'; }
        if (slot) { slot.classList.add('has-photo'); slot.querySelector('.photo-slot-remove').style.display = ''; }
      }
    }
    updatePhotoCountUI();
    if (cameraStep > 0) {
      showCameraStep(cameraStep);
      if (session.currentTab) switchTab(session.currentTab);
    }
    return cameraStep > 0;
  } catch(e) { return false; }
}

function clearWorkingSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ====== 一時保存（下書き） ======
const DRAFTS_KEY = 'f8_draft_items';

function saveDraft() {
  if (!currentItem.productName && !currentItem.photo1) {
    showToast('保存するデータがありません');
    return;
  }

  const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  const draft = {
    id: 'draft_' + Date.now(),
    item: { ...currentItem },
    category: currentCategory,
    bundle: currentBundle,
    step: cameraStep,
    photos: multiPhotos.map(p => p ? true : false), // 写真データは重いのでフラグだけ
    photoData: multiPhotos, // 実際の写真データ
    staffName: currentUser.name,
    savedAt: new Date().toISOString(),
  };
  drafts.unshift(draft);
  // 最大20件
  if (drafts.length > 20) drafts.pop();

  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    showToast('💾 一時保存しました。ホーム画面から再開できます。');
    clearWorkingSession();
    resetCameraFlow();
    switchTab('home');
    renderDraftItems();
  } catch(e) {
    // localStorageの容量超過
    showToast('保存容量を超えました。古い下書きを削除してください。');
  }
}

function renderDraftItems() {
  const container = document.getElementById('draftItemsList');
  const section = document.getElementById('draftItemsSection');
  if (!container || !section) return;

  const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  const myDrafts = drafts.filter(d => d.staffName === currentUser?.name);

  if (myDrafts.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  container.innerHTML = myDrafts.map(d => {
    const name = d.item.productName || '商品名未定';
    const channel = d.item.channel || '未判定';
    const stepLabel = ['種別選択', '撮影', 'AI判定結果', '商品写真', '保管場所', '完了'][d.step] || '不明';
    const time = new Date(d.savedAt);
    const timeStr = `${time.getMonth()+1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;
    return `
      <div class="draft-item">
        <div class="draft-info" onclick="resumeDraft('${d.id}')">
          <div class="draft-name">${escapeHtml(name)}</div>
          <div class="draft-meta">${escapeHtml(channel)} — ${stepLabel}で中断 — ${timeStr}</div>
        </div>
        <button class="draft-delete" onclick="deleteDraft('${d.id}')">✕</button>
      </div>
    `;
  }).join('');
}

function resumeDraft(draftId) {
  const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  const draft = drafts.find(d => d.id === draftId);
  if (!draft) { showToast('下書きが見つかりません'); return; }

  // 復元
  currentItem = draft.item;
  currentCategory = draft.category;
  currentBundle = draft.bundle || 'single';
  multiPhotos = draft.photoData || [null,null,null,null,null];

  // 写真プレビュー復元
  for (let i = 0; i < 5; i++) {
    if (multiPhotos[i]) {
      const preview = document.getElementById('multiPreview' + (i+1));
      const slot = document.getElementById('photoSlot' + (i+1));
      if (preview) { preview.src = multiPhotos[i]; preview.style.display = 'block'; }
      if (slot) { slot.classList.add('has-photo'); slot.querySelector('.photo-slot-remove').style.display = ''; }
    }
  }
  updatePhotoCountUI();

  // AI判定結果があれば表示を復元
  if (currentItem.productName) {
    document.getElementById('aiProductName').textContent = currentItem.productName || '—';
    document.getElementById('aiCategory').textContent = currentItem.category || '—';
    document.getElementById('aiCondition').textContent = `${currentItem.condition || '—'} ${currentItem.conditionNote || ''}`;
    document.getElementById('aiChannel').textContent = currentItem.channel || '—';
    document.getElementById('aiPrice').textContent = currentItem.estimatedPrice
      ? `¥${currentItem.estimatedPrice.min?.toLocaleString()}〜¥${currentItem.estimatedPrice.max?.toLocaleString()}`
      : '—';
    document.getElementById('aiSize').textContent = currentItem.estimatedSize || '—';
  }

  switchTab('camera');
  showCameraStep(draft.step);
  showToast('📋 下書きを再開しました');
}

function deleteDraft(draftId) {
  let drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  drafts = drafts.filter(d => d.id !== draftId);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  renderDraftItems();
  showToast('下書きを削除しました');
}

// 自動保存（5秒ごと、作業中のみ）
setInterval(() => {
  if (currentTab === 'camera' && cameraStep > 0 && (currentItem.productName || currentItem.photo1)) {
    saveWorkingSession();
  }
}, 5000);

// ====== AI判定中オーバーレイ ======
function showAnalyzingOverlay() {
  let overlay = document.getElementById('analyzingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'analyzingOverlay';
    overlay.className = 'analyzing-overlay';
    overlay.innerHTML = `
      <div class="analyzing-spinner"></div>
      <div class="analyzing-text">🤖 AIが判定中<span class="analyzing-dots"></span></div>
      <div class="analyzing-sub">写真を分析しています</div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}

function hideAnalyzingOverlay() {
  const overlay = document.getElementById('analyzingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ====== テストモード判定 ======
const IS_TEST_MODE = new URLSearchParams(window.location.search).has('test');
if (IS_TEST_MODE) {
  console.log('[テストモード] GAS送信先: テスト用スプレッドシート');
}

// ====== 状態管理 ======
let currentUser = null;
let currentTab = 'home';
let cameraStep = 0;
let currentItem = {};
let currentCategory = null; // 'jisha', 'bigsports', 'watanabe', 'shimachiyo'
let currentBundle = 'single'; // 'single' or 'set'
let photosTaken = 0;
let todayStats = { bunka: 0, satsuei: 0, shuppin: 0, konpo: 0 };

// ローカルストレージキー
const STORAGE_KEY = 'f8_takeback_data';
const LOGIN_KEY = 'f8_takeback_user';
const PERMISSIONS_KEY = 'f8_permissions';

// ====== 権限管理 ======
// デフォルト権限: バーコードは桃井・浅野のみ
const DEFAULT_PERMISSIONS = {
  barcode: ['桃井侑菜', '浅野儀頼'],
};

function loadPermissions() {
  try {
    return JSON.parse(localStorage.getItem(PERMISSIONS_KEY)) || DEFAULT_PERMISSIONS;
  } catch { return DEFAULT_PERMISSIONS; }
}

function savePermissions(perms) {
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(perms));
}

function hasPermission(feature) {
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true; // 管理者は全機能利用可
  const perms = loadPermissions();
  const allowed = perms[feature] || [];
  return allowed.includes(currentUser.name);
}

// ====== データ管理（ローカル） ======
function loadLocalData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"items":[],"stats":{}}');
  } catch { return { items: [], stats: {} }; }
}

function saveLocalData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function addItem(item) {
  const data = loadLocalData();
  item.createdAt = new Date().toISOString();
  data.items.unshift(item);
  saveLocalData(data);
  return item;
}

function getItems() {
  return loadLocalData().items || [];
}

// ====== ログイン ======
function doLogin() {
  const sel = document.getElementById('loginStaff');
  const name = sel.value;
  if (!name) { showToast('スタッフを選択してください'); return; }
  currentUser = { name: name, isAdmin: name === '浅野儀頼' };
  localStorage.setItem(LOGIN_KEY, JSON.stringify(currentUser));
  showMainScreen();
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem(LOGIN_KEY);
  document.getElementById('mainScreen').classList.remove('active');
  document.getElementById('loginScreen').classList.add('active');
}

function showMainScreen() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.add('active');
  const firstName = currentUser.name.split(/[　 ]/)[0];
  document.getElementById('staffName').textContent = firstName;
  document.getElementById('mypageName').textContent = currentUser.name;
  // 下の名前をアバターに表示（写真未設定時）
  const avatarEmoji = document.getElementById('avatarEmoji');
  if (avatarEmoji && !localStorage.getItem('f8_avatar')) {
    // 姓名を分割して下の名前を取得
    const nameParts = currentUser.name.split(/[　 ]/);
    const givenName = nameParts.length > 1 ? nameParts[1] : nameParts[0];
    avatarEmoji.textContent = givenName;
  }
  if (currentUser.isAdmin) {
    document.getElementById('notifBadge').style.display = 'flex';
    // 管理者用: 権限設定セクション表示
    const adminPerm = document.getElementById('adminPermSection');
    if (adminPerm) {
      adminPerm.style.display = '';
      renderPermissionSettings();
    }
  }
  updateDate();
  // loadTestData(); // テストデータ無効化（実運用モード）
  // テストモード表示
  if (IS_TEST_MODE) {
    const header = document.querySelector('.header-title');
    if (header) header.textContent = '【テスト】テイクバック 流通事業部';
    document.querySelector('.header')?.style.setProperty('border-bottom', '3px solid #FF9500');
  }
  updateHomeStats();
  renderStockList();
  checkTodayAttendance();
  startNotificationPolling();
  loadProfileImages();
  loadTheme();
  loadContactInfo();
  initMiniClocks();
  renderFeatureGuide();
  renderChangelog();
  renderLeaveHistory();
  renderLeaveCalendar();
  // 作業中データの復元（リロード対策）
  if (restoreWorkingSession()) {
    showToast('作業中のデータを復元しました');
  }
  // 一時保存リスト表示
  renderDraftItems();
  const savedTab = localStorage.getItem('f8_current_tab');
  if (savedTab) switchTab(savedTab);
}

// 自動ログイン
function tryAutoLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGIN_KEY));
    if (saved && saved.name) {
      currentUser = saved;
      showMainScreen();
      return true;
    }
  } catch {}
  return false;
}

// ====== タブ切り替え ======
function switchTab(tab) {
  currentTab = tab;
  localStorage.setItem('f8_current_tab', tab);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  if (tab === 'camera' && cameraStep <= 1) {
    resetCameraFlow();
  }
  if (tab === 'stock') {
    renderStockList();
  }
}

// ====== 日付・時刻 ======
function updateDate() {
  const now = new Date();
  const days = ['日','月','火','水','木','金','土'];
  const d = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${days[now.getDay()]}）`;
  document.getElementById('todayDate').textContent = d;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'おはようございます';
  if (h < 17) return 'お疲れ様です';
  return 'お疲れ様です';
}

// ====== ホーム画面更新 ======
function updateHomeStats() {
  const today = new Date().toISOString().slice(0, 10);
  const items = getItems();
  const todayItems = items.filter(i => i.createdAt && i.createdAt.startsWith(today));

  // 今日の実績
  todayStats.bunka = todayItems.length;
  todayStats.satsuei = todayItems.filter(i => i.photo1).length;
  todayStats.shuppin = todayItems.filter(i => i.listingTitle).length;
  todayStats.konpo = todayItems.filter(i => i.shipped).length;

  document.getElementById('statBunka').textContent = todayStats.bunka;
  document.getElementById('statSatsuei').textContent = todayStats.satsuei;
  document.getElementById('statShuppin').textContent = todayStats.shuppin;
  document.getElementById('statKonpo').textContent = todayStats.konpo;

  // 実績を日別にローカル保存（目標設定用データ蓄積）
  const statsKey = 'f8_daily_stats_' + today;
  localStorage.setItem(statsKey, JSON.stringify({
    date: today,
    staff: currentUser.name,
    bunka: todayStats.bunka,
    satsuei: todayStats.satsuei,
    shuppin: todayStats.shuppin,
    konpo: todayStats.konpo,
    updatedAt: new Date().toISOString(),
  }));

  // ボトルネック計算
  updateBottleneck(items);

  // 出勤メンバー表示
  renderMemberTimeline();

  // お知らせ更新
  updateNoticeList(items);

  // 挨拶の更新
  const greetEl = document.querySelector('.greeting h2');
  if (greetEl) {
    const firstName = currentUser.name.split(/[　 ]/)[0];
    greetEl.innerHTML = `${getGreeting()}、<span id="staffName">${firstName}</span>さん`;
  }
}

// ====== ボトルネック ======
function updateBottleneck(items) {
  // 撮影待ち: 登録済みだが写真がない
  const satsueiWait = items.filter(i => !i.photo1 && !i.shipped).length;
  // 出品待ち: 撮影済みだが出品情報がない（通販チャンネルのみ）
  const shuppinWait = items.filter(i => i.photo1 && !i.listingTitle && !i.shipped && isTsuhanChannel(i.channelNumber)).length;
  // 梱包待ち: 出品済みだが未出荷（status=出品中 or listingTitle有り）
  const konpoWait = items.filter(i => (i.status === '出品中' || i.listingTitle) && !i.shipped).length;

  const maxItems = 50; // バー100%の基準値

  const setBar = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(count / maxItems * 100, 100) + '%';
  };

  document.getElementById('bnCountSatsuei').textContent = satsueiWait + '件';
  document.getElementById('bnCountShuppin').textContent = shuppinWait + '件';
  document.getElementById('bnCountKonpo').textContent = konpoWait + '件';

  setBar('bnBarSatsuei', satsueiWait);
  setBar('bnBarShuppin', shuppinWait);
  setBar('bnBarKonpo', konpoWait);

  // 危険レベルでアラート表示
  const threshold = 20;
  document.getElementById('bnSatsuei').classList.toggle('alert', satsueiWait >= threshold);
  document.getElementById('bnShuppin').classList.toggle('alert', shuppinWait >= threshold);
  document.getElementById('bnKonpo').classList.toggle('alert', konpoWait >= threshold);
}

function isTsuhanChannel(channelNum) {
  if (!channelNum) return false;
  const ch = CONFIG.CHANNELS.find(c => c.id === channelNum);
  return ch && ch.type === 'tsuhan';
}

// ====== お知らせ（実データ） ======
function updateNoticeList(items) {
  const list = document.getElementById('noticeList');
  const emptyEl = document.getElementById('emptyNotice');
  if (!list) return;

  const notices = [];

  // アプリ更新通知（未読分）
  const unreadChanges = getUnreadChanges();
  unreadChanges.forEach(c => {
    notices.push({
      badge: 'notice-update', label: c.type,
      text: c.text,
      isUpdate: true,
    });
  });

  // 承認待ち
  items.filter(i => i.needsApproval && !i.approved && !i.rejected).forEach(i => {
    notices.push({
      badge: 'notice-danger', label: '承認待ち',
      text: `${i.mgmtNum} ${i.productName || '商品'} ¥${i.estimatedPrice?.max?.toLocaleString() || '---'}`,
    });
  });

  // 承認済み
  items.filter(i => i.approved).slice(0, 3).forEach(i => {
    notices.push({
      badge: 'notice-approve', label: '承認済',
      text: `${i.mgmtNum} ${i.channel || ''}で出品OK`,
    });
  });

  // 出荷済み（今日）
  const today = new Date().toISOString().slice(0, 10);
  items.filter(i => i.shipped && i.shippedAt && i.shippedAt.startsWith(today)).forEach(i => {
    notices.push({
      badge: 'notice-gold', label: '出荷済',
      text: `${i.mgmtNum} ${i.carrier || ''} で出荷完了`,
    });
  });

  if (notices.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    list.innerHTML = '<p class="empty-notice">新しいお知らせはありません</p>';
    return;
  }

  list.innerHTML = notices.map(n => `
    <div class="notice-item">
      <span class="notice-badge ${n.badge}">${n.label}</span>
      <span>${escapeHtml(n.text)}</span>
    </div>
  `).join('');
}

// ====== 出勤メンバータイムライン ======
function renderMemberTimeline() {
  const container = document.getElementById('memberTimeline');
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const timelineStart = 6; // 6時
  const timelineEnd = 21;  // 21時
  const totalHours = timelineEnd - timelineStart;

  // 全スタッフの出勤情報を取得
  const members = [];
  CONFIG.STAFF.forEach(s => {
    const saved = localStorage.getItem('f8_attendance_' + today + '_detail_' + s.name)
      || localStorage.getItem('f8_attendance_' + today);

    if (saved) {
      try {
        const a = JSON.parse(saved);
        // 自分以外のデータもチェック（名前が一致するか）
        if (a.staffName && a.staffName !== s.name) return;
        members.push({
          name: s.name,
          start: a.start || '09:00',
          end: a.end || '18:00',
          breakStart: a.breakStart || null,
          breakEnd: a.breakEnd || null,
          noBreak: a.noBreak || false,
        });
      } catch {}
    }
  });

  // 自分の出勤データを確実に含める
  if (currentUser && !members.find(m => m.name === currentUser.name)) {
    const mySaved = localStorage.getItem('f8_attendance_' + today);
    if (mySaved) {
      try {
        const a = JSON.parse(mySaved);
        members.push({
          name: currentUser.name,
          start: a.start || '09:00',
          end: a.end || '18:00',
          breakStart: a.breakStart || null,
          breakEnd: a.breakEnd || null,
          noBreak: a.noBreak || false,
        });
      } catch {}
    }
  }

  // 人数表示
  const countEl = document.getElementById('memberCount');
  if (countEl) countEl.textContent = `(${members.length}名)`;

  if (members.length === 0) {
    container.innerHTML = '<p class="empty-notice">まだ出勤記録がありません</p>';
    return;
  }

  const timeToPercent = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return ((h + m / 60) - timelineStart) / totalHours * 100;
  };

  let html = '';
  members.forEach(m => {
    const startPct = Math.max(0, timeToPercent(m.start));
    const endPct = Math.min(100, timeToPercent(m.end));
    const workWidth = endPct - startPct;

    let breakHtml = '';
    let breakMeta = '休憩なし';
    if (m.breakStart && m.breakEnd && !m.noBreak) {
      const bStartPct = Math.max(startPct, timeToPercent(m.breakStart));
      const bEndPct = Math.min(endPct, timeToPercent(m.breakEnd));
      breakHtml = `<div class="member-bar-break" style="left:${bStartPct}%;width:${bEndPct - bStartPct}%"></div>`;
      breakMeta = `休憩 ${m.breakStart}-${m.breakEnd}`;
    } else if (m.noBreak) {
      breakMeta = '休憩なし';
    } else {
      // デフォルト休憩（12:00-13:00）
      const bStartPct = Math.max(startPct, timeToPercent('12:00'));
      const bEndPct = Math.min(endPct, timeToPercent('13:00'));
      if (bStartPct < bEndPct) {
        breakHtml = `<div class="member-bar-break" style="left:${bStartPct}%;width:${bEndPct - bStartPct}%"></div>`;
      }
      breakMeta = '休憩 12:00-13:00';
    }

    // 姓だけ表示
    const lastName = m.name.split(/[　 ]/)[0];
    html += `
      <div class="member-row">
        <div class="member-name">${escapeHtml(lastName)}</div>
        <div class="member-bar-container">
          <div class="member-bar-work" style="left:${startPct}%;width:${workWidth}%"></div>
          ${breakHtml}
        </div>
        <div class="member-meta">${m.start}-${m.end}</div>
      </div>
    `;
  });

  // 時間軸
  html += '<div class="member-time-axis">';
  for (let h = timelineStart; h <= timelineEnd; h += 3) {
    html += `<span class="member-time-tick">${h}:00</span>`;
  }
  html += '</div>';

  container.innerHTML = html;
}

// ====== 在庫一覧 ======
function renderStockList() {
  const list = document.getElementById('stockList');
  if (!list) return;
  let items = getItems();

  updateStatusCounts();

  if (items.length === 0) {
    const emptyEl = document.getElementById('stockEmpty');
    if (emptyEl) emptyEl.style.display = 'block';
    list.innerHTML = '';
    return;
  }
  const emptyEl = document.getElementById('stockEmpty');
  if (emptyEl) emptyEl.style.display = 'none';

  // フィルター適用
  if (currentFilter !== 'all') {
    items = items.filter(i => {
      if (currentFilter === '登録済') return !i.needsApproval && !i.shipped;
      if (currentFilter === '承認待ち') return i.needsApproval && !i.shipped;
      if (currentFilter === '出品中') return i.status === '出品中';
      if (currentFilter === '出荷済') return i.shipped;
      return true;
    });
  }

  let html = '';
  items.slice(0, 20).forEach(item => {
    let statusClass, statusText;
    if (item.shipped) { statusClass = 'status-listed'; statusText = '出荷済'; }
    else if (item.needsApproval) { statusClass = 'status-shooting'; statusText = '承認待ち'; }
    else { statusClass = 'status-listing'; statusText = '登録済'; }
    html += `
      <div class="stock-card" onclick="openItemDetail('${item.mgmtNum}')" style="cursor:pointer">
        <div class="stock-header">
          <span class="stock-number">${item.mgmtNum || '---'}</span>
          <span class="stock-status ${statusClass}">${statusText}</span>
        </div>
        <div class="stock-name">${escapeHtml(item.productName || '不明')}</div>
        <div class="stock-meta">${escapeHtml(item.channel || '---')} ・ ¥${item.estimatedPrice?.min?.toLocaleString() || '---'} ・ ${escapeHtml(item.location || '---')}</div>
      </div>
    `;
  });
  if (html) {
    list.innerHTML = html;
  }
}

// ====== 管理番号生成 ======
function generateManagementNumber() {
  const prefix = CONFIG.MGMT_PREFIX();
  const items = getItems();
  const thisMonth = items.filter(i => i.mgmtNum && i.mgmtNum.startsWith(prefix));
  const nextSeq = thisMonth.length + 1;
  return prefix + '-' + String(nextSeq).padStart(4, '0');
}

// ====== 入口選択 ======
function startPhotoEntry() {
  document.getElementById('entrySelect').style.display = 'none';
  document.getElementById('photoMode').style.display = 'block';
  document.getElementById('barcodeMode').style.display = 'none';
}

function startBarcodeEntry() {
  document.getElementById('entrySelect').style.display = 'none';
  document.getElementById('photoMode').style.display = 'none';
  document.getElementById('barcodeMode').style.display = 'block';
  startBarcodeScanner();
}

// ====== バーコードスキャナー ======
let barcodeReader = null;

async function startBarcodeScanner() {
  try {
    const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
    barcodeReader = codeReader;
    const videoEl = document.getElementById('barcodeVideo');

    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    // 背面カメラを優先
    const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.includes('背面')) || devices[0];

    codeReader.decodeFromVideoDevice(backCamera?.deviceId || undefined, videoEl, (result, err) => {
      if (result) {
        const isbn = result.getText();
        console.log('Barcode detected:', isbn);
        stopBarcode();
        handleBarcodeResult(isbn);
      }
    });
  } catch (err) {
    console.error('Barcode scanner error:', err);
    showToast('カメラを起動できませんでした');
  }
}

function stopBarcode() {
  if (barcodeReader) {
    barcodeReader.reset?.();
    barcodeReader = null;
  }
  const video = document.getElementById('barcodeVideo');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  document.getElementById('entrySelect').style.display = 'block';
  document.getElementById('barcodeMode').style.display = 'none';
  document.getElementById('barcodeResult').style.display = 'none';
}

function handleBarcodeResult(isbn) {
  document.getElementById('barcodeISBN').textContent = isbn;
  document.getElementById('barcodeTitle').textContent = '検索中...';
  document.getElementById('barcodeResult').style.display = 'block';

  // Amazon URLを生成
  currentItem.isbn = isbn;
  currentItem.amazonUrl = `https://www.amazon.co.jp/dp/${isbn}`;

  // ISBNから書籍情報を取得（Google Books API - 無料・キー不要）
  fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
    .then(res => res.json())
    .then(data => {
      if (data.items && data.items.length > 0) {
        const book = data.items[0].volumeInfo;
        currentItem.productName = book.title || 'タイトル不明';
        currentItem.maker = (book.authors || []).join(', ');
        currentItem.category = '書籍';
        currentItem.bookInfo = {
          title: book.title,
          authors: book.authors,
          publisher: book.publisher,
          publishedDate: book.publishedDate,
          pageCount: book.pageCount,
          thumbnail: book.imageLinks?.thumbnail,
        };
        document.getElementById('barcodeTitle').textContent = currentItem.productName;
        if (book.imageLinks?.thumbnail) {
          currentItem.photo1 = null; // 本はAmazon画像で代替
        }
      } else {
        document.getElementById('barcodeTitle').textContent = 'タイトル不明（ISBN: ' + isbn + '）';
        currentItem.productName = 'ISBN: ' + isbn;
        currentItem.category = '書籍';
      }
    })
    .catch(err => {
      console.error('Book search error:', err);
      document.getElementById('barcodeTitle').textContent = 'ISBN: ' + isbn;
    });
}

async function analyzeBarcode() {
  showToast('🤖 AIが判定中...');

  try {
    // バーコードの場合は画像なしでテキスト情報をAIに送る
    const bookContext = currentItem.bookInfo
      ? `書籍名: ${currentItem.bookInfo.title}\n著者: ${(currentItem.bookInfo.authors || []).join(', ')}\n出版社: ${currentItem.bookInfo.publisher || '不明'}\nページ数: ${currentItem.bookInfo.pageCount || '不明'}\nISBN: ${currentItem.isbn}\nAmazon URL: ${currentItem.amazonUrl}`
      : `ISBN: ${currentItem.isbn}\nAmazon URL: ${currentItem.amazonUrl}`;

    const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        image: null,
        step: 'book',
        context: { bookInfo: bookContext },
      }),
    });

    const result = await response.json();
    if (result.success && result.judgment) {
      const j = result.judgment;
      currentItem = { ...currentItem, ...j };
      // 書籍名を保持
      if (!j.productName && currentItem.bookInfo) {
        currentItem.productName = currentItem.bookInfo.title;
      }
      document.getElementById('aiProductName').textContent = currentItem.productName || '—';
      document.getElementById('aiCategory').textContent = '書籍';
      document.getElementById('aiCondition').textContent = `${j.condition || '—'} ${j.conditionNote || ''}`;
      document.getElementById('aiChannel').textContent = j.channel || '—';
      document.getElementById('aiPrice').textContent = j.estimatedPrice
        ? `¥${j.estimatedPrice.min?.toLocaleString()}〜¥${j.estimatedPrice.max?.toLocaleString()}`
        : '—';
      document.getElementById('aiSize').textContent = j.estimatedSize || '—';
      showCameraStep(2);
    } else {
      showToast('判定エラー');
    }
  } catch (err) {
    console.error('Book judge error:', err);
    showToast('通信エラー');
  }
}

// ====== 種別選択 ======
function selectCategory(cat) {
  currentCategory = cat;
  currentItem = {};
  currentBundle = 'single';

  // 種別に応じた設定
  const titles = {
    jisha: { title: '自社商品を撮影', desc: 'AIが分荷判定します（アイロンポット or ブロカント）' },
    bigsports: { title: 'ビッグスポーツの商品を撮影', desc: '価格を決定して出品します' },
    watanabe: { title: '渡辺質店の商品を撮影', desc: '按分比率を確認して出品します' },
    shimachiyo: { title: 'シマチヨの商品を撮影', desc: '浅野さん指定品を出品します' },
  };

  const t = titles[cat] || titles.jisha;
  document.getElementById('step1Title').textContent = t.title;
  document.getElementById('step1Desc').textContent = t.desc;

  // 種別をcurrentItemに記録
  currentItem.category_type = cat;
  if (cat === 'bigsports') {
    currentItem.channel = 'ビッグスポーツ';
    currentItem.channelNumber = 11;
    currentItem.itakuType = 'bigsports';
  } else if (cat === 'watanabe') {
    currentItem.channel = '渡辺質店';
    currentItem.channelNumber = 10;
    currentItem.itakuType = 'watanabe';
  } else if (cat === 'shimachiyo') {
    currentItem.channel = 'シマチヨ';
    currentItem.channelNumber = 20;
    currentItem.itakuType = 'shimachiyo';
  }

  showCameraStep(1);

  // バーコードボタンの表示制御
  const barcodeBtn = document.getElementById('barcodeBtnEntry');
  if (barcodeBtn) {
    barcodeBtn.style.display = hasPermission('barcode') ? '' : 'none';
  }
}

function backToCategory() {
  currentCategory = null;
  currentItem = {};
  showCameraStep(0);
}

function selectBundle(type) {
  currentBundle = type;
  document.getElementById('bundleSingle').classList.toggle('active', type === 'single');
  document.getElementById('bundleSet').classList.toggle('active', type === 'set');
  currentItem.bundleType = type;
}

// ====== 撮影フロー ======
function resetCameraFlow() {
  cameraStep = 0;
  currentItem = {};
  currentCategory = null;
  currentBundle = 'single';
  photosTaken = 0;
  resetMultiPhotos();
  showCameraStep(0);
  // 入口選択に戻す
  const entrySelect = document.getElementById('entrySelect');
  if (entrySelect) entrySelect.style.display = 'block';
  const photoMode = document.getElementById('photoMode');
  if (photoMode) photoMode.style.display = 'none';
  const barcodeMode = document.getElementById('barcodeMode');
  if (barcodeMode) barcodeMode.style.display = 'none';
  const barcodeResult = document.getElementById('barcodeResult');
  if (barcodeResult) barcodeResult.style.display = 'none';
  const preview = document.getElementById('preview1');
  if (preview) preview.style.display = 'none';
  const afterPhoto = document.getElementById('afterPhoto1');
  if (afterPhoto) afterPhoto.style.display = 'none';
  const placeholder = document.querySelector('.camera-placeholder');
  if (placeholder) placeholder.style.display = 'flex';
  stopBarcode();
}

function showCameraStep(step) {
  document.querySelectorAll('.camera-step').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('cameraStep' + step);
  if (el) el.classList.add('active');
  cameraStep = step;
  // 作業中データを保持
  saveWorkingSession();
}

// ====== 複数写真撮影 ======
let currentPhotoSlot = 0;
let multiPhotos = [null, null, null, null, null]; // 最大5枚

function takePhoto() {
  takeMultiPhoto(1);
}

function takeMultiPhoto(slot) {
  currentPhotoSlot = slot;
  document.getElementById('photoInput').click();
}

function handleMultiPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const slot = currentPhotoSlot;

  const reader = new FileReader();
  reader.onload = function(e) {
    compressImage(e.target.result, 1200, 0.8, (compressed) => {
      multiPhotos[slot - 1] = compressed;
      // プレビュー表示
      const preview = document.getElementById('multiPreview' + slot);
      preview.src = compressed;
      preview.style.display = 'block';
      const slotEl = document.getElementById('photoSlot' + slot);
      slotEl.classList.add('has-photo');
      // 削除ボタン表示
      slotEl.querySelector('.photo-slot-remove').style.display = '';
      // 1枚目をphoto1にも保持（互換性）
      if (slot === 1) currentItem.photo1 = compressed;
      updatePhotoCountUI();
    });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function removeMultiPhoto(slot) {
  multiPhotos[slot - 1] = null;
  const preview = document.getElementById('multiPreview' + slot);
  preview.style.display = 'none';
  preview.src = '';
  const slotEl = document.getElementById('photoSlot' + slot);
  slotEl.classList.remove('has-photo');
  slotEl.querySelector('.photo-slot-remove').style.display = 'none';
  if (slot === 1) currentItem.photo1 = null;
  updatePhotoCountUI();
}

function updatePhotoCountUI() {
  const count = multiPhotos.filter(p => p !== null).length;
  const countMsg = document.getElementById('photoCount');
  const afterBtn = document.getElementById('afterPhotos');
  const countNum = document.getElementById('photoCountNum');

  if (count === 0) {
    countMsg.textContent = 'まず1枚目を撮影してください';
    afterBtn.style.display = 'none';
  } else {
    const tips = [];
    if (count === 1) tips.push('型番ラベルや裏面の写真を追加すると判定精度が上がります');
    if (count >= 2) tips.push('判定に十分な情報があります');
    countMsg.textContent = `${count}枚撮影済み` + (tips.length ? ` — ${tips[0]}` : '');
    afterBtn.style.display = '';
    countNum.textContent = count;
  }
}

function resetMultiPhotos() {
  multiPhotos = [null, null, null, null, null];
  for (let i = 1; i <= 5; i++) {
    const preview = document.getElementById('multiPreview' + i);
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    const slot = document.getElementById('photoSlot' + i);
    if (slot) { slot.classList.remove('has-photo'); slot.querySelector('.photo-slot-remove').style.display = 'none'; }
  }
  updatePhotoCountUI();
}

function handlePhoto(event, num) {
  handleMultiPhoto(event);
}

// 画像圧縮（モバイルの大きな画像をAPIに送れるサイズにする）
function compressImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (w > maxWidth) {
      h = Math.round(h * maxWidth / w);
      w = maxWidth;
    }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

function retakePhoto(num) {
  removeMultiPhoto(num || 1);
}

// ====== AI判定（本番：Supabase Edge Function経由） ======
async function analyzePhoto() {
  const photos = multiPhotos.filter(p => p !== null);
  if (photos.length === 0) {
    showToast('写真を撮影してください');
    return;
  }

  showAnalyzingOverlay();
  const btn = document.querySelector('#afterPhotos .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '判定中...'; }

  try {
    // 複数画像対応: imagesフィールドで送信、1枚の場合はimageフィールドも互換
    const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        image: photos[0],
        images: photos,
        step: 'judge',
      }),
    });

    const result = await response.json();

    if (result.success && result.judgment) {
      const j = result.judgment;
      currentItem = { ...currentItem, ...j };
      document.getElementById('aiProductName').textContent = j.productName || '—';
      document.getElementById('aiCategory').textContent = j.category || '—';
      document.getElementById('aiCondition').textContent = `${j.condition || '—'} ${j.conditionNote || ''}`;
      document.getElementById('aiChannel').textContent = j.channel || '—';
      document.getElementById('aiPrice').textContent = j.estimatedPrice
        ? `¥${j.estimatedPrice.min?.toLocaleString()}〜¥${j.estimatedPrice.max?.toLocaleString()}`
        : '—';
      document.getElementById('aiSize').textContent = j.estimatedSize || '—';
      // 種別に応じてチャンネル表示を上書き
      if (currentCategory === 'bigsports') {
        document.getElementById('aiChannel').textContent = 'ビッグスポーツ';
        currentItem.channel = 'ビッグスポーツ';
        currentItem.channelNumber = 11;
      } else if (currentCategory === 'watanabe') {
        document.getElementById('aiChannel').textContent = '渡辺質店';
        currentItem.channel = '渡辺質店';
        currentItem.channelNumber = 10;
      } else if (currentCategory === 'shimachiyo') {
        document.getElementById('aiChannel').textContent = 'シマチヨ';
        currentItem.channel = 'シマチヨ';
        currentItem.channelNumber = 20;
      }
      // 按分比率欄の表示切替
      const anbunEl = document.getElementById('anbunSection');
      if (anbunEl) anbunEl.style.display = currentCategory === 'watanabe' ? 'block' : 'none';
      // 単品/まとめのリセット
      selectBundle('single');
      // 追加写真が必要な場合の表示
      const morePhotosEl = document.getElementById('needsMorePhotosMsg');
      if (morePhotosEl) {
        if (j.needsMorePhotos && multiPhotos.filter(p => p).length <= 1) {
          morePhotosEl.style.display = '';
          morePhotosEl.innerHTML = `⚠️ ${j.morePhotosReason || '古道具・ビンテージ品の可能性があります。追加写真で判定精度が上がります。'}<br><button class="btn btn-outline" onclick="goBackToAddPhotos()" style="margin-top:8px; font-size:13px;">📷 写真を追加して再判定</button>`;
        } else {
          morePhotosEl.style.display = 'none';
        }
      }
      showCameraStep(2);
    } else if (result.error) {
      showToast('判定エラー: ' + result.error);
    } else {
      showToast('判定結果を解析できませんでした');
      console.log('Raw result:', result);
    }
  } catch (err) {
    console.error('AI判定エラー:', err);
    showToast('通信エラー。もう一度お試しください。');
  } finally {
    hideAnalyzingOverlay();
    const photoCount = multiPhotos.filter(p => p !== null).length;
    if (btn) { btn.disabled = false; btn.textContent = `🤖 AIに判定させる（${photoCount}枚）`; }
  }
}

function goBackToPhotos() {
  showCameraStep(1);
  document.getElementById('entrySelect').style.display = 'none';
  document.getElementById('photoMode').style.display = 'block';
}

function goBackToAddPhotos() {
  showCameraStep(1);
  document.getElementById('entrySelect').style.display = 'none';
  document.getElementById('photoMode').style.display = 'block';
}

function acceptJudgment() {
  // 渡辺質店の場合、按分比率を確認
  if (currentCategory === 'watanabe') {
    const rate = document.getElementById('anbunRate').value;
    if (!rate) {
      showToast('按分比率を入力してください');
      return;
    }
    currentItem.anbunRate = Number(rate);
  }
  // ビッグスポーツは折半固定
  if (currentCategory === 'bigsports') {
    currentItem.anbunRate = 50;
  }
  // まとめ売り設定を記録
  currentItem.bundleType = currentBundle;
  if (currentBundle === 'set') {
    currentItem.channel += '（まとめ）';
  }
  buildPhotoGuide();
  showCameraStep(3);
}

function consultAsano() {
  showToast('🙋 浅野さんに相談を送信しました');
  currentItem.needsApproval = true;
  currentItem.approvalReason = '手動相談';
  // GASに相談データを送る
  sendToGAS({
    action: 'consultation',
    staff_id: currentUser.name,
    item_name: currentItem.productName || '',
    channel: currentItem.channel || '',
    price: currentItem.estimatedPrice?.max || '',
    reason: '手動相談',
    timestamp: formatTimestamp(),
  });
}

// ====== 出品用商品写真撮影 ======

// チャンネル別の撮影スタイルガイド
const PHOTO_STYLE_GUIDE = {
  'ヤフオクビンテージ': {
    style: '古道具タグボート風',
    tips: '自然光で撮影。木目や布の背景で雰囲気を出す。正面からやや見下ろす角度。余白を多めに。',
    guides: [
      { title: '正面全体（メイン画像）', description: '商品を正面から撮影。背景は木目の台や白布。上からではなく正面目線で。余白を左右均等に。' },
      { title: '銘・刻印・陶印', description: '底面や背面の銘・刻印を接写。古美術としての価値を証明する重要な写真。' },
      { title: '質感・素材感', description: '素材の質感が伝わるアップ。焼き物の釉薬、木目、金属の光沢など。' },
      { title: '傷・欠け・修復跡', description: '経年の状態を正直に。欠けやヒビがあれば寄って撮影。隠さない。' },
      { title: '付属品・箱', description: '共箱・共布・栞など付属品があれば。箱の書付も。' },
    ],
  },
  'ヤフオク現行': {
    style: '白背景・スペック重視',
    tips: '白背景で清潔感。正面から水平に撮影。型番が読めることが最重要。',
    guides: [
      { title: '正面全体（メイン画像）', description: '白背景で商品全体を正面から撮影。上からの斜め撮りNG。商品が画面の60-70%を占めるように。' },
      { title: '型番・スペックラベル', description: '型番・製造番号が読めるように接写。これが検索でヒットする鍵。' },
      { title: '動作確認', description: '電源ランプ点灯、画面表示など動作状態の証拠写真。' },
      { title: '傷・汚れ・使用感', description: '目立つ傷や汚れを寄って撮影。コンディションの根拠。' },
      { title: '付属品一式', description: 'ケーブル・説明書・箱など付属品を並べて1枚。「写真の物が全て」の証拠。' },
    ],
  },
  'eBayシングル': {
    style: '白背景・国際基準',
    tips: '白背景必須。eBayでは白背景の写真が検索上位に表示されやすい。正面から撮影。',
    guides: [
      { title: '正面全体（メイン画像）', description: '純白背景で商品を正面から。eBayの検索アルゴリズムは白背景を優遇。上からの撮影NG。' },
      { title: '背面・底面', description: 'Made in Japanの刻印やブランドマークが海外バイヤーの判断材料。' },
      { title: 'スケール（サイズ感）', description: '定規やコインを横に置いてサイズ感を伝える。海外バイヤーはcm/inchが分からない。' },
      { title: 'ディテール・質感', description: '素材感や細工の美しさが伝わるアップ。職人技が分かる写真。' },
      { title: 'コンディション', description: '傷・欠けを正直に。eBayでは「not as described」の返品リスクがある。' },
    ],
  },
  'ヤフオクまとめ': {
    style: '全体俯瞰＋代表品アップ',
    tips: '全商品を並べた俯瞰写真がメイン。代表的な商品のアップを追加。',
    guides: [
      { title: '全体俯瞰（メイン画像）', description: '全商品を並べて真上から撮影。点数が分かるように。これがまとめ売りの顔。' },
      { title: '代表品アップ①', description: '一番良い状態の商品を正面からアップ。セットの質を伝える。' },
      { title: '代表品アップ②', description: '別の商品のアップ。バリエーションが分かるように。' },
      { title: '状態の悪いもの', description: '一番状態が悪い商品も撮影。「最悪でもこの程度」を伝える。クレーム防止。' },
    ],
  },
};

function buildPhotoGuide() {
  // チャンネル別の撮影ガイドを取得
  const channel = currentItem.channel || '';
  const styleGuide = PHOTO_STYLE_GUIDE[channel] || PHOTO_STYLE_GUIDE['ヤフオク現行'];

  // ガイドテキストを更新
  const guideText = document.getElementById('guideText');
  if (guideText) {
    guideText.innerHTML = `<strong>${styleGuide.style}</strong><br>${styleGuide.tips}`;
  }

  // チャンネル別ガイド + AIからの追加ガイド
  const channelGuides = styleGuide.guides;
  const aiGuides = currentItem.photoGuide || [];
  const guides = [...channelGuides, ...aiGuides.filter(g =>
    !channelGuides.some(d => d.title === g.title)
  )];

  const list = document.getElementById('photoGuideList');
  list.innerHTML = '';
  guides.forEach((g, i) => {
    const num = i + 1;
    const div = document.createElement('div');
    div.className = 'photo-guide-item';
    div.innerHTML = `
      <div class="photo-guide-num" id="guideNum${num}">${num}</div>
      <div class="photo-guide-text">
        <div class="photo-guide-title">${escapeHtml(g.title)}</div>
        <div class="photo-guide-desc">${escapeHtml(g.description)}</div>
      </div>
      <button class="photo-guide-btn" id="guideBtn${num}" onclick="takeGuidePhoto(${num})">📷 撮影</button>
    `;
    list.appendChild(div);
  });

  photosTaken = 0;
  document.getElementById('afterAllPhotos').style.display = 'block';
}

let guidePhotoTarget = 0;

function takeGuidePhoto(num) {
  guidePhotoTarget = num;
  const input = document.getElementById('guidePhotoInput2');
  input.value = '';
  input.click();
}

function handleGuidePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const num = guidePhotoTarget;
  const reader = new FileReader();
  reader.onload = function(ev) {
    compressImage(ev.target.result, 1200, 0.8, (compressed) => {
      currentItem['photo' + num] = compressed;
      const numEl = document.getElementById('guideNum' + num);
      const btnEl = document.getElementById('guideBtn' + num);
      if (numEl) { numEl.classList.add('done'); numEl.textContent = '✓'; }
      if (btnEl) { btnEl.classList.add('done'); btnEl.textContent = '✓ 完了'; btnEl.onclick = null; }
      photosTaken++;
      document.getElementById('afterAllPhotos').style.display = 'block';
    });
  };
  reader.readAsDataURL(file);
}

function goToStep4() {
  showCameraStep(4);
}

// ====== 保管場所 ======
function selectLocation(loc) {
  document.querySelectorAll('.location-btn').forEach(b => b.classList.remove('selected'));
  event.target.classList.add('selected');
  currentItem.location = loc;

  setTimeout(() => completeRegistration(loc), 300);
}

// ====== 登録完了 ======
async function completeRegistration(loc) {
  // 作業セッションクリア
  clearWorkingSession();
  // 管理番号生成
  const mgmtNum = generateManagementNumber();
  currentItem.mgmtNum = mgmtNum;
  currentItem.location = loc;

  // 完了画面表示
  document.getElementById('completeMgmtNum').textContent = mgmtNum;
  document.getElementById('completeProduct').textContent = currentItem.productName || '—';
  document.getElementById('completeChannel').textContent = currentItem.channel || '—';
  document.getElementById('completeLocation').textContent = loc;
  showCameraStep(5);

  // 出品情報の表示（通販チャンネル=1〜5の場合）
  const listingSection = document.getElementById('listingSection');
  if (currentItem.channelNumber && currentItem.channelNumber <= 5) {
    listingSection.style.display = 'block';
    document.getElementById('listingTitle').value = currentItem.listingTitle || currentItem.productName || '';
    document.getElementById('listingDesc').value = currentItem.listingDescription || '';
    document.getElementById('listingPrice').value = currentItem.startPrice || '';
  } else {
    listingSection.style.display = 'none';
  }

  // ローカルに保存
  addItem({
    mgmtNum: mgmtNum,
    productName: currentItem.productName,
    maker: currentItem.maker,
    modelNumber: currentItem.modelNumber,
    category: currentItem.category,
    channel: currentItem.channel,
    channelNumber: currentItem.channelNumber,
    estimatedPrice: currentItem.estimatedPrice,
    startPrice: currentItem.startPrice,
    condition: currentItem.condition,
    conditionNote: currentItem.conditionNote,
    estimatedSize: currentItem.estimatedSize,
    shippingSize: currentItem.shippingSize,
    needsApproval: currentItem.needsApproval,
    approvalReason: currentItem.approvalReason,
    score: currentItem.score,
    location: loc,
    listingTitle: currentItem.listingTitle,
    listingDescription: currentItem.listingDescription,
    staffName: currentUser.name,
  });

  // Google Driveに写真アップロード（バックグラウンド）
  uploadToDrive(mgmtNum).then(result => {
    if (result && result.folderUrl) {
      currentItem.driveFolderUrl = result.folderUrl;
      console.log('Drive保存完了:', result.folderUrl);
    }
  }).catch(err => {
    console.error('Driveアップロードエラー:', err);
  });

  // GASに送信（バックグラウンド）
  sendToGAS({
    kanri_bango: mgmtNum,
    kakutei_channel: currentItem.channel || '',
    item_name: currentItem.productName || '',
    maker: currentItem.maker || '',
    model_number: currentItem.modelNumber || '',
    condition: currentItem.condition || '',
    predicted_price: currentItem.estimatedPrice ? `¥${currentItem.estimatedPrice.min}〜¥${currentItem.estimatedPrice.max}` : '',
    start_price: String(currentItem.startPrice || ''),
    score: String(currentItem.score || ''),
    location: loc,
    estimated_size: currentItem.estimatedSize || '',
    listing_title: currentItem.listingTitle || '',
    staff_id: currentUser.name,
    needs_approval: currentItem.needsApproval ? 'はい' : 'いいえ',
    approval_reason: currentItem.approvalReason || '',
    timestamp: formatTimestamp(),
  }).then(() => {
    console.log('GAS送信完了');
  }).catch(err => {
    console.error('GAS送信エラー:', err);
    // エラーでもローカルには保存済みなので大丈夫
  });

  // 統計更新
  updateHomeStats();

  showToast('✅ ' + mgmtNum + ' 登録完了');
}

function startNewItem() {
  resetCameraFlow();
  switchTab('camera');
}

// ====== 出品情報コピー ======
function copyListing() {
  const title = document.getElementById('listingTitle').value;
  const desc = document.getElementById('listingDesc').value;
  const price = document.getElementById('listingPrice').value;
  const text = `【タイトル】\n${title}\n\n【説明文】\n${desc}\n\n【スタート価格】¥${Number(price).toLocaleString()}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 出品情報をコピーしました');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('📋 出品情報をコピーしました');
}

// ====== Google Drive連携 ======
async function uploadToDrive(mgmtNum) {
  // 撮影した写真を収集
  const images = [];
  if (currentItem.photo1) {
    images.push({ data: currentItem.photo1, name: '01_商品.jpg', mimeType: 'image/jpeg' });
  }
  if (currentItem.photo2) {
    images.push({ data: currentItem.photo2, name: '02_商品.jpg', mimeType: 'image/jpeg' });
  }
  if (currentItem.photo3) {
    images.push({ data: currentItem.photo3, name: '03_商品.jpg', mimeType: 'image/jpeg' });
  }
  if (currentItem.photo4) {
    images.push({ data: currentItem.photo4, name: '04_商品.jpg', mimeType: 'image/jpeg' });
  }
  if (currentItem.photo5) {
    images.push({ data: currentItem.photo5, name: '05_商品.jpg', mimeType: 'image/jpeg' });
  }

  if (images.length === 0) return null;

  try {
    const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-drive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        managementNumber: mgmtNum,
        images: images,
      }),
    });
    return await response.json();
  } catch (err) {
    console.error('Drive upload error:', err);
    return null;
  }
}

// ====== GAS連携 ======
async function sendToGAS(payload) {
  const url = IS_TEST_MODE ? CONFIG.GAS_URL_TEST : CONFIG.GAS_URL;
  if (IS_TEST_MODE) {
    payload._test = true;
    console.log('[テストモード] GAS送信:', JSON.stringify(payload).slice(0, 200));
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'no-cors',
    });
    return true;
  } catch (err) {
    console.error('GAS送信エラー:', err);
    return false;
  }
}

// ====== チャット ======
// ====== AI相談チャット ======
let chatMsgId = 0;

function sendAIChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage(msg, 'user');
  input.value = '';
  // 定型文を非表示
  const suggestions = document.getElementById('aiSuggestions');
  if (suggestions) suggestions.style.display = 'none';

  chatWithAI(msg);
}

function askSuggestion(btn) {
  const msg = btn.textContent;
  document.getElementById('chatInput').value = msg;
  sendAIChat();
}

async function chatWithAI(msg) {
  addChatMessage('考え中...', 'bot', 'thinking');

  try {
    const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        image: null,
        step: 'chat',
        context: { question: msg, staffName: currentUser.name },
      }),
    });

    const result = await response.json();
    removeChatMessage('thinking');

    if (result.success && result.judgment) {
      addChatMessage(typeof result.judgment === 'string' ? result.judgment : JSON.stringify(result.judgment), 'bot');
    } else if (result.raw) {
      addChatMessage(result.raw, 'bot');
    } else {
      addChatMessage('すみません、回答できませんでした。浅野さんに相談してください。', 'bot');
    }
  } catch (err) {
    removeChatMessage('thinking');
    addChatMessage('通信エラーが発生しました。', 'bot');
  }
}

function addChatMessage(text, type, id) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  chatMsgId++;
  const msgId = id || ('msg-' + chatMsgId);
  div.className = 'chat-msg ' + type;
  div.id = 'chat-' + msgId;
  const avatar = type === 'bot' ? '🤖' : '👤';
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const deleteBtn = type === 'user' ? `<button class="chat-delete" onclick="deleteChatMsg('${msgId}')" title="削除">✕</button>` : '';

  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble-wrap">
      <div class="chat-bubble">${escapeHtml(text)}</div>
      <div class="chat-meta">
        <span class="chat-time">${timeStr}</span>
        ${deleteBtn}
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function deleteChatMsg(id) {
  const el = document.getElementById('chat-' + id);
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(() => el.remove(), 200);
  }
}

function removeChatMessage(id) {
  const el = document.getElementById('chat-' + id);
  if (el) el.remove();
}

function startConsultation() {
  addChatMessage('浅野さんへの相談を入力してください。写真付きの場合は撮影タブから商品を登録し、「相談する」ボタンを使ってください。', 'bot');
}

// ====== 商品詳細・出荷登録 ======
let selectedItem = null;

function openItemDetail(mgmtNum) {
  const items = getItems();
  const item = items.find(i => i.mgmtNum === mgmtNum);
  if (!item) { showToast('商品が見つかりません'); return; }

  selectedItem = item;
  document.getElementById('detailMgmtNum').textContent = item.mgmtNum;
  document.getElementById('detailName').textContent = item.productName || '—';
  document.getElementById('detailMaker').textContent = item.maker || '—';
  document.getElementById('detailChannel').textContent = item.channel || '—';
  document.getElementById('detailPrice').textContent = item.estimatedPrice
    ? `¥${item.estimatedPrice.min?.toLocaleString()}〜¥${item.estimatedPrice.max?.toLocaleString()}`
    : '—';
  document.getElementById('detailCondition').textContent = `${item.condition || '—'} ${item.conditionNote || ''}`;
  document.getElementById('detailSize').textContent = item.estimatedSize || '—';
  document.getElementById('detailLocation').textContent = item.location || '—';
  document.getElementById('detailStatus').textContent = item.status || '登録済';

  // 出荷済みなら出荷セクション非表示
  const shippingSection = document.getElementById('shippingSection');
  if (item.shipped) {
    shippingSection.style.display = 'none';
  } else {
    shippingSection.style.display = 'block';
  }

  // 管理者用: 削除ボタン表示
  const deleteBtn = document.getElementById('adminDeleteBtn');
  if (deleteBtn) {
    deleteBtn.style.display = currentUser?.isAdmin ? '' : 'none';
    deleteBtn.onclick = () => deleteItem(mgmtNum);
  }

  document.getElementById('itemDetailOverlay').classList.add('open');
}

function closeItemDetail() {
  document.getElementById('itemDetailOverlay').classList.remove('open');
  selectedItem = null;
}

function deleteItem(mgmtNum) {
  if (!confirm(`${mgmtNum} を削除しますか？`)) return;
  const data = loadLocalData();
  data.items = data.items.filter(i => i.mgmtNum !== mgmtNum);
  saveLocalData(data);
  // GASにも削除を通知
  sendToGAS({
    action: 'delete_item',
    mgmtNum: mgmtNum,
    deletedBy: currentUser.name,
    timestamp: formatTimestamp(),
  });
  closeItemDetail();
  renderStockList();
  updateHomeStats();
  showToast(`${mgmtNum} を削除しました`);
}

function scanTrackingLabel() {
  document.getElementById('trackingPhotoInput').click();
}

async function handleTrackingPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast('🤖 送り状を読み取り中...');

  const reader = new FileReader();
  reader.onload = async function(e) {
    compressImage(e.target.result, 1200, 0.8, async (compressed) => {
      try {
        // Edge Function経由でClaude Visionに送り状を読ませる
        const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            image: compressed,
            step: 'tracking',
            context: { task: '送り状から追跡番号と運送会社を読み取ってください。JSON形式: {"carrier":"運送会社名","trackingNumber":"追跡番号"}' },
          }),
        });
        const result = await response.json();
        if (result.success && result.judgment) {
          const j = result.judgment;
          if (j.trackingNumber) {
            document.getElementById('shippingTracking').value = j.trackingNumber;
          }
          if (j.carrier) {
            const sel = document.getElementById('shippingCarrier');
            for (let opt of sel.options) {
              if (opt.value.includes(j.carrier) || j.carrier.includes(opt.value)) {
                sel.value = opt.value;
                break;
              }
            }
          }
          showToast('✅ 読み取り完了');
        } else {
          showToast('読み取れませんでした。手入力してください。');
        }
      } catch (err) {
        console.error('Tracking OCR error:', err);
        showToast('読み取りエラー。手入力してください。');
      }
    });
  };
  reader.readAsDataURL(file);
}

async function completeShipping() {
  if (!selectedItem) return;

  const carrier = document.getElementById('shippingCarrier').value;
  const tracking = document.getElementById('shippingTracking').value.trim();

  if (!carrier) { showToast('運送会社を選択してください'); return; }
  if (!tracking && carrier !== '購入者引取') { showToast('追跡番号を入力してください'); return; }

  // ローカルデータ更新
  const data = loadLocalData();
  const idx = data.items.findIndex(i => i.mgmtNum === selectedItem.mgmtNum);
  if (idx >= 0) {
    data.items[idx].shipped = true;
    data.items[idx].carrier = carrier;
    data.items[idx].trackingNumber = tracking;
    data.items[idx].shippedAt = new Date().toISOString();
    data.items[idx].status = '出荷済';
    saveLocalData(data);
  }

  // GASに送信
  sendToGAS({
    action: 'shipping_update',
    kanri_bango: selectedItem.mgmtNum,
    carrier: carrier,
    tracking_number: tracking,
    staff_id: currentUser.name,
    timestamp: formatTimestamp(),
  });

  showToast('🚚 ' + selectedItem.mgmtNum + ' 出荷完了');
  closeItemDetail();
  renderStockList();
}

// ====== ステータスフィルター ======
let currentFilter = 'all';

function updateStatusCounts() {
  const items = getItems();
  const all = items.length;
  const registered = items.filter(i => !i.needsApproval && !i.shipped).length;
  const approval = items.filter(i => i.needsApproval && !i.shipped).length;
  const listed = items.filter(i => i.status === '出品中').length;
  const shipped = items.filter(i => i.shipped).length;

  const el = (id) => document.getElementById(id);
  if (el('countAll')) el('countAll').textContent = all;
  if (el('countRegistered')) el('countRegistered').textContent = registered;
  if (el('countApproval')) el('countApproval').textContent = approval;
  if (el('countListed')) el('countListed').textContent = listed;
  if (el('countShipped')) el('countShipped').textContent = shipped;
}

function filterByStatus(status) {
  currentFilter = status;
  const titleEl = document.getElementById('stockListTitle');
  if (status === 'all') {
    titleEl.textContent = '📦 全商品';
  } else {
    titleEl.textContent = '📦 ' + status;
  }
  renderStockList();
}

// ====== 出退勤 ======
function toggleNoBreak() {
  const checked = document.getElementById('noBreakCheck').checked;
  const bStartEl = document.getElementById('breakStartDisplay');
  const bEndEl = document.getElementById('breakEndDisplay');
  if (bStartEl) bStartEl.style.opacity = checked ? '0.3' : '1';
  if (bEndEl) bEndEl.style.opacity = checked ? '0.3' : '1';
}

function submitAttendance() {
  // 1日1回チェック
  const today = new Date().toISOString().slice(0, 10);
  const saved = localStorage.getItem('f8_attendance_' + today);
  if (saved) {
    showToast('本日は既に登録済みです。修正は浅野さんに連絡してください。');
    return;
  }

  const start = document.getElementById('attendStart').value;
  const end = document.getElementById('attendEnd').value;
  const noBreak = document.getElementById('noBreakCheck').checked;
  const breakStart = noBreak ? null : document.getElementById('breakStart').value;
  const breakEnd = noBreak ? null : document.getElementById('breakEnd').value;

  if (!start) { showToast('出勤時刻を入力してください'); return; }
  if (!end) { showToast('退勤時刻を入力してください'); return; }

  // 実働時間計算
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  let breakMin = 0;
  if (!noBreak && breakStart && breakEnd) {
    const [bsh, bsm] = breakStart.split(':').map(Number);
    const [beh, bem] = breakEnd.split(':').map(Number);
    breakMin = (beh * 60 + bem) - (bsh * 60 + bsm);
  }
  const netMin = totalMin - breakMin;
  const netHours = (netMin / 60).toFixed(1);

  // GASに送信
  sendToGAS({
    action: 'attendance',
    staff_id: currentUser.name,
    type: '勤務申告',
    start_time: start,
    end_time: end,
    break_start: breakStart || '',
    break_end: breakEnd || '',
    no_break: noBreak ? 'はい' : 'いいえ',
    break_minutes: breakMin,
    net_hours: netHours,
    timestamp: formatTimestamp(),
  });

  // ローカルに記録
  localStorage.setItem('f8_attendance_' + today, JSON.stringify({
    start, end, breakStart, breakEnd, noBreak, breakMin, netHours, staffName: currentUser.name,
  }));

  // 表示更新
  const breakText = noBreak ? '休憩なし' : `休憩${breakMin}分`;
  const msg = document.getElementById('attendanceMsg');
  msg.textContent = `✅ ${start}〜${end}（${breakText}・実働${netHours}時間）記録済み`;
  msg.classList.add('recorded');

  // 入力欄を隠す
  document.querySelectorAll('.attendance-form .attendance-row').forEach(el => el.style.display = 'none');

  showToast('🕐 勤務記録を送信しました');

  // ホーム画面の出勤メンバー更新
  renderMemberTimeline();
}

function checkTodayAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = localStorage.getItem('f8_attendance_' + today);
  if (saved) {
    try {
      const a = JSON.parse(saved);
      const msg = document.getElementById('attendanceMsg');
      if (msg) {
        msg.textContent = `✅ ${a.start}〜${a.end}（実働${a.netHours}時間）記録済み`;
        msg.classList.add('recorded');
        document.getElementById('attendStart').value = a.start;
        document.getElementById('attendEnd').value = a.end;
        // 時間入力欄を隠す
        const attendRow = document.querySelector('.attendance-form .attendance-row');
        if (attendRow) attendRow.style.display = 'none';
        // 送信ボタンを修正依頼ボタンに差し替え
        const submitBtn = document.querySelector('[onclick="submitAttendance()"]');
        if (submitBtn) {
          submitBtn.textContent = '修正を依頼・相談';
          submitBtn.onclick = requestAttendanceCorrection;
          submitBtn.className = 'btn btn-outline';
        }
      }
    } catch {}
  }
}

// ====== アナログ時計ピッカー ======
let clockTarget = 'start'; // 'start' or 'end'
let clockMode = 'hour'; // 'hour' or 'min'
let clockHour = 9;
let clockMin = 0;

function drawMiniClock(canvasId, hour, min) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, r = Math.min(cx, cy) - 4;

  ctx.clearRect(0, 0, w, h);

  // 文字盤
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#dde0e6'; ctx.lineWidth = 2; ctx.stroke();

  // 目盛り
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(a) * (r - 8), y1 = cy + Math.sin(a) * (r - 8);
    const x2 = cx + Math.cos(a) * (r - 2), y2 = cy + Math.sin(a) * (r - 2);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // 短針
  const ha = ((hour % 12) * 30 + min * 0.5 - 90) * Math.PI / 180;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ha) * (r * 0.5), cy + Math.sin(ha) * (r * 0.5));
  ctx.strokeStyle = '#1C2541'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();

  // 長針
  const ma = (min * 6 - 90) * Math.PI / 180;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ma) * (r * 0.7), cy + Math.sin(ma) * (r * 0.7));
  ctx.strokeStyle = '#C5A258'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();

  // 中心
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#C5A258'; ctx.fill();
}

function openClockPicker(target) {
  clockTarget = target;
  const inputMap = { start: 'attendStart', end: 'attendEnd', breakStart: 'breakStart', breakEnd: 'breakEnd' };
  const titleMap = { start: '出勤時刻', end: '退勤時刻', breakStart: '休憩開始', breakEnd: '休憩終了' };
  const current = document.getElementById(inputMap[target] || 'attendStart').value || '09:00';
  const [h, m] = current.split(':').map(Number);
  clockHour = h; clockMin = m;
  clockMode = 'hour';

  document.getElementById('clockPickerTitle').textContent = titleMap[target] || '時刻を選択';
  updateClockPickerDisplay();
  drawClockPickerFace();
  document.getElementById('clockModeHour').classList.add('active');
  document.getElementById('clockModeMin').classList.remove('active');
  document.getElementById('clockPickerOverlay').classList.add('open');
}

function closeClockPicker() {
  document.getElementById('clockPickerOverlay').classList.remove('open');
}

function setClockMode(mode) {
  clockMode = mode;
  document.getElementById('clockModeHour').classList.toggle('active', mode === 'hour');
  document.getElementById('clockModeMin').classList.toggle('active', mode === 'min');
  drawClockPickerFace();
}

function updateClockPickerDisplay() {
  const str = String(clockHour).padStart(2, '0') + ':' + String(clockMin).padStart(2, '0');
  document.getElementById('clockPickerDisplay').textContent = str;
}

function drawClockPickerFace() {
  const canvas = document.getElementById('clockPickerCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, r = 115;

  ctx.clearRect(0, 0, w, h);

  // 背景
  ctx.beginPath(); ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = '#F8F5EE'; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#dde0e6'; ctx.lineWidth = 2; ctx.stroke();

  if (clockMode === 'hour') {
    // 時の数字（1-12）
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * (r - 25);
      const y = cy + Math.sin(a) * (r - 25);
      const isSelected = (clockHour % 12 === i % 12);
      if (isSelected) {
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#C5A258'; ctx.fill();
      }
      ctx.font = isSelected ? 'bold 16px sans-serif' : '14px sans-serif';
      ctx.fillStyle = isSelected ? '#fff' : '#1C2541';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i), x, y);
    }
    // PM表示（13-24の内側リング）
    for (let i = 13; i <= 24; i++) {
      const a = ((i - 12) * 30 - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * (r - 55);
      const y = cy + Math.sin(a) * (r - 55);
      const displayNum = i === 24 ? 0 : i;
      const isSelected = (clockHour === displayNum || (clockHour === 0 && i === 24));
      if (isSelected) {
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#1C2541'; ctx.fill();
      }
      ctx.font = isSelected ? 'bold 13px sans-serif' : '12px sans-serif';
      ctx.fillStyle = isSelected ? '#fff' : '#888';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(displayNum), x, y);
    }
    // 針
    const selectedA = (clockHour % 12 * 30 - 90) * Math.PI / 180;
    const needleR = clockHour >= 13 || clockHour === 0 ? r - 55 : r - 25;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(selectedA) * needleR, cy + Math.sin(selectedA) * needleR);
    ctx.strokeStyle = '#C5A258'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    // 分の数字（0, 5, 10, 15...55）
    for (let i = 0; i < 12; i++) {
      const minVal = i * 5;
      const a = (i * 30 - 90) * Math.PI / 180;
      const x = cx + Math.cos(a) * (r - 25);
      const y = cy + Math.sin(a) * (r - 25);
      const isSelected = (clockMin === minVal);
      if (isSelected) {
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#C5A258'; ctx.fill();
      }
      ctx.font = isSelected ? 'bold 16px sans-serif' : '14px sans-serif';
      ctx.fillStyle = isSelected ? '#fff' : '#1C2541';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(minVal).padStart(2, '0'), x, y);
    }
    // 針
    const selectedA = (clockMin * 6 - 90) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(selectedA) * (r - 25), cy + Math.sin(selectedA) * (r - 25));
    ctx.strokeStyle = '#C5A258'; ctx.lineWidth = 2; ctx.stroke();
  }

  // 中心点
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#C5A258'; ctx.fill();
}

// 時計ピッカーのタップ操作
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('clockPickerCanvas');
  if (canvas) {
    canvas.addEventListener('click', handleClockTap);
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      handleClockTapAt(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });
  }
});

function handleClockTap(e) {
  const rect = e.target.getBoundingClientRect();
  handleClockTapAt(e.clientX - rect.left, e.clientY - rect.top);
}

function handleClockTapAt(x, y) {
  const cx = 130, cy = 130;
  const dx = x - cx, dy = y - cy;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  if (angle < 0) angle += 360;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (clockMode === 'hour') {
    let h = Math.round(angle / 30);
    if (h === 0) h = 12;
    if (dist < 70) {
      // 内側リング（13-24）
      h = h === 12 ? 0 : h + 12;
    }
    clockHour = h;
    updateClockPickerDisplay();
    drawClockPickerFace();
    // 自動で分モードに切り替え
    setTimeout(() => setClockMode('min'), 300);
  } else {
    let m = Math.round(angle / 6);
    if (m === 60) m = 0;
    // 5分刻みにスナップ
    m = Math.round(m / 5) * 5;
    if (m === 60) m = 0;
    clockMin = m;
    updateClockPickerDisplay();
    drawClockPickerFace();
  }
}

function applyClockPicker() {
  const str = String(clockHour).padStart(2, '0') + ':' + String(clockMin).padStart(2, '0');
  const inputMap = { start: 'attendStart', end: 'attendEnd', breakStart: 'breakStart', breakEnd: 'breakEnd' };
  const displayMap = { start: 'attendStartDisplay', end: 'attendEndDisplay', breakStart: 'breakStartDisplay', breakEnd: 'breakEndDisplay' };
  const inputEl = document.getElementById(inputMap[clockTarget]);
  const displayEl = document.getElementById(displayMap[clockTarget]);
  if (inputEl) inputEl.value = str;
  if (displayEl) displayEl.textContent = str;
  closeClockPicker();
}

function initMiniClocks() {
  // 時間入力カラム方式に変更。ミニ時計は不要
}

let attendHistoryYear, attendHistoryMonth;

function toggleAttendanceHistory() {
  const el = document.getElementById('attendanceHistory');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    document.getElementById('attendHistoryBtn').textContent = '📅 出勤状況を閉じる';
    const now = new Date();
    attendHistoryYear = now.getFullYear();
    attendHistoryMonth = now.getMonth();
    renderAttendanceHistory();
  } else {
    el.style.display = 'none';
    document.getElementById('attendHistoryBtn').textContent = '📅 今月の出勤状況を見る';
  }
}

function changeAttendMonth(dir) {
  attendHistoryMonth += dir;
  if (attendHistoryMonth < 0) { attendHistoryMonth = 11; attendHistoryYear--; }
  if (attendHistoryMonth > 11) { attendHistoryMonth = 0; attendHistoryYear++; }
  // 未来月には進めない
  const now = new Date();
  if (attendHistoryYear > now.getFullYear() || (attendHistoryYear === now.getFullYear() && attendHistoryMonth > now.getMonth())) {
    attendHistoryMonth = now.getMonth();
    attendHistoryYear = now.getFullYear();
    return;
  }
  renderAttendanceHistory();
}

function renderAttendanceHistory() {
  const el = document.getElementById('attendanceHistory');
  const year = attendHistoryYear;
  const month = attendHistoryMonth;
  const now = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay(); // 0=日
  const dayLabels = ['日','月','火','水','木','金','土'];
  const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth());

  let totalDays = 0;
  let totalHours = 0;

  let html = `<div class="attend-history-card">
    <div class="attend-month-nav">
      <button class="attend-nav-btn" onclick="changeAttendMonth(-1)">◀</button>
      <h4 class="attend-month-title">${year}年${month + 1}月</h4>
      <button class="attend-nav-btn ${isCurrentMonth ? 'disabled' : ''}" onclick="changeAttendMonth(1)" ${isCurrentMonth ? 'disabled' : ''}>▶</button>
    </div>
    <div class="attend-cal-grid">
      <div class="attend-cal-header">`;

  // 曜日ヘッダー
  for (let i = 0; i < 7; i++) {
    const cls = (i === 0) ? 'attend-cal-dow sun' : (i === 6) ? 'attend-cal-dow sat' : 'attend-cal-dow';
    html += `<div class="${cls}">${dayLabels[i]}</div>`;
  }
  html += `</div><div class="attend-cal-body">`;

  // 空セル（月初の曜日まで）
  for (let i = 0; i < firstDow; i++) {
    html += `<div class="attend-cal-cell empty"></div>`;
  }

  // 日付セル
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = date.toISOString().slice(0, 10);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isFuture = date > now;
    const saved = localStorage.getItem('f8_attendance_' + dateStr);

    let cellClass = 'attend-cal-cell';
    let content = `<div class="attend-cal-date">${d}</div>`;
    let dot = '';

    if (saved) {
      try {
        const a = JSON.parse(saved);
        totalDays++;
        totalHours += parseFloat(a.netHours);
        dot = `<div class="attend-cal-dot worked"></div><div class="attend-cal-hours">${a.netHours}h</div>`;
        cellClass += ' worked';
      } catch {}
    } else if (!isFuture) {
      if (isWeekend) {
        cellClass += ' off';
      } else {
        dot = `<div class="attend-cal-dot missing"></div>`;
        cellClass += ' missing';
      }
    } else {
      cellClass += ' future';
    }

    if (dow === 0) cellClass += ' sun';
    if (dow === 6) cellClass += ' sat';

    html += `<div class="${cellClass}">${content}${dot}</div>`;
  }

  html += `</div></div>
    <div class="attend-summary">
      <span>出勤日数: <strong>${totalDays}日</strong></span>
      <span>合計実働: <strong>${totalHours.toFixed(1)}時間</strong></span>
    </div>
  </div>`;

  el.innerHTML = html;
}

function openAttendanceConsult() {
  const msg = prompt('勤怠についての連絡・相談内容を入力してください：');
  if (!msg) return;

  sendToGAS({
    action: 'chat_message',
    from: currentUser.name,
    to: '浅野儀頼',
    message: `【勤怠連絡】${msg}`,
    timestamp: formatTimestamp(),
  });
  showToast('💬 浅野さんに送信しました');
}

function requestAttendanceCorrection() {
  sendToGAS({
    action: 'chat_message',
    from: currentUser.name,
    to: '浅野儀頼',
    message: `出退勤の修正を依頼します。本日の記録を確認してください。`,
    timestamp: formatTimestamp(),
  });
  showToast('📝 浅野さんに修正依頼を送信しました');
}

// ====== 在庫検索 ======
function searchStock() {
  const q = document.getElementById('stockSearch').value.trim();
  if (!q) return;
  const items = getItems();
  const results = items.filter(i =>
    (i.productName && i.productName.includes(q)) ||
    (i.mgmtNum && i.mgmtNum.includes(q)) ||
    (i.maker && i.maker.includes(q))
  );
  if (results.length === 0) {
    showToast('「' + q + '」は見つかりませんでした');
  } else {
    showToast(results.length + '件見つかりました');
    // 検索結果を表示
    const list = document.getElementById('stockList');
    let html = '';
    results.forEach(item => {
      html += `
        <div class="stock-card">
          <div class="stock-header">
            <span class="stock-number">${item.mgmtNum || '---'}</span>
            <span class="stock-status status-listing">登録済</span>
          </div>
          <div class="stock-name">${escapeHtml(item.productName || '不明')}</div>
          <div class="stock-meta">${escapeHtml(item.channel || '---')} ・ ¥${item.estimatedPrice?.min?.toLocaleString() || '---'}</div>
        </div>
      `;
    });
    list.innerHTML = html;
  }
}

// ====== 経費精算 ======
function openReceiptModal() {
  document.getElementById('receiptOverlay').classList.add('open');
  document.getElementById('receiptStep1').style.display = 'block';
  document.getElementById('receiptStep2').style.display = 'none';
  document.getElementById('receiptLoading').style.display = 'none';
}

function closeReceiptModal() {
  document.getElementById('receiptOverlay').classList.remove('open');
}

function takeReceiptPhoto() {
  document.getElementById('receiptPhotoInput').click();
}

async function handleReceiptPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('receiptLoading').style.display = 'block';

  const reader = new FileReader();
  reader.onload = async function(e) {
    compressImage(e.target.result, 1200, 0.8, async (compressed) => {
      try {
        // Claude VisionでレシートOCR
        const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            image: compressed,
            step: 'receipt',
            context: { task: 'このレシート/領収書から以下の情報をJSON形式で読み取ってください: {"date":"YYYY-MM-DD","shop":"店舗名","amount":金額数値,"tax":"10%or8%orなし","category":"勘定科目推定","memo":"品目"}' },
          }),
        });
        const result = await response.json();
        document.getElementById('receiptLoading').style.display = 'none';

        if (result.success && result.judgment) {
          const r = result.judgment;
          document.getElementById('receiptDate').value = r.date || new Date().toISOString().slice(0, 10);
          document.getElementById('receiptShop').value = r.shop || '';
          document.getElementById('receiptAmount').value = r.amount || '';
          document.getElementById('receiptMemo').value = r.memo || '';
          if (r.category) {
            const sel = document.getElementById('receiptCategory');
            for (let opt of sel.options) {
              if (opt.value.includes(r.category) || r.category.includes(opt.value)) {
                sel.value = opt.value; break;
              }
            }
          }
          document.getElementById('receiptStep1').style.display = 'none';
          document.getElementById('receiptStep2').style.display = 'block';
        } else {
          showToast('読み取れませんでした。手入力してください。');
          document.getElementById('receiptStep1').style.display = 'none';
          document.getElementById('receiptStep2').style.display = 'block';
        }
      } catch (err) {
        console.error('Receipt OCR error:', err);
        document.getElementById('receiptLoading').style.display = 'none';
        showToast('読み取りエラー。手入力してください。');
        document.getElementById('receiptStep1').style.display = 'none';
        document.getElementById('receiptStep2').style.display = 'block';
      }
    });
  };
  reader.readAsDataURL(file);
}

function submitReceipt() {
  const jigyoubu = document.getElementById('receiptJigyoubu').value;
  const date = document.getElementById('receiptDate').value;
  const shop = document.getElementById('receiptShop').value;
  const amount = document.getElementById('receiptAmount').value;
  const category = document.getElementById('receiptCategory').value;
  const memo = document.getElementById('receiptMemo').value;

  if (!date || !shop || !amount) {
    showToast('日付・支払先・金額は必須です');
    return;
  }

  sendToGAS({
    action: 'keihi',
    jigyoubu: jigyoubu,
    date: date,
    shop_name: shop,
    amount: amount,
    category: category,
    memo: memo,
    staff_id: currentUser.name,
    timestamp: formatTimestamp(),
  });

  showToast('🧾 経費精算を登録しました');
  closeReceiptModal();
}

// ====== ヘルプ ======
function showHelp() {
  document.getElementById('helpOverlay').classList.add('open');
}

function closeHelp() {
  document.getElementById('helpOverlay').classList.remove('open');
}

// ====== 通知システム ======
let notifications = [];
let notifPollTimer = null;

let lastNotifCount = 0;

function startNotificationPolling() {
  fetchNotifications();
  notifPollTimer = setInterval(fetchNotifications, 30000);
}

function stopNotificationPolling() {
  if (notifPollTimer) clearInterval(notifPollTimer);
}

async function fetchNotifications() {
  try {
    // ローカルデータから承認待ちを取得
    const items = getItems();
    const pending = items.filter(i => i.needsApproval && !i.approved && !i.rejected);

    // 通知を構築
    notifications = [];
    pending.forEach(item => {
      notifications.push({
        id: item.mgmtNum,
        type: 'approval',
        title: '承認待ち',
        body: `${item.mgmtNum} ${item.productName || '商品'} ¥${item.estimatedPrice?.max?.toLocaleString() || '---'}`,
        item: item,
        timestamp: item.createdAt,
      });
    });

    // バッジ更新
    const badge = document.getElementById('notifBadge');
    if (notifications.length > 0) {
      badge.textContent = notifications.length;
      badge.style.display = 'flex';
      // 新しい通知があればポップアップ表示
      if (notifications.length > lastNotifCount) {
        const newest = notifications[0];
        showPopupNotification(newest.title, newest.body, newest.id);
      }
    } else {
      badge.style.display = 'none';
    }
    lastNotifCount = notifications.length;
  } catch (err) {
    console.error('通知取得エラー:', err);
  }
}

function showNotifications() {
  if (notifications.length === 0) {
    showToast('新しい通知はありません');
    return;
  }
  document.getElementById('notifOverlay').classList.add('open');
  renderNotificationList();
}

function closeNotifications() {
  document.getElementById('notifOverlay').classList.remove('open');
}

function renderNotificationList() {
  const list = document.getElementById('notifList');
  let html = '';
  notifications.forEach(n => {
    const time = n.timestamp ? new Date(n.timestamp).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    html += `
      <div class="notif-item" onclick="openApproval('${n.id}')">
        <div class="notif-item-header">
          <span class="notice-badge notice-danger">${n.title}</span>
          <span class="notif-time">${time}</span>
        </div>
        <div class="notif-body">${escapeHtml(n.body)}</div>
      </div>
    `;
  });
  list.innerHTML = html || '<p style="text-align:center; color:var(--sub); padding:20px;">通知はありません</p>';
}

function openApproval(mgmtNum) {
  closeNotifications();
  const items = getItems();
  const item = items.find(i => i.mgmtNum === mgmtNum);
  if (!item) return;

  // 承認モーダルを開く
  selectedItem = item;
  document.getElementById('approvalMgmtNum').textContent = item.mgmtNum;
  document.getElementById('approvalProduct').textContent = item.productName || '—';
  document.getElementById('approvalChannel').textContent = item.channel || '—';
  document.getElementById('approvalPrice').textContent = item.estimatedPrice
    ? `¥${item.estimatedPrice.min?.toLocaleString()}〜¥${item.estimatedPrice.max?.toLocaleString()}`
    : '—';
  document.getElementById('approvalReason').textContent = item.approvalReason || '高額品';
  document.getElementById('approvalOverlay').classList.add('open');
}

function closeApproval() {
  document.getElementById('approvalOverlay').classList.remove('open');
}

function approveItem() {
  if (!selectedItem) return;
  const data = loadLocalData();
  const idx = data.items.findIndex(i => i.mgmtNum === selectedItem.mgmtNum);
  if (idx >= 0) {
    data.items[idx].approved = true;
    data.items[idx].approvedAt = new Date().toISOString();
    data.items[idx].approvedBy = currentUser.name;
    saveLocalData(data);
  }

  sendToGAS({
    action: 'approval',
    kanri_bango: selectedItem.mgmtNum,
    result: '承認',
    approved_by: currentUser.name,
    timestamp: formatTimestamp(),
  });

  showToast('✅ ' + selectedItem.mgmtNum + ' 承認しました');
  closeApproval();
  fetchNotifications();
  updateHomeStats();
}

function rejectItem() {
  if (!selectedItem) return;
  const comment = prompt('差し戻し理由を入力してください：');
  if (comment === null) return;

  const data = loadLocalData();
  const idx = data.items.findIndex(i => i.mgmtNum === selectedItem.mgmtNum);
  if (idx >= 0) {
    data.items[idx].rejected = true;
    data.items[idx].rejectedAt = new Date().toISOString();
    data.items[idx].rejectedBy = currentUser.name;
    data.items[idx].rejectReason = comment;
    saveLocalData(data);
  }

  sendToGAS({
    action: 'approval',
    kanri_bango: selectedItem.mgmtNum,
    result: '差し戻し',
    comment: comment,
    approved_by: currentUser.name,
    timestamp: formatTimestamp(),
  });

  showToast('↩️ ' + selectedItem.mgmtNum + ' 差し戻しました');
  closeApproval();
  fetchNotifications();
}

// ====== ポップアップ通知（どのページでも表示） ======
function showPopupNotification(title, body, id) {
  // 既存のポップアップがあれば消す
  const existing = document.querySelector('.popup-notif');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'popup-notif';
  popup.innerHTML = `
    <span class="popup-notif-icon">🔔</span>
    <div class="popup-notif-body">
      <div class="popup-notif-title">${escapeHtml(title)}</div>
      <div class="popup-notif-text">${escapeHtml(body)}</div>
    </div>
    <button class="popup-notif-close" onclick="this.parentElement.remove()">✕</button>
  `;
  popup.onclick = function(e) {
    if (e.target.classList.contains('popup-notif-close')) return;
    popup.remove();
    if (id) openApproval(id);
  };
  document.body.appendChild(popup);

  // 5秒後に自動で消える
  setTimeout(() => { if (popup.parentElement) popup.remove(); }, 5000);
}

// ====== 連絡先情報 ======
function loadContactInfo() {
  // LocalStorageから読み込み（管理者が設定）
  const contacts = JSON.parse(localStorage.getItem('f8_contacts_' + currentUser.name) || 'null');
  if (contacts) {
    document.getElementById('privatePhone').textContent = contacts.privatePhone || '未登録';
    document.getElementById('privateMail').textContent = contacts.privateMail || '未登録';
    document.getElementById('companyPhone').textContent = contacts.companyPhone || '未登録';
    document.getElementById('companyMail').textContent = contacts.companyMail || '未登録';
  }
}

// ====== テーマ切り替え ======
function setTheme(theme) {
  if (theme === 'female') {
    document.body.setAttribute('data-theme', 'female');
  } else {
    document.body.removeAttribute('data-theme');
  }
  localStorage.setItem('f8_theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'female' ? '🌸' : '🔵';
}

function toggleTheme() {
  const current = localStorage.getItem('f8_theme') || 'male';
  setTheme(current === 'male' ? 'female' : 'male');
}

function loadTheme() {
  const saved = localStorage.getItem('f8_theme') || 'male';
  setTheme(saved);
}

// ====== アバターメニュー ======
function openAvatarMenu() {
  document.getElementById('avatarMenu').style.display = 'block';
  setTimeout(() => document.addEventListener('click', closeMenusOnOutside), 10);
}

function closeMenusOnOutside(e) {
  const avatarMenu = document.getElementById('avatarMenu');
  const bgMenu = document.getElementById('bgMenu');
  if (avatarMenu && avatarMenu.style.display !== 'none' && !avatarMenu.contains(e.target)) {
    closeAvatarMenu();
  }
  if (bgMenu && bgMenu.style.display !== 'none' && !bgMenu.contains(e.target)) {
    closeBgMenu();
  }
  document.removeEventListener('click', closeMenusOnOutside);
}

function closeAvatarMenu() {
  document.getElementById('avatarMenu').style.display = 'none';
  document.removeEventListener('click', closeMenusOnOutside);
}

function editAvatarImage() {
  closeAvatarMenu();
  const saved = localStorage.getItem('f8_avatar');
  if (!saved) { showToast('写真が設定されていません'); return; }
  openCropModal(saved, 'avatar');
}

// ====== 背景メニュー ======
function openBgMenu() {
  document.getElementById('bgMenu').style.display = 'block';
  setTimeout(() => document.addEventListener('click', closeMenusOnOutside), 10);
}

function closeBgMenu() {
  document.getElementById('bgMenu').style.display = 'none';
  document.removeEventListener('click', closeMenusOnOutside);
}

function editBgImage() {
  closeBgMenu();
  const saved = localStorage.getItem('f8_bg');
  if (!saved) { showToast('背景が設定されていません'); return; }
  openCropModal(saved, 'bg');
}

function deleteBgImage() {
  closeBgMenu();
  localStorage.removeItem('f8_bg');
  document.getElementById('mypageBg').style.backgroundImage = 'none';
  showToast('背景を削除しました');
}

function deleteAvatarImage() {
  closeAvatarMenu();
  localStorage.removeItem('f8_avatar');
  document.getElementById('avatarImg').style.display = 'none';
  document.getElementById('avatarEmoji').style.display = 'block';
  showToast('写真を削除しました');
}

// ====== プロフィール画像 ======
let _cropImg = null, _cropX = 0, _cropY = 0, _cropScale = 1;
let _cropDragging = false, _cropStartX = 0, _cropStartY = 0;
let _cropMode = 'avatar'; // 'avatar' or 'bg'

function changeAvatarImage() {
  _cropMode = 'avatar';
  document.getElementById('avatarInput').click();
}

function changeBgImage() {
  _cropMode = 'bg';
  document.getElementById('bgInput').click();
}

function handleAvatarFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => openCropModal(e.target.result, 'avatar');
  reader.readAsDataURL(file);
}

function handleBgFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => openCropModal(e.target.result, 'bg');
  reader.readAsDataURL(file);
}

function openCropModal(dataUrl, mode) {
  _cropMode = mode;
  _cropImg = new Image();
  _cropImg.onload = function() {
    _cropX = 0; _cropY = 0; _cropScale = 1;
    document.getElementById('cropZoom').value = 100;
    document.getElementById('cropZoomLabel').textContent = '100%';

    const container = document.getElementById('cropContainer');
    if (mode === 'bg') {
      container.classList.add('square');
    } else {
      container.classList.remove('square');
    }

    document.getElementById('cropImage').src = dataUrl;
    document.getElementById('cropOverlay').classList.add('open');
    updateCropImage();

    container.onmousedown = cropDragStart;
    container.onmousemove = cropDragMove;
    container.onmouseup = cropDragEnd;
    container.ontouchstart = (e) => { e.preventDefault(); const t = e.touches[0]; _cropDragging = true; _cropStartX = t.clientX - _cropX; _cropStartY = t.clientY - _cropY; };
    container.ontouchmove = (e) => { e.preventDefault(); if (!_cropDragging) return; const t = e.touches[0]; _cropX = t.clientX - _cropStartX; _cropY = t.clientY - _cropStartY; updateCropImage(); };
    container.ontouchend = cropDragEnd;
  };
  _cropImg.src = dataUrl;
}

function updateCropImage() {
  const img = document.getElementById('cropImage');
  if (!img || !_cropImg) return;
  const container = document.getElementById('cropContainer');
  const cw = container.offsetWidth;
  const ch = container.offsetHeight;
  const aspect = _cropImg.width / _cropImg.height;
  let w, h;
  if (aspect > cw / ch) { h = ch * _cropScale; w = h * aspect; }
  else { w = cw * _cropScale; h = w / aspect; }
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = ((cw - w) / 2 + _cropX) + 'px';
  img.style.top = ((ch - h) / 2 + _cropY) + 'px';
}

function setCropScale(s) {
  _cropScale = s;
  document.getElementById('cropZoomLabel').textContent = Math.round(s * 100) + '%';
  updateCropImage();
}

function cropDragStart(e) { _cropDragging = true; _cropStartX = e.clientX - _cropX; _cropStartY = e.clientY - _cropY; }
function cropDragMove(e) { if (!_cropDragging) return; _cropX = e.clientX - _cropStartX; _cropY = e.clientY - _cropStartY; updateCropImage(); }
function cropDragEnd() { _cropDragging = false; }

function applyCrop() {
  const container = document.getElementById('cropContainer');
  const cw = container.offsetWidth;
  const ch = container.offsetHeight;
  const canvas = document.createElement('canvas');

  if (_cropMode === 'bg') {
    canvas.width = 600; canvas.height = 300;
  } else {
    canvas.width = 300; canvas.height = 300;
  }

  const ctx = canvas.getContext('2d');
  const aspect = _cropImg.width / _cropImg.height;
  let w, h;
  if (aspect > cw / ch) { h = ch * _cropScale; w = h * aspect; }
  else { w = cw * _cropScale; h = w / aspect; }
  const sx = (cw - w) / 2 + _cropX;
  const sy = (ch - h) / 2 + _cropY;
  const scaleX = canvas.width / cw;
  const scaleY = canvas.height / ch;
  ctx.drawImage(_cropImg, sx * scaleX, sy * scaleY, w * scaleX, h * scaleY);

  const result = canvas.toDataURL('image/jpeg', 0.85);

  if (_cropMode === 'avatar') {
    document.getElementById('avatarImg').src = result;
    document.getElementById('avatarImg').style.display = 'block';
    document.getElementById('avatarEmoji').style.display = 'none';
    localStorage.setItem('f8_avatar', result);
  } else {
    document.getElementById('mypageBg').style.backgroundImage = `url(${result})`;
    localStorage.setItem('f8_bg', result);
  }

  cancelCrop();
}

function cancelCrop() {
  document.getElementById('cropOverlay').classList.remove('open');
  _cropImg = null;
}

function loadProfileImages() {
  const avatar = localStorage.getItem('f8_avatar');
  if (avatar) {
    document.getElementById('avatarImg').src = avatar;
    document.getElementById('avatarImg').style.display = 'block';
    document.getElementById('avatarEmoji').style.display = 'none';
  }
  const bg = localStorage.getItem('f8_bg');
  if (bg) {
    document.getElementById('mypageBg').style.backgroundImage = `url(${bg})`;
  }
}

// ====== 折りたたみ ======
function toggleSection(id) {
  const el = document.getElementById(id);
  const arrow = document.getElementById(id.replace('Section', 'Arrow'));
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (arrow) arrow.classList.add('open');
    // 更新履歴を開いたら既読にする
    if (id === 'changelogSection') {
      markChangelogRead();
    }
    if (id === 'leaveFormSection') {
      renderLeaveCalendar();
      renderLeaveSummary();
    }
  } else {
    el.style.display = 'none';
    if (arrow) arrow.classList.remove('open');
    if (id === 'leaveFormSection') {
      renderLeaveSummary();
    }
  }
}

// ====== ユーティリティ ======
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimestamp() {
  const now = new Date();
  return now.getFullYear() + '/' +
    String(now.getMonth()+1).padStart(2,'0') + '/' +
    String(now.getDate()).padStart(2,'0') + ' ' +
    String(now.getHours()).padStart(2,'0') + ':' +
    String(now.getMinutes()).padStart(2,'0');
}

// ====== テストデータ投入 ======
function loadTestData() {
  const today = new Date().toISOString().slice(0, 10);

  // 出勤テストデータ（他メンバー分）
  const testAttendance = [
    { staffName: '林和人', start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', noBreak: false, breakMin: 60, netHours: '8.0' },
    { staffName: '横山優', start: '09:30', end: '18:30', breakStart: '12:30', breakEnd: '13:30', noBreak: false, breakMin: 60, netHours: '8.0' },
    { staffName: '平野光雄', start: '08:00', end: '17:00', breakStart: '13:00', breakEnd: '14:00', noBreak: false, breakMin: 60, netHours: '8.0' },
    { staffName: '三島圭織', start: '10:00', end: '17:00', breakStart: null, breakEnd: null, noBreak: true, breakMin: 0, netHours: '7.0' },
    { staffName: '桃井侑菜', start: '09:00', end: '16:00', breakStart: '12:00', breakEnd: '12:30', noBreak: false, breakMin: 30, netHours: '6.5' },
    { staffName: '伊藤佐和子', start: '13:00', end: '20:00', breakStart: '16:00', breakEnd: '16:30', noBreak: false, breakMin: 30, netHours: '6.5' },
  ];

  testAttendance.forEach(a => {
    const key = 'f8_attendance_' + today;
    // 自分のデータは上書きしない
    if (currentUser && a.staffName === currentUser.name) return;
    const detailKey = key + '_detail_' + a.staffName;
    if (!localStorage.getItem(detailKey)) {
      localStorage.setItem(detailKey, JSON.stringify(a));
    }
  });

  // ボトルネック用テストデータ（商品）
  const data = loadLocalData();
  if (data.items.length === 0) {
    const testItems = [
      { mgmtNum: '2604-0001', productName: 'アンティーク真鍮ランプ', channel: 'アイロンポット', channelNumber: 1, photo1: 'test', listingTitle: 'ビンテージ真鍮ランプ', condition: 'B', estimatedPrice: { min: 8000, max: 18000 }, location: 'A-1', staffName: '林和人', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0002', productName: 'SONY ラジオ ICF-506', channel: 'ブロカント', channelNumber: 2, photo1: 'test', condition: 'A', estimatedPrice: { min: 3000, max: 5000 }, location: 'B-1', staffName: '横山優', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0003', productName: '九谷焼 花瓶', channel: 'アイロンポット', channelNumber: 1, photo1: 'test', listingTitle: '九谷焼 色絵花瓶', status: '出品中', condition: 'A', estimatedPrice: { min: 12000, max: 25000 }, location: 'A-2', staffName: '桃井侑菜', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0004', productName: '昭和レトロ ガラス皿セット', channel: 'ブロカント', channelNumber: 2, condition: 'B', estimatedPrice: { min: 1500, max: 3000 }, location: 'C-1', staffName: '平野光雄', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0005', productName: 'ヴィンテージ Zippo', channel: 'アイロンポット', channelNumber: 1, photo1: 'test', condition: 'A', estimatedPrice: { min: 5000, max: 12000 }, location: 'A-3', staffName: '三島圭織', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0006', productName: '古伊万里 小皿5枚', channel: 'アイロンポット', channelNumber: 1, condition: 'B', estimatedPrice: { min: 8000, max: 15000 }, location: 'B-2', staffName: '桃井侑菜', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0007', productName: 'CASIO 電卓', channel: 'ブロカント', channelNumber: 2, photo1: 'test', listingTitle: 'CASIO 関数電卓', status: '出品中', condition: 'A', estimatedPrice: { min: 2000, max: 4000 }, location: 'C-2', staffName: '横山優', createdAt: new Date().toISOString() },
      { mgmtNum: '2604-0008', productName: '銅製 やかん', channel: 'アイロンポット', channelNumber: 1, photo1: 'test', listingTitle: '銅製やかん 昭和', status: '出品中', condition: 'B', estimatedPrice: { min: 3000, max: 6000 }, location: 'A-1', staffName: '林和人', needsApproval: true, approvalReason: '高額品', createdAt: new Date().toISOString() },
    ];
    testItems.forEach(item => data.items.push(item));
    saveLocalData(data);
  }
}

// ====== 機能ガイド・更新履歴 ======
function renderFeatureGuide() {
  const container = document.getElementById('featureGuideList');
  if (!container || !CONFIG.FEATURE_GUIDE) return;

  container.innerHTML = CONFIG.FEATURE_GUIDE.map(f => {
    const steps = f.steps.map((s, i) => `
      <div class="guide-step">
        <span class="guide-step-num">${i + 1}</span>
        <span>${escapeHtml(s)}</span>
      </div>
    `).join('');
    const note = f.note ? `<div class="guide-note">${escapeHtml(f.note)}</div>` : '';
    return `
      <div class="guide-card">
        <div class="guide-card-header">
          <span class="guide-icon">${f.icon}</span>
          <span>${escapeHtml(f.title)}</span>
        </div>
        <div class="guide-steps">${steps}</div>
        ${note}
      </div>
    `;
  }).join('');
}

function renderChangelog() {
  const container = document.getElementById('changelogList');
  if (!container || !CONFIG.CHANGELOG) return;

  container.innerHTML = CONFIG.CHANGELOG.map(entry => {
    const items = entry.changes.map(c => {
      let badgeClass = 'changelog-badge-change';
      if (c.type === '新機能') badgeClass = 'changelog-badge-new';
      else if (c.type === '修正') badgeClass = 'changelog-badge-fix';
      else if (c.type === '初版') badgeClass = 'changelog-badge-init';
      return `
        <div class="changelog-item">
          <span class="changelog-badge ${badgeClass}">${escapeHtml(c.type)}</span>
          <span>${escapeHtml(c.text)}</span>
        </div>
      `;
    }).join('');
    return `
      <div class="changelog-entry">
        <div class="changelog-date">${escapeHtml(entry.date)}</div>
        ${items}
      </div>
    `;
  }).join('');
}

function getUnreadChanges() {
  if (!CONFIG.CHANGELOG) return [];
  const lastSeen = localStorage.getItem('f8_last_seen_version') || '';
  const unread = [];
  for (const entry of CONFIG.CHANGELOG) {
    if (entry.version === lastSeen) break;
    if (entry.notify) {
      entry.changes.forEach(c => unread.push({ date: entry.date, ...c }));
    }
  }
  return unread;
}

function markChangelogRead() {
  if (CONFIG.CHANGELOG && CONFIG.CHANGELOG.length > 0) {
    localStorage.setItem('f8_last_seen_version', CONFIG.CHANGELOG[0].version);
  }
}

// ====== 売上登録 ======
function openSalesModal() {
  document.getElementById('salesStep1').style.display = '';
  document.getElementById('salesStep2').style.display = 'none';
  document.getElementById('salesOverlay').style.display = 'flex';
}

function closeSalesModal() {
  document.getElementById('salesOverlay').style.display = 'none';
}

function openSalesManual() {
  document.getElementById('salesStep1').style.display = 'none';
  document.getElementById('salesStep2').style.display = '';
  // 粗利計算リスナー
  ['salesPrice', 'salesFee', 'salesShipping'].forEach(id => {
    document.getElementById(id).oninput = calcSalesProfit;
  });
}

function takeSalesPhoto() {
  document.getElementById('salesPhotoInput').click();
}

async function handleSalesPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('salesLoading').style.display = '';

  const reader = new FileReader();
  reader.onload = async function(e) {
    const dataUrl = e.target.result;
    try {
      const platform = document.getElementById('salesPlatform').value;
      const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          image: dataUrl,
          step: 'receipt',
          context: {
            task: `この${platform}の落札・売上画面のスクリーンショットから情報をJSON形式で読み取ってください: {"itemName":"商品名","price":落札価格数値,"fee":手数料数値,"shipping":送料数値,"buyer":"落札者ID","mgmtNum":"管理番号（あれば）"}`
          },
        }),
      });

      const result = await response.json();
      document.getElementById('salesLoading').style.display = 'none';

      if (result.success && result.judgment) {
        const j = result.judgment;
        document.getElementById('salesItemName').value = j.itemName || j.item_name || '';
        document.getElementById('salesPrice').value = j.price || j.amount || '';
        document.getElementById('salesFee').value = j.fee || 0;
        document.getElementById('salesShipping').value = j.shipping || 0;
        document.getElementById('salesBuyer').value = j.buyer || '';
        document.getElementById('salesMgmtNum').value = j.mgmtNum || j.kanri_bango || '';
      }
      openSalesManual();
      calcSalesProfit();
    } catch (err) {
      document.getElementById('salesLoading').style.display = 'none';
      showToast('読み取りに失敗しました');
      openSalesManual();
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function calcSalesProfit() {
  const price = parseInt(document.getElementById('salesPrice').value) || 0;
  const fee = parseInt(document.getElementById('salesFee').value) || 0;
  const shipping = parseInt(document.getElementById('salesShipping').value) || 0;
  const profit = price - fee - shipping;
  document.getElementById('salesProfit').textContent = '¥' + profit.toLocaleString();
  document.getElementById('salesProfit').style.color = profit >= 0 ? 'var(--accent)' : 'var(--danger)';
}

function submitSales() {
  const price = document.getElementById('salesPrice').value;
  if (!price) { showToast('落札価格を入力してください'); return; }

  const payload = {
    action: 'sales_register',
    mgmtNum: document.getElementById('salesMgmtNum').value,
    itemName: document.getElementById('salesItemName').value,
    price: parseInt(price) || 0,
    fee: parseInt(document.getElementById('salesFee').value) || 0,
    shipping: parseInt(document.getElementById('salesShipping').value) || 0,
    buyer: document.getElementById('salesBuyer').value,
    channel: document.getElementById('salesChannel').value,
    platform: document.getElementById('salesPlatform').value,
    staff: currentUser.name,
    timestamp: formatTimestamp(),
  };

  sendToGAS(payload);

  // ローカル保存
  const salesData = JSON.parse(localStorage.getItem('f8_sales') || '[]');
  salesData.unshift({ ...payload, createdAt: new Date().toISOString() });
  localStorage.setItem('f8_sales', JSON.stringify(salesData));

  showToast('売上を登録しました');
  closeSalesModal();
}

// ====== 休み希望・連絡 ======
let selectedLeaveType = '';
let selectedLeaveDates = [];
let leaveCalYear = new Date().getFullYear();
let leaveCalMonth = new Date().getMonth();

function selectLeaveType(type, btn) {
  selectedLeaveType = type;
  document.querySelectorAll('.leave-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const timeSection = document.getElementById('leaveTimeSection');
  const timeLabel = document.getElementById('leaveTimeLabel');
  if (type === '遅刻') {
    timeSection.style.display = '';
    timeLabel.textContent = '出勤予定時刻';
  } else if (type === '早退') {
    timeSection.style.display = '';
    timeLabel.textContent = '早退予定時刻';
  } else {
    timeSection.style.display = 'none';
  }
}

function renderLeaveCalendar() {
  const grid = document.getElementById('leaveCalGrid');
  const title = document.getElementById('leaveCalMonth');
  if (!grid || !title) return;

  title.textContent = `${leaveCalYear}年${leaveCalMonth + 1}月`;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const firstDay = new Date(leaveCalYear, leaveCalMonth, 1);
  const lastDay = new Date(leaveCalYear, leaveCalMonth + 1, 0);
  const startDow = firstDay.getDay(); // 0=日

  const dows = ['日','月','火','水','木','金','土'];
  let html = dows.map(d => `<div class="leave-cal-dow">${d}</div>`).join('');

  // 空白セル
  for (let i = 0; i < startDow; i++) {
    html += '<div class="leave-cal-day empty"></div>';
  }

  // 日付セル
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${leaveCalYear}-${String(leaveCalMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const isPast = dateStr < today; // 今日は選択可能（当日の急な休み連絡用）
    const isSelected = selectedLeaveDates.includes(dateStr);
    const cls = [
      'leave-cal-day',
      isToday ? 'today' : '',
      isPast ? 'past' : '',
      isSelected ? 'selected' : '',
    ].filter(Boolean).join(' ');
    html += `<div class="${cls}" onclick="toggleLeaveDate('${dateStr}')">${d}</div>`;
  }

  grid.innerHTML = html;
  updateLeaveSelectedInfo();
}

function toggleLeaveDate(dateStr) {
  const idx = selectedLeaveDates.indexOf(dateStr);
  if (idx >= 0) {
    selectedLeaveDates.splice(idx, 1);
  } else {
    selectedLeaveDates.push(dateStr);
    selectedLeaveDates.sort();
  }
  renderLeaveCalendar();
}

function changeLeaveMonth(delta) {
  leaveCalMonth += delta;
  if (leaveCalMonth > 11) { leaveCalMonth = 0; leaveCalYear++; }
  if (leaveCalMonth < 0) { leaveCalMonth = 11; leaveCalYear--; }
  renderLeaveCalendar();
}

function updateLeaveSelectedInfo() {
  const container = document.getElementById('leaveSelectedInfo');
  if (!container) return;
  if (selectedLeaveDates.length === 0) {
    container.innerHTML = '<span>日付をタップして選択</span>';
  } else {
    container.innerHTML = selectedLeaveDates.map(d =>
      `<span class="leave-date-tag">${d}</span>`
    ).join('');
  }
}

function setLeaveReason(btn) {
  document.getElementById('leaveReason').value = btn.textContent;
}

function submitLeaveRequest() {
  if (!selectedLeaveType) { showToast('種別を選択してください'); return; }
  if (selectedLeaveDates.length === 0) { showToast('日付を選択してください'); return; }
  const reason = document.getElementById('leaveReason').value.trim();
  const time = (selectedLeaveType === '遅刻' || selectedLeaveType === '早退')
    ? document.getElementById('leaveTime').value : null;

  const key = 'f8_leave_requests';
  const requests = JSON.parse(localStorage.getItem(key) || '[]');

  // 各日付分を登録
  selectedLeaveDates.forEach(date => {
    const request = {
      type: selectedLeaveType,
      date: date,
      time: time,
      reason: reason,
      staffName: currentUser.name,
      submittedAt: new Date().toISOString(),
    };
    requests.unshift(request);
  });

  localStorage.setItem(key, JSON.stringify(requests));

  // GASに送信（浅野に通知）
  sendToGAS({
    action: 'leave_request',
    type: selectedLeaveType,
    dates: selectedLeaveDates.join(', '),
    time: time || '',
    reason: reason,
    staff: currentUser.name,
    timestamp: formatTimestamp(),
  });

  const count = selectedLeaveDates.length;
  showToast(`${selectedLeaveType}の連絡を送信しました（${count}日分）`);

  // フォームリセット
  selectedLeaveType = '';
  selectedLeaveDates = [];
  document.querySelectorAll('.leave-type-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('leaveReason').value = '';
  document.getElementById('leaveTimeSection').style.display = 'none';
  renderLeaveCalendar();
  renderLeaveHistory();
}

let leaveGroupMode = 'date';
let leaveViewMode = 'list';

function getAllLeaveRequests() {
  return JSON.parse(localStorage.getItem('f8_leave_requests') || '[]');
}

function renderLeaveSummary() {
  const container = document.getElementById('leaveSummary');
  if (!container) return;

  // フォームが開いている時は要約を隠す
  const form = document.getElementById('leaveFormSection');
  if (form && form.style.display !== 'none') {
    container.innerHTML = '';
    return;
  }

  const requests = getAllLeaveRequests();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // 自分の今日以降の予定
  const mine = requests
    .filter(r => r.staffName === currentUser?.name && r.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  if (mine.length === 0) {
    container.innerHTML = '<p class="leave-summary-empty">予定された休みはありません</p>';
  } else {
    container.innerHTML = mine.map(r => {
      const status = r.approved
        ? '<span class="leave-status leave-status-approved">承諾</span>'
        : '<span class="leave-status leave-status-pending">未承諾</span>';
      const timeInfo = r.time ? `（${r.time}）` : '';
      return `
        <div class="leave-summary-item">
          <span class="leave-badge leave-badge-${r.type}">${r.type}</span>
          <span style="flex:1">${r.date}${timeInfo}</span>
          ${status}
        </div>
      `;
    }).join('');
  }
}

function renderLeaveHistory() {
  // スタッフ用：自分の申告リスト
  const container = document.getElementById('leaveMyList');
  if (!container) return;
  const requests = getAllLeaveRequests();
  const mine = requests.filter(r => r.staffName === currentUser?.name).slice(0, 10);

  if (mine.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--sub);">まだ連絡はありません</p>';
  } else {
    container.innerHTML = '<p style="font-size:12px; color:var(--sub); margin-bottom:6px;">申告履歴</p>' +
      mine.map(r => {
        const timeInfo = r.time ? `（${r.time}）` : '';
        const reasonInfo = r.reason ? ` — ${escapeHtml(r.reason)}` : '';
        const status = r.approved
          ? '<span class="leave-status leave-status-approved">承諾</span>'
          : '<span class="leave-status leave-status-pending">未承諾</span>';
        return `
          <div class="leave-my-item">
            <span class="leave-badge leave-badge-${r.type}">${r.type}</span>
            <span class="leave-detail" style="flex:1">${r.date}${timeInfo}${reasonInfo}</span>
            ${status}
          </div>
        `;
      }).join('');
  }

  // 要約表示
  renderLeaveSummary();

  // 管理者用
  const adminSection = document.getElementById('leaveAdminSection');
  if (adminSection && currentUser?.isAdmin) {
    adminSection.style.display = '';
    renderLeaveAdmin();
  }
}

function setLeaveGroup(mode) {
  leaveGroupMode = mode;
  document.getElementById('leaveGroupDate').classList.toggle('active', mode === 'date');
  document.getElementById('leaveGroupPerson').classList.toggle('active', mode === 'person');
  renderLeaveAdmin();
}

function setLeaveView(mode) {
  leaveViewMode = mode;
  document.getElementById('leaveViewList').classList.toggle('active', mode === 'list');
  document.getElementById('leaveViewCal').classList.toggle('active', mode === 'calendar');
  renderLeaveAdmin();
}

function renderLeaveAdmin() {
  const container = document.getElementById('leaveAdminContent');
  if (!container) return;
  const requests = getAllLeaveRequests();

  if (leaveViewMode === 'calendar') {
    renderLeaveAdminCalendar(container, requests);
  } else {
    renderLeaveAdminList(container, requests);
  }
}

function renderLeaveAdminList(container, requests) {
  if (requests.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--sub);">休み連絡はまだありません</p>';
    return;
  }

  let html = '';
  if (leaveGroupMode === 'date') {
    // 日付別にグループ化
    const byDate = {};
    requests.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });
    const sortedDates = Object.keys(byDate).sort().reverse();
    sortedDates.forEach(date => {
      html += `<div style="margin-top:10px"><p style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:4px;">${date}</p>`;
      byDate[date].forEach((r, i) => {
        html += renderLeaveAdminItem(r, i, date);
      });
      html += '</div>';
    });
  } else {
    // 個人別にグループ化
    const byPerson = {};
    requests.forEach(r => {
      if (!byPerson[r.staffName]) byPerson[r.staffName] = [];
      byPerson[r.staffName].push(r);
    });
    Object.keys(byPerson).sort().forEach(name => {
      html += `<div style="margin-top:10px"><p style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:4px;">👤 ${escapeHtml(name)}</p>`;
      byPerson[name].forEach((r, i) => {
        html += renderLeaveAdminItem(r, i, name);
      });
      html += '</div>';
    });
  }
  container.innerHTML = html;
}

function renderLeaveAdminItem(r, idx, groupKey) {
  const timeInfo = r.time ? `（${r.time}）` : '';
  const reasonInfo = r.reason ? ` ${escapeHtml(r.reason)}` : '';
  const nameInfo = leaveGroupMode === 'date' ? `${escapeHtml(r.staffName)} ` : '';
  const dateInfo = leaveGroupMode === 'person' ? `${r.date} ` : '';
  const status = r.approved
    ? '<span class="leave-status leave-status-approved">承諾済</span>'
    : `<button class="leave-approve-btn" onclick="approveLeave('${r.staffName}','${r.date}')">承諾</button>`;
  return `
    <div class="leave-my-item">
      <span class="leave-badge leave-badge-${r.type}">${r.type}</span>
      <span class="leave-detail" style="flex:1">${nameInfo}${dateInfo}${timeInfo}${reasonInfo}</span>
      ${status}
    </div>
  `;
}

function renderLeaveAdminCalendar(container, requests) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();

  // 日付ごとのリクエストマップ
  const byDate = {};
  requests.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const dows = ['日','月','火','水','木','金','土'];
  let html = `<p style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:6px;">${year}年${month+1}月</p>`;
  html += '<div class="leave-admin-cal">';
  html += dows.map(d => `<div class="leave-cal-dow">${d}</div>`).join('');

  for (let i = 0; i < startDow; i++) {
    html += '<div class="leave-admin-cal-day" style="background:transparent"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayRequests = byDate[dateStr] || [];
    const dots = dayRequests.map(r =>
      `<span class="leave-admin-cal-dot dot-${r.type}" title="${escapeHtml(r.staffName)} ${r.type}"></span>`
    ).join('');
    const names = dayRequests.map(r => escapeHtml(r.staffName.slice(0,1))).join('');
    html += `<div class="leave-admin-cal-day"><span class="day-num">${d}</span><br>${dots}<div style="font-size:9px;color:var(--sub)">${names}</div></div>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function approveLeave(staffName, date) {
  const requests = getAllLeaveRequests();
  const target = requests.find(r => r.staffName === staffName && r.date === date && !r.approved);
  if (target) {
    target.approved = true;
    target.approvedBy = currentUser.name;
    target.approvedAt = new Date().toISOString();
    localStorage.setItem('f8_leave_requests', JSON.stringify(requests));
    showToast(`${staffName}さんの${date}を承諾しました`);
    renderLeaveAdmin();
  }
}

// ====== 権限設定画面（管理者用） ======
function renderPermissionSettings() {
  const container = document.getElementById('permBarcodeList');
  if (!container) return;

  const perms = loadPermissions();
  const barcodeAllowed = perms.barcode || [];

  // 浅野以外のスタッフ一覧でチェックリスト生成
  const staffList = CONFIG.STAFF.filter(s => s.name !== '浅野儀頼');
  container.innerHTML = staffList.map((s, i) => {
    const checked = barcodeAllowed.includes(s.name) ? 'checked' : '';
    const role = s.role === 'admin' ? '管理者' : 'スタッフ';
    return `
      <label class="perm-row" onclick="event.stopPropagation()">
        <input type="checkbox" data-staff="${escapeHtml(s.name)}" ${checked} class="perm-cb">
        <span class="perm-name">${escapeHtml(s.name)}</span>
        <span class="perm-role">${role}</span>
      </label>
    `;
  }).join('');
}

function savePermissionSettings() {
  const perms = loadPermissions();
  const staffList = CONFIG.STAFF.filter(s => s.name !== '浅野儀頼');

  const barcodeAllowed = ['浅野儀頼']; // 浅野は常に許可
  document.querySelectorAll('.perm-cb:checked').forEach(cb => {
    const name = cb.dataset.staff;
    if (name) barcodeAllowed.push(name);
  });

  perms.barcode = barcodeAllowed;
  savePermissions(perms);
  showToast('権限を保存しました');
}

// ====== 初期化 ======
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  if (!tryAutoLogin()) {
    // ログイン画面を表示（デフォルト）
  }
});
