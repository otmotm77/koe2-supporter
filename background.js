chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'download') {
    chrome.storage.local.get('settings', data => {
      const folder = data.settings?.downloadFolder ?? 'koe2';
      const filename = folder ? `${folder}/${msg.filename}` : msg.filename;
      chrome.downloads.download({ url: msg.url, filename }, id => {
        sendResponse({ ok: true, id });
      });
    });
    return true;
  }

  if (msg.type === 'fetchVoicePage') {
    fetchVoicePage(msg.id).then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  if (msg.type === 'fetchArchivePage') {
    fetchArchivePage(msg.id).then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

async function fetchVoicePage(id) {
  // Service Worker には DOMParser がないため regex でパース
  const url = `https://koe-koe.com/detail.php?n=${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  if (!html.includes('class="desc detail"')) {
    throw new Error('投稿が見つかりません（削除済みまたはアクセス不可）');
  }

  // ユーザー名: span.user_name + トリップ（</a> 直後）
  const userBase = decodeHtml(
    html.match(/<span class="user_name">([^<]+)<\/span>/)?.[1] ?? '不明'
  );
  const tripNormal = decodeHtml(
    html.match(/<span class="user_name">[^<]+<\/span><\/a>([◆◇][^\s:：<]+)/)?.[1] ?? ''
  );
  const username = userBase + tripNormal;

  // 相対日時: .desc.detail 以降の最初の metaIcon_up
  const descStart = html.indexOf('class="desc detail"');
  const htmlFromDesc = descStart >= 0 ? html.slice(descStart) : html;
  const relativeDate = htmlFromDesc.match(/<span class="metaIcon_up">(@[^<]+)<\/span>/)?.[1] ?? '';

  // タイトル: og:title から "[番号] - Koe-Koe..." を除去
  const ogTitle = decodeHtml(
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? ''
  );
  const title = ogTitle.replace(/\s*\[\d+\].*$/, '').trim() || `voice_${id}`;

  return { ok: true, username, relativeDate, title };
}

async function fetchArchivePage(id) {
  const url = `https://koe-koe.com/archive_detail.php?n=${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  if (!html.includes('class="desc detail"')) {
    throw new Error('投稿が見つかりません（削除済みまたはアクセス不可）');
  }

  // ユーザー名: .desc.detail 内の entry_auth + トリップ（◆/◇）
  const descStart = html.indexOf('class="desc detail"');
  const htmlFromDesc = descStart >= 0 ? html.slice(descStart) : html;
  const baseName = decodeHtml(
    htmlFromDesc.match(/<span class="entry_auth">([^<]+)<\/span>/)?.[1] ?? '不明'
  );
  const tripMatch = htmlFromDesc.match(/<span class="entry_auth">[^<]+<\/span>([◆◇][^\s:：<]+)/);
  const username = baseName + (tripMatch ? decodeHtml(tripMatch[1]) : '');

  // 日付: og:title の [YYYY-MM-DD] → YYYYMMDD
  const ogTitle = decodeHtml(
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? ''
  );
  const dateStr = (ogTitle.match(/\[(\d{4})-(\d{2})-(\d{2})\]/) ?? [])
    .slice(1).join('') || '';

  // タイトル: entry_auth の後の ": 説明文"
  const title = decodeHtml(
    htmlFromDesc.match(/<span class="entry_auth">[^<]+<\/span>\s*:\s*([^\n<;]+)/)?.[1]?.trim() ?? '配信'
  );

  return { ok: true, username, dateStr, title };
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
