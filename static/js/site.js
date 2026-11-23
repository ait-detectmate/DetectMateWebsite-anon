// Progressive enhancement only: every page is complete without this file.

// Animations: the HTML holds the final state and these only animate it. Reduced
// motion leaves it still; looping animations pause off screen and in a hidden tab.
// Looping animations are written at a brisk pace and run SLOW times slower (slow(ms)),
// so a loop can be written at full speed and slowed in one place; the one-time intro is not slowed.
var motion = (function () {
  var root = document.documentElement;
  var SLOW = 1.6;   // keep --home-slow in site.css equal
  function slow(ms) { return ms * SLOW; }

  // ms until the CSS failsafe (dm-failsafe in site.css) shows the intro's targets anyway;
  // the page's age stands in where the failsafe's clock can't be read
  function failsafeLeft() {
    var a = document.getAnimations && document.getAnimations().filter(function (x) {
      return x.animationName === "dm-failsafe";
    })[0];
    return 3000 - (a && a.currentTime != null ? a.currentTime : performance.now());
  }

  // a script this late would hide the page the failsafe is about to show, and replay it
  var intro = root.classList.contains("is-intro") && failsafeLeft() > 800;
  if (!intro) root.classList.remove("is-intro");

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // cb(true) while el is on screen and the tab is visible, cb(false) when not.
  // Returns a function that stops watching.
  function watch(el, cb) {
    var seen = false, on = null;
    function update() {
      var now = seen && !document.hidden;
      if (now !== on) { on = now; cb(now); }
    }
    if (!("IntersectionObserver" in window)) { seen = true; update(); return function () {}; }
    var io = new IntersectionObserver(function (entries) {
      seen = entries[entries.length - 1].isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return function () {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }

  function play(node, keyframes, opts) {
    var o = { fill: "backwards", easing: "cubic-bezier(.2,.8,.2,1)" };
    for (var k in opts) o[k] = opts[k];
    return node.animate(keyframes, o);
  }

  function rise(node, delay, duration) {
    return play(node, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
                { delay: delay, duration: duration || 420 });
  }

  // Reveals node left to right behind an edge cut at 45 degrees, as in the logo's D.
  function wipe(node, w, h, delay, duration) {
    return play(node, [
      { clipPath: "polygon(0px 0px, " + -h + "px 0px, 0px " + h + "px, 0px " + h + "px)" },
      { clipPath: "polygon(0px 0px, " + w + "px 0px, " + (w + h) + "px " + h + "px, 0px " + h + "px)" }
    ], { delay: delay, duration: duration, easing: "cubic-bezier(.65,0,.25,1)" });
  }

  return { reduced: reduced, intro: intro, failsafeLeft: failsafeLeft, watch: watch, play: play, rise: rise, wipe: wipe,
           SLOW: SLOW, slow: slow };
})();

// Docs and GitHub in the header are <details> menus: they open and close without JS.
// Here, opening one closes the other, and a press outside, Tab out of it or Escape closes them.
(function () {
  var menus = [].slice.call(document.querySelectorAll("details.menu"));
  if (!menus.length) return;

  menus.forEach(function (m) {
    m.addEventListener("toggle", function () {
      if (m.open) menus.forEach(function (o) { if (o !== m) o.open = false; });
    });
    // focus moving to somewhere else on the page; null is the window losing focus: leave it open
    m.addEventListener("focusout", function (e) {
      if (m.open && e.relatedTarget && !m.contains(e.relatedTarget)) m.open = false;
    });
  });
  // pointerdown, not click: iOS Safari sends no click to the document for a tap on plain content
  document.addEventListener("pointerdown", function (e) {
    menus.forEach(function (m) { if (m.open && !m.contains(e.target)) m.open = false; });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    menus.forEach(function (m) {
      if (!m.open) return;
      var inside = m.contains(document.activeElement);
      m.open = false;
      if (inside) m.querySelector("summary").focus();
    });
  });
})();

// Home intro, once per tab session: the two halves of the mark come together, the
// wordmark and the headline are wiped in, the eyebrow types itself. Ends with the
// event dm:hero-done, when the buttons start to rise. Then the pipeline cards draw
// in (dm:pipeline-drawn starts the flow) and the points rise.
(function () {
  var root = document.documentElement;
  var h1 = document.querySelector(".hero h1");
  if (!motion.intro) return;
  if (motion.reduced() || !h1 || !root.animate) { root.classList.remove("is-intro"); return; }

  var text = h1.textContent.trim();
  var anims = [], sent = false, doneTimer = null, resizeTimer = null, width = window.innerWidth;
  var pending = 1, drawn = false, waits = [];   // pending: the hero, then each group until it has played
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function heroDone() {
    if (sent) return;
    sent = true;
    clearTimeout(doneTimer);
    document.dispatchEvent(new CustomEvent("dm:hero-done"));
  }

  // One span per rendered line, so each line can be wiped on its own.
  function splitLines() {
    h1.textContent = "";
    var words = text.split(/\s+/).map(function (word, i) {
      if (i) h1.appendChild(document.createTextNode(" "));
      var span = document.createElement("span");
      span.textContent = word;
      h1.appendChild(span);
      return span;
    });
    var lines = [], top = null;
    words.forEach(function (span) {
      if (span.offsetTop !== top) { lines.push([]); top = span.offsetTop; }
      lines[lines.length - 1].push(span.textContent);
    });
    h1.setAttribute("aria-label", text);
    h1.textContent = "";
    return lines.map(function (line) {
      var ln = document.createElement("span"), txt = document.createElement("span");
      ln.className = "ln";
      ln.setAttribute("aria-hidden", "true");
      txt.className = "ln__txt";
      txt.textContent = line.join(" ");
      ln.appendChild(txt);
      ln.appendChild(document.createElement("i")).className = "ln__blade";
      h1.appendChild(ln);
      return ln;
    });
  }

  function restore() {
    if (!h1.hasAttribute("aria-label")) return;
    h1.textContent = text;
    h1.removeAttribute("aria-label");
  }

  function pipelineDrawn() {
    if (drawn) return;
    drawn = true;
    var pipeline = document.querySelector(".pipeline");
    if (pipeline) pipeline.dispatchEvent(new CustomEvent("dm:pipeline-drawn", { bubbles: true }));
  }

  // Jumps to the end: everything shown, the headline whole, the code and the flow started.
  function finish() {
    waits.forEach(function (io) { io.disconnect(); });
    anims.forEach(function (a) { a.finish(); });
    all(".stage__draw").forEach(function (d) { d.remove(); });
    all(".is-waiting").forEach(function (e) { e.classList.remove("is-waiting"); });
    restore();
    root.classList.remove("is-intro");
    heroDone();
    pipelineDrawn();
    window.removeEventListener("resize", onResize);
  }

  // A width change mid-intro would leave the split headline and the drawn borders
  // wrong: jump to the end, and show the groups still waiting below the fold.
  function onResize() {
    if (window.innerWidth === width) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(finish, 150);
  }

  // Stops listening for resizes once the hero and both groups have played.
  function settle(list) {
    Promise.all(list.map(function (a) { return a.finished; })).then(function () {
      if (--pending === 0) window.removeEventListener("resize", onResize);
    }, function () {});
  }

  // A group in view plays from base: in view means reaching into the top three quarters
  // of the window, or whole on screen (in a window too tall for its top to get that high).
  // One below the fold hides its items and plays from 0 when it first comes into view.
  function group(el, items, base, play) {
    if (!el || !items.length) return;
    pending++;
    var r = el.getBoundingClientRect(), h = window.innerHeight, done = false, ios;
    if ((r.top < h * 0.75 && r.bottom > 0) || (r.top >= 0 && r.bottom <= h) || !("IntersectionObserver" in window)) {
      settle(play(base));
      return;
    }
    items.forEach(function (e) { e.classList.add("is-waiting"); });
    ios = [[{ rootMargin: "0px 0px -25% 0px" }, 0], [{ threshold: 0.99 }, 0.99]].map(function (o) {
      var io = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        if (done || !e.isIntersecting || e.intersectionRatio < o[1]) return;
        done = true;
        ios.forEach(function (x) { x.disconnect(); });
        items.forEach(function (it) { it.classList.remove("is-waiting"); });
        settle(play(0));
      }, o[0]);
      io.observe(el);
      waits.push(io);
      return io;
    });
  }

  // Each card draws its border (an overlay, removed when drawn), then fills in; the sink
  // only fades in. The chevrons slide in; after the last card the rail fades in.
  function drawCards(base) {
    var list = [], stages = all(".pipeline .stage"), n = stages.length, NS = "http://www.w3.org/2000/svg";
    var phone = window.matchMedia("(max-width: 600px)").matches;
    var pseudo = window.KeyframeEffect && "pseudoElement" in KeyframeEffect.prototype;
    function add(a) { list.push(a); anims.push(a); return a; }
    stages.forEach(function (stage, i) {
      var d = base + i * 190, box = stage.querySelector(".stage__box"), inner = stage.querySelector(".stage__inner");
      if (stage.classList.contains("stage--sink")) {
        add(motion.play(box, [{ opacity: 0 }, { opacity: 1 }], { delay: d, duration: 600 }));
      } else {
        var w = box.offsetWidth, h = box.offsetHeight, c = 12;
        var stroke = window.getComputedStyle(box).backgroundColor, fill = window.getComputedStyle(inner).backgroundColor;
        var svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
        svg.setAttribute("class", "stage__draw");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        path.setAttribute("d", "M1 1H" + (w - c) + "L" + (w - 1) + " " + (c - 1) + "V" + (h - c + 1) +
                               "L" + (w - c) + " " + (h - 1) + "H1Z");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", "2");
        svg.appendChild(path);
        stage.appendChild(svg);
        var len = path.getTotalLength();
        path.style.strokeDasharray = len + "px";
        add(motion.play(path, [{ strokeDashoffset: len + "px" }, { strokeDashoffset: "0px" }],
                        { delay: d, duration: 760, easing: "cubic-bezier(.55,0,.25,1)" })).onfinish = function () { svg.remove(); };
        add(motion.play(box, [{ backgroundColor: "transparent" }, { backgroundColor: stroke }], { delay: d + 700, duration: 120 }));
        add(motion.play(inner, [{ backgroundColor: "transparent" }, { backgroundColor: fill }], { delay: d + 500, duration: 500 }));
        Array.prototype.forEach.call(inner.children, function (e) { add(motion.rise(e, d + 380, 460)); });
      }
      if (pseudo && !phone && i < n - 1) {
        add(motion.play(stage, [{ opacity: 0, translate: "-12px 0" }, { opacity: 1, translate: "0 0" }],
                        { pseudoElement: "::after", delay: d + 620, duration: 420 }));
      }
    });
    // the rail, its stops and, on phones, the rail segments drawn by each card's ::after
    var at = base + (n - 1) * 190 + 760, fade = [{ opacity: 0 }, { opacity: 1 }];
    all(".flow__rail, .stage__stop").forEach(function (e) { add(motion.play(e, fade, { delay: at, duration: 400 })); });
    if (pseudo && phone) stages.forEach(function (stage) {
      add(motion.play(stage, fade, { pseudoElement: "::after", delay: at, duration: 400 }));
    });
    Promise.all(list.map(function (a) { return a.finished; })).then(pipelineDrawn, function () {});
    return list;
  }

  function risePoints(base) {
    return all(".points li").map(function (li, i) {
      var a = motion.rise(li, base + i * 120, 480);
      anims.push(a);
      return a;
    });
  }

  function start() {
    try { sessionStorage.setItem("dm-intro", "1"); } catch (e) {}
    if (motion.failsafeLeft() <= 0) { finish(); return; }   // the page is already shown: no replay
    var q = function (sel) { return document.querySelector(sel); };
    var bounce = "cubic-bezier(.3,1.35,.5,1)";
    var blue = q(".brand__blue"), grey = q(".brand__grey"), mark = q(".brand svg"), word = q(".brand img");
    var eyebrow = q(".hero .eyebrow");

    if (blue) anims.push(motion.play(blue, [{ transform: "translateX(-150px)", opacity: 0 }, { transform: "none", opacity: 1 }],
                                     { delay: 80, duration: 640, easing: bounce }));
    if (grey) anims.push(motion.play(grey, [{ transform: "translateX(150px)", opacity: 0 }, { transform: "none", opacity: 1 }],
                                     { delay: 200, duration: 640, easing: bounce }));
    if (mark) anims.push(motion.play(mark, [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
                                     { delay: 800, duration: 260, easing: "ease-out" }));
    if (word) anims.push(motion.wipe(word, word.offsetWidth, word.offsetHeight, 820, 560));
    all(".site-nav > *").forEach(function (n, i) { anims.push(motion.rise(n, 900 + i * 70, 380)); });

    // monospace, so a stepped clip reveals one character per step, in a second at most. On two
    // lines (a phone) the clip would reveal both at once, so there it rises instead.
    if (eyebrow) {
      var n = eyebrow.textContent.length, range = document.createRange();
      range.selectNodeContents(eyebrow);
      if (range.getClientRects().length > 1) anims.push(motion.rise(eyebrow, 1050, 420));
      else anims.push(motion.play(eyebrow, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }],
                                  { delay: 1050, duration: Math.min(n * 26, 1000), easing: "steps(" + n + ")" }));
    }

    // the headline: one wipe per line, with a brand-blue blade on its leading edge
    var lines = splitLines(), last = null;
    lines.forEach(function (ln, i) {
      var txt = ln.firstChild, blade = ln.lastChild, bw = 7;
      var w = txt.offsetWidth, h = txt.offsetHeight, delay = 1350 + i * 130;
      anims.push(motion.wipe(txt, w, h, delay, 640));
      blade.style.cssText = "width:" + (h + bw) + "px;height:" + h + "px;top:" + txt.offsetTop + "px;left:" +
        txt.offsetLeft + "px;clip-path:polygon(0 0," + bw + "px 0," + (h + bw) + "px " + h + "px," + h + "px " + h + "px)";
      last = motion.play(blade, [
        { transform: "translateX(" + (-h - bw) + "px)", opacity: 0 },
        { opacity: 1, offset: 0.06 },
        { transform: "translateX(" + (w - bw) + "px)", opacity: 1, offset: 0.9 },
        { transform: "translateX(" + (w - bw) + "px)", opacity: 0 }
      ], { delay: delay, duration: 800, fill: "both", easing: "cubic-bezier(.65,0,.25,1)" });
      anims.push(last);
    });
    if (last) last.onfinish = restore;

    var after = 1350 + lines.length * 130 + 380;
    all(".hero .actions > *").forEach(function (a, i) { anims.push(motion.rise(a, after + i * 90)); });
    doneTimer = setTimeout(heroDone, after);

    window.addEventListener("resize", onResize);
    settle(anims.slice());
    group(q(".pipeline"), all(".pipeline .stage, .flow__rail"), after + 350, drawCards);
    group(q(".points"), all(".points li"), after + 1300, risePoints);
    root.classList.remove("is-intro");
  }

  // An error mid-intro must not leave anything hidden or the code panel blank.
  function run() {
    try { start(); } catch (e) { finish(); throw e; }
  }

  // The lines are split by measuring the headline, so wait for its web font (a second
  // at most, and never into the failsafe: past that, start with whatever font is there).
  var cs = window.getComputedStyle(h1), font, cap = Math.max(0, Math.min(1000, motion.failsafeLeft() - 500));
  try { font = document.fonts.load(cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily, text); }
  catch (e) { font = Promise.resolve(); }
  Promise.race([font, new Promise(function (r) { setTimeout(r, cap); })]).then(run, run);
})();

