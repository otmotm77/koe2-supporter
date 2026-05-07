const FAV_KEY  = 'favorites';
const LFAV_KEY = 'live_favorites';
const DL_KEY   = 'downloads';
const SETTINGS_KEY = 'settings';
const RENAME_PATTERN      = /^(\d+)\.(mp3|m4a|ogg|wav|3gp|amr|3ga|m4v|mp4|aac|flac)$/i;
const LIVE_RENAME_PATTERN = /^live_0?(\d+)\.(mp3|m4a|ogg|wav|3gp|amr|3ga|m4v|mp4|aac|flac)$/i;
// リネーム済みファイルの検出: [name][id][YYYYMMDD]title.ext
const RENAMED_PATTERN      = /^\[.+?\]\[(\d+)\]\[\d{8}\].+\.(mp3|m4a|ogg|wav|3gp|amr|3ga|m4v|mp4|aac|flac)$/i;
const LIVE_RENAMED_PATTERN = /^\[.+?\]\[l_(\d+)\]\[\d{8}\].+\.(mp3|m4a|ogg|wav|3gp|amr|3ga|m4v|mp4|aac|flac)$/i;
const DEFAULT_FOLDER = 'koe2';

// ── タブ切り替え ──────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ── お気に入りタブ ────────────────────────────────────────────
const favList = document.getElementById('fav-list');
const favEmpty = document.getElementById('fav-empty');

function renderFavorites(list) {
  favList.innerHTML = '';
  if (list.length === 0) { favEmpty.style.display = ''; return; }
  favEmpty.style.display = 'none';
  const genderLabels = { female: '女性', male: '男性', couple: 'カップル' };
  list.slice().reverse().forEach(fav => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = fav.profileUrl; a.textContent = fav.name; a.target = '_blank'; a.rel = 'noopener';
    const badge = document.createElement('span');
    badge.className = `gender-badge ${fav.gender || ''}`.trim();
    badge.textContent = genderLabels[fav.gender] || fav.gender || '不明';
    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn'; delBtn.textContent = '×'; delBtn.title = '削除';
    delBtn.addEventListener('click', () => removeFavorite(fav.id));
    li.append(a, badge, delBtn);
    favList.appendChild(li);
  });
}

function removeFavorite(id) {
  chrome.storage.local.get(FAV_KEY, data => {
    const list = (data[FAV_KEY] || []).filter(f => f.id !== id);
    chrome.storage.local.set({ [FAV_KEY]: list }, () => renderFavorites(list));
  });
}

chrome.storage.local.get(FAV_KEY, data => renderFavorites(data[FAV_KEY] || []));

// ── LIVEお気に入りタブ ────────────────────────────────────────
const lfavList  = document.getElementById('lfav-list');
const lfavEmpty = document.getElementById('lfav-empty');

function renderLiveFavorites(list) {
  lfavList.innerHTML = '';
  if (list.length === 0) { lfavEmpty.style.display = ''; return; }
  lfavEmpty.style.display = 'none';
  const genderLabels = { female: '女性', male: '男性', couple: 'カップル' };
  list.slice().reverse().forEach(fav => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = fav.profileUrl; a.textContent = fav.name; a.target = '_blank'; a.rel = 'noopener';
    const badge = document.createElement('span');
    badge.className = `gender-badge ${fav.gender || ''}`.trim();
    badge.textContent = genderLabels[fav.gender] || fav.gender || 'LIVE';
    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn'; delBtn.textContent = '×'; delBtn.title = '削除';
    delBtn.addEventListener('click', () => {
      chrome.storage.local.get(LFAV_KEY, data => {
        const updated = (data[LFAV_KEY] || []).filter(f => f.id !== fav.id);
        chrome.storage.local.set({ [LFAV_KEY]: updated }, () => renderLiveFavorites(updated));
      });
    });
    li.append(a, badge, delBtn);
    lfavList.appendChild(li);
  });
}

chrome.storage.local.get(LFAV_KEY, data => renderLiveFavorites(data[LFAV_KEY] || []));

chrome.storage.onChanged.addListener(changes => {
  if (changes[FAV_KEY])  renderFavorites(changes[FAV_KEY].newValue || []);
  if (changes[LFAV_KEY]) renderLiveFavorites(changes[LFAV_KEY].newValue || []);
});

// ── リネーム支援タブ：DOM 参照 ────────────────────────────────
const pickBtn      = document.getElementById('pick-folder-btn');
const scanResult   = document.getElementById('scan-result');
const previewList  = document.getElementById('rename-preview');
const executeBtn   = document.getElementById('execute-rename-btn');
const renameStatus = document.getElementById('rename-status');

// ── フォルダ設定 ──────────────────────────────────────────────
const folderInput = document.getElementById('dl-folder-input');
const folderSave  = document.getElementById('dl-folder-save');
const folderHint  = document.getElementById('dl-folder-hint');

function applyFolderSetting(folder) {
  folderInput.value = folder;
  folderHint.textContent = folder
    ? `保存先: Downloads/${folder}/`
    : '保存先: Downloads/ （サブフォルダなし）';
  pickBtn.textContent = `📁 Downloads/${folder || ''}/ DBファイル更新＆リネーム`;
}

