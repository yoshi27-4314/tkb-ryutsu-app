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

  // スタッフ一覧
  STAFF: [
    { name: '浅野儀頼', role: 'admin' },
    { name: '林和人', role: 'staff' },
    { name: '横山優', role: 'staff' },
    { name: '平野光雄', role: 'staff' },
    { name: '三島圭織', role: 'staff' },
    { name: '桃井侑菜', role: 'staff' },
    { name: '伊藤佐和子', role: 'staff' },
    { name: '奥村亜優李', role: 'staff' },
  ],

  // 管理番号フォーマット
  MGMT_PREFIX: () => {
    const now = new Date();
    return String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
  },
};