// Home code panels, Library and Service (the switch above them is CSS only). A panel is
// active while it is on screen, in a visible tab and its radio is checked, and pauses
// otherwise. Library: after the intro pipeline.py types itself; then audit lines stream
// in under it and get parsed, and when NewValueDetector fires, the alert prints under
// stdout. On later loads the stream goes on from the still frame in the HTML. Service: the
// first time it is active detector.yaml types itself, the service starts in the terminal,
// and access-log lines stream in the same way, the alerts going to output.log.
(function () {
  var lib = document.querySelector(".code--library"), svc = document.querySelector(".code--service");
  if (!lib || !lib.animate || motion.reduced()) return;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function enter(node) {
    motion.play(node, [{ maxHeight: 0, opacity: 0, transform: "translateY(8px)" },
                       { maxHeight: "2em", opacity: 1, transform: "none" }], { duration: motion.slow(380) });
  }
  function flash(line, color, ms) {
    if (line) motion.play(line, [{ backgroundColor: color }, { backgroundColor: "rgba(0,0,0,0)" }],
                          { duration: motion.slow(ms), easing: "ease-out" });
  }
  // a node's text nodes, blanked, for type() to fill back in; skip(node) keeps one as it is
  function blank(root, skip) {
    var nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!skip || !skip(walker.currentNode)) nodes.push({ node: walker.currentNode, full: walker.currentNode.data });
    }
    nodes.forEach(function (n) { n.node.data = ""; });
    return nodes;
  }

  // cfg: radio (its input), normal and anom (lists of event makers), event (the code line
  // that flashes blue on each event), fire (the lines that flash amber on an alert; the
  // first at once, the rest as the alert prints), alert(ev) (the printed alert element),
  // start ("intro": types after the intro, else streams from the still frame; "shown":
  // blank until first active, then types), term (log lines shown before the terminal's
  // last one, or null). An event is { id?, flag?, segs }: segs are [text, is a value,
  // field], and flag names the field that fires.
  function codePanel(fig, cfg) {
    var code = fig.querySelector("pre code"), lines = fig.querySelector(".code__lines");
    var stdout = fig.querySelector(".code__stdout"), status = fig.querySelector(".code__status");
    if (!code || !lines || !stdout || !status) return;

    // one block per line, so a line can flash
    code.innerHTML = code.innerHTML.split("\n").map(function (l) {
      return '<span class="cl">' + l + "</span>";
    }).join("");
    var cls = Array.prototype.slice.call(code.children);
    function lineWith(text) {
      return cls.filter(function (l) { return l.textContent.indexOf(text) >= 0; })[0];
    }
    var lEvent = lineWith(cfg.event), lFire = cfg.fire.map(lineWith);

    // running: the stream has started; until then wake() (if set) starts or resumes typing.
    // Every path to feed() clears the timer first, so there is never a second feed loop.
    // A pause keeps the time left to the next line (left), so switching back adds none.
    var seen = false, on = false, running = false, wake = null, timer = 0, due = 0, left = 0;
    function later(ms) {
      due = Date.now() + ms;
      timer = setTimeout(feed, ms);
    }
    function update() {
      var now = seen && (!cfg.radio || cfg.radio.checked);
      if (now === on) return;
      on = now;
      if (running) {
        status.classList.toggle("is-running", on);
        clearTimeout(timer);
        if (on) later(left);
        else left = Math.max(0, due - Date.now());
      } else if (on && wake) wake();
    }
    motion.watch(fig, function (v) { seen = v; update(); });
    if (cfg.radio) Array.prototype.forEach.call(document.getElementsByName(cfg.radio.name), function (r) {
      r.addEventListener("change", update);
    });

    function addLine(ev) {
      var row = make("div", "code__line"), txt = make("span", "code__txt");
      if (ev.id) row.appendChild(make("span", "code__id", ev.id));
      ev.segs.forEach(function (s) {
        txt.appendChild(s[1] ? make("span", s[2] && s[2] === ev.flag ? "v v--flag" : "v", s[0])
                             : document.createTextNode(s[0]));
      });
      row.appendChild(txt);
      lines.appendChild(row);
      enter(row);
      while (lines.children.length > 6) lines.removeChild(lines.firstElementChild);
      return row;
    }

    var since = 1;   // events since the last alert; the still frame's came one line ago
    function feed() {
      since += 1;
      var anomaly = (since > 4 && Math.random() < 0.18) || since > 9;
      var ev = anomaly ? pick(cfg.anom)() : pick(cfg.normal)();
      if (anomaly) since = 0;
      var row = addLine(ev);
      flash(lEvent, "rgba(169,180,240,.22)", 520);
      setTimeout(function () { row.classList.add("is-parsed"); }, motion.slow(240));
      setTimeout(function () { row.classList.add("is-old"); }, motion.slow(anomaly ? 3600 : 1500));
      if (anomaly) setTimeout(function () {
        row.classList.add("is-fired");
        flash(lFire[0], "rgba(200,112,10,.30)", 1100);
        setTimeout(function () {
          lFire.slice(1).forEach(function (l) { flash(l, "rgba(200,112,10,.42)", 1300); });
          var alert = cfg.alert(ev);
          stdout.appendChild(alert);
          motion.rise(alert, 0, motion.slow(380));
          while (stdout.children.length > 2) stdout.removeChild(stdout.firstElementChild);
        }, motion.slow(260));
      }, motion.slow(620));
      later(motion.slow(anomaly ? rand(1300, 1600) : rand(480, 820)));
    }

    function stream() {
      running = true;
      wake = null;
      status.hidden = false;
      status.lastChild.textContent = "running";
      status.classList.toggle("is-running", on);
      clearTimeout(timer);
      if (on) feed();
    }

    // 3 characters a frame at the brisk pace (about 1.9 at SLOW 1.6), a run of spaces as one, with a
    // caret after the last one. It runs while the panel is active and goes on where it
    // stopped; then done().
    function type(nodes, at, done) {
      var caret = make("span", "code__caret"), ni = 0, ci = 0, idle = true, carry = 0;
      status.hidden = false;
      at.appendChild(caret);
      wake = function () { if (idle) { idle = false; requestAnimationFrame(step); } };
      function step() {
        if (!on) { idle = true; return; }
        carry += 3 / motion.SLOW;
        var budget = Math.floor(carry);
        carry -= budget;
        while (budget > 0 && ni < nodes.length) {
          var n = nodes[ni];
          if (ci >= n.full.length) { ni += 1; ci = 0; continue; }
          var next = ci + 1;
          if (n.full[ci] === " ") while (next < n.full.length && n.full[next] === " ") next += 1;
          ci = next;
          n.node.data = n.full.slice(0, ci);
          n.node.parentNode.insertBefore(caret, n.node.nextSibling);
          budget -= 1;
        }
        if (ni < nodes.length) { requestAnimationFrame(step); return; }
        wake = null;
        caret.parentNode.removeChild(caret);
        done();
      }
      if (on) wake();
    }

    // blank the code (keeping its typed width, so no scrollbar comes and goes) and the panes
    function blankAll() {
      var nodes = blank(code);
      var longest = Math.max.apply(null, cls.map(function (l) { return l.textContent.length; }));
      code.style.minWidth = "calc(" + longest + "ch + 40px)";
      lines.textContent = "";
      stdout.textContent = "";
      return nodes;
    }

    if (cfg.start === "intro") {
      if (!motion.intro) { stream(); return; }
      // the intro: blank while is-intro still hides the panel, type once the hero is done
      var codeNodes = blankAll();
      document.addEventListener("dm:hero-done", function () {
        type(codeNodes, cls[0], function () { code.style.minWidth = ""; setTimeout(stream, motion.slow(500)); });
      }, { once: true });
      return;
    }

    // "shown": blank now; the first time the panel is active (and stays so for a beat, so
    // a panel only passed on the way down doesn't start), type the code, then the command,
    // then the log lines, then stream
    var tl = fig.querySelectorAll(".code__tline"), cmd = tl[0], log = tl[tl.length - 1];
    var nodes = blankAll();
    var cmdNodes = cmd ? blank(cmd, function (n) { return n.parentNode.classList.contains("c"); }) : [];
    var logLine = log && log !== cmd ? log.innerHTML : null;
    if (logLine != null) log.textContent = "";
    function say(line) {   // a log line: its level in .k, then the message
      var sp = line.indexOf(" ");
      log.textContent = "";
      log.appendChild(make("span", "k", line.slice(0, sp)));
      log.appendChild(document.createTextNode(line.slice(sp)));
    }
    function startUp() {
      var queue = logLine == null ? [] : (cfg.term || []).slice();
      status.lastChild.textContent = "starting…";
      (function next() {
        if (queue.length) { say(queue.shift()); setTimeout(next, motion.slow(600)); return; }
        if (logLine != null) log.innerHTML = logLine;
        setTimeout(stream, motion.slow(400));
      })();
    }
    var startTimer = 0;
    wake = function () {
      clearTimeout(startTimer);
      startTimer = setTimeout(function () {
        if (!on) return;
        type(nodes, cls[0], function () {
          code.style.minWidth = "";
          setTimeout(function () {
            if (!cmdNodes.length) { startUp(); return; }
            type(cmdNodes, cmd, function () { setTimeout(startUp, motion.slow(300)); });
          }, motion.slow(400));
        });
      }, motion.slow(400));
    };
    if (on) wake();
  }

  // Library: illustrative audit events, continuing the still frame's clock.
  var t0 = 1642723743.217, seq = 379;
  function ts() { t0 += rand(0.05, 0.9); seq += 1; return t0.toFixed(3) + ":" + seq; }
  function pid() { return String(Math.floor(rand(1200, 9800))); }
  var PROCS = [["cron", "/usr/sbin/cron"], ["sshd", "/usr/sbin/sshd"], ["apache2", "/usr/sbin/apache2"],
               ["systemd", "/lib/systemd/systemd"], ["logrotate", "/usr/sbin/logrotate"]];
  function sys(p, flag) {
    return { id: "E1", flag: flag, segs: [["type=SYSCALL msg=audit("], [ts(), 1], ["): syscall="],
      [pick(["59", "2", "257", "42"]), 1], [" success=yes pid="], [pid(), 1], [" comm="], ['"' + p[0] + '"', 1, "comm"],
      [" exe="], ['"' + p[1] + '"', 1, "exe"]] };
  }
  function login(acct, addr, flag) {
    return { id: "E2", flag: flag, segs: [["type=USER_LOGIN msg=audit("], [ts(), 1], ["): pid="], [pid(), 1],
      [" acct="], ['"' + acct + '"', 1, "acct"], [' exe="/usr/sbin/sshd" addr='], [addr, 1, "addr"], [" res=success"]] };
  }
  function cred() {
    return { id: "E3", segs: [["type=CRED_DISP msg=audit("], [ts(), 1], ["): pid="], [pid(), 1],
      [' acct="root" exe="/usr/sbin/cron" res=success']] };
  }
  // print(alert): the detector's output, cut to the fields that matter
  function printAlert(ev) {
    var value = ev.segs.filter(function (s) { return s[2] === ev.flag; })[0][0].replace(/"/g, "");
    var alert = make("div", "code__alert");
    [["detectorID:", ' "NewValueDetector"\n'], ["score:", " 1\n"], ["alertDetails {", "\n  "],
     ["key:", ' "EventID ' + ev.id.slice(1) + " - " + ev.flag + '"\n  '],
     ["value:", ' "Unknown value: \\\'' + value + '\\\'"\n'], ["}", ""]].forEach(function (p) {
      alert.appendChild(make("span", "code__key", p[0]));
      alert.appendChild(document.createTextNode(p[1]));
    });
    return alert;
  }
  codePanel(lib, {
    radio: document.getElementById("run-library"),
    normal: [
      function () { return sys(pick(PROCS)); },
      function () { return sys(pick(PROCS)); },
      function () { return login(pick(["root", "www-data", "deploy"]), pick(["10.35.33.12", "10.35.33.17", "10.35.34.4"])); },
      cred
    ],
    anom: [
      function () { return sys(["sh", "/tmp/.kx/sh"], "exe"); },
      function () { return sys(["nc", "/bin/nc.openbsd"], "exe"); },
      function () { return login("backup", "203.0.113.77", "acct"); },
      function () { return sys(["python3", "/dev/shm/.p/python3"], "exe"); }
    ],
    event: "detector.process(", fire: ["if alert", "print(alert)"], alert: printAlert, start: "intro", term: null
  });

  // Service: illustrative Nginx access lines (combined format), continuing the still
  // frame's clock. The URL is the one field the detector watches: a probe fires.
  if (!svc) return;
  var clock = (9 * 60 + 53) * 60 + 31, alertID = 10;
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() {
    clock += Math.floor(rand(0, 4));
    return "14/Oct/2026:" + two(Math.floor(clock / 3600) % 24) + ":" + two(Math.floor(clock / 60) % 60) + ":" +
      two(clock % 60) + " +0000";
  }
  function access(url, code, flag) {
    return { flag: flag, segs: [[pick(["10.0.0.4", "10.0.0.7", "10.0.0.9", "10.0.0.12"]) + " - - [" + stamp() + '] "GET '],
      [url, 1, "url"], [' HTTP/1.1" ' + code + " " + Math.floor(rand(12, 4800)) + ' "-" "curl/8.5.0"']] };
  }
  // what the service writes to output.log: the real field names and order, cut to four
  function jsonAlert(ev) {
    var url = ev.segs.filter(function (s) { return s[2] === ev.flag; })[0][0], alert = make("div", "code__alert");
    alertID += 1;
    ['{"detectorID":"NewValueDetector",', '"alertID":"NewValueDetector_' + alertID + '",', '"score":1.0,',
     '"alertsObtain":{"Global - URL":"Unknown value: \'' + url + "'\"}}"].forEach(function (part, i) {
      if (i) alert.appendChild(document.createElement("wbr"));   // it wraps after a comma
      alert.appendChild(document.createTextNode(part));
    });
    return alert;
  }
  codePanel(svc, {
    radio: document.getElementById("run-service"),
    normal: [function () { return access(pick(["/", "/hello", "/world", "/static/app.css", "/static/logo.svg", "/api/v1/status"]), 200); }],
    anom: [function () { return access(pick(["/.env", "/wp-login.php", "/.git/config", "/cgi-bin/luci"]), 404, "url"); }],
    event: "component_type", fire: ["out_addr", "output.ipc"], alert: jsonAlert, start: "shown",
    term: ["INFO Auto-starting engine..."]
  });
})();

