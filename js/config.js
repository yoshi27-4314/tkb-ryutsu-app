/**
 * ファーストエイト業務アプリ - 設定
 * APIキーは含まない。Supabase Edge Function経由で安全に呼び出す。
 */

const CONFIG = {
  // Supabase（AWAI共用・DBは使わない。Edge Functionのみ）
  SUPABASE_URL: 'https://njdnfvlucwasrafoepmu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZG5mdmx1Y3dhc3JhZm9lcG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTEzNjgsImV4cCI6MjA5MDg4NzM2OH0.jDjqf3nWqaQ0sMfDf-85dDQNbEhX90qLsOOhWJdDlM8',

  // GAS（スプレッドシート書き込み）
  GAS_URL: 'https://script.google.com/macros/s/AKfycbx9JpYWvi3p0HgA9Bb0RLgEjkgzbF6iJRuAX7Ks2VL3hwIEnpuTR0J1ydtxegGKRXjh/exec',
  // テスト用GAS（テスト用スプレッドシートに書き込み）
  GAS_URL_TEST: 'https://script.google.com/macros/s/AKfycbyyx7Ew4LaCP7L21j6J5PACxnIIifkyrjTHSTr_roSpEHYSeJLUt5StORtSM_2xCbYWnA/exec',

  // 販売チャンネル
  // type: tsuhan=出品が必要, non-tsuhan=出品不要
  // category: jisha=自社, itaku=委託, kojin=個人
  CHANNELS: [
    // 自社アカウント
    { id: 1, name: 'アイロンポット', platform: 'ヤフオク', category: 'jisha', target: 'ビンテージ単品・まとめ', type: 'tsuhan' },
    { id: 2, name: 'ブロカント', platform: 'ヤフオク', category: 'jisha', target: '現行品単品・まとめ', type: 'tsuhan' },
    { id: 3, name: 'eBay', platform: 'eBay', category: 'jisha', target: '単品・まとめ', type: 'tsuhan' },
    { id: 4, name: 'Amazon書籍', platform: 'Amazon', category: 'jisha', target: '書籍', type: 'tsuhan' },
    // 委託アカウント（増える前提）
    { id: 10, name: '渡辺質店', platform: 'ヤフオク', category: 'itaku', target: '委託品', type: 'tsuhan' },
    { id: 11, name: 'ビッグスポーツ', platform: 'ヤフオク', category: 'itaku', target: '委託品', type: 'tsuhan' },
    // 浅野個人
    { id: 20, name: 'シマチヨ', platform: 'ヤフオク', category: 'kojin', target: '浅野さん指定品のみ', type: 'tsuhan' },
    // 非通販
    { id: 90, name: '社内利用', platform: null, category: null, target: null, type: 'non-tsuhan' },
    { id: 91, name: 'ロット販売', platform: null, category: null, target: null, type: 'non-tsuhan' },
    { id: 92, name: 'スクラップ', platform: null, category: null, target: null, type: 'non-tsuhan' },
    { id: 93, name: '廃棄', platform: null, category: null, target: null, type: 'non-tsuhan' },
  ],

  // スタッフ一覧（基本勤務時間・休日含む）
  // offDays: 0=日,1=月,2=火,3=水,4=木,5=金,6=土
  STAFF: [
    { name: '浅野儀頼', role: 'admin', start: '09:00', end: '18:00', breakMin: 60, offDays: [], pattern: '管理者', showTimeline: false },
    { name: '林和人', role: 'staff', start: '09:00', end: '16:00', breakMin: 60, offDays: [], pattern: '週5日' },
    { name: '横山優', role: 'staff', start: '10:00', end: '16:00', breakMin: 60, offDays: [3], pattern: '水休み' },
    { name: '桃井侑菜', role: 'staff', start: '11:00', end: '15:00', breakMin: 0, offDays: [2,4], pattern: '月水金のみ' },
    { name: '伊藤佐和子', role: 'staff', start: '09:00', end: '15:00', breakMin: 60, offDays: [4], pattern: '木休み' },
    { name: '奥村亜優李', role: 'staff', start: '10:00', end: '16:00', breakMin: 60, offDays: [3], pattern: '水休み' },
    { name: '平野光雄', role: 'staff', start: '09:00', end: '16:00', breakMin: 60, offDays: [3], pattern: '水休み', company: 'クリアメンテ' },
    { name: '松本豊彦', role: 'staff', start: '09:00', end: '16:00', breakMin: 60, offDays: [], pattern: '週5日', company: 'クリアメンテ' },
    { name: '北瀬', role: 'staff', start: '09:00', end: '16:00', breakMin: 60, offDays: [3], pattern: '水休み', company: 'クリアメンテ' },
    { name: '三島圭織', role: 'staff', start: '10:00', end: '16:00', breakMin: 60, offDays: [3], pattern: '水休み（4/30退職）', company: 'クリアメンテ' },
  ],

  // 管理番号フォーマット
  MGMT_PREFIX: () => {
    const now = new Date();
    return String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  },

  // 当番ローテーション（曜日: 0=日〜6=土）
  // null = その曜日は該当なし
  DUTY_ROTATION: {
    1: { // 月
      '分荷撮影': ['林和人','伊藤佐和子','奥村亜優李'],
      '出品': '奥村亜優李',
      '取引ナビ': '奥村亜優李',
      '梱包出荷': '桃井侑菜',
    },
    2: { // 火
      '分荷撮影': ['林和人','伊藤佐和子','横山優'],
      '出品': '横山優',
      '取引ナビ': '奥村亜優李',
      '梱包出荷': null,
    },
    3: { // 水（横山・奥村休み）
      '分荷撮影': ['林和人','伊藤佐和子'],
      '出品': '林和人',
      '取引ナビ': null,
      '梱包出荷': '桃井侑菜',
    },
    4: { // 木
      '分荷撮影': ['林和人','横山優','奥村亜優李'],
      '出品': '奥村亜優李',
      '取引ナビ': '奥村亜優李',
      '梱包出荷': '桃井侑菜',
    },
    5: { // 金
      '分荷撮影': ['林和人','伊藤佐和子','横山優','奥村亜優李'],
      '出品': '横山優',
      '取引ナビ': '奥村亜優李',
      '梱包出荷': null,
    },
  },

  // アプリバージョン
  APP_VERSION: '2026.04.15',

  // 更新履歴（新しい順。機能追加・変更時にここに追記する）
  // notify: true → ホームのお知らせに表示
  CHANGELOG: [
    {
      date: '2026-04-14',
      version: '2026.04.14b',
      notify: true,
      changes: [
        { type: '変更', text: 'チャットタブをGoogle Chat連携 + AI相談に分離' },
        { type: '新機能', text: 'Google Chatの各ルームへ直接アクセスできるリンクを追加' },
        { type: '新機能', text: 'AI相談に定型文クイック送信を追加' },
        { type: '新機能', text: 'メッセージにタイムスタンプ表示' },
        { type: '新機能', text: '自分のメッセージを削除できるように' },
        { type: '変更', text: 'バーコード登録（本）は桃井さん・浅野のみ利用可能に' },
        { type: '新機能', text: '管理者（浅野）のマイページに権限設定画面を追加' },
        { type: '新機能', text: 'マイページに使い方ガイド・更新履歴を追加' },
      ],
    },
    {
      date: '2026-04-10',
      version: '2026.04.10',
      notify: false,
      changes: [
        { type: '新機能', text: '種別選択画面追加（自社/ビッグスポーツ/渡辺質店/シマチヨ）' },
        { type: '改善', text: 'ボトルネック表示・出勤タイムライン追加' },
        { type: '改善', text: 'アバターに下の名前を表示' },
      ],
    },
    {
      date: '2026-04-07',
      version: '2026.04.07',
      notify: false,
      changes: [
        { type: '初版', text: 'テイクバック業務アプリ リリース' },
      ],
    },
  ],

  // 機能ガイド（マイページに表示。機能追加・変更時にここも更新する）
  FEATURE_GUIDE: [
    {
      icon: '📷',
      title: '商品登録（分荷判定）',
      steps: [
        'ホーム →「撮影を開始する」',
        '種別を選択（自社 / ビッグスポーツ / 渡辺質店 / シマチヨ）',
        '写真を撮影（基準物を横に置く）',
        '「AIに判定させる」→ 結果確認 →「OK」or「相談する」',
        '追加写真を撮影 → 保管場所を選択 → 完了',
      ],
    },
    {
      icon: '📱',
      title: 'バーコード登録（本）',
      steps: [
        '撮影タブ → 種別選択 →「バーコードで登録」',
        '本のバーコードにカメラを向ける → 自動読取',
        '「AIに判定させる」→ 以降は写真登録と同じ',
      ],
      note: '※ 桃井さん・浅野のみ利用可能',
    },
    {
      icon: '📦',
      title: '在庫確認・検索',
      steps: [
        '在庫タブで管理番号 or キーワード検索',
        'ステータスでフィルター（全件/登録済/承認待ち/出品中/出荷済）',
        '商品をタップで詳細表示',
      ],
    },
    {
      icon: '🚚',
      title: '出荷登録',
      steps: [
        '在庫タブ → 商品タップ → 下にスクロール',
        '運送会社を選択',
        '追跡番号を入力 or 送り状を撮影してOCR',
        '「出荷完了」をタップ',
      ],
    },
    {
      icon: '🧾',
      title: '経費精算',
      steps: [
        'ホーム →「経費精算」',
        '事業部を選択（テイクバック / クリアメンテ）',
        'レシートを撮影 → AIが自動読取',
        '内容を確認・修正 →「登録する」',
      ],
    },
    {
      icon: '💬',
      title: 'チームチャット（Google Chat）',
      steps: [
        'チャットタブを開く',
        '各ルーム（通販業務/分荷/勤怠/社内連絡）をタップ',
        'Google Chatが開くので、そこでメッセージ送信',
      ],
      note: '※ 確認・連絡・報告はGoogle Chatで',
    },
    {
      icon: '🤖',
      title: 'AI相談',
      steps: [
        'チャットタブ下部の「AI相談」セクション',
        '質問を入力 or 定型文をタップ',
        'AIが業務に関する回答を返します',
      ],
      note: '※ 価格相場・出品文・業務ルールの質問に対応',
    },
    {
      icon: '🕐',
      title: '出退勤',
      steps: [
        'マイページ → 出勤・退勤の時刻をタップして設定',
        '休憩時間を設定（休憩なしはチェック）',
        '「送信」をタップ',
        '月間カレンダーで勤務履歴を確認',
      ],
    },
    {
      icon: '📋',
      title: '休み・遅刻・早退の連絡',
      steps: [
        'マイページ → 出退勤の下にある「休み・遅刻・早退の連絡」',
        '種別を選択（欠勤/遅刻/早退）',
        '日付を選択、遅刻・早退は時刻も設定',
        '理由を入力（任意）→「連絡する」',
      ],
      note: '※ 送信すると浅野に通知されます',
    },
    {
      icon: '👤',
      title: 'プロフィール',
      steps: [
        'マイページ → アバターをタップで写真変更',
        '背景エリアをタップで背景変更',
        '左上アイコンでテーマ切替（ブルー/ピンク）',
      ],
    },
  ],
};