chrome.storage.local.get(SETTINGS_KEY, data => {
  applyFolderSetting(data[SETTINGS_KEY]?.downloadFolder ?? DEFAULT_FOLDER);
});

folderSave.addEventListener('click', () => {
  const folder = folderInput.value.trim().replace(/[/\\]/g, '');
  chrome.storage.local.set({ [SETTINGS_KEY]: { downloadFolder: folder } }, () => {
    applyFolderSetting(folder);
    folderSave.textContent = '✓';
    setTimeout(() => { folderSave.textContent = '保存'; }, 1200);
  });
});

// { handle, oldName, newName, id, username, title, dateStr }
let pendingRenames = [];

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
function buildFilename(username, id, dateStr, title, ext) {
  return `[${sanitize(username)}][${id}][${dateStr}]${sanitize(title)}.${ext}`;
}

function fetchFromBg(type, id) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, id }, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!res) reject(new Error('レスポンスなし'));
      else resolve(res);
    });
  });
}

pickBtn.addEventListener('click', async () => {
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch { return; }

  pickBtn.disabled = true;
  scanResult.textContent = 'スキャン中…';
  previewList.innerHTML = '';
  executeBtn.style.display = 'none';
  renameStatus.textContent = '';
  pendingRenames = [];

  // スキャン: リネーム対象・リネーム済み・全ファイル名 を同時収集
  const targets = [];
  const alreadyRenamed = [];
  const allFilenames = new Set();
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    allFilenames.add(name);
    const m  = name.match(RENAME_PATTERN);
    const ml = name.match(LIVE_RENAME_PATTERN);
    const rr = name.match(RENAMED_PATTERN);
    const rl = name.match(LIVE_RENAMED_PATTERN);
    if (m)       targets.push({ id: m[1],  ext: m[2].toLowerCase(),  name, handle, isLive: false });
    else if (ml) targets.push({ id: ml[1], ext: ml[2].toLowerCase(), name, handle, isLive: true });
    else if (rl) alreadyRenamed.push({ id: rl[1], isLive: true,  name });
    else if (rr) alreadyRenamed.push({ id: rr[1], isLive: false, name });
  }

  // 既存のストレージキャッシュを読み込む
  const { [DL_KEY]: dlCache = {} } = await new Promise(r => chrome.storage.local.get(DL_KEY, r));

  // リネーム済みファイルを DL済み として登録（ストレージクリア後の復元）
  let restored = 0;
  for (const r of alreadyRenamed) {
    const dlKey = r.isLive ? `live_${r.id}` : r.id;
    if (!dlCache[dlKey]?.filename) {
      dlCache[dlKey] = { ...(dlCache[dlKey] || { id: dlKey }), filename: r.name };
      restored++;
    }
  }

  // DB照合: filename が記録されているのにフォルダに存在しないものはDL済みを取り消す
  let revoked = 0;
  for (const entry of Object.values(dlCache)) {
    if (entry.filename && !allFilenames.has(entry.filename)) {
      delete entry.filename;
      revoked++;
    }
  }

  if (targets.length === 0) {
    chrome.storage.local.set({ [DL_KEY]: dlCache });
    const msgs = ['リネーム対象：0件'];
    if (restored > 0) msgs.push(`DL済み ${restored} 件を復元`);
    if (revoked  > 0) msgs.push(`${revoked} 件を取り消し`);
    scanResult.textContent = msgs.join(' / ');
    pickBtn.disabled = false;
    return;
  }

  // キャッシュなしの件数を事前カウントして確認
  const FETCH_INTERVAL_MS = 300;
  const CONFIRM_THRESHOLD = 50;
  const uncached = targets.filter(t => !dlCache[t.isLive ? `live_${t.id}` : t.id]);
  if (uncached.length > CONFIRM_THRESHOLD) {
    const sec = Math.round(uncached.length * FETCH_INTERVAL_MS / 1000);
    const min = Math.floor(sec / 60);
    const timeStr = min > 0
      ? `約${min}分${sec % 60 > 0 ? (sec % 60) + '秒' : ''}`
      : `約${sec}秒`;
    const ok = confirm(
      `未取得ファイルが ${uncached.length} 件あります。\nサーバー負荷軽減のため ${timeStr} かかります。\n続行しますか？`
    );
    if (!ok) { pickBtn.disabled = false; return; }
  }

  scanResult.textContent = `${targets.length} 件を照会中…`;
  let done = 0;

  for (const t of targets) {
    const dlKey = t.isLive ? `live_${t.id}` : t.id;
    try {
      let username, title, dateStr;

      if (dlCache[dlKey]) {
        ({ username, title, date: dateStr } = dlCache[dlKey]);
      } else if (t.isLive) {
        const info = await fetchFromBg('fetchArchivePage', t.id);
        if (!info.ok) throw new Error(info.error || '取得失敗');
        username = info.username;
        title    = info.title;
        dateStr  = info.dateStr;
        dlCache[dlKey] = { id: dlKey, username, title, date: dateStr };
        await new Promise(r => setTimeout(r, FETCH_INTERVAL_MS));
      } else {
        const info = await fetchFromBg('fetchVoicePage', t.id);
        if (!info.ok) throw new Error(info.error || '取得失敗');
        const date = info.relativeDate ? parseRelativeDate(info.relativeDate) : new Date();
        username = info.username;
        title    = info.title;
        dateStr  = formatDate(date);
        dlCache[dlKey] = { id: dlKey, username, title, date: dateStr };
        await new Promise(r => setTimeout(r, FETCH_INTERVAL_MS));
      }

      const filenameId = t.isLive ? `l_${t.id}` : t.id;
      const newName = buildFilename(username, filenameId, dateStr, title, t.ext);
      const alreadyDone = !!dlCache[dlKey]?.filename;
      pendingRenames.push({ handle: t.handle, oldName: t.name, newName, id: dlKey, username, title, dateStr, alreadyDone });
    } catch (err) {
      pendingRenames.push({ handle: t.handle, oldName: t.name, newName: null, id: dlKey, error: err.message });
    }
    done++;
    scanResult.textContent = `${done} / ${targets.length} 照会完了`;
  }

  // DB保存（照合済み + 今回fetch分）
  chrome.storage.local.set({ [DL_KEY]: dlCache });

  renderPreview(pendingRenames);
  const statusMsgs = [];
  if (restored > 0) statusMsgs.push(`DL済み ${restored} 件を復元`);
  if (revoked  > 0) statusMsgs.push(`${revoked} 件を取り消し`);
  if (statusMsgs.length) renameStatus.textContent = statusMsgs.join(' / ');
  pickBtn.disabled = false;
});