// Home pipeline: events travel along the rail under the cards (down their left side
// on phones). Normal events end at the detector; alerts turn amber, gather at the
// aggregation stop and go on to the sink as one group of up to 4. No rail, no flow (601-960px).
(function () {
  var flow = document.querySelector(".flow");
  var rail = flow && flow.querySelector(".flow__rail");
  var src = flow && flow.querySelector(".flow__src");
  var layer = flow && flow.querySelector(".flow__tokens");
  if (!rail || !src || !layer || !flow.animate || motion.reduced()) return;
  var stages = Array.prototype.slice.call(flow.querySelectorAll(".stage"));
  var stops = stages.map(function (s) { return s.querySelector(".stage__stop"); });
  var phone = window.matchMedia("(max-width: 600px)");
  var run = 0, on = false, live = false, P = null, size = "";
  var spawnT = null, mergeT = null, buf = [], since = 0, burst = 0, pings = {};
  var GAP = 14, MAX = 4;   // px between the waiting alerts; the most alerts in one group

  function rand(a, b) { return a + Math.random() * (b - a); }
  function guard(my, fn) { return function () { if (my === run) fn(); }; }
  var FLOW_FAST = 2;   // runs this many times faster than the other looping animations; keep --flow-slow equal
  function S(ms) { return motion.slow(ms) / FLOW_FAST; }   // every ms below is the brisk pace
  function later(my, ms, fn) { setTimeout(guard(my, fn), S(ms)); }

  // the stops' centres and the source, relative to .flow
  function measure() {
    var f = flow.getBoundingClientRect(), r = src.getBoundingClientRect();
    var st = stops.map(function (e) {
      var q = e.getBoundingClientRect();
      return { x: q.left + q.width / 2 - f.left, y: q.top + q.height / 2 - f.top };
    });
    var vertical = phone.matches;
    return { vertical: vertical, st: st,
             src: vertical ? { x: st[0].x, y: r.bottom - f.top } : { x: r.right - f.left, y: st[0].y } };
  }

  function token(cls, text) {
    var t = document.createElement("span");
    t.className = "tk " + cls;
    if (text) t.textContent = text;
    layer.appendChild(t);
    return t;
  }
  function at(p) { return "calc(" + p.x + "px - 50%) calc(" + p.y + "px - 50%)"; }
  function place(t, p) { t.style.translate = at(p); }
  function move(my, t, p, ms, easing, then) {
    var a = t.animate({ translate: at(p) },
                      { duration: S(ms), easing: easing || "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
    if (then) a.onfinish = guard(my, then);
  }
  function vanish(t, ms, delay, scale) {
    t.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: scale }],
              { duration: S(ms), delay: S(delay), fill: "forwards" }).onfinish = function () { t.remove(); };
  }
  function ping(i, cls, ms) {
    var s = stages[i], k = i + cls;
    s.classList.add(cls);
    clearTimeout(pings[k]);
    pings[k] = setTimeout(function () { s.classList.remove(cls); }, S(ms));
  }
  function ring(p) {
    var r = token("tk--ring");
    place(r, p);
    r.animate([{ scale: 1, opacity: 1 }, { scale: 3.6, opacity: 0 }],
              { duration: S(700), easing: "ease-out", fill: "forwards" }).onfinish = function () { r.remove(); };
  }
  // Mostly a lone alert now and then; about one time in three a burst of 2 to 4 in a row
  // (an attack touches several events), which the aggregation stop gathers into one group.
  // Groups come out about 60% single, 20% of 2, 10% of 3 and 10% of 4.
  function anomaly() {
    since += 1;
    if (burst > 0) { burst -= 1; since = 0; return true; }
    if (since >= 8 || (since > 3 && Math.random() < 0.17)) {
      since = 0;
      if (Math.random() < 0.3) burst = 1 + Math.floor(Math.random() * 3);   // 1 to 3 more
      return true;
    }
    return false;
  }
  // the waiting alerts sit side by side, centred on the aggregation stop
  function slot(i, n) {
    var off = (i - (n - 1) / 2) * GAP, s = P.st[2];
    return P.vertical ? { x: s.x, y: s.y + off } : { x: s.x + off, y: s.y };
  }

  function life(my) {
    var bad = anomaly(), st = P.st, raw = token("tk--raw");
    place(raw, P.src);
    raw.animate([{ opacity: 0 }, { opacity: 1 }], { duration: S(200) });
    move(my, raw, st[0], P.vertical ? 520 : 820, "cubic-bezier(.4,0,.6,1)", function () {
      raw.remove();
      ping(0, "is-ping", 220);
      var ev = token("tk--ev");
      place(ev, st[0]);
      ev.animate([{ scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: S(220), easing: "ease-out" });
      move(my, ev, st[1], 720, null, function () {
        ping(1, "is-ping", 220);
        if (!bad) { vanish(ev, 260, 0, 0.2); return; }
        ev.classList.add("tk--alert");
        ring(st[1]);
        ping(1, "is-fire", 650);
        later(my, 240, function () {
          move(my, ev, st[2], 720, null, function () {
            ping(2, "is-ping", 220);
            buf.push(ev);
            var n = buf.length;
            buf.forEach(function (t, i) { if (t !== ev) move(my, t, slot(i, n), 200); });
            move(my, ev, slot(n - 1, n), 200, null, function () {
              if (buf.length >= MAX) merge(my);
              // the wait outlasts a burst of 4 (3 spawn gaps of at most 680 ms)
              else if (buf.length === 1) { clearTimeout(mergeT); mergeT = setTimeout(function () { merge(my); }, S(2200)); }
            });
          });
        });
      });
    });
  }

  // the buffered alerts move together and become one group, which goes on to the sink
  function merge(my) {
    clearTimeout(mergeT);
    var items = buf.splice(0), left = items.length, st = P.st;
    if (!left || my !== run) return;
    items.forEach(function (t) {
      move(my, t, st[2], 240, null, function () {
        left -= 1;
        if (left) return;
        items.forEach(function (t) { t.remove(); });
        var n = items.length;
        var g = token("tk--grp", P.vertical ? "×" + n : n + (n === 1 ? " alert" : " alerts"));
        place(g, st[2]);
        g.animate([{ scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1 }],
                  { duration: S(260), easing: "cubic-bezier(.3,1.6,.5,1)" });
        ping(2, "is-ping", 500);
        later(my, 320, function () {
          move(my, g, st[3], 900, null, function () {
            ping(3, "is-recv", 1100);
            vanish(g, 380, 200, 0.6);
          });
        });
      });
    });
  }

  function tick() {
    life(run);
    spawnT = setTimeout(tick, S(rand(430, 680)));
  }
  function spawn() {
    clearTimeout(spawnT);
    if (on && live) tick();
  }
  // clears every token and measures again
  function restart() {
    run += 1;
    clearTimeout(mergeT);
    buf = [];
    since = 0;
    burst = 0;
    layer.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); });
    layer.textContent = "";
    stages.forEach(function (s) { s.classList.remove("is-ping", "is-fire", "is-recv"); });
    live = getComputedStyle(rail).display !== "none";
    if (live) P = measure();
    size = flow.offsetWidth + "x" + flow.offsetHeight;
    spawn();
  }

  // Restart 200 ms after .flow changes size: a new width, or the web font re-wrapping
  // the cards. A phone's URL bar resizing the window leaves it alone.
  function start() {
    var t = null;
    function resized() {
      clearTimeout(t);
      t = setTimeout(function () { if (flow.offsetWidth + "x" + flow.offsetHeight !== size) restart(); }, 200);
    }
    restart();
    if (window.ResizeObserver) new ResizeObserver(resized).observe(flow);
    else window.addEventListener("resize", resized);
    motion.watch(flow, function (v) { on = v; spawn(); });
  }

  // after the intro, the card draw starts it (dm:pipeline-drawn)
  if (motion.intro) flow.addEventListener("dm:pipeline-drawn", start, { once: true });
  else start();
})();

