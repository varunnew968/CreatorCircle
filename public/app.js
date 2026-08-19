const state = {
  memberId: localStorage.getItem("creatorCircleMemberId"),
  member: null,
  settings: {
    channelName: "Everyday Stories",
    channelHandle: "@EverydayStories",
    channelUrl: "https://www.youtube.com/@everydaystories968",
    channelAvatar: ""
  }
};

const $ = (selector) => document.querySelector(selector);

const views = {
  welcome: $("#welcomeView"),
  subscribe: $("#subscribeView"),
  join: $("#joinView"),
  success: $("#successView"),
  community: $("#communityView")
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function timeAgo(dateValue) {
  const diff = Math.max(0, Date.now() - new Date(dateValue).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

function detectType(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return "invalid";
    if (host === "youtu.be") return "video";
    if (u.pathname.startsWith("/shorts/")) return "short";
    if (u.pathname.startsWith("/watch") && u.searchParams.get("v")) return "video";
    if (u.pathname.startsWith("/@") || u.pathname.startsWith("/channel/") || u.pathname.startsWith("/c/") || u.pathname.startsWith("/user/")) return "channel";
    return "invalid";
  } catch {
    return "invalid";
  }
}

function getVideoId(url, type) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (type === "video") return host === "youtu.be" ? u.pathname.slice(1).split("/")[0] : u.searchParams.get("v");
    if (type === "short") return u.pathname.split("/")[2] || "";
  } catch { }
  return "";
}

function localThumbnail(url, type) {
  const id = getVideoId(url, type);
  return (type === "video" || type === "short") && id
    ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
    : "";
}

async function loadSettings() {
  try {
    const data = await api("/settings");
    if (data.settings) state.settings = data.settings;
  } catch {
    // Simple app fallback.
  }

  $("#channelName").textContent = state.settings.channelName || "Everyday Stories";
  $("#channelHandle").textContent = state.settings.channelHandle || "@EverydayStories";
  const letters = initials(state.settings.channelName || "Everyday Stories");
  $("#channelAvatar").textContent = letters || "ES";
}

async function loadCount() {
  try {
    const data = await api("/members/count");
    $("#welcomeCount").textContent = data.count.toLocaleString();
    $("#communityCount").textContent = data.count.toLocaleString();
    return data.count;
  } catch {
    $("#welcomeCount").textContent = "—";
    $("#communityCount").textContent = "—";
    return 0;
  }
}

async function loadCurrentMember() {
  if (!state.memberId) return false;
  try {
    const data = await api(`/members/${state.memberId}`);
    state.member = data.member;
    return true;
  } catch {
    localStorage.removeItem("creatorCircleMemberId");
    state.memberId = null;
    state.member = null;
    return false;
  }
}

function renderAvatarStack(shares) {
  const names = [...new Set(shares.map(s => s.member?.name).filter(Boolean))].slice(0, 4);
  $("#avatarStack").innerHTML = names.map(name =>
    `<div class="stack-avatar">${escapeHtml(initials(name))}</div>`
  ).join("");
}

