/* app.js — UI wiring only. All maths lives in cidr.js. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var C = window.CIDR;

  // ---------------- clipboard + feedback ----------------

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1300);
  }

  function copy(text) {
    var clean = String(text).split(" (")[0];
    var done = function () {
      toast("Copied  " + (clean.length > 34 ? clean.slice(0, 34) + "…" : clean));
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clean).then(done, function () { legacyCopy(clean, done); });
    } else {
      legacyCopy(clean, done);
    }
  }

  function legacyCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); }
    document.body.removeChild(ta);
  }

  // ---------------- rendering helpers ----------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderRows(container, pairs) {
    container.innerHTML = pairs.map(function (p) {
      return '<div class="row" data-copy="' + esc(p[1]) + '">' +
             '<div class="k">' + esc(p[0]) + "</div>" +
             '<div class="v">' + esc(p[1]) + "</div></div>";
    }).join("");
  }

  // Address scope as a single dot. Green = globally routable, orange = usable
  // but only within a local boundary, red = not assignable to a host at all.
  function scopeClass(type) {
    if (/multicast|reserved|unspecified/i.test(type)) return "bad";
    if (/^Public|Global Unicast/.test(type)) return "ok";
    return "mid";
  }

  // One large number per view. Kept outside the .rows list on purpose: the rows
  // are a plain copyable table and the hero is the thing read at a glance.
  function renderHero(el, spec) {
    el.innerHTML =
      '<div class="hlabel">' + esc(spec.label) + "</div>" +
      '<div class="hnum">' + esc(spec.num) +
      (spec.unit ? '<span class="hunit">' + esc(spec.unit) + "</span>" : "") +
      "</div>" +
      '<div class="hsub"><span class="dot ' + spec.scope + '"></span>' +
      "<span>" + esc(spec.sub) + "</span></div>";
    el.classList.remove("hidden");
  }

  function hideHero(el) {
    el.innerHTML = "";
    el.classList.add("hidden");
  }

  function showError(el, msg) {
    if (msg) { el.textContent = msg; el.classList.remove("hidden"); }
    else { el.textContent = ""; el.classList.add("hidden"); }
  }

  function buildChips(container, values, current, onPick) {
    container.innerHTML = "";
    values.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "/" + v;
      if (v === current) b.className = "on";
      b.addEventListener("click", function () { onPick(v); });
      container.appendChild(b);
    });
  }

  // ---------------- IPv4 ----------------

  var V4_CHIPS = [8, 16, 24, 25, 26, 30];

  function calcV4() {
    var text = $("v4ip").value;
    var bits = Number($("v4bits").value);
    var ip = C.parseIPv4(text);
    var blank = text.trim() === "";

    $("v4ip").classList.toggle("bad", ip === null && !blank);
    buildChips($("v4chips"), V4_CHIPS, bits, function (v) {
      $("v4bits").value = v;
      calcV4();
    });

    if (ip === null) {
      showError($("v4err"), blank ? "" : "Not a valid IPv4 address.");
      $("v4out").innerHTML = "";
      hideHero($("v4hero"));
      return;
    }
    showError($("v4err"), "");

    var r = C.computeV4(ip, bits);
    // usableHosts carries a parenthetical for /31 and /32; split it off so the
    // figure stays a number and the caveat becomes a unit label beside it
    var u = /^([\d,]+)(?:\s*\((.*)\))?$/.exec(r.usableHosts) || [null, r.usableHosts, ""];
    renderHero($("v4hero"), {
      label: "Usable hosts",
      num: u[1],
      unit: u[2] || "",
      // scope only — the class letter is already a row below, and repeating it
      // here would push the line to two rows for no added information
      sub: r.cidr + "  ·  " + C.ip4Special(ip),
      scope: scopeClass(r.addressType)
    });
    renderRows($("v4out"), [
      ["CIDR", r.cidr],
      ["Netmask", r.netmask],
      ["Wildcard", r.wildcard],
      ["Network", r.network],
      ["Broadcast", r.broadcast],
      ["Host Range", r.hostRange],
      ["Usable Hosts", r.usableHosts],
      ["Total Addresses", r.totalAddresses],
      ["Netmask (binary)", r.maskBinary],
      ["Type", r.addressType]
    ]);
  }

  // ---------------- IPv6 ----------------

  var V6_CHIPS = [32, 48, 56, 64, 128];

  function calcV6() {
    var text = $("v6ip").value;
    var bits = Number($("v6bits").value);
    var val = C.parseIPv6(text);
    var blank = text.trim() === "";

    $("v6ip").classList.toggle("bad", val === null && !blank);
    buildChips($("v6chips"), V6_CHIPS, bits, function (v) {
      $("v6bits").value = v;
      calcV6();
    });

    if (val === null) {
      showError($("v6err"), blank ? "" : "Not a valid IPv6 address.");
      $("v6out").innerHTML = "";
      hideHero($("v6hero"));
      return;
    }
    showError($("v6err"), "");

    var r = C.computeV6(val, bits);
    // /64s inside is the number a network engineer actually plans with; past
    // /64 there are none, so the prefix length itself becomes the figure
    var deep = r.slash64Inside === "—";
    renderHero($("v6hero"), {
      label: deep ? "Prefix length" : "/64 subnets inside",
      num: deep ? "/" + bits : r.slash64Inside,
      unit: "",
      sub: r.prefixCIDR + "  ·  " + r.addressType,
      scope: scopeClass(r.addressType)
    });
    renderRows($("v6out"), [
      ["Prefix", r.prefixCIDR],
      ["Compressed", r.compressed],
      ["Expanded", r.expanded],
      ["Network (first)", r.networkFirst],
      ["Last Address", r.lastAddress],
      ["Total Addresses", r.totalAddresses],
      ["/64 Subnets Inside", r.slash64Inside],
      ["Type", r.addressType]
    ]);
  }

  // ---------------- Split ----------------

  function calcSplit() {
    var text = $("spnet").value;
    var newBits = Number($("spnew").value);
    var blank = text.trim() === "";
    var parsed = C.parseCIDRv4(text);

    $("spnet").classList.toggle("bad", parsed === null && !blank);
    $("spout").innerHTML = "";
    $("spnote").textContent = "";
    hideHero($("sphero"));

    if (!parsed) {
      showError($("sperr"), blank ? "" : "Enter a network in CIDR form, e.g. 192.168.1.0/24.");
      return;
    }
    if (newBits <= parsed.bits) {
      showError($("sperr"), "Pick a prefix longer than /" + parsed.bits + " to split it.");
      return;
    }
    showError($("sperr"), "");

    var sp = C.splitV4(parsed.ip, parsed.bits, newBits);
    // the note carries only caveats now — the count and usable-per-subnet moved
    // to the hero figure, and saying them twice earns neither line its place
    var notes = [];
    if (sp.normalizedParent) notes.push("Using network " + sp.normalizedParent + ".");
    if (sp.truncatedTo) notes.push("Showing first " + sp.truncatedTo + " of " +
                                   C.fmt(sp.totalCount) + ".");
    $("spnote").textContent = notes.join("  ");

    var parentType = C.ip4Special(parsed.ip);
    renderHero($("sphero"), {
      label: "Subnets",
      num: C.fmt(sp.totalCount),
      unit: "× /" + newBits,
      sub: (sp.normalizedParent || (C.ip4str(parsed.ip) + "/" + parsed.bits)) +
           "  ·  " + C.fmt(sp.usablePerSubnet) + " usable each",
      scope: scopeClass(parentType)
    });

    $("spout").innerHTML = sp.subnets.map(function (s) {
      return '<div class="subnet" data-copy="' + esc(s.cidr) + '">' +
             '<div class="head"><span class="num">' + s.index + "</span>" + esc(s.cidr) + "</div>" +
             '<div class="meta">' + esc(s.hostRange) +
             (s.broadcast === "—" ? "" : "  ·  bc " + esc(s.broadcast)) +
             "</div></div>";
    }).join("");
  }

  // ---------------- setup ----------------

  function fillSelects() {
    var v4 = $("v4bits");
    for (var b = 1; b <= 32; b++) {
      v4.add(new Option("/" + b + "  ·  " + C.ip4str(C.maskFromBits(b)), b));
    }
    v4.value = 24;

    var v6 = $("v6bits");
    for (var p = 1; p <= 128; p++) v6.add(new Option("/" + p, p));
    v6.value = 64;

    var sp = $("spnew");
    for (var n = 2; n <= 32; n++) sp.add(new Option("/" + n + " subnets", n));
    sp.value = 26;
  }

  function bindTabs() {
    var map = { "tab-v4": "pane-v4", "tab-v6": "pane-v6", "tab-split": "pane-split" };
    Object.keys(map).forEach(function (tid) {
      $(tid).addEventListener("click", function () {
        Object.keys(map).forEach(function (t) {
          var selected = t === tid;
          $(t).setAttribute("aria-selected", selected ? "true" : "false");
          $(map[t]).classList.toggle("hidden", !selected);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function bind() {
    $("v4ip").addEventListener("input", calcV4);
    $("v4bits").addEventListener("change", calcV4);
    $("v6ip").addEventListener("input", calcV6);
    $("v6bits").addEventListener("change", calcV6);
    $("spnet").addEventListener("input", calcSplit);
    $("spnew").addEventListener("change", calcSplit);

    // dismiss the on-screen keyboard when Return/Done is pressed
    ["v4ip", "v6ip", "spnet"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); this.blur(); }
      });
    });

    // tap anywhere on a result row / subnet card to copy it
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-copy]");
      if (el) copy(el.getAttribute("data-copy"));
    });

    bindTabs();
  }

  fillSelects();
  bind();
  calcV4();
  calcV6();
  calcSplit();

  // Offline caching for the hosted web version only. Inside the Capacitor
  // apps (window.Capacitor) the files already live on the device, and from a
  // file:// copy a service worker cannot register at all.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) &&
      window.isSecureContext && !window.Capacitor) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
