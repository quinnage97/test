export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function layout({ title, tab, body }) {
  const nav = [
    ["/", "Today"],
    ["/connect", "New people"],
    ["/posts", "Post ideas"],
    ["/people", "Everyone"],
  ].map(([href, label]) =>
    `<a href="${href}" class="${tab === href ? "on" : ""}">${label}</a>`).join("");

  return `<!doctype html><html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/app.css">
</head><body>
<header class="bar"><div class="wrap"><h1>Follow-up</h1><nav>${nav}</nav></div></header>
<main class="wrap">${body}</main>
<div class="toast" id="toast"></div>
<script>
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
// Copy the message, open their profile, and tell the server it went out.
async function send(btn, id, url) {
  const card = btn.closest('.card');
  const text = card.querySelector('textarea.msg').value;
  try { await navigator.clipboard.writeText(text); }
  catch (e) { card.querySelector('textarea.msg').select(); document.execCommand('copy'); }
  await fetch('/action/sent', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ id, body: text })
  });
  if (url) window.open(url, '_blank', 'noopener');
  card.style.opacity = .35;
  btn.disabled = true;
  toast('Copied. Paste it into the message box.');
}
async function act(btn, path, payload) {
  await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify(payload) });
  const card = btn.closest('.card');
  card.style.transition = 'opacity .2s'; card.style.opacity = 0;
  setTimeout(() => card.remove(), 200);
  toast('Done.');
}
</script>
</body></html>`;
}

function cardFor(item) {
  const c = item.contact;
  const flags = item.flags?.length
    ? `<div class="flag"><b>Read this before you send it</b>${
        item.flags.map((f) => `&ldquo;${esc(f.phrase)}&rdquo; &mdash; ${esc(f.why)}`).join("<br>")
      }</div>`
    : "";

  return `<div class="card ${item.warm ? "warm" : ""}">
  <p class="who">${esc(c.name)}</p>
  ${c.headline ? `<p class="role">${esc(c.headline)}${c.company ? ` &middot; ${esc(c.company)}` : ""}</p>` : ""}
  <div class="why">${esc(item.reason)}</div>
  <textarea class="msg">${esc(item.body)}</textarea>
  ${flags}
  <div class="actions">
    <button class="go" onclick="send(this, 'msg:${item.messageId}', ${c.linkedin_url ? `'${esc(c.linkedin_url)}'` : "null"})">
      Copy &amp; open LinkedIn
    </button>
    <button onclick="act(this,'/action/replied',{contactId:${c.id}})">They replied</button>
    <button class="quiet" onclick="act(this,'/action/snooze',{contactId:${c.id},days:21})">Not now</button>
    <button class="quiet" onclick="act(this,'/action/stop',{contactId:${c.id}})">Take off list</button>
  </div>
</div>`;
}

export function todayPage({ warm, cold, coldHeld }) {
  const count = warm.length + cold.length;
  if (count === 0) {
    return layout({ title: "Nothing to do", tab: "/", body: `
      <div class="empty"><div class="tick">&#10003;</div>
      <h3>You're all caught up</h3>
      <p>Nobody needs chasing today. Come back tomorrow.</p></div>` });
  }

  const body = `
    <h2 class="day">${count} ${count === 1 ? "person" : "people"} to message today</h2>
    <p class="sub">Read it, change anything you like, then press the green button.</p>
    ${warm.length ? `<p class="note"><strong>These ones matter most</strong> &mdash; they replied to you, or something has come up in their file.</p>` : ""}
    ${warm.map(cardFor).join("")}
    ${cold.length && warm.length ? `<p class="note"><strong>And these, if you have time.</strong></p>` : ""}
    ${cold.map(cardFor).join("")}
    ${coldHeld ? `<p class="note">${coldHeld} more are waiting. They'll come up over the next few days &mdash; there's no rush and nothing gets lost.</p>` : ""}`;

  return layout({ title: `${count} to do today`, tab: "/", body });
}

export function connectPage({ queue, sentToday, perDay }) {
  if (!queue.length) {
    return layout({ title: "New people", tab: "/connect", body: `
      <div class="empty"><div class="tick">&#10003;</div>
      <h3>${sentToday ? "That's today's invitations done" : "No one in the queue"}</h3>
      <p>${sentToday
          ? `You've sent ${sentToday} today. Stopping around ${perDay} a day is what keeps the account safe.`
          : `Add people you'd like to connect with, and their invitation note gets written for you.`}</p>
      <p style="margin-top:20px"><a class="btn" href="/people/new?stage=prospect">Add someone</a></p>
      </div>` });
  }

  const cards = queue.map((c) => `
    <div class="card">
      <p class="who">${esc(c.name)}</p>
      ${c.headline ? `<p class="role">${esc(c.headline)}${c.company ? ` &middot; ${esc(c.company)}` : ""}</p>` : ""}
      <div class="why">Send a connection request with a note &mdash; notes roughly double the accept rate</div>
      <textarea class="msg">${esc(c.invite || "")}</textarea>
      <div class="actions">
        <button class="go" onclick="send(this, 'inv:${c.messageId}', ${c.linkedin_url ? `'${esc(c.linkedin_url)}'` : "null"})">
          Copy &amp; open their profile
        </button>
        <button class="quiet" onclick="act(this,'/action/stop',{contactId:${c.id}})">Skip them</button>
      </div>
    </div>`).join("");

  return layout({ title: "New people", tab: "/connect", body: `
    <h2 class="day">${queue.length} to invite today</h2>
    <p class="sub">On their profile, press <strong>Connect</strong>, then <strong>Add a note</strong>, then paste.
       LinkedIn caps invitations at roughly ${perDay * 7} a week &mdash; this paces you under that.</p>
    ${cards}` });
}

export function postsPage({ posts }) {
  const body = posts.length
    ? posts.map((p) => `
      <div class="card">
        <div class="why">${esc(p.angle)}</div>
        <textarea class="msg" style="min-height:230px">${esc(p.body)}</textarea>
        <div class="actions">
          <button class="go" onclick="send(this, 'post:${p.messageId}', 'https://www.linkedin.com/feed/')">
            Copy &amp; open LinkedIn
          </button>
        </div>
      </div>`).join("")
    : `<div class="empty"><h3>No drafts yet</h3><p>Press the button below and three will be written for you.</p></div>`;

  return layout({ title: "Post ideas", tab: "/posts", body: `
    <h2 class="day">Something to post this week</h2>
    <p class="sub">One post reaches more people than a hundred messages, and nobody can be
       annoyed by it. Two a week is plenty.</p>
    <form method="POST" action="/posts/new" style="margin-bottom:22px">
      <button class="go" type="submit">Write me three new ones</button>
    </form>
    ${body}` });
}