async function loadFeed() {
  const feed = $("#feed");
  feed.innerHTML = `
    <div class="share-card">
      <div class="thumb-wrap"><div class="thumb-placeholder">Loading community shares…</div></div>
      <div class="share-body"><div class="share-title">Loading latest shares</div></div>
    </div>`;

  try {
    const data = await api("/shares");
    const shares = data.shares || [];
    renderAvatarStack(shares);

    if (!shares.length) {
      feed.innerHTML = `
        <div class="share-card">
          <div class="share-body">
            <div class="share-title">Nothing shared yet.</div>
            <div class="share-meta">Be the first to share something with the community.</div>
          </div>
        </div>`;
      return;
    }

    feed.innerHTML = shares.map(share => {
      const name = share.member?.name || "Community Member";
      const isOwner = share.member?._id === state.memberId;
      const thumb = share.thumbnail || localThumbnail(share.url, share.type);
      const label = share.type === "short" ? "YouTube Short" : share.type === "channel" ? "YouTube Channel" : "YouTube Video";
      return `
        <article class="share-card" id="share-${share._id}">
          <div class="thumb-wrap">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">` : ""}
            <div class="thumb-placeholder" style="${thumb ? "display:none" : ""}">YouTube</div>
            <span class="type-badge">${label}</span>
          </div>
          <div class="share-body">
            <div class="share-meta" style="display:flex; justify-content:space-between; width:100%;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="person-dot">${escapeHtml(initials(name))}</span>
                <span>${escapeHtml(name)} • ${timeAgo(share.createdAt)}</span>
              </div>
              ${isOwner ? `<button class="delete-btn" data-action="delete" data-id="${share._id}" title="Delete share">🗑</button>` : ""}
            </div>
            <div class="share-title">${escapeHtml(share.title || label)}</div>
            <div class="share-actions">
              <button class="small-btn primary" data-action="watch" data-url="${escapeHtml(share.url)}">Watch</button>
              <button class="small-btn" data-action="subscribe" data-url="${escapeHtml(share.url)}">Subscribe</button>
              <button class="small-btn" data-action="copy" data-url="${escapeHtml(share.url)}">Copy</button>
            </div>
          </div>
        </article>`;
    }).join("");
  } catch (err) {
    feed.innerHTML = `
      <div class="share-card">
        <div class="share-body">
          <div class="share-title">Couldn't load shares.</div>
          <div class="share-meta">${escapeHtml(err.message)}</div>
        </div>
      </div>`;
  }
}

async function enterCommunity() {
  if (!(await loadCurrentMember())) {
    showView("welcome");
    await loadCount();
    return;
  }
  showView("community");
  $("#welcomeName").textContent = `Welcome back, ${state.member.name} 👋`;
  await Promise.all([loadCount(), loadFeed()]);
}

function setBusy(button, busy, text) {
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>${text}</span>`;
    button.style.opacity = ".7";
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.original || button.innerHTML;
    button.style.opacity = "";
  }
}

$("#joinBtn").addEventListener("click", () => showView("subscribe"));
$("#backToWelcome").addEventListener("click", () => showView("welcome"));
$("#backToSubscribe").addEventListener("click", () => showView("subscribe"));

$("#youtubeBtn").addEventListener("click", () => {
  const url = state.settings.channelUrl || "https://www.youtube.com/";
  window.open(url, "_blank", "noopener,noreferrer");
});

$("#subscribedBtn").addEventListener("click", () => {
  const btn = $("#subscribedBtn");
  setBusy(btn, true, "Checking…");
  setTimeout(() => {
    setBusy(btn, false);
    toast("Subscription confirmed ✓");
    showView("join");
    setTimeout(() => $("#nameInput").focus(), 200);
  }, 850);
});

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = $("#joinSubmitBtn");
  const name = $("#nameInput").value.trim();

  if (!name) {
    toast("Please enter your name.");
    $("#nameInput").focus();
    return;
  }

  try {
    setBusy(btn, true, "Joining…");
    const data = await api("/members", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    state.memberId = data.member._id;
    state.member = data.member;
    localStorage.setItem("creatorCircleMemberId", state.memberId);

    $("#memberNumber").textContent = `#${data.memberCount.toLocaleString()}`;
    $("#nameInput").value = "";
    showView("success");
  } catch (err) {
    toast(err.message);
  } finally {
    setBusy(btn, false);
  }
});

$("#enterCommunityBtn").addEventListener("click", enterCommunity);
$("#refreshBtn").addEventListener("click", async () => {
  await Promise.all([loadCount(), loadFeed()]);
  toast("Community refreshed ✓");
});
$("#refreshFeedBtn").addEventListener("click", loadFeed);

