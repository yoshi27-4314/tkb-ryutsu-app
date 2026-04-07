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
  checkTodayAttendance();
  startNotificationPolling();
  loadProfileImages();
  initMiniClocks();
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

// ====== 撮影フロー ======
function resetCameraFlow() {
  cameraStep = 1;
  currentItem = {};
  photosTaken = 0;
  showCameraStep(1);
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
  const mention = document.getElementById('chatMention').value;
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();

  if (!mention) { showToast('宛先（@メンション）を選択してください'); return; }
  if (!msg) return;

  const displayMsg = `@${mention} ${msg}`;
  addChatMessage(displayMsg, 'user');
  input.value = '';

  if (mention === 'AI') {
    // AIに質問
    chatWithAI(msg);
  } else {
    // 人宛のメッセージ → GASに送信して通知
    sendToGAS({
      action: 'chat_message',
      from: currentUser.name,
      to: mention,
      message: msg,
      timestamp: formatTimestamp(),
    });
    addChatMessage(`${mention}さんにメッセージを送信しました`, 'bot');
  }
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

  document.getElementById('itemDetailOverlay').classList.add('open');
}

function closeItemDetail() {
  document.getElementById('itemDetailOverlay').classList.remove('open');
  selectedItem = null;
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

  if (!start) { showToast('出勤時刻を入力してください'); return; }
  if (!end) { showToast('退勤時刻を入力してください'); return; }

  // 実働時間計算
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  const breakMin = 60;
  const netMin = totalMin - breakMin;
  const netHours = (netMin / 60).toFixed(1);

  // GASに送信
  sendToGAS({
    action: 'attendance',
    staff_id: currentUser.name,
    type: '勤務申告',
    start_time: start,
    end_time: end,
    break_minutes: breakMin,
    net_hours: netHours,
    timestamp: formatTimestamp(),
  });

  // ローカルに記録（1日1回制限用）
  localStorage.setItem('f8_attendance_' + today, JSON.stringify({
    start, end, breakMin, netHours, staffName: currentUser.name,
  }));

  // 表示更新
  const msg = document.getElementById('attendanceMsg');
  msg.textContent = `✅ ${start}〜${end}（実働${netHours}時間）記録済み`;
  msg.classList.add('recorded');

  // 入力欄を無効化
  document.getElementById('attendStart').disabled = true;
  document.getElementById('attendEnd').disabled = true;

  showToast('🕐 勤務記録を送信しました');
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
        const startDisp = document.getElementById('attendStartDisplay');
        const endDisp = document.getElementById('attendEndDisplay');
        if (startDisp) { startDisp.textContent = a.start; startDisp.onclick = null; startDisp.style.opacity = '0.6'; }
        if (endDisp) { endDisp.textContent = a.end; endDisp.onclick = null; endDisp.style.opacity = '0.6'; }
        // 送信ボタンを修正依頼ボタンに差し替え
        const submitBtn = document.querySelector('[onclick="submitAttendance()"]');
        if (submitBtn) {
          submitBtn.textContent = '📝 修正を依頼する（浅野さんに連絡）';
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
  const current = document.getElementById(target === 'start' ? 'attendStart' : 'attendEnd').value || '09:00';
  const [h, m] = current.split(':').map(Number);
  clockHour = h; clockMin = m;
  clockMode = 'hour';

  document.getElementById('clockPickerTitle').textContent = target === 'start' ? '出勤時刻' : '退勤時刻';
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
  if (clockTarget === 'start') {
    document.getElementById('attendStart').value = str;
    document.getElementById('attendStartDisplay').textContent = str;
  } else {
    document.getElementById('attendEnd').value = str;
    document.getElementById('attendEndDisplay').textContent = str;
  }
  closeClockPicker();
}

function initMiniClocks() {
  // 時間入力カラム方式に変更。ミニ時計は不要
}

function toggleAttendanceHistory() {
  const el = document.getElementById('attendanceHistory');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    document.getElementById('attendHistoryBtn').textContent = '📅 出勤状況を閉じる';
    renderAttendanceHistory();
  } else {
    el.style.display = 'none';
    document.getElementById('attendHistoryBtn').textContent = '📅 今月の出勤状況を見る';
  }
}

function renderAttendanceHistory() {
  const el = document.getElementById('attendanceHistory');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = ['日','月','火','水','木','金','土'];

  let totalDays = 0;
  let totalHours = 0;
  let html = `<div class="attend-history-card">
    <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">${year}年${month + 1}月の出勤状況</h4>
    <div class="attend-calendar">`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayName = days[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const saved = localStorage.getItem('f8_attendance_' + dateStr);

    let status = '';
    let hours = '';
    let rowClass = 'attend-day';

    if (saved) {
      try {
        const a = JSON.parse(saved);
        status = `${a.start}〜${a.end}`;
        hours = `${a.netHours}h`;
        totalDays++;
        totalHours += parseFloat(a.netHours);
        rowClass += ' attend-day-worked';
      } catch {}
    } else if (date <= now) {
      if (isWeekend) {
        status = '—';
        rowClass += ' attend-day-off';
      } else if (d <= now.getDate()) {
        status = '未登録';
        rowClass += ' attend-day-missing';
      }
    }

    if (d <= now.getDate() || saved) {
      html += `<div class="${rowClass}">
        <span class="attend-date">${d}日（${dayName}）</span>
        <span class="attend-time">${status}</span>
        <span class="attend-hours">${hours}</span>
      </div>`;
    }
  }

  html += `</div>
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
