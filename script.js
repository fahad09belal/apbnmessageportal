(() => {
  "use strict";

  const SUPABASE_URL = "__SUPABASE_URL__";
  const SUPABASE_PUBLISHABLE_KEY = "__SUPABASE_ANON_KEY__";
  const AUTH_DOMAIN = "apbn.local";

  // Insert your ImgBB API Key below (from https://api.imgbb.com/)
  const IMGBB_API_KEY = "d895a576a810d43ebf43d08d566f48a9";

  const { createClient } = window.supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const $ = id => document.getElementById(id);
  const authScreen = $("auth-screen"), app = $("app");
  const authStatus = $("auth-status"), messagesEl = $("messages");
  const input = $("message-input");
  const winEl = $("messenger-window");
  const winverEl = $("winver-window");
  const taskbarItem = $("taskbar-app-item");
  const startOrbBtn = $("start-orb-btn");
  let winverTaskbarItem = null;

  let currentUser = null;
  let currentProfile = null;
  let replyTo = null;
  let realtimeChannel = null;
  let popoverTimeout = null;
  let activeTarget = null;
  let initialMessagesLoaded = false;
  let swRegistration = null;

  const usernameRegex = /^[A-Za-z]+@[0-9]+$/;

  // Mobile Side Panel Controls
  const sidebarEl = $("sidebar");
  const mobileProfileToggleBtn = $("mobile-profile-toggle");
  const mobileOverlayEl = $("mobile-overlay");

  function toggleMobileSidebar(show) {
    const shouldShow = show !== undefined ? show : !sidebarEl.classList.contains("mobile-open");
    sidebarEl.classList.toggle("mobile-open", shouldShow);
    mobileOverlayEl.classList.toggle("show", shouldShow);
  }

  mobileProfileToggleBtn.onclick = (e) => {
    e.stopPropagation();
    toggleMobileSidebar();
  };

  mobileOverlayEl.onclick = () => {
    toggleMobileSidebar(false);
  };

  // Audio Synthesizer Beep
  let audioCtx = null;
  function playNotificationBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      const ctx = audioCtx;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn("Audio chime unavailable:", e);
    }
  }

  // Mobile In-App Toast Alert Fallback
  function showInAppToast(sender, text) {
    const toast = $("mobile-toast");
    if (!toast) return;
    toast.innerHTML = `<strong>${escapeHTML(sender)}</strong><br>${escapeHTML(text)}`;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 4500);
  }

  // Register Service Worker (sw.js)
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('sw.js');
      swRegistration = await navigator.serviceWorker.ready;
    } catch (e) {
      console.warn("Service Worker registration skipped:", e);
    }
  }
  registerServiceWorker();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'notification-click' && winEl.classList.contains("minimized")) {
        toggleMinimizeWindow();
      }
    });
  }

  // Taskbar Clock
  function updateTaskbarClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
    $("taskbar-clock").innerHTML = `${timeStr}<br>${dateStr}`;
  }
  setInterval(updateTaskbarClock, 1000);
  updateTaskbarClock();

  function toggleMinimizeWindow() {
    const isMin = winEl.classList.toggle("minimized");
    if (isMin) {
      taskbarItem.classList.remove("active");
      taskbarItem.classList.add("minimized");
    } else {
      taskbarItem.classList.add("active");
      taskbarItem.classList.remove("minimized");
    }
  }

  function toggleMinimizeWinver() {
    if (!winverTaskbarItem) return;
    const isMin = winverEl.classList.toggle("minimized");
    if (isMin) {
      winverTaskbarItem.classList.remove("active");
      winverTaskbarItem.classList.add("minimized");
    } else {
      winverTaskbarItem.classList.add("active");
      winverTaskbarItem.classList.remove("minimized");
    }
  }

  function openWinverWindow() {
    winverEl.classList.remove("hidden");
    winverEl.classList.remove("minimized");

    const left = Math.max(20, (window.innerWidth - 480) / 2);
    const top = Math.max(20, (window.innerHeight - 380 - 40) / 2);
    winverEl.style.left = `${left}px`;
    winverEl.style.top = `${top}px`;

    if (!winverTaskbarItem) {
      winverTaskbarItem = document.createElement("div");
      winverTaskbarItem.className = "taskbar-item active";
      winverTaskbarItem.title = "About Windows - APBn Squad";
      winverTaskbarItem.innerHTML = `<img src="custom-logo.png" alt=""><span>About Windows</span>`;
      winverTaskbarItem.onclick = toggleMinimizeWinver;
      $("taskbar-items-container").appendChild(winverTaskbarItem);
    } else {
      winverTaskbarItem.classList.add("active");
      winverTaskbarItem.classList.remove("minimized");
    }
  }

  function closeWinverWindow() {
    winverEl.classList.add("hidden");
    if (winverTaskbarItem) {
      winverTaskbarItem.remove();
      winverTaskbarItem = null;
    }
  }

  startOrbBtn.onclick = () => {
    if (winverEl.classList.contains("hidden")) {
      openWinverWindow();
    } else if (winverEl.classList.contains("minimized")) {
      toggleMinimizeWinver();
    } else {
      winverEl.focus();
    }
  };

  $("winver-min").onclick = toggleMinimizeWinver;
  $("winver-close").onclick = closeWinverWindow;
  $("winver-ok-btn").onclick = closeWinverWindow;

  function setupWindowControls() {
    $("win-min").onclick = () => toggleMinimizeWindow();
    taskbarItem.onclick = () => toggleMinimizeWindow();

    $("show-desktop").onclick = () => {
      if (!winEl.classList.contains("minimized")) {
        toggleMinimizeWindow();
      }
      if (winverTaskbarItem && !winverEl.classList.contains("minimized") && !winverEl.classList.contains("hidden")) {
        toggleMinimizeWinver();
      }
    };

    $("win-max").onclick = () => {
      winEl.classList.toggle("is-fullscreen");
      app.classList.toggle("is-fullscreen-wrap");
      if (winEl.classList.contains("is-fullscreen")) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    $("win-close").onclick = () => logout();
  }
  setupWindowControls();

  function setupDraggableWindow(targetWin, titleBar) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    function onPointerDown(e) {
      if (targetWin.classList.contains("is-fullscreen")) return;
      if (e.target.closest("button")) return;

      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;

      const rect = targetWin.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      targetWin.style.left = `${initialLeft}px`;
      targetWin.style.top = `${initialTop}px`;
      targetWin.style.margin = "0";

      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const maxLeft = window.innerWidth - targetWin.offsetWidth;
      const maxTop = window.innerHeight - 34 - 40;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      targetWin.style.left = `${newLeft}px`;
      targetWin.style.top = `${newTop}px`;
    }

    function onPointerUp() {
      isDragging = false;
      document.removeEventListener("mousemove", onPointerMove);
      document.removeEventListener("mouseup", onPointerUp);
      document.removeEventListener("touchmove", onPointerMove);
      document.removeEventListener("touchend", onPointerUp);
    }

    titleBar.addEventListener("mousedown", onPointerDown);
    titleBar.addEventListener("touchstart", onPointerDown, { passive: true });
  }

  setupDraggableWindow(winEl, $("app-titlebar"));
  setupDraggableWindow(winverEl, $("winver-titlebar"));

  function authEmail(username) {
    const bytes = new TextEncoder().encode(username.trim().toLowerCase());
    let binary = "";
    bytes.forEach(b => binary += String.fromCharCode(b));
    const encoded = btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    return encoded + "@" + AUTH_DOMAIN;
  }

  function showStatus(message, good=false) {
    authStatus.className = good ? "ok" : "error";
    authStatus.textContent = message;
  }

  function clearStatus() {
    authStatus.className = "";
    authStatus.textContent = "";
  }

  function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function stripFormatting(str) {
    if (!str) return "";
    let clean = String(str).replace(/<[^>]*>/g, "");
    clean = clean.replace(/[*_~`]/g, "");
    return clean.trim();
  }

  // EXTENDED TEXT FORMATTER WITH YOUTUBE, SPOTIFY, CATBOX, MYINSTANTS, MP4 & IMAGE EMBEDS
  function formatText(s) {
    let safe = escapeHTML(s);

    // Easter Egg Replacement
    const easterEggUrl = "https://cdn.discordapp.com/attachments/872398057856184330/1555987461342109810/password.mp4?ex=6ac285bf&is=6ac1343f&hm=86c886f4d1fe234570932e5e0d6485da69c0c5f9f2d4811092db99b3930704ab&";
    safe = safe.replace(/\bandhenemoviedekhiorrgungeneganagaya\b/g, easterEggUrl);

    // Auto-detect and embed direct MP4 video links
    const mp4Regex = /(https?:\/\/[^\s]+?\.(?:mp4)(?:\?[^\s]*)?)/gi;
    safe = safe.replace(mp4Regex, (match) => {
      return `<br><video class="chat-embed-media" controls src="${match}"></video>`;
    });

    // Auto-detect and embed Youtube links
    const youtubeRegex = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s]*/gi;
    safe = safe.replace(youtubeRegex, (match, videoId) => {
      return `<br><iframe class="chat-embed-media" height="240" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    });

    // Auto-detect and embed Spotify links
    const spotifyRegex = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)[^\s]*/gi;
    safe = safe.replace(spotifyRegex, (match, type, id) => {
      return `<br><iframe class="chat-embed-media" src="https://open.spotify.com/embed/${type}/${id}" height="152" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
    });

    // Auto-detect files.catbox.moe links and replace with MSN Engraved Download Button
    const catboxRegex = /(https?:\/\/files\.catbox\.moe\/[a-zA-Z0-9._-]+)/gi;
    safe = safe.replace(catboxRegex, (match) => {
      return `<br><a href="${match}" target="_blank" rel="noopener noreferrer" class="msn-engraved-btn"><span class="msn-icon-dl"></span><span>Download</span></a>`;
    });

    // Auto-detect and embed MyInstants links
    const myinstantsRegex = /https?:\/\/(?:www\.)?myinstants\.com\/(?:[a-z]{2}\/)?instant\/([a-zA-Z0-9-]+)\/?[^\s]*/gi;
    safe = safe.replace(myinstantsRegex, (match, instantSlug) => {
      const embedUrl = `https://www.myinstants.com/instant/${instantSlug}/embed/`;
      return `<br><iframe class="chat-embed-instant" width="110" height="200" src="${embedUrl}" frameborder="0" scrolling="no"></iframe>`;
    });

    // Auto-detect and render direct image or GIF links (including ibb.co or i.ibb.co images)
    const imageRegex = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp))/gi;
    safe = safe.replace(imageRegex, (match) => {
      return `<br><a href="${match}" target="_blank" rel="noopener noreferrer"><img src="${match}" class="chat-embed-image" alt="Uploaded Image" loading="lazy"></a>`;
    });

    // Detect @mentions
    safe = safe.replace(/(^|[\s])(@[A-Za-z]+@[0-9]+)\b/g, '$1<span class="mention">$2</span>');
    return safe;
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium", timeStyle: "short"
    }).format(new Date(value));
  }

  function switchAuth(mode) {
    $("login-box").classList.toggle("hidden", mode !== "login");
    $("signup-box").classList.toggle("hidden", mode !== "signup");
    clearStatus();
  }

  $("show-signup").onclick = () => switchAuth("signup");
  $("show-login").onclick = () => switchAuth("login");

  // IMGBB.COM UPLOADER FUNCTION FOR CHAT COMPOSER
  const imgbbFileInput = $("imgbb-file-input");
  const uploadImageBtn = $("upload-image-btn");

  uploadImageBtn.onclick = () => {
    imgbbFileInput.click();
  };

  imgbbFileInput.onchange = async () => {
    const file = imgbbFileInput.files[0];
    if (!file) return;

    if (!IMGBB_API_KEY || IMGBB_API_KEY === "YOUR_IMGBB_API_KEY") {
      alert("Please configure a valid ImgBB API Key in the script before uploading.");
      return;
    }

    uploadImageBtn.classList.add("uploading");
    const originalText = input.placeholder;
    input.placeholder = "Uploading file to ImgBB...";

    try {
      const formData = new FormData();
      formData.append("image", file);

      // Call ImgBB official API v1 upload endpoint directly
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error(`ImgBB upload HTTP status: ${res.status}`);

      const json = await res.json();
      if (!json.success || !json.data || !json.data.url) {
        throw new Error(json.error?.message || "Invalid upload response from ImgBB.");
      }

      // ImgBB returns the image link in json.data.url or json.data.display_url
      const fileUrl = json.data.url;

      // Append image link to message box
      input.value = input.value ? `${input.value}\n${fileUrl}` : fileUrl;
      input.focus();
    } catch (err) {
      alert("Failed to upload image to ImgBB: " + err.message);
    } finally {
      uploadImageBtn.classList.remove("uploading");
      input.placeholder = originalText;
      imgbbFileInput.value = "";
    }
  };

  // IMGBB.COM UPLOADER FUNCTION FOR AVATAR/PROFILE PICTURE
  const avatarFileInput = $("avatar-file-input");
  const uploadAvatarBtn = $("upload-avatar-btn");

  uploadAvatarBtn.onclick = () => {
    avatarFileInput.click();
  };

  avatarFileInput.onchange = async () => {
    const file = avatarFileInput.files[0];
    if (!file) return;

    if (!IMGBB_API_KEY || IMGBB_API_KEY === "YOUR_IMGBB_API_KEY") {
      alert("Please configure a valid ImgBB API Key in the script before uploading.");
      return;
    }

    const origBtnText = uploadAvatarBtn.textContent;
    uploadAvatarBtn.disabled = true;
    uploadAvatarBtn.textContent = "Uploading to ImgBB...";

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error(`ImgBB upload HTTP status: ${res.status}`);

      const json = await res.json();
      if (!json.success || !json.data || !json.data.url) {
        throw new Error(json.error?.message || "Invalid upload response from ImgBB.");
      }

      // Populate avatar URL input field with uploaded ImgBB URL
      $("edit-avatar-url").value = json.data.url;
    } catch (err) {
      alert("Failed to upload avatar to ImgBB: " + err.message);
    } finally {
      uploadAvatarBtn.disabled = false;
      uploadAvatarBtn.textContent = origBtnText;
      avatarFileInput.value = "";
    }
  };

  // ===== PRESENCE / STATUS =====
  const STATUS_KEY = "apbn_presence_status";
  const STATUS_META = {
    online:  { label: "Online", icon: "online.png" },
    dnd:     { label: "DND",    icon: "dnd.png" },
    idle:    { label: "Idle",   icon: "idle.png" },
    offline: { label: "Offline", icon: "offline.png" }
  };
  const DND_NOTE = "Do Not Disturb is on. Notifications and sounds are muted.";
  let presenceChannel = null;
  let presenceMap = {};

  function statusStorageKey() {
    return STATUS_KEY + (currentUser ? ":" + currentUser.id : "");
  }
  function getMyStatus() {
    try {
      const s = localStorage.getItem(statusStorageKey());
      if (s === "online" || s === "dnd" || s === "idle") return s;
    } catch (e) {}
    return "online";
  }
  function isDnd() { return getMyStatus() === "dnd"; }
  function statusOf(uid) {
    if (currentUser && uid === currentUser.id) return getMyStatus();
    return presenceMap[uid] || "offline";
  }

  function applyPresenceBadges() {
    document.querySelectorAll(".avatar-wrap[data-uid]").forEach(wrap => {
      const badge = wrap.querySelector(".status-badge");
      if (!badge) return;
      const s = statusOf(wrap.dataset.uid);
      const icon = STATUS_META[s].icon;
      if (badge.getAttribute("src") !== icon) badge.setAttribute("src", icon);
      badge.alt = STATUS_META[s].label;
    });
  }

  function applyDndNotificationUI() {
    const dnd = isDnd();
    const toggle = $("notification-toggle");
    const testBtn = $("test-notification-btn");
    const msg = $("notification-status-msg");
    if (!toggle || !testBtn || !msg) return;
    toggle.disabled = dnd;
    testBtn.disabled = dnd;
    toggle.closest(".settings-row")?.classList.toggle("notif-disabled", dnd);
    testBtn.classList.toggle("notif-disabled", dnd);
    if (dnd) {
      if (msg.textContent !== DND_NOTE) msg.dataset.prev = msg.textContent;
      msg.textContent = DND_NOTE;
    } else if (msg.textContent === DND_NOTE) {
      msg.textContent = msg.dataset.prev || "Receive alerts when new squad messages arrive.";
    }
  }

  function updateMyStatusUI() {
    const s = getMyStatus();
    const meta = STATUS_META[s];
    $("status-select-icon").src = meta.icon;
    $("status-select-label").textContent = meta.label;
    $("toolbar-status-icon").src = meta.icon;
    $("toolbar-status-label").textContent = meta.label;
    $("sidebar-avatar-wrap").dataset.uid = currentUser ? currentUser.id : "";
    document.querySelectorAll("#status-menu button").forEach(b => {
      b.classList.toggle("active", b.dataset.status === s);
    });
    applyPresenceBadges();
    applyDndNotificationUI();
  }

  function setMyStatus(s) {
    try { localStorage.setItem(statusStorageKey(), s); } catch (e) {}
    updateMyStatusUI();
    if (presenceChannel && presenceChannel.state === "joined") {
      presenceChannel.track({ status: s, at: Date.now() }).catch(() => {});
    }
  }

  function stopPresence() {
    if (presenceChannel) {
      const ch = presenceChannel;
      presenceChannel = null;
      try { ch.untrack(); } catch (e) {}
      sb.removeChannel(ch);
    }
    presenceMap = {};
    applyPresenceBadges();
  }

  function startPresence() {
    if (!currentUser) return;
    stopPresence();
    const ch = sb.channel("apbn-presence", { config: { presence: { key: currentUser.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const next = {};
      Object.keys(state).forEach(uid => {
        const metas = state[uid] || [];
        if (!metas.length) return;
        const latest = metas.reduce((a, b) => ((b.at || 0) >= (a.at || 0) ? b : a));
        next[uid] = (latest.status === "dnd" || latest.status === "idle") ? latest.status : "online";
      });
      presenceMap = next;
      applyPresenceBadges();
    });
    ch.subscribe(async (st) => {
      if (st === "SUBSCRIBED") {
        try { await ch.track({ status: getMyStatus(), at: Date.now() }); }
        catch (e) { console.warn("Presence track failed:", e); }
      }
    });
    presenceChannel = ch;
  }

  // Status dropdown (profile bar)
  const statusMenuEl = $("status-menu");
  const statusBtnEl = $("status-select-btn");
  function closeStatusMenu() { statusMenuEl.classList.remove("show"); }

  statusBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (statusMenuEl.classList.contains("show")) { closeStatusMenu(); return; }
    hidePopover();
    statusMenuEl.classList.add("show");
    const r = statusBtnEl.getBoundingClientRect();
    const mh = statusMenuEl.offsetHeight, mw = statusMenuEl.offsetWidth;
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 48) top = r.top - mh - 4;
    const left = Math.min(r.left, window.innerWidth - mw - 8);
    statusMenuEl.style.top = Math.max(8, top) + "px";
    statusMenuEl.style.left = Math.max(8, left) + "px";
  });

  statusMenuEl.querySelectorAll("button[data-status]").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      setMyStatus(b.dataset.status);
      closeStatusMenu();
    });
  });

  document.addEventListener("click", (e) => {
    if (!statusMenuEl.contains(e.target)) closeStatusMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeStatusMenu(); });
  window.addEventListener("resize", closeStatusMenu);
  window.addEventListener("pagehide", () => {
    if (presenceChannel) { try { presenceChannel.untrack(); } catch (e) {} }
  });

  // Universal Mobile & Desktop Notification Manager
  function initNotificationSettings() {
    const toggle = $("notification-toggle");
    const statusMsg = $("notification-status-msg");

    if (!("Notification" in window)) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      statusMsg.textContent = isIOS
        ? "On iPhone/iPad: tap Share > Add to Home Screen, then open the portal from the home screen to get OS notifications. In-app alerts enabled."
        : "OS Notifications not supported. In-app alerts enabled.";
      toggle.checked = true;
      return;
    }

    const savedPref = localStorage.getItem("apbn_notifications_enabled");
    if (savedPref === null) {
      localStorage.setItem("apbn_notifications_enabled", "true");
    }

    const isEnabled = localStorage.getItem("apbn_notifications_enabled") === "true";
    toggle.checked = isEnabled;

    if (Notification.permission === "denied") {
      statusMsg.textContent = "OS permissions blocked. Falling back to in-app banner alerts.";
    } else if (Notification.permission === "granted") {
      statusMsg.textContent = "Notifications active on desktop and mobile.";
    }

    if (isEnabled && Notification.permission === "default" && !initNotificationSettings.armed) {
      initNotificationSettings.armed = true;
      statusMsg.textContent = "Tap anywhere once to allow notifications.";
      document.addEventListener("click", async () => {
        try {
          const p = await Notification.requestPermission();
          statusMsg.textContent = p === "granted"
            ? "Notifications active on desktop and mobile."
            : "OS permission not granted. In-app banner alerts will be used.";
        } catch (e) {}
      }, { once: true });
    }

    toggle.addEventListener("change", async () => {
      if (toggle.checked) {
        if (Notification.permission !== "granted") {
          try {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
              localStorage.setItem("apbn_notifications_enabled", "true");
              statusMsg.textContent = "Notifications enabled successfully!";
              triggerBrowserNotification("APBn Squad Portal", "Notifications successfully configured!", true);
            } else {
              localStorage.setItem("apbn_notifications_enabled", "true");
              statusMsg.textContent = "OS blocked notifications. In-app banners will be used.";
            }
          } catch (err) {
            localStorage.setItem("apbn_notifications_enabled", "true");
            statusMsg.textContent = "In-app banner notifications active.";
          }
        } else {
          localStorage.setItem("apbn_notifications_enabled", "true");
          statusMsg.textContent = "Notifications enabled!";
        }
      } else {
        localStorage.setItem("apbn_notifications_enabled", "false");
        statusMsg.textContent = "Notifications disabled.";
      }
    });

    $("test-notification-btn").onclick = async () => {
      if ("Notification" in window && Notification.permission !== "granted") {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      localStorage.setItem("apbn_notifications_enabled", "true");
      toggle.checked = true;
      triggerBrowserNotification("Test Notification", "This is a test notification from APBn Portal!", true);
    };
  }

  async function triggerBrowserNotification(senderName, messageText, forceShow = false) {
    if (isDnd()) return; // Do Not Disturb: no sound, no notification, no toast
    playNotificationBeep();

    const isEnabled = localStorage.getItem("apbn_notifications_enabled") !== "false";
    if (!isEnabled) return;

    const cleanSender = stripFormatting(senderName);
    const cleanBody = stripFormatting(messageText);
    const truncatedBody = cleanBody.length > 120 ? cleanBody.slice(0, 117) + "..." : cleanBody;

    const isAppMinimized = winEl.classList.contains("minimized");
    const isHiddenTab = document.hidden || document.visibilityState !== "visible";
    const shouldShowOS = forceShow || isAppMinimized || isHiddenTab;

    if (shouldShowOS && "Notification" in window && Notification.permission === "granted") {
      const title = `Message from ${cleanSender}`;
      const options = {
        body: truncatedBody || "New message received.",
        icon: "group-logo.png",
        badge: "group-logo.png",
        tag: "apbn-chat-" + Date.now(),
        renotify: true,
        vibrate: [200, 100, 200]
      };

      try {
        let reg = swRegistration;
        if (!reg && "serviceWorker" in navigator) {
          reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(resolve => setTimeout(() => resolve(null), 1500))
          ]);
        }
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      } catch (e) {
        console.warn("Service Worker notification failed:", e);
      }

      try {
        const notif = new Notification(title, options);
        notif.onclick = () => {
          window.focus();
          if (winEl.classList.contains("minimized")) toggleMinimizeWindow();
          notif.close();
        };
        return;
      } catch (e) {
        console.warn("Desktop Notification constructor failed:", e);
      }
    }

    showInAppToast(cleanSender, truncatedBody);
  }

  async function createAccount() {
    clearStatus();
    const username = $("signup-username").value.trim();
    const password = $("signup-password").value;
    const password2 = $("signup-password2").value;

    if (!usernameRegex.test(username)) {
      showStatus("Username must look like alphabet@number.");
      return;
    }
    if (password.length < 6) {
      showStatus("Password must be at least 6 characters.");
      return;
    }
    if (password !== password2) {
      showStatus("Passwords do not match.");
      return;
    }

    $("signup-btn").disabled = true;
    try {
      const { data: existing, error: lookupError } = await sb
        .from("profiles")
        .select("id")
        .eq("username_normalized", username.toLowerCase())
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) throw new Error("That username already exists.");

      const { data, error } = await sb.auth.signUp({
        email: authEmail(username),
        password,
        options: { data: { username } }
      });

      if (error) throw error;

      if (!data.session) {
        showStatus("Account created, but email confirmation is enabled on Supabase.");
      } else {
        showStatus("Account created. You can now sign in.", true);
        switchAuth("login");
        $("login-username").value = username;
      }
    } catch (e) {
      showStatus(e.message || "Could not create account.");
    } finally {
      $("signup-btn").disabled = false;
    }
  }

  async function login() {
    clearStatus();
    const username = $("login-username").value.trim();
    const password = $("login-password").value;

    if (!usernameRegex.test(username)) {
      showStatus("Enter a username like alphabet@number.");
      return;
    }
    if (!password) {
      showStatus("Enter your password.");
      return;
    }

    $("login-btn").disabled = true;
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: authEmail(username),
        password
      });
      if (error) throw error;
    } catch (e) {
      showStatus("Login failed. Check your username and password.");
    } finally {
      $("login-btn").disabled = false;
    }
  }

  function setupProfileEvents() {
    const popover = $("profile-popover");
    const sidebarBox = $("profile-box");

    sidebarBox.addEventListener("mouseenter", () => showPopoverForProfile(currentProfile, sidebarBox));
    sidebarBox.addEventListener("mouseleave", schedulePopoverHide);
    sidebarBox.addEventListener("click", (e) => {
      e.stopPropagation();
      showPopoverForProfile(currentProfile, sidebarBox);
    });

    popover.addEventListener("mouseenter", () => clearTimeout(popoverTimeout));
    popover.addEventListener("mouseleave", schedulePopoverHide);

    document.addEventListener("click", (e) => {
      if (!popover.contains(e.target) && !sidebarBox.contains(e.target) && !e.target.closest(".user-clickable") && !e.target.closest(".msg-avatar")) {
        hidePopover();
      }
    });

    messagesEl.addEventListener("scroll", hidePopover);

    $("popover-edit-btn").onclick = () => {
      hidePopover();
      openEditProfileModal();
    };
  }

  function hidePopover() {
    clearTimeout(popoverTimeout);
    const popover = $("profile-popover");
    popover.classList.remove("show");
    popover.style.display = "none";
    activeTarget = null;
  }

  function schedulePopoverHide() {
    clearTimeout(popoverTimeout);
    popoverTimeout = setTimeout(() => {
      const popover = $("profile-popover");
      const isPopoverHovered = popover.matches(":hover");
      const isTargetHovered = activeTarget && activeTarget.matches(":hover");

      if (!isPopoverHovered && !isTargetHovered) {
        hidePopover();
      }
    }, 200);
  }

  function showPopoverForProfile(profileData, targetElement) {
    clearTimeout(popoverTimeout);
    activeTarget = targetElement;
    const popover = $("profile-popover");

    const displayName = profileData.display_name || profileData.username || "Unknown";
    const avatar = profileData.avatar_url || "group-logo.png";
    const bio = profileData.bio || "No bio added yet.";
    const isAdmin = profileData.role === "admin";
    const isSelf = profileData.id === currentUser?.id;

    $("popover-display-name").textContent = displayName;
    $("popover-username").textContent = "@" + (profileData.username || "user");
    $("popover-avatar").src = avatar;
    $("popover-avatar-wrap").dataset.uid = profileData.id || "";
    applyPresenceBadges();
    $("popover-bio").textContent = bio;
    $("popover-nowplaying").style.display = "none";

    const badgeEl = $("popover-badge");
    badgeEl.className = "role-badge " + (isAdmin ? "admin" : "member");
    badgeEl.textContent = isAdmin ? "★ Admin" : "Member";

    $("popover-edit-btn").classList.toggle("hidden", !isSelf);

    popover.style.display = "flex";
    const targetRect = targetElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = targetRect.bottom + 6;
    let left = targetRect.left;

    if (top + popoverRect.height > viewportHeight - 12 - 40) {
      top = targetRect.top - popoverRect.height - 6;
    }

    if (left + popoverRect.width > viewportWidth - 12) {
      left = viewportWidth - popoverRect.width - 12;
    }

    top = Math.max(10, top);
    left = Math.max(10, left);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    popover.classList.add("show");
    updateNowPlaying(profileData);
  }

  function attachChatUserEvents(element, profileData) {
    element.addEventListener("mouseenter", () => showPopoverForProfile(profileData, element));
    element.addEventListener("mouseleave", schedulePopoverHide);
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      showPopoverForProfile(profileData, element);
    });
  }

  setupProfileEvents();

  // ---- Last.fm "now playing" (enabled for one account only) ----
  const LASTFM_OWNER = "prantikog@67";
  const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";
  const nowPlayingCache = new Map();

  function isLastfmOwner(p) {
    return !!p && (p.username || "").toLowerCase() === LASTFM_OWNER;
  }

  async function fetchNowPlaying(user, key) {
    const url = "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&limit=1&format=json"
      + "&user=" + encodeURIComponent(user) + "&api_key=" + encodeURIComponent(key);
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.message || "Last.fm error");
    let t = json.recenttracks && json.recenttracks.track;
    if (Array.isArray(t)) t = t[0];
    if (!t || !t["@attr"] || t["@attr"].nowplaying !== "true") return null;
    const imgs = Array.isArray(t.image) ? t.image : [];
    const pick = imgs.find(i => i.size === "large") || imgs[imgs.length - 1];
    let cover = pick && pick["#text"] ? pick["#text"] : "";
    if (cover.includes(LASTFM_PLACEHOLDER)) cover = "";
    return {
      name: t.name || "Unknown track",
      artist: (t.artist && (t.artist["#text"] || t.artist.name)) || "Unknown artist",
      cover
    };
  }

  async function updateNowPlaying(profileData) {
    const box = $("popover-nowplaying");
    box.style.display = "none";
    if (!isLastfmOwner(profileData) || !profileData.id) return;
    const uid = String(profileData.id);

    try {
      let track;
      const cached = nowPlayingCache.get(uid);
      if (cached && Date.now() - cached.t < 15000) {
        track = cached.track;
      } else {
        let creds = profileData.id === currentUser?.id ? currentProfile : null;
        if (!creds || creds.lastfm_user === undefined) {
          const { data, error } = await sb.from("profiles")
            .select("lastfm_user, lastfm_key").eq("id", profileData.id).maybeSingle();
          if (error) throw error;
          creds = data;
        }
        if (!creds || !creds.lastfm_user || !creds.lastfm_key) return;
        track = await fetchNowPlaying(creds.lastfm_user, creds.lastfm_key);
        nowPlayingCache.set(uid, { t: Date.now(), track });
      }

      const popover = $("profile-popover");
      if (!track || !popover.classList.contains("show") || $("popover-avatar-wrap").dataset.uid !== uid) return;

      $("np-track").textContent = track.name;
      $("np-track").title = track.name;
      $("np-artist").textContent = track.artist;
      $("np-artist").title = track.artist;
      const cover = $("np-cover");
      cover.onerror = () => { cover.removeAttribute("src"); };
      if (track.cover) cover.src = track.cover; else cover.removeAttribute("src");
      box.style.display = "flex";

      // keep the grown popover inside the viewport
      const r = popover.getBoundingClientRect();
      const maxBottom = window.innerHeight - 12;
      if (r.bottom > maxBottom) {
        popover.style.top = Math.max(10, r.top - (r.bottom - maxBottom)) + "px";
      }
    } catch (e) {
      console.warn("Last.fm now playing failed:", e);
    }
  }

  function openEditProfileModal() {
    $("edit-display-name").value = currentProfile.display_name || currentProfile.username;
    $("edit-avatar-url").value = currentProfile.avatar_url || "";
    $("edit-bio").value = currentProfile.bio || "";
    const showLastfm = isLastfmOwner(currentProfile);
    $("lastfm-fields").classList.toggle("hidden", !showLastfm);
    if (showLastfm) {
      $("edit-lastfm-user").value = currentProfile.lastfm_user || "";
      $("edit-lastfm-key").value = currentProfile.lastfm_key || "";
    }
    $("edit-profile-modal").classList.remove("hidden");
  }

  $("close-profile-modal").onclick = () => $("edit-profile-modal").classList.add("hidden");

  $("save-profile-btn").onclick = async () => {
    const displayName = $("edit-display-name").value.trim();
    const avatarUrl = $("edit-avatar-url").value.trim();
    const bio = $("edit-bio").value.trim();

    $("save-profile-btn").disabled = true;
    try {
      const { error } = await sb.from("profiles")
        .update({ display_name: displayName, avatar_url: avatarUrl, bio: bio })
        .eq("id", currentUser.id);

      if (error) throw error;

      if (isLastfmOwner(currentProfile)) {
        const { error: lfErr } = await sb.from("profiles")
          .update({
            lastfm_user: $("edit-lastfm-user").value.trim() || null,
            lastfm_key: $("edit-lastfm-key").value.trim() || null
          })
          .eq("id", currentUser.id);
        if (lfErr) {
          alert("Profile saved, but Last.fm settings failed: " + lfErr.message +
            "\n\nRun this once in the Supabase SQL editor:\nalter table profiles add column if not exists lastfm_user text, add column if not exists lastfm_key text;");
        }
        nowPlayingCache.clear();
      }

      $("edit-profile-modal").classList.add("hidden");
      await loadProfile();
      await loadMessages();
    } catch (e) {
      alert("Failed to save profile: " + e.message);
    } finally {
      $("save-profile-btn").disabled = false;
    }
  };

  async function loadProfile() {
    const { data, error } = await sb.from("profiles")
      .select("*").eq("id", currentUser.id).single();
    if (error) throw error;
    currentProfile = data;

    if (currentProfile.banned) {
      await sb.auth.signOut();
      throw new Error("This account has been banned from the portal.");
    }

    const displayName = currentProfile.display_name || currentProfile.username;
    const avatar = currentProfile.avatar_url || "group-logo.png";
    const isAdmin = currentProfile.role === "admin";

    $("who").textContent = displayName;
    $("subwho").textContent = "@" + currentProfile.username;
    $("sidebar-avatar").src = avatar;
    $("mobile-profile-toggle").src = avatar;

    $("admin-btn").classList.toggle("hidden", !isAdmin);
  }

  async function enterApp() {
    try {
      await loadProfile();
      authScreen.classList.add("hidden");
      app.classList.remove("hidden");
      initNotificationSettings();
      updateMyStatusUI();
      startPresence();
      await loadMessages();
      initialMessagesLoaded = true;
      subscribeRealtime();
    } catch (e) {
      authScreen.classList.remove("hidden");
      app.classList.add("hidden");
      showStatus(e.message || "Could not load your account.");
    }
  }

  async function loadMessages() {
    if (!initialMessagesLoaded) {
      messagesEl.innerHTML = '<div class="empty">Loading messages…</div>';
    }
    const { data, error } = await sb.from("messages")
      .select(`
        id, user_id, content, created_at, deleted, reply_to,
        profiles:user_id(id, username, display_name, avatar_url, bio, role)
      `)
      .order("created_at", { ascending: true });

    if (error) {
      messagesEl.innerHTML = '<div class="empty">Could not load messages.</div>';
      console.error(error);
      return;
    }

    if (!data.length) {
      messagesEl.innerHTML = '<div class="empty">No messages yet. Start the conversation.</div>';
      return;
    }

    renderMessages(data);
  }

  function renderMessages(rows) {
    messagesEl.innerHTML = "";
    const byId = new Map(rows.map(r => [r.id, r]));

    rows.forEach(row => {
      const article = document.createElement("article");
      article.className = "msg" + (row.user_id === currentUser.id ? " mine" : "") + (row.deleted ? " deleted" : "");

      const profile = row.profiles || {};
      const username = profile.username || "Unknown";
      const displayName = profile.display_name || username;
      const avatar = profile.avatar_url || "group-logo.png";
      const isAdmin = profile.role === "admin";
      const reply = row.reply_to ? byId.get(row.reply_to) : null;

      let replyHTML = "";
      if (reply) {
        const replyProfile = reply.profiles || {};
        const replyName = replyProfile.display_name || replyProfile.username || "Unknown";
        replyHTML = `<div class="reply-line">Replying to <strong>${escapeHTML(replyName)}</strong>: ${reply.deleted ? "deleted message" : escapeHTML(reply.content.slice(0,120))}</div>`;
      }

      article.innerHTML = `
        <span class="avatar-wrap" data-uid="${escapeHTML(String(row.user_id))}"><img class="msg-avatar" src="${escapeHTML(avatar)}" alt=""><img class="status-badge" src="${STATUS_META[statusOf(row.user_id)].icon}" alt=""></span>
        <div class="msg-content-wrap">
          <div class="msg-head">
            <span class="user-clickable">${escapeHTML(displayName)}</span>
            <span style="font-size:10px;color:#6b7887">(@${escapeHTML(username)})</span>
            ${isAdmin ? '<span class="role-badge admin" style="font-size:8px">Admin</span>' : ''}
            <span class="time">${formatTime(row.created_at)}</span>
          </div>
          ${replyHTML}
          <div class="body">${row.deleted ? '<span class="deleted-text">This message is deleted</span>' : formatText(row.content)}</div>
          <div class="msg-tools">
            ${!row.deleted ? '<button class="tiny reply-btn">Reply</button>' : ''}
            ${!row.deleted && row.user_id === currentUser.id ? '<button class="tiny delete-msg-btn">Delete</button>' : ''}
            ${!row.deleted && currentProfile?.role === "admin" ? '<button class="tiny delete-admin-btn">Remove</button>' : ''}
          </div>
        </div>
      `;

      const usernameEl = article.querySelector(".user-clickable");
      const avatarEl = article.querySelector(".msg-avatar");
      if (usernameEl) attachChatUserEvents(usernameEl, profile);
      if (avatarEl) attachChatUserEvents(avatarEl, profile);

      const replyBtn = article.querySelector(".reply-btn");
      if (replyBtn) replyBtn.onclick = () => startReply(row, username);

      const del = article.querySelector(".delete-msg-btn");
      if (del) del.onclick = () => softDeleteMessage(row.id);

      const adminDel = article.querySelector(".delete-admin-btn");
      if (adminDel) adminDel.onclick = () => adminDeleteMessage(row.id);

      messagesEl.appendChild(article);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function startReply(row, username) {
    replyTo = row;
    $("reply-banner").classList.remove("hidden");
    $("reply-label").textContent = "Replying to @" + username;
    input.value = `@${username} ` + input.value;
    input.focus();
  }

  $("cancel-reply").onclick = () => {
    replyTo = null;
    $("reply-banner").classList.add("hidden");
  };

  async function sendMessage() {
    const content = input.value.trim();
    if (!content || !currentUser) return;

    $("send-btn").disabled = true;
    try {
      const { error } = await sb.from("messages").insert({
        user_id: currentUser.id,
        content,
        reply_to: replyTo?.id || null
      });
      if (error) throw error;
      input.value = "";
      replyTo = null;
      $("reply-banner").classList.add("hidden");
    } catch (e) {
      alert(e.message || "Message could not be sent.");
    } finally {
      $("send-btn").disabled = false;
    }
  }

  async function softDeleteMessage(id) {
    if (!confirm("Delete this message?")) return;
    const { error } = await sb.from("messages")
      .update({ deleted: true, content: "[deleted]" })
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) alert(error.message);
  }

  async function adminDeleteMessage(id) {
    if (!confirm("Remove this message as an administrator?")) return;
    const { error } = await sb.from("messages")
      .update({ deleted: true, content: "[removed by administrator]" })
      .eq("id", id);
    if (error) alert(error.message);
  }

  function subscribeRealtime() {
    if (realtimeChannel) sb.removeChannel(realtimeChannel);

    realtimeChannel = sb.channel("apbn-message-feed")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages"
      }, async (payload) => {
        const newMsg = payload.new;
        if (newMsg && newMsg.user_id !== currentUser?.id && !newMsg.deleted) {
          try {
            const { data: sender } = await sb.from("profiles")
              .select("display_name, username")
              .eq("id", newMsg.user_id)
              .maybeSingle();

            const senderName = sender ? (sender.display_name || sender.username) : "Squad Member";
            triggerBrowserNotification(senderName, newMsg.content);
          } catch (err) {
            triggerBrowserNotification("Squad Member", newMsg.content);
          }
        }
        await loadMessages();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages"
      }, () => loadMessages())
      .subscribe();
  }

  async function logout() {
    if (realtimeChannel) {
      await sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    stopPresence();
    $("settings-modal").classList.add("hidden");
    await sb.auth.signOut();
  }

  async function deleteAccount() {
    if (!confirm("Are you sure you want to permanently delete your account and all associated data? This action cannot be undone.")) {
      return;
    }
    try {
      const { error } = await sb.from("profiles").delete().eq("id", currentUser.id);
      if (error) throw error;
      await logout();
    } catch (e) {
      alert("Could not delete account: " + e.message);
    }
  }

  async function openAdmin() {
    $("admin-modal").classList.remove("hidden");
    await loadAdminUsers();
  }

  async function loadAdminUsers() {
    const list = $("admin-list");
    list.textContent = "Loading…";
    const { data, error } = await sb.from("profiles")
      .select("id,username,display_name,role,banned,ban_reason,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      list.textContent = error.message;
      return;
    }

    list.innerHTML = "";
    data.forEach(p => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const name = p.display_name || p.username;
      row.innerHTML = `
        <div>
          <strong>${escapeHTML(name)}</strong> <small>(@${escapeHTML(p.username)})</small>
          <span class="role-badge ${p.role === "admin" ? "admin" : "member"}">${p.role}</span>
          ${p.banned ? '<span class="role-badge" style="background:#ffcdd2;color:#b71c1c">BANNED</span>' : ''}
        </div>
        <button class="tiny ban-toggle">${p.banned ? "Unban" : "Ban"}</button>
      `;

      row.querySelector(".ban-toggle").onclick = async () => {
        if (p.id === currentUser.id) {
          alert("Do not ban your own admin account.");
          return;
        }
        let reason = "";
        if (!p.banned) {
          reason = prompt("Ban reason (optional):", "Violation of APBn portal rules") || "";
        }
        const { error } = await sb.from("profiles")
          .update({ banned: !p.banned, ban_reason: reason })
          .eq("id", p.id);

        if (error) alert(error.message);
        else await loadAdminUsers();
      };

      list.appendChild(row);
    });
  }

  $("close-admin").onclick = () => $("admin-modal").classList.add("hidden");
  $("admin-btn").onclick = openAdmin;

  $("settings-toolbar").onclick = () => $("settings-modal").classList.remove("hidden");
  $("close-settings-btn").onclick = () => $("settings-modal").classList.add("hidden");
  $("settings-logout-btn").onclick = logout;
  $("delete-account-btn").onclick = deleteAccount;

  $("signup-btn").onclick = createAccount;
  $("login-btn").onclick = login;
  $("send-btn").onclick = sendMessage;

  input.addEventListener("keydown", (e) => {
    // Only send on Enter without Shift if NOT on a mobile screen/device
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      sendMessage();
    }
  });

  sb.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    if (currentUser) {
      await enterApp();
    } else {
      authScreen.classList.remove("hidden");
      app.classList.add("hidden");
    }
  });
})();