function openShareSheet() {
  $("#shareSheet").classList.remove("hidden");
  setTimeout(() => $("#urlInput").focus(), 150);
}
function closeShareSheet() {
  $("#shareSheet").classList.add("hidden");
  $("#urlInput").value = "";
  $("#preview").classList.add("hidden");
  $("#preview").innerHTML = "";
  $("#shareHint").textContent = "You can share up to 5 links per day.";
}
$("#openShareBtn").addEventListener("click", openShareSheet);
$("#navShare").addEventListener("click", openShareSheet);
$("#closeShareBtn").addEventListener("click", closeShareSheet);
$("#shareSheet").addEventListener("click", e => {
  if (e.target === $("#shareSheet")) closeShareSheet();
});

$("#urlInput").addEventListener("input", () => {
  const url = $("#urlInput").value.trim();
  const type = detectType(url);
  const preview = $("#preview");

  if (!url) {
    preview.classList.add("hidden");
    return;
  }

  if (type === "invalid") {
    preview.classList.remove("hidden");
    preview.innerHTML = `<div><strong>Invalid YouTube link</strong><small>Please paste a YouTube video, Short, or channel URL.</small></div>`;
    return;
  }

  const label = type === "short" ? "YouTube Short" : type === "channel" ? "YouTube Channel" : "YouTube Video";
  const thumb = localThumbnail(url, type);
  preview.classList.remove("hidden");
  preview.innerHTML = `
    ${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : ""}
    <div><strong>${label}</strong><small>${escapeHtml(url)}</small></div>`;
});

$("#postShareBtn").addEventListener("click", async () => {
  if (!state.memberId) {
    closeShareSheet();
    showView("welcome");
    return;
  }

  const url = $("#urlInput").value.trim();
  const type = detectType(url);

  if (type === "invalid") {
    toast("Please enter a valid YouTube link.");
    return;
  }

  const btn = $("#postShareBtn");

  try {
    setBusy(btn, true, "Sharing…");
    await api("/shares", {
      method: "POST",
      body: JSON.stringify({ memberId: state.memberId, url })
    });

    closeShareSheet();
    toast("Shared with the community ✓");
    await loadFeed();
  } catch (err) {
    toast(err.message);
  } finally {
    setBusy(btn, false);
  }
});

$("#feed").addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const url = button.dataset.url;
  const action = button.dataset.action;

  if (action === "watch" || action === "subscribe") {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied ✓");
    } catch {
      toast("Copy failed. Please copy the link manually.");
    }
  }

  if (action === "delete") {
    openDeleteSheet(button.dataset.id);
  }
});

let shareToDelete = null;

function openDeleteSheet(id) {
  shareToDelete = id;
  $("#deleteSheet").classList.remove("hidden");
}

function closeDeleteSheet() {
  shareToDelete = null;
  $("#deleteSheet").classList.add("hidden");
}

$("#cancelDeleteBtn").addEventListener("click", closeDeleteSheet);
$("#deleteSheet").addEventListener("click", e => {
  if (e.target === $("#deleteSheet")) closeDeleteSheet();
});

$("#confirmDeleteBtn").addEventListener("click", async () => {
  if (!shareToDelete || !state.memberId) return;
  const btn = $("#confirmDeleteBtn");
  
  try {
    setBusy(btn, true, "Deleting…");
    await api(`/shares/${shareToDelete}`, {
      method: "DELETE",
      body: JSON.stringify({ memberId: state.memberId })
    });
    
    closeDeleteSheet();
    toast("Share deleted ✓");
    const el = $(`#share-${shareToDelete}`);
    if (el) el.remove();
  } catch (err) {
    toast(err.message);
  } finally {
    setBusy(btn, false);
  }
});

async function boot() {
  await loadSettings();
  const hasMember = await loadCurrentMember();

  if (hasMember) {
    await enterCommunity();
  } else {
    showView("welcome");
    await loadCount();
  }
}

boot();
