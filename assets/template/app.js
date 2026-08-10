/* 抽抽乐网站引擎（数据驱动，无框架无构建）
 * 读取 window.GACHA_CONFIG（由 config.js 注入），纯前端运行。 */
(function () {
  "use strict";
  var CFG = window.GACHA_CONFIG;
  if (!CFG) { document.getElementById("root").innerHTML = '<main class="loading">缺少 config.js 配置</main>'; return; }

  // ---------- 主题 ----------
  var theme = CFG.theme || {};
  var root = document.documentElement;
  root.style.setProperty("--bg", theme.bg || "#ffffff");
  root.style.setProperty("--surface", theme.surface || "#ffffff");
  root.style.setProperty("--primary", theme.primary || "#8b5cf6");
  root.style.setProperty("--accent", theme.accent || "#d4af37");
  root.style.setProperty("--text", theme.text || "#3a2d4d");
  document.title = CFG.siteName || "抽抽乐";
  var og = document.querySelector('meta[property="og:title"]'); if (og) og.setAttribute("content", document.title);

  // ---------- 派生结构 ----------
  var tiers = CFG.tiers || [{ key: "R", name: "R", prob: 100, color: "#b0a8c0" }];
  var tierByKey = {}; tiers.forEach(function (t) { tierByKey[t.key] = t; });
  var rank = function (k) { return tiers.findIndex(function (t) { return t.key === k; }); };
  // 保底强制档：最高声望的非隐藏档（数组末尾视为最高）
  var forceKey = null;
  for (var i = tiers.length - 1; i >= 0; i--) { if (tiers[i].key !== "HIDDEN") { forceKey = tiers[i].key; break; } }
  if (!forceKey) forceKey = tiers[tiers.length - 1].key;
  var isHigh = function (k) { return rank(k) >= rank(forceKey); };

  var cards = CFG.cards || [];
  var cardById = function (id) { return cards.find(function (c) { return c.id === id; }); };

  var vouchers = CFG.vouchers || [];
  var STORAGE_KEY = "gacha-" + (CFG.siteName || "site").replace(/\W+/g, "-").toLowerCase() + "-v1";
  var PITY = CFG.pityLimit || 50;

  // ---------- 状态 ----------
  var blank = function () {
    return { coins: CFG.initialCoins != null ? CFG.initialCoins : 300, inventory: {}, history: [], pity: 0, pending: null, redeemedCodes: [] };
  };
  var save = blank();
  var hydrated = false;
  var page = "home";
  var filter = "ALL";
  var ownedOnly = false;
  var detail = null;
  var codeInput = "";
  var codeNotice = "";
  var hint = "";

  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {} }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        save = Object.assign(blank(), p);
        save.redeemedCodes = Array.isArray(p.redeemedCodes) ? p.redeemedCodes : [];
        if (save.pending && !save.pending.newIds) save.pending.newIds = save.pending.results;
      }
    } catch (e) { try { localStorage.removeItem(STORAGE_KEY); } catch (e2) {} }
    hydrated = true;
  }

  // ---------- 抽卡逻辑 ----------
  function rollRarity(pity) {
    if (pity >= PITY - 1) return forceKey;
    var r = Math.random() * 100, acc = 0;
    for (var i = 0; i < tiers.length; i++) { acc += tiers[i].prob; if (r < acc) return tiers[i].key; }
    return tiers[tiers.length - 1].key;
  }
  function drawOne(pity) {
    var rarity = rollRarity(pity);
    var pool = cards.filter(function (c) { return c.tier === rarity; });
    if (!pool.length) pool = cards;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }
  function beginDraw(type) {
    if (save.pending) return;
    var cost = type === "single" ? CFG.drawCost.single : CFG.drawCost.ten;
    if (save.coins < cost) { hint = "积分不足，先去兑换码里补点积分吧～"; render(); return; }
    var pity = save.pity, results = [], n = type === "single" ? 1 : 10;
    for (var i = 0; i < n; i++) {
      var id = drawOne(pity);
      pity = isHigh(cardById(id).tier) ? 0 : pity + 1;
      results.push(id);
    }
    var known = new Set(Object.keys(save.inventory).map(Number));
    var newIds = [], quickIds = [];
    results.forEach(function (id) { if (known.has(id)) quickIds.push(id); else { known.add(id); newIds.push(id); } });
    save = Object.assign({}, save, {
      coins: save.coins - cost,
      pity: pity,
      pending: { results: results, drawType: type, newIds: newIds, quickIds: quickIds, index: 0, revealed: false }
    });
    persist(); render();
  }
  function reveal() { if (save.pending) { save.pending.revealed = true; persist(); render(); } }
  function nextCard() {
    if (!save.pending) return;
    save.pending.index += 1; save.pending.revealed = false; persist(); render();
  }
  function commit() {
    if (!save.pending) return;
    var at = new Date().toISOString(), pity = save.pity, inv = Object.assign({}, save.inventory);
    save.pending.results.forEach(function (id) {
      var prev = inv[id];
      inv[id] = prev ? { count: prev.count + 1, firstObtainedAt: prev.firstObtainedAt, lastObtainedAt: at }
                     : { count: 1, firstObtainedAt: at, lastObtainedAt: at };
      pity = isHigh(cardById(id).tier) ? 0 : pity + 1;
    });
    var hist = save.pending.results.map(function (cardId, idx) {
      return { id: at + "-" + idx + "-" + cardId, at: at, cardId: cardId, drawType: save.pending.drawType };
    }).concat(save.history);
    save = Object.assign({}, save, { inventory: inv, history: hist, pity: pity, pending: null });
    persist(); render();
  }
  function redeem() {
    var code = codeInput.trim().toUpperCase();
    if (!code) { codeNotice = "请输入兑换码"; render(); return; }
    var v = vouchers.find(function (x) { return x.code === code; });
    if (!v) { codeNotice = "兑换码无效"; render(); return; }
    if (save.redeemedCodes.indexOf(code) >= 0) { codeNotice = "这个兑换码已使用"; render(); return; }
    var reward = v.points != null ? v.points : 500;
    save = Object.assign({}, save, { coins: save.coins + reward, redeemedCodes: save.redeemedCodes.concat([code]) });
    codeInput = ""; codeNotice = "兑换成功，获得 " + reward + " 积分！";
    persist(); render();
  }

  // ---------- 渲染 ----------
  var owned = function () { return Object.keys(save.inventory).length; };
  function tierDot(k) { return '<span class="dot" style="background:' + (tierByKey[k] ? tierByKey[k].color : "#ccc") + '"></span>'; }
  function preload(src) { if (src) { var im = new Image(); im.src = src; } }

  function headerHTML() {
    var nav = [["home", "抽卡大厅"], ["collection", "我的图鉴"], ["pool", "卡池详情"], ["history", "抽卡记录"]]
      .map(function (p) { return '<button data-nav="' + p[0] + '" class="' + (page === p[0] ? "active" : "") + '">' + p[1] + "</button>"; }).join("");
    return '<header><button class="brand" data-nav="home">✦ <span>' + (CFG.siteName || "抽抽乐") + '</span></button>' +
      '<nav>' + nav + '</nav><div class="coins">✦ ' + save.coins.toLocaleString() + "</div></header>";
  }

  function homeHTML() {
    var hero = '<div class="hero"><p>' + (CFG.siteName || "GACHA").toUpperCase() + ' · PRIVATE UNIVERSE</p><h1>' +
      (CFG.subtitle || "遇见下一张卡") + "</h1><span>每一次翻面，都有一束为你而亮的光。</span></div>";
    var stage = '<section class="stage panel"><div class="orbit"></div><p class="eyebrow">卡池</p><h2>轻触，开启一段新邂逅</h2>' +
      '<div class="showcase-card"><img src="' + (cards[0] ? cards[0].back : "") + '" alt="卡牌背面" /></div>' +
      '<div class="draw-actions"><button data-draw="single">单抽 <small>✦ ' + CFG.drawCost.single + '</small></button>' +
      '<button class="warm" data-draw="ten">十连抽 <small>✦ ' + CFG.drawCost.ten + "</small></button></div></section>";
    var rows = tiers.slice().reverse().map(function (t) {
      return '<div class="rarity-row">' + tierDot(t.key) + (t.name) + "<em>" + cards.filter(function (c) { return c.tier === t.key; }).length + " 张</em></div>";
    }).join("");
    var redeem = '<div class="redeem"><b>兑换积分</b><p>输入兑换码，立刻获得对应积分（万分码一次到账 10000）。</p>' +
      '<div><input id="codeInput" placeholder="输入兑换码" aria-label="兑换码"/><button id="redeemBtn">兑换</button></div>' +
      (codeNotice ? '<small class="' + (codeNotice.indexOf("成功") >= 0 ? "success" : "error") + '">' + codeNotice + "</small>" : "") + "</div>";
    var side = '<aside class="panel sidebar"><p class="eyebrow">COLLECTION PROGRESS</p><strong>' + owned() + " <small>/ " + cards.length + " 张</small></strong>" +
      '<div class="progress"><i style="width:' + (cards.length ? owned() / cards.length * 100 : 0) + '%"></i></div>' +
      "<p>距保底还有 <b>" + Math.max(0, PITY - save.pity) + "</b> 抽</p>" + rows + redeem + "</aside>";
    return '<section class="content"><div class="home-grid">' + stage + side + "</div></section>" + (hint ? '<p style="text-align:center;color:var(--muted);margin-top:12px">' + hint + "</p>" : "");
  }

  function collectionHTML() {
    var flt = cards.filter(function (c) { return (filter === "ALL" || c.tier === filter) && (!ownedOnly || save.inventory[c.id]); });
    var grid = flt.map(function (c) {
      var it = save.inventory[c.id];
      return '<button class="collection-card ' + (it ? "unlocked" : "locked") + '" data-detail="' + c.id + '">' +
        '<img src="' + (it ? c.frontThumb : c.backThumb) + '" alt="' + (it ? c.name : "未解锁") + '" loading="lazy"/>' +
        (it ? "<span>×" + it.count + "</span>" : "") +
        "<b>" + (it ? c.name : "????") + "</b><em>" + (it ? (tierByKey[c.tier] ? tierByKey[c.tier].name : c.tier) : "卡背") + "</em></button>";
    }).join("");
    var filters = '<button class="' + (filter === "ALL" ? "selected" : "") + '" data-filter="ALL">全部</button>' +
      tiers.slice().reverse().map(function (t) { return '<button class="' + (filter === t.key ? "selected" : "") + '" data-filter="' + t.key + '">' + t.name + "</button>"; }).join("") +
      '<button class="' + (ownedOnly ? "selected" : "") + '" data-owned="1">仅已拥有</button>';
    return '<section class="content"><div class="section-head"><div><p class="eyebrow">COLLECTION</p><h1>我的图鉴 <small>' + owned() + "/" + cards.length + "</small></h1></div>" +
      '<div class="filters">' + filters + "</div></div><div class=\"collection-grid\">" + (grid || '<div class="empty">还没有卡牌。</div>') + "</div></section>";
  }

  function poolHTML() {
    var rules = tiers.slice().reverse().map(function (t) { return "<b>" + t.name + " " + t.prob + "%</b>"; }).join("");
    return '<section class="content"><p class="eyebrow">POOL DETAILS</p><h1>' + (CFG.siteName || "抽抽乐") + "卡池</h1>" +
      "<p>" + cards.length + " 张照片，所有稀有度先按概率决定，再在对应卡池中等概率抽取。</p>" +
      '<div class="pool-rules">' + rules + "</div><p>第 " + PITY + " 抽必得 " + (tierByKey[forceKey] ? tierByKey[forceKey].name : forceKey) +
      " 或更高；抽到该档及以上后重置保底。</p></section>";
  }

  function historyHTML() {
    if (!save.history.length) return '<section class="content"><div class="section-head"><div><p class="eyebrow">DRAW HISTORY</p><h1>抽卡记录</h1></div></div><div class="empty">还没有抽卡记录。第一张卡正在等你。</div></section>';
    var list = save.history.slice(0, 60).map(function (h) {
      var c = cardById(h.cardId);
      return "<article><img src=\"" + c.frontThumb + "\" alt=\"\"/><div><b>" + c.name + "</b><span>" +
        new Date(h.at).toLocaleString("zh-CN") + "</span></div><mark style=\"background:" + (tierByKey[c.tier] ? tierByKey[c.tier].color : "#999") + "\">" +
        (tierByKey[c.tier] ? tierByKey[c.tier].name : c.tier) + "</mark><em>" + (h.drawType === "single" ? "单抽" : "十连") + "</em></article>";
    }).join("");
    return '<section class="content"><div class="section-head"><div><p class="eyebrow">DRAW HISTORY</p><h1>抽卡记录</h1></div></div><div class="history-list">' + list + "</div></section>";
  }

  function pendingHTML() {
    var p = save.pending;
    if (p.index < p.newIds.length) {
      var cid = p.newIds[p.index], c = cardById(cid);
      var isBack = !p.revealed;
      return '<div class="modal"><div class="modal-box">' +
        "<p>" + (p.drawType === "ten" ? "新卡揭晓 " + (p.index + 1) + " / " + p.newIds.length : "新卡揭晓") + "</p>" +
        '<div class="flip-card"><img src="' + (isBack ? c.back : c.front) + '" alt="' + (isBack ? "卡背，点击翻开" : c.name) + '" data-reveal/></div>' +
        (p.revealed
          ? "<h2>" + c.name + "</h2><strong style=\"background:" + (tierByKey[c.tier] ? tierByKey[c.tier].color : "#999") + "\">" + (tierByKey[c.tier] ? tierByKey[c.tier].name : c.tier) + "</strong>" +
            (p.index < p.newIds.length - 1 ? '<button class="primary" data-next>查看下一张新卡</button>' : '<button class="primary" data-next>查看本次结果</button>')
          : "<span>点击卡牌翻开</span>") +
        "</div></div>";
    }
    var grid = p.results.map(function (id, idx) { return '<img src="' + cardById(id).frontThumb + '" alt="' + cardById(id).name + '"/>'; }).join("");
    return '<div class="modal"><div class="modal-box"><p>' + (p.drawType === "ten" ? "十连抽结果" : "单抽结果") + "</p>" +
      "<h2>" + (p.newIds.length ? "发现 " + p.newIds.length + " 张新卡" : "都是熟悉的卡片") + "</h2>" +
      '<div class="result-grid">' + grid + '</div><button class="primary" data-commit>收下全部卡牌</button></div></div>';
  }

  function detailHTML() {
    var c = detail;
    return '<div class="modal"><div class="detail-box"><button data-close>×</button>' +
      '<div class="detail-cards"><figure><img src="' + c.front + '" alt="' + c.name + ' 卡面"/><figcaption>卡面</figcaption></figure>' +
      '<figure><img src="' + c.back + '" alt="' + c.name + ' 卡背"/><figcaption>卡背</figcaption></figure></div>' +
      '<div class="detail-info"><p class="eyebrow">' + (tierByKey[c.tier] ? tierByKey[c.tier].name : c.tier) + "</p><h2>" + c.name + "</h2>" +
      "<b>持有 ×" + save.inventory[c.id].count + "</b><p>首次获得：" + new Date(save.inventory[c.id].firstObtainedAt).toLocaleString("zh-CN") + "</p></div></div></div>";
  }

  function render() {
    if (!hydrated) { document.getElementById("root").innerHTML = '<main class="loading">正在打开花园…</main>'; return; }
    var main;
    if (page === "home") main = homeHTML();
    else if (page === "collection") main = collectionHTML();
    else if (page === "pool") main = poolHTML();
    else if (page === "history") main = historyHTML();
    var html = '<main class="app-shell">' + headerHTML() + main + "</main>";
    if (save.pending) html += pendingHTML();
    if (detail) html += detailHTML();
    document.getElementById("root").innerHTML = html;
    bind();
  }

  function bind() {
    document.querySelectorAll("[data-nav]").forEach(function (b) { b.onclick = function () { page = b.getAttribute("data-nav"); detail = null; render(); }; });
    document.querySelectorAll("[data-draw]").forEach(function (b) { b.onclick = function () { hint = ""; beginDraw(b.getAttribute("data-draw")); }; });
    var ci = document.getElementById("codeInput");
    if (ci) { ci.value = codeInput; ci.oninput = function () { codeInput = ci.value; }; ci.onkeydown = function (e) { if (e.key === "Enter") redeem(); }; }
    var rb = document.getElementById("redeemBtn"); if (rb) rb.onclick = redeem;
    document.querySelectorAll("[data-filter]").forEach(function (b) { b.onclick = function () { filter = b.getAttribute("data-filter"); render(); }; });
    document.querySelectorAll("[data-owned]").forEach(function (b) { b.onclick = function () { ownedOnly = !ownedOnly; render(); }; });
    document.querySelectorAll("[data-detail]").forEach(function (b) { b.onclick = function () { var c = cardById(Number(b.getAttribute("data-detail"))); if (save.inventory[c.id]) detail = c; render(); }; });
    var rev = document.querySelector("[data-reveal]"); if (rev) rev.onclick = reveal;
    var nx = document.querySelector("[data-next]"); if (nx) nx.onclick = nextCard;
    var cm = document.querySelector("[data-commit]"); if (cm) cm.onclick = commit;
    var cl = document.querySelector("[data-close]"); if (cl) cl.onclick = function () { detail = null; render(); };
    if (save.pending) save.pending.newIds.forEach(function (id) { preload(cardById(id).back); preload(cardById(id).front); });
  }

  load();
  if (save.pending) save.pending.newIds.forEach(function (id) { preload(cardById(id).back); preload(cardById(id).front); });
  render();
})();
