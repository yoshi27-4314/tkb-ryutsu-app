/**
 * ファーストエイト業務アプリ - メインJS
 * テイクバック流通事業 テスト運用版
 */

// ====== 状態管理 ======
let currentUser = null;
let currentTab = 'home';
let cameraStep = 1;
let currentItem = {};
let photosTaken = 0;
let todayStats = { bunka: 0, satsuei: 0, shuppin: 0, konpo: 0 };

// ローカルストレージキー
const STORAGE_KEY = 'f8_takeback_data';
const LOGIN_KEY = 'f8_takeback_user';

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
  if (currentUser.isAdmin) {
    document.getElementById('notifBadge').style.display = 'flex';
  }
  updateDate();
  updateHomeStats();
  renderStockList();
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
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  if (tab === 'camera' && cameraStep === 1) {
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
  const items = getItems().filter(i => i.createdAt && i.createdAt.startsWith(today));
  todayStats.bunka = items.length;
  document.getElementById('statBunka').textContent = todayStats.bunka;

  // 挨拶の更新
  const greetEl = document.querySelector('.greeting h2');
  if (greetEl) {
    const firstName = currentUser.name.split(/[　 ]/)[0];
    greetEl.innerHTML = `${getGreeting()}、<span id="staffName">${firstName}</span>さん`;
  }
}

