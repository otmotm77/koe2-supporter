(() => {
  const FAV_KEY  = 'favorites';
  const LFAV_KEY = 'live_favorites';
  const GENDER = { '1': 'female', '2': 'male', '3': 'couple' };

  let favCache  = null;
  let lfavCache = null;

  // ── ストレージ ───────────────────────────────────────────────
  function loadFavs() {
    return new Promise(resolve => {
      chrome.storage.local.get([FAV_KEY, LFAV_KEY], d => {
        favCache  = d[FAV_KEY]  || [];
        lfavCache = d[LFAV_KEY] || [];
        resolve();
      });
    });
  }

  function isFav(userId, live) {
    return (live ? lfavCache : favCache)?.some(f => f.id === userId) ?? false;
  }

  async function toggleFav(userId, name, profileUrl, gender, live) {
    if (!favCache || !lfavCache) await loadFavs();
    const cache = live ? lfavCache : favCache;
    const key   = live ? LFAV_KEY  : FAV_KEY;
    const idx   = cache.findIndex(f => f.id === userId);
    if (idx >= 0) cache.splice(idx, 1);
    else cache.push({ id: userId, name, profileUrl, gender, addedAt: Date.now() });
    chrome.storage.local.set({ [key]: cache });
  }

  // ── ハートボタン生成 ─────────────────────────────────────────
  function makeHeart(userId, name, profileUrl, gender, live = false) {
    const btn = document.createElement('button');
    btn.className = 'koe2-heart' + (live ? ' koe2-heart--live' : '');
    btn.dataset.koe2Id   = userId;
    btn.dataset.koe2Live = live ? '1' : '';
    setHeartState(btn, isFav(userId, live));

    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      await toggleFav(userId, name, profileUrl, gender, live);
      const on  = isFav(userId, live);
      const cls = live ? 'koe2-fav-card--live' : 'koe2-fav-card';
      document.querySelectorAll(`.koe2-heart[data-koe2-id="${CSS.escape(userId)}"][data-koe2-live="${live ? '1' : ''}"]`)
        .forEach(b => {
          setHeartState(b, on);
          b.closest('.content')?.classList.toggle(cls, on);
        });
    });

    return btn;
  }

  function setHeartState(btn, on) {
    btn.textContent = on ? '♥' : '♡';
    btn.title = on ? 'お気に入りから削除' : 'お気に入りに追加';
    btn.classList.toggle('koe2-heart--on', on);
  }

  // ── スタイル注入 ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('koe2-styles')) return;
    const s = document.createElement('style');
    s.id = 'koe2-styles';
    s.textContent = `
      .koe2-heart {
        background: none; border: none; padding: 0 2px; margin-right: 2px;
        cursor: pointer; font-size: 14px; line-height: 1;
        vertical-align: middle; color: #ccc; display: inline-block;
      }
      .koe2-heart--on { color: #e00; }
      .koe2-heart--live.koe2-heart--on { color: #27ae60; }
      .koe2-heart--live:hover { color: #27ae60 !important; opacity: .8; }
      .koe2-heart:not(.koe2-heart--live):hover { color: #e00; opacity: .8; }
      .koe2-dl-mark {
        display: inline-block; color: #2a7; font-size: 10px; font-weight: bold;
        background: #e8ffe8; border: 1px solid #2a7; border-radius: 3px;
        padding: 0 4px; margin-right: 4px; vertical-align: middle;
      }
      .koe2-dl-row .content-inner     { background: #d4eaff !important; }
      .koe2-played-row .content-inner { background: #f0f0f0 !important; }
      .koe2-fav-card       { border-left: 3px solid #FFA33B !important; }
      .koe2-fav-card--live { border-left: 3px solid #27ae60 !important; }
      #koe2-filter { display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f5f5f5;border-bottom:1px solid #ddd;font-size:11px;flex-wrap:wrap;margin-bottom:2px; }
      .koe2-fg { display:flex;align-items:center;gap:2px; }
      .koe2-fb { padding:1px 8px;border:1px solid #ccc;border-radius:3px;background:#fff;cursor:pointer;font-size:11px;color:#555; }
      .koe2-fb:hover { border-color:#999; }
      .koe2-fb.on-none { background:#eee;border-color:#aaa; }
      .koe2-fb.on-done { color:#fff; }
      .koe2-fb.on-not  { background:#444;color:#fff;border-color:#444; }
    `;
    document.head.appendChild(s);
  }

  // 要素直後のテキストノードからトリップ（◆/◇）を返す
  function extractTrip(el) {
    let node = el.nextSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const m = node.textContent.match(/^([◆◇][^\s:：]+)/);
        if (m) return m[1];
      }
      node = node.nextSibling;
    }
    return '';
  }

  // ── ライブコンテキスト判定 ───────────────────────────────────
  // entry_auth が archive_detail.php へのリンク内、またはページ自体が archive_*
  function isLiveContext(el) {
    if (el.closest('a[href*="archive_detail.php"]')) return true;
    if (el.closest('a[href*="live.koe-koe.com"]')) return true;
    return location.pathname.includes('archive_');
  }

  // ── セレクタ別処理 ───────────────────────────────────────────

  // detail.php: <a href="search.php?word=NAME&g=X"><span class="user_name">NAME</span></a>
  function processUserName(el) {
    if (el.dataset.koe2) return;
    el.dataset.koe2 = '1';
    const a = el.closest('a[href*="search.php"]');
    if (!a) return;
    const p = new URLSearchParams(a.href.split('?')[1]);
    const word = p.get('word');
    const g = p.get('g') || '';
    if (!word) return;
    // トリップ: <a>の直後のテキストノード
    const displayName = word + extractTrip(a);
    el.insertAdjacentElement('beforebegin',
      makeHeart(displayName + '|' + g, displayName, a.href, GENDER[g] || '', false));
  }

  // 音声一覧 / archive_detail / archive_list / archive_search:
  // <span class="entry_auth">NAME</span>
  function processEntryAuth(el) {
    if (el.dataset.koe2) return;
    el.dataset.koe2 = '1';
    const name = el.textContent.trim();
    const displayName = name + extractTrip(el);

    const contentInner = el.closest('.content-inner');
    const iconDiv = contentInner?.querySelector('.icon');
    let g = iconDiv?.classList.contains('icon_female') ? '1'
          : iconDiv?.classList.contains('icon_male')   ? '2'
          : iconDiv?.classList.contains('icon_couple') ? '3' : '';
    // fallback: archive_detail.php 本体は audioTime_1/2/3 で性別を判定
    if (!g) {
      const at = contentInner?.querySelector('[class*="audioTime_"]');
      g = at?.className.match(/audioTime_(\d)/)?.[1] || '';
    }
    const live = isLiveContext(el);
    const profileUrl = live
      ? `https://koe-koe.com/archive_search.php?name=${encodeURIComponent(name)}`
      : `https://koe-koe.com/search.php?word=${encodeURIComponent(name)}&g=${g}&m=1`;
    const userId = live ? `live:${displayName}` : `${displayName}|${g}`;

    // ライブ詳細ページ本体のユーザー名にリンクがない場合は追加
    if (live && !el.closest('a')) {
      const a = document.createElement('a');
      a.href = profileUrl;
      a.style.cssText = 'color:inherit;text-decoration:underline;';
      el.replaceWith(a);
      a.appendChild(el);
    }

    el.insertAdjacentElement('beforebegin',
      makeHeart(userId, displayName, profileUrl, GENDER[g] || '', live));
  }

  // post_users.php:
  function processUserListItem(li) {
    if (li.dataset.koe2) return;
    li.dataset.koe2 = '1';
    const a = li.querySelector('a[href*="search.php"]');
    if (!a) return;
    const p = new URLSearchParams(a.href.split('?')[1]);
    const word = p.get('word');
    const g = p.get('g') || '';
    if (!word) return;
    const textInA = Array.from(a.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim()).filter(Boolean).join('');
    const trip = textInA.startsWith(word)
      ? (textInA.slice(word.length).match(/^([◆◇][^\s]+)/)?.[1] || '') : '';
    const displayName = word + trip;
    a.insertAdjacentElement('beforebegin',
      makeHeart(displayName + '|' + g, displayName, a.href, GENDER[g] || '', false));
  }

  // ── 一括注入 ─────────────────────────────────────────────────
  function injectAll() {
    document.querySelectorAll('span.user_name:not([data-koe2])').forEach(processUserName);
    document.querySelectorAll('span.entry_auth:not([data-koe2])').forEach(processEntryAuth);
    document.querySelectorAll('li.gender1:not([data-koe2]), li.gender2:not([data-koe2]), li.gender3:not([data-koe2])')
      .forEach(processUserListItem);
  }

  // ── お気に入りカードボーダー ─────────────────────────────────
  function refreshFavCards() {
    document.querySelectorAll('.koe2-heart').forEach(btn => {
      const userId = btn.dataset.koe2Id;
      const live   = btn.dataset.koe2Live === '1';
      const on     = isFav(userId, live);
      const cls    = live ? 'koe2-fav-card--live' : 'koe2-fav-card';
      const card   = btn.closest('.content');
      if (card) card.classList.toggle(cls, on);
    });
  }

  // ── DL済み・再生済みマーク ───────────────────────────────────
  function markCards(downloads, played) {
    document.querySelectorAll('a[href*="detail.php?n="]').forEach(a => {
      const isArchive = a.href.includes('archive_detail.php');
      const n = new URLSearchParams(a.href.split('?')[1]).get('n');
      if (!n) return;
      const dlKey    = isArchive ? `live_${n}` : n;
      const isDl     = !!downloads[dlKey]?.filename;
      const isPlayed = !!played[dlKey];

      const card = a.closest('.content');
      if (card) {
        card.classList.toggle('koe2-dl-row',     isDl);
        card.classList.toggle('koe2-played-row', !isDl && isPlayed);
      }

      // バッジは初回のみ挿入
      if (isDl && !a.dataset.koe2Dl) {
        a.dataset.koe2Dl = '1';
        const meta = a.querySelector('p.meta');
        if (meta) {
          const mark = document.createElement('span');
          mark.className = 'koe2-dl-mark';
          mark.textContent = '✓ DL済';
          meta.insertAdjacentElement('afterbegin', mark);
        }
      }
    });
  }

  function refreshCardMarks() {
    chrome.storage.local.get(['downloads', 'played'], data => {
      markCards(data.downloads || {}, data.played || {});
    });
  }

  // ── フィルタバー ─────────────────────────────────────────────
  const FILTER_SS_KEY = 'koe2Filter';
  const filterState = (() => {
    try { return Object.assign({ fav: '', dl: '', play: '' }, JSON.parse(sessionStorage.getItem(FILTER_SS_KEY))); }
    catch { return { fav: '', dl: '', play: '' }; }
  })();
  const FILTER_COLORS = { fav: '#FFA33B', dl: '#4190ff', play: '#888' };

  function saveFilterState() {
    sessionStorage.setItem(FILTER_SS_KEY, JSON.stringify(filterState));
  }

  function injectFilterBar() {
    if (document.getElementById('koe2-filter')) return;
    // detail ページでは注入しない
    if (location.pathname.match(/\/(archive_)?detail\.php/)) return;
    const target = document.getElementById('content_body') || document.getElementById('content');
    if (!target || !target.querySelector('a[href*="detail.php?n="]')) return;

    const bar = document.createElement('div');
    bar.id = 'koe2-filter';

    const header = document.createElement('span');
    header.textContent = 'フィルタ:';
    header.style.color = '#888';
    bar.appendChild(header);

    [
      { key: 'fav',  label: '♥' },
      { key: 'dl',   label: 'DL' },
      { key: 'play', label: '▶' },
    ].forEach(({ key, label }) => {
      const grp = document.createElement('span');
      grp.className = 'koe2-fg';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'color:#555;margin-right:2px;';
      grp.appendChild(lbl);
      [['', '−'], ['1', '済'], ['0', '未']].forEach(([val, text]) => {
        const btn = document.createElement('button');
        btn.className = 'koe2-fb';
        btn.dataset.fk = key;
        btn.dataset.fv = val;
        btn.textContent = text;
        btn.addEventListener('click', () => {
          filterState[key] = val;
          saveFilterState();
          updateBtnStyles();
          applyFilter();
        });
        grp.appendChild(btn);
      });
      bar.appendChild(grp);
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'koe2-fb';
    resetBtn.textContent = 'リセット';
    resetBtn.style.marginLeft = '4px';
    resetBtn.addEventListener('click', () => {
      filterState.fav = filterState.dl = filterState.play = '';
      saveFilterState();
      updateBtnStyles();
      applyFilter();
    });
    bar.appendChild(resetBtn);
    target.insertAdjacentElement('afterbegin', bar);

    function updateBtnStyles() {
      bar.querySelectorAll('.koe2-fb[data-fk]').forEach(btn => {
        const active = filterState[btn.dataset.fk] === btn.dataset.fv;
        btn.classList.remove('on-none', 'on-done', 'on-not');
        btn.style.background = '';
        if (!active) return;
        if (btn.dataset.fv === '')  { btn.classList.add('on-none'); }
        else if (btn.dataset.fv === '1') {
          btn.classList.add('on-done');
          btn.style.background = FILTER_COLORS[btn.dataset.fk];
          btn.style.borderColor = FILTER_COLORS[btn.dataset.fk];
        } else {
          btn.classList.add('on-not');
        }
      });
    }
    updateBtnStyles();
  }

  async function applyFilter() {
    const { downloads = {}, played: playedStore = {} } =
      await new Promise(r => chrome.storage.local.get(['downloads', 'played'], r));
    const noFilter = !Object.values(filterState).some(v => v !== '');

    document.querySelectorAll('div.content').forEach(card => {
      const a = card.querySelector('a[href*="detail.php?n="]');
      if (!a) { card.style.display = ''; return; }
      if (noFilter) { card.style.display = ''; return; }

      const isArchive = a.href.includes('archive_detail.php');
      const n = new URLSearchParams(a.href.split('?')[1]).get('n');
      if (!n) { card.style.display = ''; return; }
      const dlKey = isArchive ? `live_${n}` : n;

      const isFavCard = card.classList.contains('koe2-fav-card') || card.classList.contains('koe2-fav-card--live');
      const isDl      = !!(downloads[dlKey]?.filename);
      const isPlayed  = !!(playedStore[dlKey]);

      let show = true;
      if (filterState.fav  === '1' && !isFavCard) show = false;
      if (filterState.fav  === '0' && isFavCard)  show = false;
      if (filterState.dl   === '1' && !isDl)       show = false;
      if (filterState.dl   === '0' && isDl)        show = false;
      if (filterState.play === '1' && !isPlayed)   show = false;
      if (filterState.play === '0' && isPlayed)    show = false;

      card.style.display = show ? '' : 'none';
    });
  }

  // ── 初期化 ───────────────────────────────────────────────────
  if (location.pathname.includes('search.php')) {
    const q = new URLSearchParams(location.search);
    if (q.get('m') !== null)
      console.debug('[koe2] search params — word:', q.get('word'), 'g:', q.get('g'), 'm:', q.get('m'));
  }

  injectStyles();
  loadFavs().then(() => {
    injectAll();
    refreshCardMarks();
    refreshFavCards();
    injectFilterBar();
    applyFilter();
    const observer = new MutationObserver(() => {
      injectAll();
      refreshCardMarks();
      refreshFavCards();
      injectFilterBar();
      applyFilter();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener(changes => {
    if (changes.downloads || changes.played) {
      refreshCardMarks();
      applyFilter();
    }
    if (changes[FAV_KEY] || changes[LFAV_KEY]) {
      if (changes[FAV_KEY])  favCache  = changes[FAV_KEY].newValue  || [];
      if (changes[LFAV_KEY]) lfavCache = changes[LFAV_KEY].newValue || [];
      refreshFavCards();
      applyFilter();
    }
  });
})();