// Benchmarks: each frame shows one block for its chosen kind, view and metric. A plot grows
// out of its median the first time its frame is seen. A switch that ends on a plot animates
// it: it moves to its new values from a plot on the same axis, and grows in otherwise.
(function () {
  var DURATION = 700;
  var MID = 20;   // PLOT_MID in build.py

  function ease(t) {
    t = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - t, 3);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function attr(el, name) { return parseFloat(el.getAttribute(name)); }

  // A plot's values as drawn now, in % of the plot width: lo and hi are the outermost x,
  // mid is the middle line, q1 and q3 the box (null without one).
  function readStats(svg) {
    var mid = svg.querySelector(".mid");
    if (!mid) return null;
    var box = svg.querySelector(".box"), xs = [], q1 = null, q3 = null;
    svg.querySelectorAll("line").forEach(function (l) { xs.push(attr(l, "x1"), attr(l, "x2")); });
    if (box) {
      q1 = attr(box, "x");
      q3 = q1 + attr(box, "width");
      xs.push(q1, q3);
    }
    return { lo: Math.min.apply(null, xs), q1: q1, mid: attr(mid, "x1"), q3: q3, hi: Math.max.apply(null, xs) };
  }

  function line(x1, x2, y1, y2, cls) {
    return '<line class="' + cls + '" x1="' + +x1.toFixed(3) + '%" x2="' + +x2.toFixed(3) + '%" y1="' +
      +y1.toFixed(3) + '" y2="' + +y2.toFixed(3) + '"/>';
  }

  // The svg's inner markup for st, drawn as render_plot in build.py draws it: change both.
  // st.h is the middle line's half height (10 when left out); caps draws the whiskers' caps.
  function plotMarkup(st, caps) {
    var c = MID, h = st.h === undefined ? 10 : st.h, out = "";
    if (st.q1 === null) {
      if (st.hi > st.lo) out += line(st.lo, st.hi, c, c, "wh");
    } else {
      [[st.lo, st.q1], [st.hi, st.q3]].forEach(function (w) {
        var a = Math.min(w[0], w[1]), b = Math.max(w[0], w[1]);
        if (b > a) {
          out += line(a, b, c, c, "wh");
          if (caps) out += line(w[0], w[0], c - 6, c + 6, "wh");
        }
      });
      out += '<rect class="box" x="' + +st.q1.toFixed(3) + '%" width="' + +(st.q3 - st.q1).toFixed(3) +
        '%" y="' + (c - 10) + '" height="20"/>';
    }
    return out + line(st.mid, st.mid, c - h, c + h, "mid");
  }

  // Plays one frame's grow-ins and morphs in a single animation-frame loop, and puts the
  // built markup back when the last row ends or the frame changes under it.
  function plotPlayer(frame) {
    var built = new WeakMap(), rows = [], flips = [], raf = 0;
    frame.querySelectorAll(".bench-block svg").forEach(function (svg) { built.set(svg, svg.innerHTML); });

    function finishPlots() {
      cancelAnimationFrame(raf);
      raf = 0;
      rows.forEach(function (r) { r.svg.innerHTML = built.get(r.svg); });
      flips.forEach(function (a) { a.finish(); });
      rows = [];
      flips = [];
    }

    function draw(now) {
      var done = true;
      rows.forEach(function (r) {
        var t = now - r.start;
        if (t < r.end) done = false;
        r.svg.innerHTML = r.at(t);
      });
      if (done) finishPlots();
      else raf = requestAnimationFrame(draw);
    }

    function play(list) {
      rows = list.filter(Boolean);
      if (rows.length) draw(performance.now());
    }

    // The mid line grows from the centre, the box out of the mid line from +160 ms, and the
    // whiskers out of the box (or the mid line) from +420 ms.
    function growRow(svg, start) {
      var st = readStats(svg);
      if (!st) return null;
      return { svg: svg, start: start, end: 420 + DURATION, at: function (t) {
        var b = ease((t - 160) / DURATION), w = ease((t - 420) / DURATION);
        var g = { h: 10 * ease(t / DURATION), mid: st.mid, q1: null, q3: null };
        if (st.q1 !== null) {
          g.q1 = lerp(st.mid, st.q1, b);
          g.q3 = lerp(st.mid, st.q3, b);
        }
        g.lo = lerp(g.q1 === null ? st.mid : g.q1, st.lo, w);
        g.hi = lerp(g.q3 === null ? st.mid : g.q3, st.hi, w);
        return plotMarkup(g, true);
      } };
    }

    // From the old values to the new: a missing box is a box of no width at the mid line,
    // and the caps are left out while either side has none.
    function morphRow(svg, from, start) {
      var to = readStats(svg);
      if (!to) return null;
      var boxed = from.q1 !== null || to.q1 !== null, caps = from.q1 !== null && to.q1 !== null;
      return { svg: svg, start: start, end: DURATION, at: function (t) {
        var e = ease(t / DURATION), g = { lo: lerp(from.lo, to.lo, e), mid: lerp(from.mid, to.mid, e),
                                         hi: lerp(from.hi, to.hi, e), q1: null, q3: null };
        if (boxed) {
          g.q1 = lerp(from.q1 === null ? from.mid : from.q1, to.q1 === null ? to.mid : to.q1, e);
          g.q3 = lerp(from.q3 === null ? from.mid : from.q3, to.q3 === null ? to.mid : to.q3, e);
        }
        return plotMarkup(g, caps);
      } };
    }

    // The rows a block shows, keyed, with where each one is drawn.
    function shown(block) {
      var top = block.querySelector("table").getBoundingClientRect().top;
      return Array.prototype.filter.call(block.querySelectorAll("tbody tr"), function (tr) {
        return !tr.hidden && tr.dataset.row;
      }).map(function (tr) {
        var svg = tr.querySelector("svg");
        return { key: tr.dataset.row, tr: tr, svg: svg,
                 stats: svg ? readStats(svg) : null, top: tr.getBoundingClientRect().top - top };
      });
    }

    function grow(block) {
      finishPlots();
      if (motion.reduced() || block.dataset.blockKind !== "plot") return;
      var now = performance.now(), i = 0;
      play(shown(block).map(function (r) { return r.svg ? growRow(r.svg, now + 55 * i++) : null; }));
    }

    // Before a switch: what the old block draws now, so the next one can start from it.
    function snapshot(block) {
      var old = {};
      shown(block).forEach(function (r) { old[r.key] = r; });
      return old;
    }

    // After a switch: each row moves from its old values and its old place (FLIP); a row the
    // old block did not show grows in. A moving row is opaque, so rows pass over each other.
    function morph(old, block) {
      finishPlots();
      if (motion.reduced()) return;
      var now = performance.now(), paper = getComputedStyle(block).getPropertyValue("--paper").trim();
      play(shown(block).map(function (r) {
        var o = old[r.key];
        if (o) {
          var dy = o.top - r.top;
          if (dy) flips.push(motion.play(r.tr, [{ transform: "translateY(" + dy + "px)", backgroundColor: paper },
                                                { transform: "none", backgroundColor: paper }], { duration: DURATION }));
        }
        if (!r.svg) return null;
        return o && o.stats ? morphRow(r.svg, o.stats, now) : growRow(r.svg, now);
      }));
    }

    return { grow: grow, snapshot: snapshot, morph: morph, finishPlots: finishPlots };
  }

  // Two plots share an axis when their tick labels say the same at the same places.
  function sameAxis(a, b) {
    function ticks(block) {
      return Array.prototype.map.call(block.querySelectorAll(".axis span"), function (s) {
        return s.style.left + " " + s.textContent;
      }).join("|");
    }
    return ticks(a) !== "" && ticks(a) === ticks(b);
  }

  // The switch bar: Table or Plot, the view and the metric, one state per frame.
  function switchBlocks(frame, bar, plots) {
    var blocks = frame.querySelectorAll(".bench-block");
    var groups = bar.querySelectorAll("[data-switch]");
    var state = { kind: "plot", view: "log-type", metric: "precision" };

    function visible() { return frame.querySelector(".bench-block:not([hidden])"); }

    function apply() {
      plots.finishPlots();
      blocks.forEach(function (block) {
        block.hidden = block.dataset.blockKind !== state.kind ||
          block.dataset.blockView !== state.view ||
          block.dataset.blockMetric !== state.metric;
      });
      groups.forEach(function (group) {
        var name = group.dataset["switch"];
        group.querySelectorAll("button").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.dataset[name] === state[name]));
        });
      });
    }

    groups.forEach(function (group) {
      var name = group.dataset["switch"];
      group.querySelectorAll("button").forEach(function (b) {
        // A switch that ends on a table is still. One that ends on a plot moves it from the
        // old plot when both share an axis (P, R and F1 do; events/s has its own), and grows
        // it in otherwise, from a table or across axes.
        b.addEventListener("click", function () {
          var to = b.dataset[name];
          if (state[name] === to) return;
          var old = visible(), was = old && old.dataset.blockKind === "plot" ? plots.snapshot(old) : null;
          state[name] = to;
          apply();
          var now = visible();
          if (!now || now.dataset.blockKind !== "plot") return;
          if (was && sameAxis(old, now)) plots.morph(was, now);
          else plots.grow(now);
        });
      });
    });

    bar.hidden = false;
    apply();
  }

  document.querySelectorAll(".frame").forEach(function (frame) {
    var bar = frame.querySelector(".frame__bar");
    var plots = plotPlayer(frame);
    if (bar) switchBlocks(frame, bar, plots);
    frame.classList.add("is-live");   // the html.js rules in site.css stop standing in for this

    // The first time the frame is seen, its plot grows in. A frame already in view starts at
    // once, before the built plot can show for a frame.
    if (motion.reduced()) return;
    var seen = false, stop = null;
    function first() {
      if (seen) return;
      seen = true;
      if (stop) stop();
      var block = frame.querySelector(".bench-block:not([hidden])");
      if (block) plots.grow(block);
    }
    var r = frame.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { first(); return; }
    stop = motion.watch(frame, function (on) { if (on) first(); });
    if (seen) stop();
  });
})();