// ====== 在庫一覧 ======
function renderStockList() {
  const list = document.getElementById('stockList');
  if (!list) return;
  const items = getItems();
  if (items.length === 0) {
    // デモデータがある場合はそのまま
    return;
  }

  // ローカルデータがある場合は表示
  let html = '';
  items.slice(0, 20).forEach(item => {
    const statusClass = item.needsApproval ? 'status-shooting' : 'status-listing';
    const statusText = item.needsApproval ? '承認待ち' : '登録済';
    html += `
      <div class="stock-card">
        <div class="stock-header">
          <span class="stock-number">${item.mgmtNum || '---'}</span>
          <span class="stock-status ${statusClass}">${statusText}</span>
        </div>
        <div class="stock-name">${escapeHtml(item.productName || '不明')}</div>
        <div class="stock-meta">分荷: ${escapeHtml(currentUser.name)} ・ ${escapeHtml(item.channel || '---')} ・ ¥${item.estimatedPrice?.min?.toLocaleString() || '---'}</div>
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

// ====== 撮影フロー ======
function resetCameraFlow() {
  cameraStep = 1;
  currentItem = {};
  photosTaken = 0;
  showCameraStep(1);
  const preview = document.getElementById('preview1');
  if (preview) {
    preview.style.display = 'none';
  }
  const afterPhoto = document.getElementById('afterPhoto1');
  if (afterPhoto) afterPhoto.style.display = 'none';
  const placeholder = document.querySelector('.camera-placeholder');
  if (placeholder) placeholder.style.display = 'flex';
}

function showCameraStep(step) {
  document.querySelectorAll('.camera-step').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('cameraStep' + step);
  if (el) el.classList.add('active');
  cameraStep = step;
}

function takePhoto() {
  document.getElementById('photoInput').click();
}

function handlePhoto(event, num) {
  const file = event.target.files[0];
  if (!file) return;

  // 画像を圧縮してbase64に変換
  const reader = new FileReader();
  reader.onload = function(e) {
    compressImage(e.target.result, 1200, 0.8, (compressed) => {
      const preview = document.getElementById('preview1');
      preview.src = compressed;
      preview.style.display = 'block';
      document.querySelector('.camera-placeholder').style.display = 'none';
      document.getElementById('afterPhoto1').style.display = 'block';
      currentItem.photo1 = compressed;
    });
  };
  reader.readAsDataURL(file);
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
  document.getElementById('preview1').style.display = 'none';
  document.getElementById('afterPhoto1').style.display = 'none';
  document.querySelector('.camera-placeholder').style.display = 'flex';
  document.getElementById('photoInput').value = '';
}

// ====== AI判定（本番：Supabase Edge Function経由） ======
async function analyzePhoto() {
  if (!currentItem.photo1) {
    showToast('写真を撮影してください');
    return;
  }

  showToast('🤖 AIが判定中...');
  const btn = document.querySelector('#afterPhoto1 .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '判定中...'; }

  try {
    const response = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/takeback-judge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        image: currentItem.photo1,
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
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AIに判定させる'; }
  }
}

function acceptJudgment() {
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

// ====== 撮影ガイド ======
function buildPhotoGuide() {
  const guides = currentItem.photoGuide || [
    { title: '型番・メーカーラベル', description: '底面や背面のラベルを撮影' },
    { title: '状態の詳細', description: '傷・汚れ・動作状態がわかる写真' },
  ];

  const list = document.getElementById('photoGuideList');
  list.innerHTML = '';
  guides.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'photo-guide-item';
    div.innerHTML = `
      <div class="photo-guide-num" id="guideNum${i+2}">${i+2}</div>
      <div class="photo-guide-text">
        <div class="photo-guide-title">${escapeHtml(g.title)}</div>
        <div class="photo-guide-desc">${escapeHtml(g.description)}</div>
      </div>
      <button class="photo-guide-btn" id="guideBtn${i+2}" onclick="takeGuidePhoto(${i+2})">📷 撮影</button>
    `;
    list.appendChild(div);
  });

  photosTaken = 0;
  document.getElementById('afterAllPhotos').style.display = 'none';
}

function takeGuidePhoto(num) {
  // ガイド写真の撮影（ファイル選択を使う）
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      compressImage(ev.target.result, 1200, 0.8, (compressed) => {
        currentItem['photo' + num] = compressed;
        const numEl = document.getElementById('guideNum' + num);
        const btnEl = document.getElementById('guideBtn' + num);
        if (numEl) { numEl.classList.add('done'); numEl.textContent = '✓'; }
        if (btnEl) { btnEl.classList.add('done'); btnEl.textContent = '✓ 完了'; btnEl.onclick = null; }

        photosTaken++;
        const totalGuides = document.querySelectorAll('.photo-guide-item').length;
        if (photosTaken >= totalGuides) {
          document.getElementById('afterAllPhotos').style.display = 'block';
        }
      });
    };
    reader.readAsDataURL(file);
  };
  input.click();
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
  try {
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'no-cors', // GASはCORS非対応のためno-cors
    });
    return true;
  } catch (err) {
    console.error('GAS送信エラー:', err);
    return false;
  }
}

// ====== チャット ======
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  addChatMessage(msg, 'user');
  input.value = '';

  // Edge Function経由でAIに質問
  chatWithAI(msg);
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

    // チャット用のEdge Functionがないので、ひとまずローカル応答
    removeChatMessage('thinking');
    addChatMessage('チャット機能は準備中です。業務についての質問は浅野さんに相談してください。', 'bot');
  } catch (err) {
    removeChatMessage('thinking');
    addChatMessage('通信エラーが発生しました。', 'bot');
  }
}

function addChatMessage(text, type, id) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + type;
  if (id) div.id = 'chat-' + id;
  const avatar = type === 'bot' ? '🤖' : '👤';
  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble">${escapeHtml(text)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeChatMessage(id) {
  const el = document.getElementById('chat-' + id);
  if (el) el.remove();
}

function startConsultation() {
  addChatMessage('浅野さんへの相談を入力してください。写真付きの場合は撮影タブから商品を登録し、「相談する」ボタンを使ってください。', 'bot');
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

// ====== 通知 ======
function showNotifications() {
  showToast('🔔 通知一覧（次回アップデートで実装）');
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

// ====== 初期化 ======
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  if (!tryAutoLogin()) {
    // ログイン画面を表示（デフォルト）
  }
});
