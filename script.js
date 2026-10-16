/* =========================================================================
   可爱的道歉信 · 交互逻辑
   ========================================================================= */
(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  // iOS 微信 / 鸿蒙老内核可能没有 fetch，这里做一次特性探测（避免直接调用 null）
  var HAS_FETCH = (typeof window.fetch === "function");
  var HAS_BEACON = !!(navigator && typeof navigator.sendBeacon === "function");
  // IntersectionObserver 必须是函数，光判 "in" 在部分内核里会误判
  var HAS_IO = (typeof window.IntersectionObserver === "function");

  var LOVE_EMOJI = ["💗", "💕", "🌸", "✨", "🎀", "💖", "🌷", "🧸", "🍓", "☁️"];
  var state = { answer: null, unlocking: false, sent: false, sendFailed: false, lastSubmit: 0 };

  /* ---------------------------------------------------------------- 工具 */
  function show(screenId) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("is-active");
    var el = $(screenId);
    if (el) {
      el.classList.add("is-active");
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
    }
  }

  function safeText(s) { return String(s == null ? "" : s); }

  function nowString() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  /* ------------------------------------------------------- 背景飘浮小图标 */
  function spawnFloaties() {
    var box = $("floaties");
    if (!box) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    function spawn() {
      if (document.hidden || box.childElementCount > 22) return;
      var s = document.createElement("span");
      s.className = "floaty";
      s.textContent = LOVE_EMOJI[Math.floor(Math.random() * LOVE_EMOJI.length)];
      var size = 12 + Math.random() * 16;
      s.style.left = (Math.random() * 96) + "%";
      s.style.fontSize = size + "px";
      s.style.setProperty("--dx", (Math.random() * 70 - 35).toFixed(1) + "px");
      s.style.setProperty("--rot", (Math.random() * 90 - 45).toFixed(0) + "deg");
      var dur = 9 + Math.random() * 8;
      s.style.animationDuration = dur + "s";
      s.addEventListener("animationend", function () {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      box.appendChild(s);
    }
    for (var i = 0; i < 5; i++) setTimeout(spawn, i * 700);
    setInterval(spawn, 1300);
  }

  /* ------------------------------------------------------------ 背景音乐 */
  var bgm = null, audioReady = false, wantPlay = false, fadeTimer = null;

  function initAudio() {
    bgm = $("bgm");
    if (!bgm) return;
    if (CFG.music) {
      bgm.src = CFG.music;
      bgm.setAttribute("src", CFG.music);
    }
    bgm.loop = true;
    bgm.volume = 0;
    bgm.setAttribute("playsinline", "");
    bgm.setAttribute("webkit-playsinline", "");
    bgm.preload = "auto";
    bgm.addEventListener("canplay", function () { audioReady = true; });
    bgm.addEventListener("error", function () {
      setMusicBtn(false);
      musicBroken = true;
    });

    var btn = $("musicBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        if (bgm.paused) { wantPlay = true; playMusic(); }
        else { pauseMusic(); }
      });
    }
    setMusicBtn(false);
  }

  var musicBroken = false;

  function setMusicBtn(on) {
    var btn = $("musicBtn");
    if (!btn) return;
    btn.classList.toggle("is-on", !!on);
    btn.classList.toggle("is-off", !on);
    btn.setAttribute("aria-label", on ? "暂停音乐" : "播放音乐");
  }

  // 微信 iOS 必须用 WeixinJSBridgeReady 才能真正解锁音频
  function unlockAudio() {
    if (state.unlocking) return;
    state.unlocking = true;
    var raw = bgm;
    if (!raw) return;
    try {
      raw.volume = 0;
      var p = raw.play();
      if (p && p.then) {
        p.then(function () {
          raw.pause();
          raw.currentTime = 0;
          audioReady = true;
          state.unlocking = false;
        })["catch"](function () { state.unlocking = false; });
      } else {
        raw.pause();
        raw.currentTime = 0;
        state.unlocking = false;
      }
    } catch (e) { state.unlocking = false; }
  }

  function bindWeixinBridge() {
    function hook() { if (wantPlay) playMusic(); }
    if (window.WeixinJSBridge && window.WeixinJSBridge.invoke) {
      window.WeixinJSBridge.invoke("getNetworkType", {}, hook);
      return;
    }
    document.addEventListener("WeixinJSBridgeReady", hook, false);
    // 兜底：首次用户手势时再试一次
    var once = function () {
      if (wantPlay) playMusic();
      document.removeEventListener("touchstart", once, true);
      document.removeEventListener("click", once, true);
    };
    document.addEventListener("touchstart", once, true);
    document.addEventListener("click", once, true);
  }

  function playMusic() {
    if (!bgm) return;
    wantPlay = true;
    if (musicBroken) { setMusicBtn(false); return; }
    try {
      bgm.volume = 0;
      var p = bgm.play();
      if (p && p.then) {
        p.then(function () {
          setMusicBtn(true);
          fadeTo(CFG.musicVolume == null ? 0.55 : CFG.musicVolume, CFG.musicFadeInMs || 2000);
        })["catch"](function () {
          setMusicBtn(false);   // 被浏览器拦截，等下一次手势
        });
      } else {
        setMusicBtn(true);
        fadeTo(CFG.musicVolume == null ? 0.55 : CFG.musicVolume, CFG.musicFadeInMs || 2000);
      }
    } catch (e) { setMusicBtn(false); }
  }

  function pauseMusic() {
    if (!bgm) return;
    wantPlay = false;
    try { bgm.pause(); } catch (e) {}
    setMusicBtn(false);
  }

  function fadeTo(target, ms) {
    if (!bgm) return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    var start = bgm.volume;
    var t0 = Date.now();
    var step = 40;
    fadeTimer = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / Math.max(200, ms));
      var v = start + (target - start) * k;
      try { bgm.volume = Math.max(0, Math.min(1, v)); } catch (e) {}
      if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; }
    }, step);
  }

  // 切后台回来接着放（微信里很常见）
  function bindAudioResume() {
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && wantPlay && bgm && bgm.paused) playMusic();
    });
    window.addEventListener("pageshow", function () {
      if (wantPlay && bgm && bgm.paused) playMusic();
    });
    // 首次触摸也能补一次播放
    var once = function () {
      if (wantPlay && bgm && bgm.paused) playMusic();
    };
    document.addEventListener("touchstart", once, { passive: true });
    document.addEventListener("click", once);
  }

  /* ---------------------------------------------------------- 渲染封面/信 */
  function renderCover() {
    var c = CFG.cover || {};
    if (c.hint) $("coverHint").innerHTML = c.hint;
    if (c.title) $("coverTitle").innerHTML = c.title;
    if (c.sub) $("coverSub").innerHTML = c.sub;
    if (c.button) $("openBtn").querySelector("span").innerHTML = c.button;
    if (c.foot) $("coverFoot").innerHTML = c.foot;
  }

  function renderLetter() {
    var L = CFG.letter || {};
    $("letterTo").textContent = safeText(L.to || "");
    var dateEl = $("letterDate");
    if (L.date) { dateEl.textContent = safeText(L.date); } else { dateEl.style.display = "none"; }

    var body = $("letterBody");
    body.innerHTML = "";
    var paras = L.paragraphs || [];
    for (var i = 0; i < paras.length; i++) {
      var p = document.createElement("p");
      var txt = safeText(paras[i]);
      if (txt.trim() === "") { p.className = "blank"; }
      p.innerHTML = txt;
      p.classList.add("reveal", "pre");
      body.appendChild(p);
    }
    $("letterSign").innerHTML = safeText(L.sign || "");
  }

  // 信件段落逐条浮现（滚动到哪里，哪里亮起来）
  function setupReveal() {
    var items = document.querySelectorAll(".letter-body .reveal");
    if (!items.length) return;

    function revealAll() {
      for (var i = 0; i < items.length; i++) items[i].classList.add("show");
    }

    if (!HAS_IO) { revealAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("show");
          io.unobserve(en.target);
        }
      });
    }, { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

    for (var i = 0; i < items.length; i++) io.observe(items[i]);
    // 兜底：3 秒后无论如何都显示出来，绝不让内容看不见
    setTimeout(revealAll, 3000);
  }

  /* -------------------------------------------------------------- 提问 */
  function renderAsk() {
    var a = CFG.ask || {};
    if (a.emoji) $("askEmoji").textContent = a.emoji;
    if (a.title) $("askTitle").innerHTML = a.title;
    if (a.sub) $("askSub").innerHTML = a.sub;
    if (a.note) $("askNote").innerHTML = a.note;

    var opts = document.querySelectorAll(".option");
    for (var i = 0; i < opts.length; i++) {
      var v = opts[i].getAttribute("data-value");
      if (v === "好" && a.yes) opts[i].querySelector(".opt-text").innerHTML = a.yes;
      if (v === "不好" && a.no) opts[i].querySelector(".opt-text").innerHTML = a.no;
      (function (btn) {
        btn.addEventListener("click", function () { onChoose(btn, btn.getAttribute("data-value"), btn.querySelector(".opt-text").textContent); });
      })(opts[i]);
    }

    $("pleadBack").addEventListener("click", closePlead);
    // 提问页可以回看信件（她可能想再读一遍再决定）
    var backLink = $("backToLetter");
    if (backLink) {
      backLink.addEventListener("click", function () {
        show("screen-letter");
        watchLetterEnd();   // 重新武装"到底自动跳转"，这样重读后还能回到问题页
      });
    }
    $("pleadKeep").addEventListener("click", function () {
      closePlead();
      var answer = state.answer || "不好";
      // 她坚持选「不好」——这也是最终选择，必须回传给你
      sendAnswer(answer, noLabel());
      finish(answer);
    });
    $("againBtn").addEventListener("click", function () {
      state.sent = false;
      $("resultFoot").textContent = "";
      show("screen-ask");
    });
  }

  function onChoose(btn, key, label) {
    var opts = document.querySelectorAll(".option");
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute("aria-checked", opts[i] === btn ? "true" : "false");
      opts[i].classList.remove("is-picked");
    }
    btn.classList.add("is-picked");

    if (key === "不好") {
      state.answer = "不好";
      setTimeout(function () { openPlead(); }, 220);
      return;
    }
    state.answer = "好";
    sendAnswer("好", label);
    setTimeout(function () { finish("好"); }, 420);
  }

  // 取配置里的「不好」文案（回传消息里用它，而不是写死的字）
  function noLabel() {
    var a = CFG.ask || {};
    return safeText(a.no || "不好");
  }

  /* --------------------------------------------------- 选「不好」的挽留 */
  var pleadIdx = 0;
  function openPlead() {
    var list = CFG.plead || ["真的不再考虑一下下吗……"];
    $("pleadText").textContent = list[pleadIdx % list.length];
    pleadIdx++;
    $("pleadEmoji").textContent = LOVE_EMOJI[Math.floor(Math.random() * 4)] === "💗" ? "🥺" : "🥺";
    $("pleadMask").classList.add("is-open");
  }
  function closePlead() { $("pleadMask").classList.remove("is-open"); }

  /* ------------------------------------------------------------- 结果页 */
  // config 里的键是英文 yes / no，这里做一次映射（别再直接用中文当键查了）
  var RESULT_KEY = { "好": "yes", "不好": "no" };

  function finish(answer) {
    var R = (CFG.result || {})[RESULT_KEY[answer] || "no"] || {};
    $("resultEmoji").textContent = R.emoji || (answer === "好" ? "🥰" : "🥺");
    $("resultTitle").innerHTML = R.title || "";
    $("resultText").innerHTML = R.text || "";
    $("resultHeart").textContent = answer === "好" ? "💗 💗 💗" : "🤍";

    // 底部这一行可能是"已经告诉你啦"，也可能是"回传失败请截图"，
    // 只在这里写一次基线文案；之后 markOk / markFail 只做追加，不覆盖
    $("resultFoot").innerHTML = R.foot || "";
    if (state.sendFailed) appendFoot("<br>（网速有点慢，麻烦你把这个页面截图发给我，我怕我没收到）");
    else if (state.sent) appendFoot("<br>（已经告诉你啦）");

    show("screen-result");
    if (answer === "好") burstConfetti();
  }

  // 往结果页底部追加一行（真实 DOM 与测试桩都安全）
  function appendFoot(html) {
    if (!html) return;
    var f = $("resultFoot");
    if (!f) return;
    if (typeof f.appendHTML === "function") f.appendHTML(html);
    else f.innerHTML = (f.innerHTML || "") + html;
  }

  function screens_showsResult() {
    var el = $("screen-result");
    return !!(el && el.classList && el.classList.contains("is-active"));
  }

  function burstConfetti() {
    var box = $("confetti");
    if (!box) return;
    var items = ["🌸", "💗", "✨", "🎀", "💕", "🌟", "🍓"];
    for (var i = 0; i < 26; i++) {
      (function (i) {
        setTimeout(function () {
          var s = document.createElement("i");
          s.textContent = items[Math.floor(Math.random() * items.length)];
          s.style.left = (Math.random() * 96) + "%";
          s.style.fontSize = (11 + Math.random() * 12) + "px";
          s.style.animationDuration = (1.8 + Math.random() * 1.6) + "s";
          box.appendChild(s);
          setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 3800);
        }, i * 70);
      })(i);
    }
  }

  /* ------------------------------------- 把她的选择回传给你（企业微信 / Server酱） */
  function buildMessage(answer, label) {
    var N = CFG.notify || {};
    var lines = [];
    lines.push("【" + safeText(N.title || "道歉信 · 新回复") + "】");
    lines.push("回复人：" + safeText(N.from || "她"));
    lines.push("她的选择：" + safeText(answer));
    lines.push("时间：" + nowString());
    try {
      var ua = navigator.userAgent || "";
      var dev = /iPhone|iPad|iPod/i.test(ua) ? "iPhone/iPad"
              : /HarmonyOS|HUAWEI|HONOR/i.test(ua) ? "华为设备"
              : /Android/i.test(ua) ? "Android" : "其他设备";
      var inWx = /MicroMessenger/i.test(ua) ? "微信内" : "浏览器";
      lines.push("设备：" + dev + " · " + inWx);
    } catch (e) {}
    return lines.join("\n");
  }

  function sendAnswer(answer, label) {
    if (state.sent) return;
    var now = Date.now();
    // state.lastSubmit 为 0 表示"这是第一次"，不要被冷却误伤
    if (state.lastSubmit && (now - state.lastSubmit) < (CFG.submitCooldownMs || 3000)) return;
    state.lastSubmit = now;

    var wecomUrl = safeText(CFG.wecomWebhook).trim();
    var scKey = safeText(CFG.serverchanKey).trim();
    if (!wecomUrl && !scKey) {
      // 两种回传方式都没配：只在本机留个记录
      try { localStorage.setItem("apology_last_answer", nowString() + " " + answer); } catch (e) {}
      return;
    }

    state.sent = true;
    state.sendFailed = false;

    function markOk() {
      state.sent = true;
      state.sendFailed = false;
      var note = $("askNote");
      if (note) note.textContent = "已经告诉你啦 ✓";
      // 结果页已经显示出来的话，补上"已送达"
      if (screens_showsResult()) appendFoot("<br>（已经告诉你啦）");
    }
    function markFail() {
      // 回传失败：必须让她知道要截图，否则她会以为你已经收到了
      state.sent = false;
      state.sendFailed = true;
      var note = $("askNote");
      if (note) note.textContent = "网络不太顺，截图发我也行～";
      if (screens_showsResult()) appendFoot("<br>（网速有点慢，麻烦你把这个页面截图发给我，我怕我没收到）");
    }

    /* ---- 方式一：企业微信群机器人 ---- */
    if (wecomUrl) {
      var payload = { msgtype: "text", text: { content: buildMessage(answer, label) } };
      try {
        if (HAS_FETCH) {
          window.fetch(wecomUrl, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }).then(function (r) {
            if (r && r.ok) markOk(); else markFail();
          })["catch"](function () { markFail(); });
        } else if (HAS_BEACON) {
          // 老内核兜底：sendBeacon 不受跨域 CORS 限制
          var ok = navigator.sendBeacon(wecomUrl, new Blob([JSON.stringify(payload)], { type: "application/json" }));
          if (ok) markOk(); else markFail();
        } else {
          markFail();
        }
      } catch (e) { markFail(); }
      return;
    }

    /* ---- 方式二：Server酱（推到个人微信，无需企业微信） ---- */
    if (scKey) {
      var N = CFG.notify || {};
      var scTitle = safeText(N.title || "道歉信 · 新回复") + "：" + safeText(answer);
      var scDesp = buildMessage(answer, label);
      var scUrl = "https://sctapi.ftqq.com/" + scKey + ".send?title=" + encodeURIComponent(scTitle) +
                  "&desp=" + encodeURIComponent(scDesp);
      try {
        if (HAS_FETCH) {
          // no-cors：绕开跨域拦截（Server酱是给服务器调用的接口，浏览器拿不到回执，所以乐观标记成功）
          window.fetch(scUrl, { method: "GET", mode: "no-cors" })
            .then(function () { markOk(); })
            ["catch"](function () { markFail(); });
        } else {
          // 极老内核：用 <img> 触发一次 GET（图片请求不受 CORS 限制）
          try {
            var im = new Image();
            im.src = scUrl;
            markOk();
          } catch (e) { markFail(); }
        }
      } catch (e) { markFail(); }
      return;
    }
  }

  /* ---------------------------------------------------------------- 启动 */
  function boot() {
    renderCover();
    renderLetter();
    renderAsk();
    initAudio();
    bindWeixinBridge();
    bindAudioResume();
    spawnFloaties();

    $("openBtn").addEventListener("click", function () {
      wantPlay = true;
      playMusic();
      show("screen-letter");
      setTimeout(setupReveal, 80);
      // 进信件后滚到底部自动出现提问
      watchLetterEnd();
    });

    // 「去回答」按钮：读完信后手动进入提问页（重读后也能靠它回来）
    var goAskBtn = $("goAsk");
    if (goAskBtn) {
      goAskBtn.addEventListener("click", function () {
        if (endDwellTimer) { clearTimeout(endDwellTimer); endDwellTimer = null; }
        show("screen-ask");
      });
    }
  }

  // 滚到信末：停留一小会儿再自动切到提问页（慢一点，别打断阅读）
  // 中途滚走就取消；也可以随时点「去回答」按钮手动进入
  var endDwellTimer = null;
  var endObserver = null;
  var END_DWELL_MS = 2600;

  function watchLetterEnd() {
    if (endObserver) { endObserver.disconnect(); endObserver = null; }
    if (endDwellTimer) { clearTimeout(endDwellTimer); endDwellTimer = null; }
    var cue = $("scrollCue");
    if (!cue || !HAS_IO) return;   // 老内核没有 IntersectionObserver，就靠「去回答」按钮

    endObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          // 到了底部：停留 END_DWELL_MS 再跳，期间滚走就取消
          if (!endDwellTimer) {
            endDwellTimer = setTimeout(function () {
              endDwellTimer = null;
              show("screen-ask");
            }, END_DWELL_MS);
          }
        } else {
          if (endDwellTimer) { clearTimeout(endDwellTimer); endDwellTimer = null; }
        }
      });
    }, { threshold: 0.6 });
    endObserver.observe(cue);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

  // 调试用（也方便自动化测试检查内部状态）
  window.__APOLOGY__ = {
    state: state,
    resetCooldown: function () { state.lastSubmit = 0; },
    config: CFG
  };
})();
