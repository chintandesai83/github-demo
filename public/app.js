(() => {
  // ===== Persistent client ID (for like toggling) =====
  let clientId = localStorage.getItem('broadcast_client_id');
  if (!clientId) {
    clientId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem('broadcast_client_id', clientId);
  }

  // ===== DOM refs =====
  const usernameInput = document.getElementById('username-input');
  const msgInput = document.getElementById('message-input');
  const postBtn = document.getElementById('post-btn');
  const charCount = document.getElementById('char-count');
  const feed = document.getElementById('feed');
  const connStatus = document.getElementById('conn-status');
  const connDot = connStatus.querySelector('.dot');
  const totalCount = document.getElementById('total-count');
  const onlineCount = document.getElementById('online-count');
  const sidebarUsername = document.getElementById('sidebar-username');
  const sidebarHandle = document.getElementById('sidebar-handle');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const composeAvatar = document.getElementById('compose-avatar');

  let ws;
  let totalMessages = 0;

  // ===== Username sync =====
  function updateProfile() {
    const name = usernameInput.value.trim() || 'Anonymous';
    const handle = '@' + name.toLowerCase().replace(/\s+/g, '_');
    sidebarUsername.textContent = name;
    sidebarHandle.textContent = handle;
    sidebarAvatar.textContent = name[0].toUpperCase();
    composeAvatar.textContent = name[0].toUpperCase();
    // Color avatar based on first char
    const hue = (name.charCodeAt(0) * 37) % 360;
    sidebarAvatar.style.background = `hsl(${hue},65%,45%)`;
    composeAvatar.style.background = `hsl(${hue},65%,45%)`;
  }

  usernameInput.addEventListener('input', updateProfile);
  updateProfile();

  // ===== Char counter =====
  msgInput.addEventListener('input', () => {
    const remaining = 280 - msgInput.value.length;
    charCount.textContent = remaining;
    charCount.className = 'char-count' + (remaining <= 0 ? ' danger' : remaining <= 20 ? ' warn' : '');
    postBtn.disabled = msgInput.value.trim().length === 0 || remaining < 0;
  });

  postBtn.disabled = true;

  // ===== WebSocket =====
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      connDot.className = 'dot connected';
      connStatus.innerHTML = '<span class="dot connected"></span> Live';
    });

    ws.addEventListener('close', () => {
      connDot.className = 'dot disconnected';
      connStatus.innerHTML = '<span class="dot disconnected"></span> Reconnecting...';
      setTimeout(connect, 2000);
    });

    ws.addEventListener('error', () => ws.close());

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        renderHistory(data.messages);
      } else if (data.type === 'new_message') {
        prependMessage(data.message);
        totalMessages++;
        totalCount.textContent = totalMessages;
      } else if (data.type === 'update_likes') {
        updateLikesUI(data.id, data.likes, data.likedBy);
      } else if (data.type === 'online_count') {
        onlineCount.textContent = data.count;
      }
    });
  }

  connect();

  // ===== Post =====
  function sendPost() {
    const text = msgInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'post',
      username: usernameInput.value.trim() || 'Anonymous',
      text,
    }));
    msgInput.value = '';
    charCount.textContent = '280';
    charCount.className = 'char-count';
    postBtn.disabled = true;
  }

  postBtn.addEventListener('click', sendPost);
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendPost();
  });

  // ===== Render =====
  function renderHistory(messages) {
    feed.innerHTML = '';
    if (messages.length === 0) {
      feed.innerHTML = `
        <div class="empty-state">
          <h3>Nothing here yet</h3>
          <p>Be the first to broadcast something!</p>
        </div>`;
      return;
    }
    messages.forEach((msg) => feed.appendChild(buildCard(msg)));
    totalMessages = messages.length;
    totalCount.textContent = totalMessages;
  }

  function prependMessage(msg) {
    const empty = feed.querySelector('.empty-state');
    if (empty) empty.remove();
    feed.insertBefore(buildCard(msg), feed.firstChild);
  }

  function buildCard(msg) {
    const card = document.createElement('article');
    card.className = 'message-card';
    card.dataset.id = msg.id;

    const liked = msg.likedBy && msg.likedBy.includes(clientId);
    const hue = (msg.username.charCodeAt(0) * 37) % 360;

    card.innerHTML = `
      <div class="avatar" style="background:hsl(${hue},65%,45%)">${msg.username[0].toUpperCase()}</div>
      <div class="message-body">
        <div class="message-header">
          <span class="msg-username">${escHtml(msg.username)}</span>
          <span class="msg-handle">@${escHtml(msg.username.toLowerCase().replace(/\s+/g, '_'))}</span>
          <span class="msg-time">${formatTime(msg.timestamp)}</span>
        </div>
        <div class="msg-text">${escHtml(msg.text)}</div>
        <div class="message-actions">
          <button class="action-btn like-btn ${liked ? 'liked' : ''}" data-id="${msg.id}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="like-count">${msg.likes}</span>
          </button>
          <button class="action-btn" onclick="navigator.clipboard.writeText(${JSON.stringify(msg.text)})">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </button>
        </div>
      </div>`;

    card.querySelector('.like-btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const id = btn.dataset.id;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'like', id, clientId }));
      }
    });

    return card;
  }

  function updateLikesUI(id, likes, likedBy) {
    const card = feed.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    const btn = card.querySelector('.like-btn');
    const countEl = btn.querySelector('.like-count');
    const heartSvg = btn.querySelector('svg');
    const isLiked = likedBy.includes(clientId);

    countEl.textContent = likes;
    btn.className = 'action-btn like-btn' + (isLiked ? ' liked' : '');
    heartSvg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
  }

  // ===== Helpers =====
  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
  }
})();
