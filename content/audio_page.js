(() => {
  const DL_KEY  = 'downloads';
  const isArchive = location.pathname.includes('archive_detail');
  const id        = new URLSearchParams(location.search).get('n') || '';
  const dlId      = isArchive ? `live_${id}` : id; // ストレージキーを分離

  function parseRelativeDate(text) {
    const now = Date.now();
    let m;
    if ((m = text.match(/(\d+)分前/))) return new Date(now - m[1] * 60 * 1000);
    if ((m = text.match(/(\d+)時間前/))) return new Date(now - m[1] * 3600 * 1000);
    if ((m = text.match(/(\d+)日前/))) return new Date(now - m[1] * 86400 * 1000);
    if ((m = text.match(/(\d+)[ヶか]月前/))) return new Date(now - m[1] * 30 * 86400 * 1000);
    if ((m = text.match(/(\d+)年前/))) return new Date(now - m[1] * 365 * 86400 * 1000);
    return new Date(now);
  }

  function formatDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  function sanitize(s) {
    return s.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 60);
  }

  // 形式: [ユーザ名][id][YYYYMMDD]タイトル.ext
  function buildFilename(username, voiceId, date, title, ext) {
    return `[${sanitize(username)}][${voiceId}][${formatDate(date)}]${sanitize(title)}.${ext}`;
  }

  function extractPageInfo() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';

    let username, date, title;

    if (isArchive) {
      // ユーザー名: span.entry_auth（メインの投稿、.desc.detail 内）
      const entryAuthEl = document.querySelector('.desc.detail span.entry_auth')
                       || document.querySelector('span.entry_auth');
      const baseName = entryAuthEl?.textContent.trim() || '不明';
      // トリップ（◆trip / ◇ID）を直後のテキストノードから取得
      let trip = '';
      let tn = entryAuthEl?.nextSibling;
      while (tn) {
        if (tn.nodeType === Node.TEXT_NODE) {
          const m = tn.textContent.match(/^([◆◇][^\s:：]+)/);
          if (m) { trip = m[1]; break; }
        }
        tn = tn.nextSibling;
      }
      username = baseName + trip;

      // 日付: og:title の [YYYY-MM-DD] から直接取得
      // 例: "NAMEの配信 [2026-05-07] [2349423]"
      const dateMatch = ogTitle.match(/\[(\d{4}-\d{2}-\d{2})\]/);
      date = dateMatch ? new Date(dateMatch[1]) : new Date();

      // タイトル: desc の ": 説明文" 部分、なければ "配信"
      const descP = document.querySelector('.desc.detail p');
      const descText = descP?.textContent.trim() || '';
      const colonIdx = descText.indexOf(' : ');
      title = (colonIdx >= 0 ? descText.slice(colonIdx + 3).trim() : '') || '配信';
    } else {
      // 通常投稿
      const userNameEl = document.querySelector('span.user_name');
      const baseName = userNameEl?.textContent.trim() || '不明';
      // トリップ: user_name を囲む <a> の直後のテキストノード
      const parentA = userNameEl?.closest('a');
      let trip2 = '';
      let tn2 = (parentA || userNameEl)?.nextSibling;
      while (tn2) {
        if (tn2.nodeType === Node.TEXT_NODE) {
          const m = tn2.textContent.match(/^([◆◇][^\s:：]+)/);
          if (m) { trip2 = m[1]; break; }
        }
        tn2 = tn2.nextSibling;
      }
      username = baseName + trip2;
      const timeText = document.querySelector('.desc.detail span.metaIcon_up')?.textContent.trim()
                    || document.querySelector('span.metaIcon_up')?.textContent.trim() || '';
      date  = timeText ? parseRelativeDate(timeText) : new Date();
      title = ogTitle.replace(/\s*\[\d+\].*$/, '').trim()
           || document.title.replace(/\s*[-|].*$/, '').trim() || 'untitled';
    }

    const sourceEl = document.querySelector('audio source');
    let audioUrl = sourceEl?.src || document.querySelector('audio')?.src || '';
    if (audioUrl.startsWith('//')) audioUrl = 'https:' + audioUrl;
    const ext = (audioUrl.match(/\.(\w+)(\?|$)/) || [])[1] || 'mp3';

    return { username, date, title, audioUrl, ext };
  }

  function markAsDone(btn) {
    btn.textContent = '✓ ダウンロード済み';
    btn.style.background = '#2a7';
    btn.disabled = true;
  }

  function saveDownload(username, title, date, filename) {
    if (!dlId) return;
    chrome.storage.local.get(DL_KEY, data => {
      const downloads = data[DL_KEY] || {};
      downloads[dlId] = { id: dlId, username, title, date: formatDate(date), filename, savedAt: Date.now() };
      chrome.storage.local.set({ [DL_KEY]: downloads });
    });
  }

  function addDownloadButton() {
    if (document.getElementById('koe2-dl-btn')) return;
    const audio = document.querySelector('audio');
    if (!audio) return;

    const btn = document.createElement('button');
    btn.id = 'koe2-dl-btn';
    btn.textContent = isArchive ? '⬇ LIVE DL（リネーム付き）' : '⬇ ダウンロード（リネーム付き）';
    btn.style.cssText = [
      'display:inline-block', 'margin:8px 4px', 'padding:6px 14px',
      `background:${isArchive ? '#27ae60' : '#e05'}`,
      'color:#fff', 'border:none', 'border-radius:4px',
      'cursor:pointer', 'font-size:14px',
    ].join(';');

    if (dlId) {
      chrome.storage.local.get(DL_KEY, data => {
        if (data[DL_KEY]?.[dlId]?.filename) markAsDone(btn);
      });
    }

    btn.addEventListener('click', () => {
      const { username, date, title, audioUrl, ext } = extractPageInfo();
      if (!audioUrl) { alert('[koe2] 音声URLが見つかりませんでした。'); return; }
      const filename = buildFilename(username, isArchive ? `l_${id}` : id, date, title, ext);
      chrome.runtime.sendMessage({ type: 'download', url: audioUrl, filename }, () => {
        saveDownload(username, title, date, filename);
        markAsDone(btn);
      });
    });

    const parent = audio.closest('p') || audio.parentNode;
    parent.insertAdjacentElement('afterend', btn);

    // 再生済みバッジ + クリアボタン
    const playedBar = document.createElement('div');
    playedBar.id = 'koe2-played-bar';
    playedBar.style.cssText = 'display:none;margin:2px 4px 6px;';

    const playedBadge = document.createElement('span');
    playedBadge.style.cssText = [
      'display:inline-block', 'padding:3px 8px', 'font-size:12px',
      'background:#f0f0f0', 'border:1px solid #bbb', 'border-radius:4px',
      'color:#555', 'margin-right:6px', 'vertical-align:middle',
    ].join(';');
    playedBadge.textContent = '▶ 再生済み';

    const clearBtn = document.createElement('button');
    clearBtn.style.cssText = [
      'padding:2px 8px', 'font-size:11px', 'background:none',
      'border:1px solid #bbb', 'border-radius:4px', 'cursor:pointer',
      'color:#888', 'vertical-align:middle',
    ].join(';');
    clearBtn.textContent = '× クリア';
    clearBtn.addEventListener('click', () => {
      chrome.storage.local.get('played', data => {
        const played = data.played || {};
        delete played[dlId];
        chrome.storage.local.set({ played }, () => {
          playedBar.style.display = 'none';
        });
      });
    });

    playedBar.append(playedBadge, clearBtn);
    btn.insertAdjacentElement('afterend', playedBar);

    function showPlayedBar() {
      playedBar.style.display = 'block';
    }

    // ページ読み込み時に既再生なら表示
    if (dlId) {
      chrome.storage.local.get('played', data => {
        if (data.played?.[dlId]) showPlayedBar();
      });
    }

    // 初回再生時に保存して表示
    audio.addEventListener('play', () => {
      if (!dlId) return;
      chrome.storage.local.get('played', data => {
        const played = data.played || {};
        if (!played[dlId]) {
          played[dlId] = { playedAt: Date.now() };
          chrome.storage.local.set({ played });
        }
        showPlayedBar();
      });
    });
  }

  addDownloadButton();
  if (!document.getElementById('koe2-dl-btn')) {
    const observer = new MutationObserver(() => {
      addDownloadButton();
      if (document.getElementById('koe2-dl-btn')) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
