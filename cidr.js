/*
 * cidr.js — pure calculation logic. No DOM, no dependencies.
 * Loadable in a browser (defines window.CIDR) and in Node (module.exports).
 *
 * This logic is the verified reference implementation: it is covered by
 * test/logic.test.js and mirrored by the Swift port in the macOS app.
 * Do not change behaviour here without updating those tests.
 */
var CIDR = (function () {
  "use strict";

  var fmt = function (n) { return Number(n).toLocaleString("en-US"); };

  // ---------------- IPv4 ----------------

  function parseIPv4(str) {
    var m = String(str).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    var ip = 0;
    for (var i = 1; i <= 4; i++) {
      var o = Number(m[i]);
      if (o > 255) return null;
      if (m[i].length > 1 && m[i][0] === "0") return null; // no leading zeros
      ip = ((ip << 8) | o) >>> 0;
    }
    return ip;
  }

  function ip4str(n) {
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }

  function maskFromBits(b) {
    return b === 0 ? 0 : (0xFFFFFFFF << (32 - b)) >>> 0;
  }

  function maskBinary(mask) {
    return (mask >>> 0).toString(2).padStart(32, "0").match(/.{8}/g).join(".");
  }

  function ip4Class(ip) {
    var o = ip >>> 24;
    if (o < 128) return "A";
    if (o < 192) return "B";
    if (o < 224) return "C";
    if (o < 240) return "D (multicast)";
    return "E (reserved)";
  }

  function ip4Special(ip) {
    function inRange(net, bits) {
      return ((ip & maskFromBits(bits)) >>> 0) === parseIPv4(net);
    }
    if (inRange("10.0.0.0", 8) || inRange("172.16.0.0", 12) || inRange("192.168.0.0", 16)) {
      return "Private (RFC 1918)";
    }
    if (inRange("127.0.0.0", 8)) return "Loopback";
    if (inRange("169.254.0.0", 16)) return "Link-local (APIPA)";
    if (inRange("100.64.0.0", 10)) return "CGNAT (RFC 6598)";
    if (inRange("224.0.0.0", 4)) return "Multicast";
    return "Public";
  }

  /** @returns {object} labelled results for an IPv4 address + prefix length */
  function computeV4(ip, bits) {
    var mask = maskFromBits(bits);
    var wildcard = (~mask) >>> 0;
    var network = (ip & mask) >>> 0;
    var broadcast = (network | wildcard) >>> 0;
    var total = Math.pow(2, 32 - bits);

    var firstHost, lastHost, usable, note = "";
    if (bits === 32) {
      firstHost = lastHost = network; usable = 1; note = " (single host route)";
    } else if (bits === 31) {
      firstHost = network; lastHost = broadcast; usable = 2; note = " (point-to-point (RFC 3021))";
    } else {
      firstHost = network + 1; lastHost = broadcast - 1; usable = total - 2;
    }

    return {
      cidr: ip4str(network) + "/" + bits,
      netmask: ip4str(mask),
      wildcard: ip4str(wildcard),
      network: ip4str(network),
      broadcast: bits >= 31 ? "—" : ip4str(broadcast),
      hostRange: ip4str(firstHost) + " – " + ip4str(lastHost),
      usableHosts: fmt(usable) + note,
      totalAddresses: fmt(total),
      maskBinary: maskBinary(mask),
      addressType: ip4Special(ip) + " · Class " + ip4Class(ip)
    };
  }

  function parseCIDRv4(s) {
    var m = String(s).trim().match(/^(.+)\/(\d{1,2})$/);
    if (!m) return null;
    var ip = parseIPv4(m[1]);
    var bits = Number(m[2]);
    if (ip === null || bits > 32) return null;
    return { ip: ip, bits: bits };
  }

  /** Split a parent network into /newBits subnets. Display list capped at maxRows. */
  function splitV4(ip, bits, newBits, maxRows) {
    if (!(newBits > bits) || newBits > 32) return null;
    maxRows = maxRows || 256;
    var parentMask = maskFromBits(bits);
    var network = (ip & parentMask) >>> 0;
    var count = Math.pow(2, newBits - bits);
    var size = Math.pow(2, 32 - newBits);
    var shown = Math.min(count, maxRows);

    var subnets = [];
    for (var i = 0; i < shown; i++) {
      var net = (network + i * size) >>> 0;
      var bc = (net + size - 1) >>> 0;
      var range;
      if (newBits === 32) range = ip4str(net);
      else if (newBits === 31) range = ip4str(net) + " – " + ip4str(bc);
      else range = ip4str(net + 1) + " – " + ip4str(bc - 1);
      subnets.push({
        index: i + 1,
        cidr: ip4str(net) + "/" + newBits,
        hostRange: range,
        broadcast: newBits >= 31 ? "—" : ip4str(bc)
      });
    }
    var usable = newBits === 32 ? 1 : (newBits === 31 ? 2 : size - 2);
    return {
      subnets: subnets,
      totalCount: count,
      usablePerSubnet: usable,
      normalizedParent: network === ip ? null : ip4str(network) + "/" + bits,
      truncatedTo: count > shown ? shown : null
    };
  }

  // ---------------- IPv6 ----------------

  function parseIPv6(str) {
    var s = String(str).trim().toLowerCase();
    if (s === "" || s.indexOf(":::") !== -1) return null;
    if ((s.match(/::/g) || []).length > 1) return null;

    // embedded IPv4 tail, e.g. ::ffff:192.168.1.1
    var v4tail = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4tail) {
      var v4 = parseIPv4(v4tail[2]);
      if (v4 === null) return null;
      s = v4tail[1] + (v4 >>> 16).toString(16) + ":" + (v4 & 0xffff).toString(16);
    } else if (s.indexOf(".") !== -1) {
      return null;
    }

    var head = s, tail = "", hasDouble = false;
    if (s.indexOf("::") !== -1) {
      hasDouble = true;
      var parts = s.split("::");
      head = parts[0];
      tail = parts[1];
    }
    var hp = head === "" ? [] : head.split(":");
    var tp = tail === "" ? [] : tail.split(":");
    if (hasDouble) {
      if (hp.length + tp.length > 7) return null;
    } else if (hp.length !== 8) {
      return null;
    }

    var groups = hp.concat(new Array(8 - hp.length - tp.length).fill("0"), tp);
    var val = 0n;
    for (var i = 0; i < groups.length; i++) {
      if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
      val = (val << 16n) | BigInt(parseInt(groups[i], 16));
    }
    return val;
  }

  function v6groups(val) {
    var g = [];
    for (var i = 7; i >= 0; i--) g.push(Number((val >> BigInt(i * 16)) & 0xffffn));
    return g;
  }

  function v6full(val) {
    return v6groups(val).map(function (x) { return x.toString(16).padStart(4, "0"); }).join(":");
  }

  function v6compress(val) {
    var g = v6groups(val).map(function (x) { return x.toString(16); });
    var best = -1, bestLen = 0, run = -1, len = 0;
    for (var i = 0; i <= 8; i++) {
      if (i < 8 && g[i] === "0") {
        if (run < 0) run = i;
        len++;
      } else {
        if (len > bestLen && len >= 2) { best = run; bestLen = len; }
        run = -1; len = 0;
      }
    }
    if (best < 0) return g.join(":");
    return g.slice(0, best).join(":") + "::" + g.slice(best + bestLen).join(":");
  }

  function v6TotalStr(bits) {
    var n = 128 - bits;
    if (n <= 50) return fmt(Number(2n ** BigInt(n)));
    return "2^" + n + "  (≈ " + Math.pow(2, n).toExponential(2).replace("e+", " × 10^") + ")";
  }

  function v6Type(val) {
    var top = Number(val >> 112n);
    if (val === 0n) return "Unspecified (::)";
    if (val === 1n) return "Loopback (::1)";
    if ((top & 0xe000) === 0x2000) {
      if (top === 0x2001 && Number((val >> 96n) & 0xffffn) === 0x0db8) {
        return "Documentation (2001:db8::/32)";
      }
      return "Global Unicast";
    }
    if ((top & 0xffc0) === 0xfe80) return "Link-Local";
    if ((top & 0xfe00) === 0xfc00) return "Unique Local (ULA)";
    if ((top & 0xff00) === 0xff00) return "Multicast";
    if ((val >> 32n) === 0xffffn) return "IPv4-mapped";
    return "Reserved / Other";
  }

  function computeV6(val, bits) {
    var all = (1n << 128n) - 1n;
    var mask = bits === 0 ? 0n : (all << BigInt(128 - bits)) & all;
    var network = val & mask;
    var last = network | (~mask & all);
    var s64;
    if (bits <= 64) {
      var n = 64 - bits;
      s64 = n <= 50 ? fmt(Number(2n ** BigInt(n))) : "2^" + n;
    } else {
      s64 = "—";
    }
    return {
      prefixCIDR: v6compress(network) + "/" + bits,
      compressed: v6compress(val),
      expanded: v6full(val),
      networkFirst: v6compress(network),
      lastAddress: v6compress(last),
      expandedRange: v6full(network) + " – " + v6full(last),
      totalAddresses: v6TotalStr(bits),
      slash64Inside: s64,
      addressType: v6Type(val)
    };
  }

  return {
    parseIPv4: parseIPv4, ip4str: ip4str, maskFromBits: maskFromBits,
    maskBinary: maskBinary, ip4Class: ip4Class, ip4Special: ip4Special,
    computeV4: computeV4, parseCIDRv4: parseCIDRv4, splitV4: splitV4,
    parseIPv6: parseIPv6, v6full: v6full, v6compress: v6compress,
    v6Type: v6Type, computeV6: computeV6, fmt: fmt
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CIDR;