function renderPreview(renames) {
  previewList.innerHTML = '';
  const valid = renames.filter(r => r.newName);
  const failed = renames.filter(r => !r.newName);

  valid.forEach(r => {
    const li = document.createElement('li');
    const prefix = r.alreadyDone ? '<span style="color:#2a7">✓</span> ' : '';
    li.innerHTML = `${prefix}<span class="old">${escHtml(r.oldName)}</span>`
      + `<span class="arrow">→</span>`
      + `<span class="new">${escHtml(r.newName)}</span>`;
    previewList.appendChild(li);
  });

  failed.forEach(r => {
    const li = document.createElement('li');
    li.style.color = '#c00';
    li.textContent = `取得失敗: ${r.oldName}（${r.error || '不明'}）`;
    previewList.appendChild(li);
  });

  if (valid.length > 0) {
    executeBtn.style.display = '';
    executeBtn.textContent = `一括リネーム実行（${valid.length} 件）`;
  }
  scanResult.textContent = `${valid.length} 件リネーム可能 / ${failed.length} 件失敗`;
}

executeBtn.addEventListener('click', async () => {
  executeBtn.disabled = true;
  const targets = pendingRenames.filter(r => r.newName);
  let ok = 0, ng = 0;

  const { [DL_KEY]: dlStore = {} } = await new Promise(r => chrome.storage.local.get(DL_KEY, r));

  for (const r of targets) {
    try {
      if (typeof r.handle.move === 'function') {
        await r.handle.move(r.newName);
      } else {
        renameStatus.textContent = 'このブラウザは move() に非対応です。Chrome 109+ が必要です。';
        executeBtn.disabled = false;
        return;
      }
      // ダウンロード済みとして記録
      dlStore[r.id] = { ...dlStore[r.id], id: r.id, username: r.username, title: r.title, date: r.dateStr, filename: r.newName, savedAt: Date.now() };
      ok++;
    } catch (err) {
      console.error('[koe2] rename failed:', r.oldName, err);
      ng++;
    }
  }

  chrome.storage.local.set({ [DL_KEY]: dlStore });
  renameStatus.textContent = `完了: ${ok} 件成功 / ${ng} 件失敗`;
  executeBtn.style.display = 'none';
  pendingRenames = [];
});

// ── バックアップ ──────────────────────────────────────────────
const exportBtn    = document.getElementById('export-btn');
const importBtn    = document.getElementById('import-btn');
const importFile   = document.getElementById('import-file');
const backupStatus = document.getElementById('backup-status');

const BACKUP_KEYS = ['favorites', 'live_favorites', 'downloads', 'played', 'settings'];

exportBtn.addEventListener('click', () => {
  chrome.storage.local.get(BACKUP_KEYS, data => {
    const json = JSON.stringify(data, null, 2);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `koe2-backup-${stamp}.json`;
    a.click();
    backupStatus.textContent = 'エクスポート完了';
  });
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      // BACKUP_KEYS 以外のキーを除外して安全にインポート
      const safe = Object.fromEntries(
        Object.entries(data).filter(([k]) => BACKUP_KEYS.includes(k))
      );
      chrome.storage.local.set(safe, () => {
        backupStatus.textContent = `インポート完了（${Object.keys(safe).join('・')}）`;
        // お気に入りを即時反映
        if (safe.favorites)      renderFavorites(safe.favorites);
        if (safe.live_favorites) renderLiveFavorites(safe.live_favorites);
      });
    } catch {
      backupStatus.textContent = 'エラー：JSONが読み込めません';
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
