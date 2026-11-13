(() => {
  const { sb, esc, money, num, today, fmtDate, fmtTime, calcHours, toast, sheet, friendlyError } = DD;
  const app = document.getElementById("app");
  // Same code runs the owner admin and the manager page.
  const MODE = window.DD_MODE === "manager" ? "manager" : "admin";
  const isStaff = (p) => p.role === "admin" || p.role === "manager" || p.role === "crew";
  const CATS = ["Meat","Buns","Toppings","Sauces","Sides","Seasonings","Drinks","Cooking","Serving","Cleaning","Event","Other"];

  const S = { me: null, tab: MODE === "manager" ? "mine" : "inv", items: [], shifts: [], people: [], events: [], assigns: [], expenses: [], cat: "All", q: "", evView: "up", exRange: "month" };

  const icons = {
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
    events: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    inv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
    buy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
    mine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    hours: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.7c2 .7 3.2 2.5 3.6 5.3"/></svg>'
  };

  const needsBuying = (i) => i.on_list || (Number(i.low_at) > 0 && Number(i.qty) <= Number(i.low_at));
  const isLow = (i) => Number(i.low_at) > 0 && Number(i.qty) <= Number(i.low_at);
  const personName = (id) => (S.people.find((p) => p.id === id) || {}).name || "Unknown";
  const crewLink = () => new URL("/crew/", location.href).href;

  // ---------- start ----------
  async function start() {
    if (!DD.ready) return DD.notConnected(app);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      return DD.authScreen(app, MODE === "manager"
        ? { title: "Manager", note: "Manager sign in.", onDone: start }
        : { title: "Admin", note: "Owner sign in. Workers use the crew page.", onDone: start });
    }
    try { S.me = await DD.loadMe(); } catch (e) { return toast(friendlyError(e)); }
    // Send people to the page that matches their access
    if (S.me && MODE === "admin" && S.me.role === "manager") return location.replace("/manager/");
    if (S.me && MODE === "manager" && S.me.role === "admin") return location.replace("/admin/");
    if (!S.me || S.me.role !== MODE) {
      app.innerHTML = `<div class="center-box"><div class="brand" style="font-size:22px">Didi's Dogs</div>
        <p class="sub" style="margin-top:12px">${MODE === "manager" ? "This page is for managers only." : "This page is for the owner only."} Workers log hours on the crew page.</p>
        <a class="btn full" href="/crew/">Go to crew page</a>
        <div style="height:8px"></div><button class="btn light full" id="out">Sign out</button></div>`;
      app.querySelector("#out").onclick = signOut;
      return;
    }
    await loadAll();
    render();
  }

  async function signOut() { await sb.auth.signOut(); S.me = null; start(); }

  async function loadAll() {
    const [a, b, c, d, e, x] = await Promise.all([
      sb.from("inventory_items").select("*").order("category").order("name"),
      sb.from("shifts").select("*").order("work_date", { ascending: false }).order("start_time", { ascending: false }),
      sb.from("profiles").select("*").order("name"),
      sb.from("events").select("*").order("event_date").order("start_time"),
      sb.from("event_workers").select("*"),
      MODE === "manager" ? Promise.resolve({ data: [], error: null }) : sb.from("expenses").select("*").order("id", { ascending: false })
    ]);
    const err = a.error || b.error || c.error || d.error || e.error || x.error;
    if (err) toast(friendlyError(err));
    S.items = a.data || []; S.shifts = b.data || []; S.people = c.data || [];
    S.events = d.data || []; S.assigns = e.data || []; S.expenses = x.data || [];
  }

  // ---------- shell ----------
  function render() {
    const buyCount = S.items.filter(needsBuying).length;
    const pendCount = S.people.filter((p) => p.role === "pending").length
      + S.people.filter((p) => isStaff(p) && S.shifts.some((x) => x.worker_id === p.id && !x.paid && x.end_time)).length;
    const todayEvents = S.events.filter((e) => e.event_date === today()).length;
    const tabs = MODE === "manager"
      ? [["mine","My Hours"],["inv","Inventory"],["buy","Buy Soon"]].concat(S.me.can_see_events ? [["events","Events"]] : [])
      : [["inv","Inventory"],["buy","Buy Soon"],["events","Events"],["team","Workers"],["money","Expenses"]];
    app.innerHTML = `
      <header class="top"><div class="wrap">
        <div class="brand">Didi's Dogs<small>${MODE === "manager" ? "Manager · " + esc(S.me.name) : "Admin"}</small></div>
        <button class="link" id="out">Sign out</button>
      </div></header>
      <main class="wrap" id="view"></main>
      <nav class="tabs"><div class="wrap">
        ${tabs.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${icons[k]}${l}
          ${k === "buy" && buyCount ? `<span class="dot">${buyCount}</span>` : ""}
          ${k === "team" && pendCount ? `<span class="dot">${pendCount}</span>` : ""}
          ${k === "events" && todayEvents ? `<span class="dot">${todayEvents}</span>` : ""}</button>`).join("")}
      </div></nav>`;
    app.querySelector("#out").onclick = signOut;
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
    clearInterval(mineTimer);
    if (!tabs.some(([k]) => k === S.tab)) S.tab = tabs[0][0];
    ({ mine: viewMine, inv: viewInventory, buy: viewBuy, events: viewEvents, team: viewTeam, money: viewExpenses })[S.tab]();
  }
  const view = () => document.getElementById("view");

  // ---------- my hours (manager page) ----------
  let mineTimer = null;
  function viewMine() {
    const mine = S.shifts.filter((s) => s.worker_id === S.me.id);
    const open = mine.find((s) => !s.end_time);
    const done = mine.filter((s) => s.end_time && !s.paid);
    const hrs = done.reduce((a, s) => a + Number(s.hours), 0);
    const owed = done.reduce((a, s) => a + Number(s.hours) * Number(s.rate), 0);
    const todays = S.events.filter((e) => e.event_date === today());
    const mins = open ? DD.minutesSince(open.work_date, open.start_time) : 0;
    view().innerHTML = `
      <h1>My Hours</h1>
      <p class="sub">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      ${open ? `<div class="card clock on">
          <div class="row"><span class="status green pulse"></span><div class="name grow">On the clock</div></div>
          <div class="big" id="elapsed" style="margin-top:6px">${DD.fmtDuration(mins)}</div>
          <div class="muted">Since ${fmtTime(open.start_time)}${open.work_date !== today() ? " on " + fmtDate(open.work_date) : ""}${open.note ? " · " + esc(open.note) : ""}</div>
          <button class="btn full big-btn" id="clockOut" style="margin-top:16px;background:var(--red);border-color:var(--red)">Clock out</button>
        </div>`
      : `<div class="card clock">
          <div class="name">Ready to work?</div>
          <div class="muted small" style="margin-bottom:12px">Tap when you start. Tap again when you finish.</div>
          ${todays.length ? `<label style="margin-top:0">Event</label>
            <select id="ev">${todays.map((e) => `<option value="${e.id}">${esc(e.title)}</option>`).join("")}<option value="">Other / no event</option></select>`
            : `<label style="margin-top:0">Event / note (optional)</label><input id="cn" placeholder="e.g. Cohen wedding">`}
          <button class="btn full big-btn" id="clockIn" style="margin-top:14px">Clock in</button>
        </div>`}
      <h2>Not paid yet</h2>
      <div class="card"><div class="big">${num(hrs)} hrs</div>${owed > 0 ? `<div class="muted">${money(owed)}</div>` : ""}</div>
      <h2>My shifts</h2>
      ${mine.length ? `<div class="list">${mine.map((s) => `
        <button class="item tap" style="width:100%" data-myshift="${s.id}" ${s.paid ? "disabled" : ""}>
          <div class="grow"><div class="name">${fmtDate(s.work_date)}</div>
            <div class="meta">${fmtTime(s.start_time)}–${s.end_time ? fmtTime(s.end_time) : "now"}${s.note ? " · " + esc(s.note) : ""}</div></div>
          <div style="text-align:right">${!s.end_time ? `<span class="tag paid">On the clock</span>` : `<div class="name">${num(s.hours)} h</div>
            ${s.paid ? `<span class="tag paid">Paid</span>` : `<span class="muted small">Tap to fix</span>`}`}</div>
        </button>`).join("")}</div>` : `<div class="empty">No shifts yet.</div>`}
      <details class="manual">
        <summary>Forgot to clock in? Add hours by hand</summary>
        <div class="card" style="margin-top:10px">
          <label style="margin-top:0">Date</label><input id="md" type="date" value="${today()}">
          <div class="row"><div class="grow"><label>Start</label><input id="ms" type="time"></div>
            <div class="grow"><label>End</label><input id="me" type="time"></div></div>
          <label>Event / note (optional)</label><input id="mn">
          <div style="height:16px"></div><button class="btn full" id="msave">Save hours</button>
        </div>
      </details>`;
    const add = (row) => sb.from("shifts").insert(row).select().single();
    const resort = () => S.shifts.sort((a, b) => b.work_date.localeCompare(a.work_date) || b.start_time.localeCompare(a.start_time));
    if (open) {
      mineTimer = setInterval(() => { const el = document.getElementById("elapsed"); if (el) el.textContent = DD.fmtDuration(DD.minutesSince(open.work_date, open.start_time)); }, 20000);
      view().querySelector("#clockOut").onclick = async (ev) => {
        ev.target.disabled = true;
        const { data, error } = await sb.from("shifts").update({ end_time: DD.nowTime() }).eq("id", open.id).select().single();
        if (error) { ev.target.disabled = false; return toast(friendlyError(error)); }
        Object.assign(open, data); render(); toast(`Clocked out · ${num(data.hours)} hours`);
      };
    } else {
      view().querySelector("#clockIn").onclick = async (ev) => {
        ev.target.disabled = true;
        const row = { work_date: today(), start_time: DD.nowTime() };
        const sel = view().querySelector("#ev");
        if (sel) { const e = S.events.find((x) => String(x.id) === sel.value); if (e) { row.event_id = e.id; row.note = e.title; } }
        else row.note = (view().querySelector("#cn").value || "").trim() || null;
        const { data, error } = await add(row);
        if (error) { ev.target.disabled = false; return toast(/one_open/.test(error.message || "") ? "You're already clocked in." : friendlyError(error)); }
        S.shifts.unshift(data); resort(); render(); toast(`Clocked in at ${fmtTime(data.start_time)}`);
      };
    }
    view().querySelector("#msave").onclick = async (ev) => {
      const row = { work_date: view().querySelector("#md").value, start_time: view().querySelector("#ms").value,
        end_time: view().querySelector("#me").value, note: view().querySelector("#mn").value.trim() || null };
      if (!row.work_date || !row.start_time || !row.end_time) return toast("Add the date, start and end.");
      if (row.start_time === row.end_time) return toast("Start and end can't be the same.");
      ev.target.disabled = true;
      const { data, error } = await add(row);
      if (error) { ev.target.disabled = false; return toast(friendlyError(error)); }
      S.shifts.unshift(data); resort(); render(); toast(`Saved ${num(data.hours)} hours`);
    };
    view().querySelectorAll("[data-myshift]").forEach((b) => (b.onclick = () => fixMine(S.shifts.find((s) => s.id == b.dataset.myshift))));
  }

  function fixMine(s) {
    const t = (v) => (v || "").slice(0, 5);
    sheet(`
      <h3>Fix shift</h3>
      <label>Date</label><input id="fd" type="date" value="${s.work_date}">
      <div class="row"><div class="grow"><label>Start</label><input id="fs" type="time" value="${t(s.start_time)}"></div>
        <div class="grow"><label>End</label><input id="fe" type="time" value="${t(s.end_time)}"></div></div>
      <label>Event / note</label><input id="fn" value="${esc(s.note || "")}">
      <div class="actions"><button class="btn danger" id="del">Delete</button><button class="btn" id="ok">Save</button></div>`,
    (el, close) => {
      el.querySelector("#ok").onclick = async () => {
        const row = { work_date: el.querySelector("#fd").value, start_time: el.querySelector("#fs").value,
          end_time: el.querySelector("#fe").value || null, note: el.querySelector("#fn").value.trim() || null };
        if (!row.work_date || !row.start_time) return toast("Add the date and start time.");
        if (!row.end_time && s.end_time) return toast("Add the end time.");
        if (row.start_time === row.end_time) return toast("Start and end can't be the same.");
        const { data, error } = await sb.from("shifts").update(row).eq("id", s.id).select().single();
        if (error) return toast(friendlyError(error));
        Object.assign(s, data); close(); render(); toast("Saved");
      };
      el.querySelector("#del").onclick = async () => {
        if (!confirm("Delete this shift?")) return;
        const { error } = await sb.from("shifts").delete().eq("id", s.id);
        if (error) return toast(friendlyError(error));
        S.shifts = S.shifts.filter((x) => x.id !== s.id); close(); render(); toast("Deleted");
      };
    });
  }

  // ---------- inventory ----------
  function viewInventory() {
    const cats = ["All", ...CATS.filter((c) => S.items.some((i) => i.category === c)),
      ...[...new Set(S.items.map((i) => i.category))].filter((c) => !CATS.includes(c))];
    const q = S.q.toLowerCase();
    const shown = S.items.filter((i) => (S.cat === "All" || i.category === S.cat) && (!q || i.name.toLowerCase().includes(q)));
    const groups = {};
    shown.forEach((i) => (groups[i.category] = groups[i.category] || []).push(i));
    const order = Object.keys(groups).sort((a, b) => (CATS.indexOf(a) + 99) % 99 - (CATS.indexOf(b) + 99) % 99 || a.localeCompare(b));

    view().innerHTML = `
      <h1>Inventory</h1>
      <p class="sub">${S.items.length} items · tap − / + to update counts</p>
      <input id="q" type="search" placeholder="Search items" value="${esc(S.q)}">
      <div class="chips" style="margin-top:10px">${cats.map((c) => `<button class="chip ${S.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      ${shown.length ? order.map((c) => `
        <h2>${esc(c)}</h2>
        <div class="list">${groups[c].map(itemRow).join("")}</div>`).join("")
        : `<div class="empty" style="margin-top:12px">${S.items.length ? "Nothing matches." : "No items yet. Tap + Add item."}</div>`}
      <button class="btn fab" id="add">+ Add item</button>`;

    const qEl = view().querySelector("#q");
    qEl.oninput = () => { S.q = qEl.value; const pos = qEl.selectionStart; viewInventory(); const n = view().querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); };
    view().querySelectorAll("[data-cat]").forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; viewInventory(); }));
    view().querySelector("#add").onclick = () => editItem(null);
    bindItemRows(view());
  }

  function itemRow(i) {
    return `<div class="item" data-id="${i.id}">
      <button class="tap grow" data-edit="${i.id}">
        <div class="name">${esc(i.name)}</div>
        <div class="meta">${i.unit ? esc(i.unit) : "no unit"}${Number(i.low_at) > 0 ? ` · low at ${num(i.low_at)}` : ""}
          ${isLow(i) ? ` <span class="tag low">Low</span>` : ""}${i.on_list ? ` <span class="tag list">On list</span>` : ""}</div>
      </button>
      <div class="stepper"><button data-step="-1" aria-label="Less">−</button><span>${num(i.qty)}</span><button data-step="1" aria-label="More">+</button></div>
    </div>`;
  }

  function bindItemRows(root) {
    root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editItem(S.items.find((i) => i.id == b.dataset.edit))));
    root.querySelectorAll("[data-step]").forEach((b) => (b.onclick = async () => {
      const id = b.closest(".item").dataset.id;
      const it = S.items.find((i) => i.id == id);
      const next = Math.max(0, Number(it.qty) + Number(b.dataset.step));
      if (next === Number(it.qty)) return;
      const prev = it.qty;
      it.qty = next;
      b.parentElement.querySelector("span").textContent = num(next);
      const { error } = await sb.from("inventory_items").update({ qty: next }).eq("id", id);
      if (error) { it.qty = prev; toast(friendlyError(error)); }
      render();
    }));
  }

  function editItem(it) {
    const isNew = !it;
    it = it || { name: "", category: S.cat !== "All" ? S.cat : "Meat", unit: "", qty: 0, low_at: 0, on_list: false, notes: "" };
    const catOpts = [...new Set([...CATS, it.category])];
    sheet(`
      <h3>${isNew ? "Add item" : "Edit item"}</h3>
      <label>Name</label><input id="fName" value="${esc(it.name)}" placeholder="e.g. Hot dog buns">
      <div class="row">
        <div class="grow"><label>Category</label><select id="fCat">${catOpts.map((c) => `<option ${c === it.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="grow"><label>Unit</label><input id="fUnit" value="${esc(it.unit)}" placeholder="pack, case, lb"></div>
      </div>
      <div class="row">
        <div class="grow"><label>How many now</label><input id="fQty" type="number" inputmode="decimal" min="0" step="any" value="${num(it.qty)}"></div>
        <div class="grow"><label>Running low at</label><input id="fLow" type="number" inputmode="decimal" min="0" step="any" value="${num(it.low_at)}"></div>
      </div>
      <p class="muted small" style="margin:6px 0 0">When the count hits "running low at," it shows up on Buy Soon. Leave 0 to turn that off.</p>
      <div class="switch"><span>Add to Buy Soon anyway</span><input id="fList" type="checkbox" ${it.on_list ? "checked" : ""}></div>
      <label>Notes</label><textarea id="fNotes" rows="2" placeholder="Brand, where to buy…">${esc(it.notes || "")}</textarea>
      <div class="actions">
        ${isNew ? "" : `<button class="btn danger" id="del">Delete</button>`}
        <button class="btn" id="save">Save</button>
      </div>`, (el, close) => {
      if (isNew) el.querySelector("#fName").focus();
      el.querySelector("#save").onclick = async () => {
        const row = {
          name: el.querySelector("#fName").value.trim(),
          category: el.querySelector("#fCat").value,
          unit: el.querySelector("#fUnit").value.trim(),
          qty: Math.max(0, Number(el.querySelector("#fQty").value) || 0),
          low_at: Math.max(0, Number(el.querySelector("#fLow").value) || 0),
          on_list: el.querySelector("#fList").checked,
          notes: el.querySelector("#fNotes").value.trim() || null
        };
        if (!row.name) return toast("Give it a name.");
        const res = isNew
          ? await sb.from("inventory_items").insert(row).select().single()
          : await sb.from("inventory_items").update(row).eq("id", it.id).select().single();
        if (res.error) return toast(friendlyError(res.error));
        if (isNew) S.items.push(res.data); else Object.assign(it, res.data);
        S.items.sort((a, b) => a.name.localeCompare(b.name));
        close(); render(); toast("Saved");
      };
      const del = el.querySelector("#del");
      if (del) del.onclick = async () => {
        if (!confirm(`Delete ${it.name}?`)) return;
        const { error } = await sb.from("inventory_items").delete().eq("id", it.id);
        if (error) return toast(friendlyError(error));
        S.items = S.items.filter((x) => x.id !== it.id);
        close(); render(); toast("Deleted");
      };
    });
  }

  // ---------- buy soon ----------
  function viewBuy() {
    const list = S.items.filter(needsBuying).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    view().innerHTML = `
      <h1>Buy Soon</h1>
      <p class="sub">Items running low, or added by hand.</p>
      ${list.length ? `
        <button class="btn light full" id="share">Send list</button>
        <div style="height:12px"></div>
        <div class="list">${list.map((i) => `
          <div class="item">
            <div class="grow">
              <div class="name">${esc(i.name)}</div>
              <div class="meta">Have ${num(i.qty)}${i.unit ? " " + esc(i.unit) : ""}${Number(i.low_at) > 0 ? ` · low at ${num(i.low_at)}` : ""}</div>
            </div>
            <button class="btn sm" data-bought="${i.id}">Bought</button>
          </div>`).join("")}</div>`
        : `<div class="empty">Nothing to buy right now.</div>`}`;

    const share = view().querySelector("#share");
    if (share) share.onclick = async () => {
      const text = "Didi's Dogs – buy soon:\n" + list.map((i) => `• ${i.name}${i.unit ? ` (${i.unit})` : ""}`).join("\n");
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast("List copied"); }
      } catch (e) { /* closed share sheet */ }
    };
    view().querySelectorAll("[data-bought]").forEach((b) => (b.onclick = () => bought(S.items.find((i) => i.id == b.dataset.bought))));
  }

  function bought(it) {
    sheet(`
      <h3>Bought ${esc(it.name)}</h3>
      <p class="muted">How many did you get? This gets added to the ${num(it.qty)} you have.</p>
      <label>Amount bought${it.unit ? ` (${esc(it.unit)})` : ""}</label>
      <input id="amt" type="number" inputmode="decimal" min="0" step="any" placeholder="0">
      <div class="actions"><button class="btn light" id="cancel">Cancel</button><button class="btn" id="ok">Save</button></div>`,
    (el, close) => {
      el.querySelector("#amt").focus();
      el.querySelector("#cancel").onclick = close;
      el.querySelector("#ok").onclick = async () => {
        const add = Math.max(0, Number(el.querySelector("#amt").value) || 0);
        const row = { qty: Number(it.qty) + add, on_list: false };
        const { data, error } = await sb.from("inventory_items").update(row).eq("id", it.id).select().single();
        if (error) return toast(friendlyError(error));
        Object.assign(it, data);
        close(); render();
        toast(isLow(it) ? `Saved. Still low (${num(it.qty)}).` : "Saved");
      };
    });
  }

  // ---------- events ----------
  const eventWorkers = (id) => S.assigns.filter((a) => a.event_id === id).map((a) => S.people.find((p) => p.id === a.worker_id)).filter(Boolean);
  const evTime = (e) => e.start_time ? fmtTime(e.start_time) + (e.end_time ? "–" + fmtTime(e.end_time) : "") : "Time TBD";

  function viewEvents() {
    const up = S.events.filter((e) => e.event_date >= today());
    const past = S.events.filter((e) => e.event_date < today()).reverse();
    if (MODE === "manager") S.evView = "up";   // managers only see upcoming events
    const shown = S.evView === "up" ? up : past;
    view().innerHTML = `
      <h1>Events</h1>
      <p class="sub">${MODE === "manager" ? "Upcoming events. The owner picks who's working." : "Add an event and pick who's working. They'll see it on the crew page."}</p>
      ${MODE === "manager" ? "" : `<div class="chips">
        <button class="chip ${S.evView === "up" ? "on" : ""}" data-ev="up">Upcoming (${up.length})</button>
        <button class="chip ${S.evView === "past" ? "on" : ""}" data-ev="past">Past (${past.length})</button>
      </div>`}
      ${shown.length ? `<div class="list">${shown.map((e) => {
        const ws = eventWorkers(e.id);
        return `<button class="item tap" style="width:100%;align-items:flex-start" data-event="${e.id}">
          <div class="datebox"><span>${new Date(e.event_date + "T12:00").toLocaleDateString("en-US", { month: "short" })}</span><b>${Number(e.event_date.slice(8))}</b></div>
          <div class="grow">
            <div class="name">${esc(e.title)}${e.event_date === today() ? ` <span class="tag low">Today</span>` : ""}</div>
            <div class="meta">${fmtDate(e.event_date)} · ${evTime(e)}</div>
            ${e.location ? `<div class="meta">${esc(e.location)}</div>` : ""}
            ${MODE === "manager" ? (ws.some((w) => w.id === S.me.id) ? `<div class="avatars"><span>You're working</span></div>` : "")
              : `<div class="avatars">${ws.length ? ws.map((w) => `<span>${esc(w.name)}</span>`).join("") : `<span style="background:var(--red-soft);color:var(--red)">No workers yet</span>`}</div>`}
          </div>
        </button>`;
      }).join("")}</div>` : `<div class="empty">${S.evView === "up" ? "No upcoming events. Tap + Add event." : "No past events."}</div>`}
      <button class="btn fab" id="addEvent">+ Add event</button>`;
    view().querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => { S.evView = b.dataset.ev; viewEvents(); }));
    view().querySelectorAll("[data-event]").forEach((b) => (b.onclick = () => editEvent(S.events.find((e) => e.id == b.dataset.event))));
    view().querySelector("#addEvent").onclick = () => editEvent(null);
  }

  function editEvent(e) {
    const isNew = !e;
    e = e || { title: "", event_date: today(), start_time: "", end_time: "", location: "", notes: "" };
    const t = (v) => (v || "").slice(0, 5);
    const workers = S.people.filter((p) => isStaff(p));
    const picked = new Set(isNew ? [] : S.assigns.filter((a) => a.event_id === e.id).map((a) => a.worker_id));
    sheet(`
      <h3>${isNew ? "Add event" : "Edit event"}</h3>
      <label>Event name</label><input id="eT" value="${esc(e.title)}" placeholder="e.g. Cohen wedding">
      <label>Date</label><input id="eD" type="date" value="${e.event_date}">
      <div class="row">
        <div class="grow"><label>Start</label><input id="eS" type="time" value="${t(e.start_time)}"></div>
        <div class="grow"><label>End</label><input id="eE" type="time" value="${t(e.end_time)}"></div>
      </div>
      <label>Address</label><input id="eL" value="${esc(e.location || "")}" placeholder="Street, city">
      <label>Notes for the crew</label><textarea id="eN" rows="2" placeholder="Guest count, parking, arrive early…">${esc(e.notes || "")}</textarea>
      ${!isNew && S.expenses.some((x) => x.event_id === e.id) ? `<div class="card" style="margin-top:14px"><div class="muted small">Spent on this event</div>
        <div class="name" style="font-size:20px">${money(S.expenses.filter((x) => x.event_id === e.id).reduce((a, x) => a + Number(x.amount), 0))}</div></div>` : ""}
      ${MODE === "manager" ? "" : `<label>Who's working</label>`}
      ${MODE === "manager" ? "" : workers.length ? `<div class="list checks">${workers.map((w) => `
        <label><input type="checkbox" value="${w.id}" ${picked.has(w.id) ? "checked" : ""}> ${esc(w.name)}</label>`).join("")}</div>`
        : `<div class="empty">No approved workers yet.</div>`}
      <div class="actions">
        ${isNew || MODE === "manager" ? "" : `<button class="btn danger" id="del">Delete</button>`}
        <button class="btn" id="save">Save</button>
      </div>`, (el, close) => {
      if (isNew) el.querySelector("#eT").focus();
      el.querySelector("#save").onclick = async (ev) => {
        const row = {
          title: el.querySelector("#eT").value.trim(),
          event_date: el.querySelector("#eD").value,
          start_time: el.querySelector("#eS").value || null,
          end_time: el.querySelector("#eE").value || null,
          location: el.querySelector("#eL").value.trim() || null,
          notes: el.querySelector("#eN").value.trim() || null
        };
        if (!row.title) return toast("Give the event a name.");
        if (!row.event_date) return toast("Pick a date.");
        ev.target.disabled = true;
        const res = isNew
          ? await sb.from("events").insert(row).select().single()
          : await sb.from("events").update(row).eq("id", e.id).select().single();
        if (res.error) { ev.target.disabled = false; return toast(friendlyError(res.error)); }
        const saved = res.data;
        const want = MODE === "manager" ? S.assigns.filter((a) => a.event_id === saved.id).map((a) => a.worker_id)
          : [...el.querySelectorAll(".checks input:checked")].map((i) => i.value);
        const had = S.assigns.filter((a) => a.event_id === saved.id).map((a) => a.worker_id);
        const add = want.filter((w) => !had.includes(w));
        const drop = had.filter((w) => !want.includes(w));
        if (drop.length) {
          const r = await sb.from("event_workers").delete().eq("event_id", saved.id).in("worker_id", drop);
          if (r.error) toast(friendlyError(r.error));
        }
        if (add.length) {
          const r = await sb.from("event_workers").insert(add.map((w) => ({ event_id: saved.id, worker_id: w })));
          if (r.error) toast(friendlyError(r.error));
        }
        S.assigns = S.assigns.filter((a) => !(a.event_id === saved.id && drop.includes(a.worker_id)))
          .concat(add.map((w) => ({ event_id: saved.id, worker_id: w })));
        if (isNew) S.events.push(saved); else Object.assign(e, saved);
        S.events.sort((a, b) => a.event_date.localeCompare(b.event_date) || String(a.start_time || "").localeCompare(String(b.start_time || "")));
        close(); render(); toast("Saved");
      };
      const del = el.querySelector("#del");
      if (del) del.onclick = async () => {
        if (!confirm(`Delete ${e.title}?`)) return;
        const { error } = await sb.from("events").delete().eq("id", e.id);
        if (error) return toast(friendlyError(error));
        S.events = S.events.filter((x) => x.id !== e.id);
        S.assigns = S.assigns.filter((a) => a.event_id !== e.id);
        close(); render(); toast("Deleted");
      };
    });
  }

  // ---------- expenses ----------
  const EX_CATS = ["Food & supplies", "Worker pay", "Gas / fuel", "Propane", "Equipment", "Trailer", "Repairs", "Kashrus", "Permits & insurance", "Phone & internet", "Marketing", "Other"];
  function monthKey(d) { return d.slice(0, 7); }
  function monthLabel(k) { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
  function exRange() {
    const now = today(), thisM = monthKey(now);
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const lastM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (S.exRange === "month") return { test: (day) => monthKey(day) === thisM, label: monthLabel(thisM) };
    if (S.exRange === "last") return { test: (day) => monthKey(day) === lastM, label: monthLabel(lastM) };
    return { test: () => true, label: "All time" };
  }
  const shiftPaidDay = (s) => (s.paid_at ? String(s.paid_at).slice(0, 10) : s.work_date);

  function viewExpenses() {
    const list = S.expenses;
    const total = list.reduce((a, e) => a + Number(e.amount), 0);
    const unpaid = list.filter((e) => !e.paid).reduce((a, e) => a + Number(e.amount), 0);
    const evName = (id) => (S.events.find((e) => e.id === id) || {}).title;
    const groups = {};
    list.forEach((e) => (groups[e.category] = groups[e.category] || []).push(e));
    const sum = (arr) => arr.reduce((a, e) => a + Number(e.amount), 0);
    const order = Object.keys(groups).sort((x, y) => sum(groups[y]) - sum(groups[x]));
    order.forEach((c) => groups[c].sort((x, y) => y.id - x.id));

    view().innerHTML = `
      <h1>Expenses</h1>
      <p class="sub">Tap the circle to mark paid. Tap an expense to edit it.</p>
      <div class="card">
        <div class="muted">Total spent</div>
        <div class="big">${money(total)}</div>
        <div class="muted small">${money(total - unpaid)} paid${unpaid > 0 ? ` · <b style="color:var(--red)">${money(unpaid)} not paid</b>` : " · all paid"}</div>
      </div>
      ${list.length ? order.map((c) => `
        <h2 class="row" style="justify-content:space-between"><span>${esc(c)}</span><span>${money(sum(groups[c]))}</span></h2>
        <div class="list">${groups[c].map((e) => `
          <div class="item">
            <button class="paycheck ${e.paid ? "on" : ""}" data-paid="${e.id}" aria-label="${e.paid ? "Paid. Tap to mark not paid" : "Not paid. Tap to mark paid"}">${e.paid ? "✓" : ""}</button>
            <button class="tap grow" data-ex="${e.id}">
              <div class="name">${esc(e.description || e.category)}</div>
              <div class="meta">${e.paid ? "Paid" : `<span style="color:var(--red);font-weight:600">Not paid</span>`}${e.event_id && evName(e.event_id) ? " · " + esc(evName(e.event_id)) : ""}</div>
            </button>
            <div class="name">${money(e.amount)}</div>
          </div>`).join("")}</div>`).join("")
        : `<div class="empty">No expenses yet. Tap + Add expense.</div>`}
      <button class="btn fab" id="addEx">+ Add expense</button>`;

    view().querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => editExpense(S.expenses.find((e) => e.id == b.dataset.ex))));
    view().querySelectorAll("[data-paid]").forEach((b) => (b.onclick = async () => {
      const e = S.expenses.find((x) => x.id == b.dataset.paid);
      const next = !e.paid;
      e.paid = next; viewExpenses();
      const { error } = await sb.from("expenses").update({ paid: next }).eq("id", e.id);
      if (error) { e.paid = !next; viewExpenses(); toast(friendlyError(error)); }
    }));
    view().querySelector("#addEx").onclick = () => editExpense(null);
  }

  function editExpense(x) {
    const isNew = !x;
    x = x || { spent_on: today(), amount: "", category: EX_CATS[0], description: "", event_id: null, paid: false };
    const cats = [...new Set([...EX_CATS, x.category])];
    const evs = S.events.slice().sort((a, b) => b.event_date.localeCompare(a.event_date)).slice(0, 40);
    sheet(`
      <h3>${isNew ? "Add expense" : "Edit expense"}</h3>
      <label>Amount ($)</label><input id="xA" type="number" inputmode="decimal" min="0" step="0.01" value="${x.amount === "" ? "" : num(x.amount)}" placeholder="0.00">
      <label>What was it?</label><input id="xD" value="${esc(x.description || "")}" placeholder="e.g. Hot dogs and buns from Costco">
      <label>Category</label><select id="xC">${cats.map((c) => `<option ${c === x.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <div class="switch"><span>Paid</span><input id="xP" type="checkbox" ${x.paid ? "checked" : ""}></div>
      <label style="margin-top:4px">For an event? (optional)</label>
      <select id="xE"><option value="">No event</option>${evs.map((e) => `<option value="${e.id}" ${e.id === x.event_id ? "selected" : ""}>${esc(e.title)} · ${fmtDate(e.event_date)}</option>`).join("")}</select>
      <div class="actions">
        ${isNew ? "" : `<button class="btn danger" id="del">Delete</button>`}
        <button class="btn" id="save">Save</button>
      </div>`, (el, close) => {
      if (isNew) el.querySelector("#xA").focus();
      el.querySelector("#save").onclick = async (ev) => {
        const row = {
          amount: Math.round((Number(el.querySelector("#xA").value) || 0) * 100) / 100,
          description: el.querySelector("#xD").value.trim() || null,
          category: el.querySelector("#xC").value,
          spent_on: x.spent_on || today(),
          event_id: el.querySelector("#xE").value ? Number(el.querySelector("#xE").value) : null,
          paid: el.querySelector("#xP").checked
        };
        if (!(row.amount > 0)) return toast("Enter the amount.");
        ev.target.disabled = true;
        const res = isNew
          ? await sb.from("expenses").insert(row).select().single()
          : await sb.from("expenses").update(row).eq("id", x.id).select().single();
        if (res.error) { ev.target.disabled = false; return toast(friendlyError(res.error)); }
        if (isNew) S.expenses.unshift(res.data); else Object.assign(x, res.data);
        S.expenses.sort((a, b) => b.id - a.id);
        close(); render(); toast("Saved");
      };
      const del = el.querySelector("#del");
      if (del) del.onclick = async () => {
        if (!confirm("Delete this expense?")) return;
        const { error } = await sb.from("expenses").delete().eq("id", x.id);
        if (error) return toast(friendlyError(error));
        S.expenses = S.expenses.filter((e) => e.id !== x.id);
        close(); render(); toast("Deleted");
      };
    });
  }

  // ---------- workers (people + hours together) ----------
  function unpaidFor(id) {
    const list = S.shifts.filter((s) => s.worker_id === id && !s.paid && s.end_time);
    return {
      list,
      hours: list.reduce((a, s) => a + Number(s.hours), 0),
      owed: list.reduce((a, s) => a + Number(s.hours) * Number(s.rate), 0)
    };
  }

  function viewTeam() {
    const pending = S.people.filter((p) => p.role === "pending");
    const active = S.people.filter((p) => isStaff(p));
    const removed = S.people.filter((p) => p.role === "removed");
    const totalOwed = active.reduce((a, p) => a + unpaidFor(p.id).owed, 0);
    const unpaidCount = active.filter((p) => unpaidFor(p.id).hours > 0).length;
    const teamHrs = S.shifts.reduce((a, s) => a + Number(s.hours), 0);
    const teamPaid = S.shifts.filter((s) => s.paid).reduce((a, s) => a + Number(s.hours) * Number(s.rate), 0);
    // Unpaid workers first, then by name
    active.sort((a, b) => (unpaidFor(b.id).hours > 0) - (unpaidFor(a.id).hours > 0) || a.name.localeCompare(b.name));

    view().innerHTML = `
      <h1>Workers</h1>
      <p class="sub">Red = has unpaid hours. Green = all paid. Tap a worker for details.</p>
      <div class="card">
        <div class="muted">Owed to workers</div>
        <div class="big">${money(totalOwed)}</div>
        <div class="muted small">${unpaidCount ? `${unpaidCount} worker${unpaidCount === 1 ? "" : "s"} unpaid` : "Everyone is paid"}</div>
      </div>

      ${pending.length ? `<h2>Waiting for approval</h2><div class="list">${pending.map((p) => `
        <div class="item" style="flex-wrap:wrap">
          <div class="grow"><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.email || "")}</div></div>
          <div class="row"><button class="btn danger sm" data-role="removed" data-id="${p.id}">Remove</button>
          <button class="btn sm" data-role="crew" data-id="${p.id}">Approve</button></div>
        </div>`).join("")}</div>` : ""}
      <h2>Team${S.shifts.some((x) => !x.end_time) ? ` · ${S.shifts.filter((x) => !x.end_time).length} on the clock` : ""}</h2>
      ${active.length ? `<div class="list">${active.map((p) => {
        const u = unpaidFor(p.id);
        const red = u.hours > 0;
        const open = S.shifts.find((x) => x.worker_id === p.id && !x.end_time);
        return `<button class="item tap" style="width:100%" data-person="${p.id}">
          <span class="status ${red ? "red" : "green"}" aria-label="${red ? "Unpaid" : "Paid"}"></span>
          <div class="grow"><div class="name">${esc(p.name)}${p.title ? ` <span class="tag plain">${esc(p.title)}</span>` : p.role === "admin" ? ` <span class="tag plain">Owner</span>` : p.role === "manager" ? ` <span class="tag plain">Manager</span>` : ""}</div>
            <div class="meta"><b style="color:var(--navy)">${num(S.shifts.filter((x) => x.worker_id === p.id).reduce((a, x) => a + Number(x.hours), 0))} hrs all-time</b>${red ? ` · ${num(u.hours)} unpaid` : ""}</div>
            ${open ? `<div class="onclock">On the clock since ${fmtTime(open.start_time)}</div>` : ""}</div>
          <div style="text-align:right">
            ${red ? `<div class="name">${money(u.owed)}</div><span class="tag low">Unpaid</span>` : `<span class="tag paid">Paid</span>`}
          </div>
        </button>`;
      }).join("")}</div>` : `<div class="empty">No workers yet.</div>`}
      ${removed.length ? `<h2>Removed</h2><div class="list">${removed.map((p) => `
        <button class="item tap" style="width:100%" data-person="${p.id}">
          <div class="grow"><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.email || "")}</div></div>
        </button>`).join("")}</div>` : ""}
      <div class="card" style="margin-top:20px">
        <div class="name" style="font-weight:700">Crew page</div>
        <div class="muted small" style="margin:2px 0 8px">Workers use it to sign up and log their hours.</div>
        <a class="maplink" href="${esc(crewLink())}" target="_blank" rel="noopener" style="word-break:break-all;margin:0 0 12px">${esc(crewLink())}</a>
        <div class="row">
          <button class="btn sm grow" id="shareCrew">Send crew link</button>
          <button class="btn light sm grow" id="copyCrew">Copy link</button>
        </div>
      </div>
      ${active.length ? `<button class="btn fab" id="addShift">+ Add hours</button>` : ""}`;

    view().querySelector("#copyCrew").onclick = async () => {
      try { await navigator.clipboard.writeText(crewLink()); toast("Link copied"); }
      catch (e) { prompt("Copy this link:", crewLink()); }
    };
    view().querySelector("#shareCrew").onclick = async () => {
      const text = `Didi's Dogs crew page. Make an account and log your hours here: ${crewLink()}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast("Link copied"); }
      } catch (e) {}
    };
    view().querySelectorAll("[data-role]").forEach((b) => (b.onclick = async () => {
      const p = S.people.find((x) => x.id === b.dataset.id);
      if (b.dataset.role === "removed" && !confirm(`Remove ${p.name}?`)) return;
      if (await savePerson(p, { role: b.dataset.role }) && b.dataset.role === "crew") editPerson(p);
    }));
    view().querySelectorAll("[data-person]").forEach((b) => (b.onclick = () => workerSheet(S.people.find((x) => x.id === b.dataset.person))));
    const add = view().querySelector("#addShift");
    if (add) add.onclick = () => editShift(null);
  }

  // One worker: unpaid summary, shifts, actions
  function workerSheet(p) {
    const u = unpaidFor(p.id);
    const mine = S.shifts.filter((s) => s.worker_id === p.id);
    const red = u.hours > 0;
    const allHrs = mine.reduce((a, s) => a + Number(s.hours), 0);
    const allPaid = mine.filter((s) => s.paid).reduce((a, s) => a + Number(s.hours) * Number(s.rate), 0);
    sheet(`
      <div class="row" style="align-items:flex-start">
        <div class="grow"><h3>${esc(p.name)}</h3>
          <p class="muted" style="margin:0">${esc(p.phone || p.email || "")}${Number(p.pay_rate) ? ` · ${money(p.pay_rate)}/hr` : " · no rate set"}</p>
          ${p.zelle ? `<p class="muted small" style="margin:2px 0 0">Zelle: ${esc(p.zelle)}</p>` : ""}</div>
        <button class="btn light sm" id="info">Edit info</button>
      </div>
      <div class="card" style="margin-top:16px;display:flex;align-items:center;gap:12px">
        <span class="status ${red ? "red" : "green"}"></span>
        <div class="grow">
          <div class="name">${red ? `${num(u.hours)} hrs unpaid` : "All paid"}</div>
          ${red ? `<div class="muted">${money(u.owed)} owed</div>` : ""}
        </div>
        ${red ? `<button class="btn sm" id="pay" style="background:var(--ok);border-color:var(--ok)">Mark paid</button>` : ""}
      </div>
      ${p.zelle
        ? `<a class="zelle-tile" href="${esc(DD.zelleLink(p.name, p.zelle))}" target="_blank" rel="noopener">
             <span class="zl">Zelle</span>
             <span class="grow">Tap to pay ${esc((p.name || "").split(" ")[0])}${red ? `<br><b>${money(u.owed)}</b> owed` : ""}</span>
             <span aria-hidden="true">›</span></a>`
        : `<p class="muted small" style="margin:-4px 0 12px">No Zelle QR yet. They can upload it on the crew page, or you can in <b>Edit info</b>.</p>`}
      <div class="row" style="gap:10px">
        <div class="card grow" style="margin:0"><div class="muted small">All-time hours</div><div class="big" style="font-size:30px">${num(allHrs)}</div></div>
        <div class="card grow" style="margin:0"><div class="muted small">All-time paid</div><div class="big" style="font-size:30px">${money(allPaid)}</div></div>
      </div>
      <h2>All shifts (${mine.length})</h2>
      ${mine.length ? `<div class="list">${mine.map((s) => `
        <button class="item tap" style="width:100%" data-shift="${s.id}">
          <div class="grow"><div class="name">${fmtDate(s.work_date)}</div>
            <div class="meta">${fmtTime(s.start_time)}–${s.end_time ? fmtTime(s.end_time) : "now"}${s.note ? " · " + esc(s.note) : ""}</div></div>
          <div style="text-align:right">${!s.end_time ? `<span class="tag paid">On the clock</span>` : `<div class="name">${num(s.hours)} h</div>
            ${s.paid ? `<span class="tag paid">Paid</span>` : `<span class="tag low">Unpaid</span>`}`}</div>
        </button>`).join("")}</div>` : `<div class="empty">No hours logged yet.</div>`}
      <div class="actions"><button class="btn light" id="close">Close</button><button class="btn" id="add">+ Add hours</button></div>`,
    (el, close) => {
      el.querySelector("#close").onclick = close;
      el.querySelector("#info").onclick = () => { close(); editPerson(p); };
      el.querySelector("#add").onclick = () => { close(); editShift(null, p.id); };
      const pay = el.querySelector("#pay");
      if (pay) pay.onclick = async () => { if (await payWorker(p.id, u)) { close(); workerSheet(p); } };
      el.querySelectorAll("[data-shift]").forEach((b) => (b.onclick = () => { close(); editShift(S.shifts.find((s) => s.id == b.dataset.shift)); }));
    });
  }

  async function payWorker(id, w) {
    if (!confirm(`Mark ${personName(id)} paid ${money(w.owed)} for ${num(w.hours)} hours?`)) return false;
    const ids = w.list.map((s) => s.id);
    const { data, error } = await sb.from("shifts").update({ paid: true }).in("id", ids).select();
    if (error) { toast(friendlyError(error)); return false; }
    data.forEach((d) => Object.assign(S.shifts.find((s) => s.id === d.id), d));
    render(); toast("Marked paid");
    return true;
  }

  function editShift(s, presetWorker) {
    const isNew = !s;
    const workers = S.people.filter((p) => isStaff(p));
    s = s || { worker_id: presetWorker || (workers[0] && workers[0].id), work_date: today(), start_time: "", end_time: "", note: "", paid: false, rate: 0 };
    const t = (v) => (v || "").slice(0, 5);
    sheet(`
      <h3>${isNew ? "Add hours" : "Edit shift"}</h3>
      <label>Worker</label>
      <select id="sW" ${isNew ? "" : "disabled"}>${(isNew ? workers : S.people).map((p) => `<option value="${p.id}" ${p.id === s.worker_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <label>Date</label><input id="sD" type="date" value="${s.work_date}">
      <div class="row">
        <div class="grow"><label>Start</label><input id="sS" type="time" value="${t(s.start_time)}"></div>
        <div class="grow"><label>End</label><input id="sE" type="time" value="${t(s.end_time)}"></div>
      </div>
      <p class="muted small" id="sH" style="margin:8px 0 0"></p>
      <label>Event / note</label><input id="sN" value="${esc(s.note || "")}" placeholder="e.g. Cohen wedding">
      ${isNew ? "" : `<label>Pay per hour for this shift ($)</label>
        <input id="sR" type="number" inputmode="decimal" min="0" step="0.01" value="${num(s.rate)}">
        <div class="switch"><span>Paid</span><input id="sP" type="checkbox" ${s.paid ? "checked" : ""}></div>`}
      ${!isNew && !s.end_time ? `<button class="btn light full" id="outNow" style="margin-top:14px">Clock them out now</button>` : ""}
      <div class="actions">
        ${isNew ? "" : `<button class="btn danger" id="del">Delete</button>`}
        <button class="btn" id="save">Save</button>
      </div>`, (el, close) => {
      const outNow = el.querySelector("#outNow");
      if (outNow) outNow.onclick = () => { el.querySelector("#sE").value = DD.nowTime(); upd(); };
      const upd = () => {
        const h = calcHours(el.querySelector("#sS").value, el.querySelector("#sE").value);
        el.querySelector("#sH").textContent = h ? `${num(h)} hours` : "";
      };
      el.querySelector("#sS").oninput = upd; el.querySelector("#sE").oninput = upd; upd();
      el.querySelector("#save").onclick = async () => {
        const row = {
          work_date: el.querySelector("#sD").value,
          start_time: el.querySelector("#sS").value,
          end_time: el.querySelector("#sE").value,
          note: el.querySelector("#sN").value.trim() || null
        };
        if (!row.work_date || !row.start_time) return toast("Add the date and start time.");
        if (!row.end_time) { if (isNew || s.end_time) return toast("Add the end time."); row.end_time = null; }
        if (row.start_time === row.end_time) return toast("Start and end can't be the same.");
        if (isNew) row.worker_id = el.querySelector("#sW").value;
        else { row.paid = el.querySelector("#sP").checked; row.rate = Math.max(0, Number(el.querySelector("#sR").value) || 0); }
        const res = isNew
          ? await sb.from("shifts").insert(row).select().single()
          : await sb.from("shifts").update(row).eq("id", s.id).select().single();
        if (res.error) return toast(friendlyError(res.error));
        if (isNew) S.shifts.unshift(res.data); else Object.assign(s, res.data);
        S.shifts.sort((a, b) => b.work_date.localeCompare(a.work_date) || b.start_time.localeCompare(a.start_time));
        close(); render(); toast("Saved");
      };
      const del = el.querySelector("#del");
      if (del) del.onclick = async () => {
        if (!confirm("Delete this shift?")) return;
        const { error } = await sb.from("shifts").delete().eq("id", s.id);
        if (error) return toast(friendlyError(error));
        S.shifts = S.shifts.filter((x) => x.id !== s.id);
        close(); render(); toast("Deleted");
      };
    });
  }

  async function savePerson(p, row) {
    const { data, error } = await sb.from("profiles").update(row).eq("id", p.id).select().single();
    if (error) { toast(friendlyError(error)); return false; }
    Object.assign(p, data);
    render(); toast("Saved");
    return true;
  }

  function editPerson(p) {
    const self = p.id === S.me.id;
    sheet(`
      <h3>${esc(p.name)}</h3>
      <p class="muted" style="margin:0">${esc(p.email || "")}</p>
      <label>Name</label><input id="pN" value="${esc(p.name)}">
      <label>Phone</label><input id="pPh" type="tel" value="${esc(p.phone || "")}">
      <label>Zelle</label>
      <div class="row"><input id="pZ" class="grow" value="${esc(p.zelle || "")}" placeholder="Phone or email">
        <button class="btn light sm" id="pZup" type="button">Upload QR</button></div>
      <input type="file" id="pZfile" accept="image/*" hidden>
      <label>Pay per hour ($)</label><input id="pR" type="number" inputmode="decimal" min="0" step="0.01" value="${num(p.pay_rate)}">
      <p class="muted small" style="margin:6px 0 0">Changing this also updates their unpaid hours. Hours already paid stay the same.</p>
      <label>Access</label>
      <select id="pRole">
        <option value="crew" ${p.role === "crew" ? "selected" : ""}>Worker (logs hours only)</option>
        <option value="manager" ${p.role === "manager" ? "selected" : ""}>Manager (own hours, inventory)</option>
        <option value="admin" ${p.role === "admin" ? "selected" : ""}>Owner (sees everything)</option>
        ${self ? "" : `<option value="removed" ${p.role === "removed" ? "selected" : ""}>Removed (no access)</option>`}
      </select>
      <label>Label next to name (optional)</label>
      <input id="pT" value="${esc(p.title || "")}" placeholder="e.g. Site Operator (leave blank for Owner / Manager)">
      <div class="switch" id="evWrap" style="${p.role === "manager" ? "" : "display:none"}"><span>Manager can see and add events</span>
        <input id="pEv" type="checkbox" ${p.can_see_events ? "checked" : ""}></div>
      <div class="actions"><button class="btn light" id="cancel">Cancel</button><button class="btn" id="save">Save</button></div>`,
    (el, close) => {
      el.querySelector("#cancel").onclick = close;
      el.querySelector("#pRole").onchange = (ev) => { el.querySelector("#evWrap").style.display = ev.target.value === "manager" ? "" : "none"; };
      const zf = el.querySelector("#pZfile");
      el.querySelector("#pZup").onclick = () => zf.click();
      zf.onchange = async () => {
        const f = zf.files[0]; if (!f) return;
        try { const z = await DD.readZelleQR(f); el.querySelector("#pZ").value = z.zelle; toast("QR read. Tap Save."); }
        catch (e) { toast(friendlyError(e)); }
        zf.value = "";
      };
      el.querySelector("#save").onclick = async () => {
        const row = {
          name: el.querySelector("#pN").value.trim() || p.name,
          phone: el.querySelector("#pPh").value.trim() || null,
          zelle: DD.cleanZelle(el.querySelector("#pZ").value) || null,
          pay_rate: Math.max(0, Number(el.querySelector("#pR").value) || 0),
          role: el.querySelector("#pRole").value,
          can_see_events: el.querySelector("#pRole").value === "manager" && el.querySelector("#pEv").checked,
          title: el.querySelector("#pT").value.trim() || null
        };
        const rateChanged = Number(row.pay_rate) !== Number(p.pay_rate);
        if (await savePerson(p, row)) {
          close();
          if (rateChanged) { await loadAll(); render(); }
        }
      };
    });
  }

  start();
})();