// Benchmarks: a tooltip with a plot row's numbers (the visually hidden .plot__nums that
// build.py writes after each row's SVG). With a mouse it follows the pointer over the row's
// plot; a tap shows it until the next tap elsewhere. A scroll or a switch hides it. It is not
// an animation, so it works under reduced motion too.
(function () {
  var frames = document.querySelectorAll(".frame");
  if (!document.querySelector(".plot__nums")) return;
  var tip = document.createElement("div"), cell = null, header = document.querySelector(".site-header");
  tip.className = "tip";
  tip.hidden = true;
  tip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tip);

  function cellAt(target) {
    var td = target.closest && target.closest("td.plot");
    return td && td.querySelector(".plot__nums") ? td : null;
  }
  function hide() {
    tip.hidden = true;
    cell = null;
  }
  // a mouse: 14 px right of and below the pointer; a finger: above it, out from under the
  // hand. Either flips where it would leave the window.
  function show(td, x, y, above) {
    if (td !== cell) {
      cell = td;
      tip.textContent = "";
      Array.prototype.forEach.call(td.querySelector(".plot__nums").childNodes, function (n) {
        tip.appendChild(n.cloneNode(true));
      });
    }
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var left = x + 14 + w <= vw ? x + 14 : x - 14 - w;
    // the sticky header covers the top of the window: keep the tip below it
    var top0 = header ? header.getBoundingClientRect().bottom : 0;
    var top = above ? (y - 14 - h >= top0 ? y - 14 - h : y + 14) : (y + 14 + h <= vh ? y + 14 : y - 14 - h);
    tip.style.left = Math.max(4, Math.min(left, vw - w - 4)) + "px";
    tip.style.top = Math.max(top0 + 4, Math.min(top, vh - h - 4)) + "px";
  }

  frames.forEach(function (frame) {
    frame.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var td = cellAt(e.target);
      if (td) show(td, e.clientX, e.clientY, false);
      else hide();
    });
    frame.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });
  });
  // a tap: pointerup, since a touch that scrolls ends in pointercancel instead
  document.addEventListener("pointerup", function (e) {
    if (e.pointerType === "mouse") return;
    var td = cellAt(e.target);
    if (td) show(td, e.clientX, e.clientY, true);
    else hide();
  });
  window.addEventListener("scroll", function () { if (!tip.hidden) hide(); }, true);
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest(".frame__bar")) hide();
  });
})();
