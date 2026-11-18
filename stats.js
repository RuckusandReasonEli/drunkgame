/*
  Anonymous play stats for DRUNK.
  One row per play session in the "Game Sessions" tab of the Eli Lie Google Sheet.
  Nothing personal is collected: a random ID per browser, city/state from a
  location lookup (the IP address itself is never stored), where the player came
  from, and what they did in the game.

  The game exposes its state as window.__drunk (one line at the end of index.html).
*/
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxeeUeU6UTFCK6yxFkspFy3a8HaxvCRR_4ba-q1QdXVdjcXKADqbfKPU-ImnW9Ty_GE1A/exec';
  var VERSION = 1;

  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function getLS(k) { var s = store('localStorage'); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function setLS(k, v) { var s = store('localStorage'); try { if (s) s.setItem(k, v); } catch (e) { /* ignore */ } }
  function getSS(k) { var s = store('sessionStorage'); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function setSS(k, v) { var s = store('sessionStorage'); try { if (s) s.setItem(k, v); } catch (e) { /* ignore */ } }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var visitor = getLS('drunk_vid');
  var returning = !!visitor;
  if (!visitor) { visitor = 'v' + rid(); setLS('drunk_vid', visitor); }

  // Where they came from: UTM tags first, then the referring site.
  var qs = new URLSearchParams(location.search);
  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
  if (ref === location.hostname) ref = '';
  var source = qs.get('utm_source') || ref || 'direct';
  var medium = qs.get('utm_medium') || (qs.get('utm_source') ? '' : ref ? 'referral' : '');
  var campaign = qs.get('utm_campaign') || '';

  // City and state (cached for the browser session so we look it up once).
  var geo = null;
  try { geo = JSON.parse(getSS('drunk_geo') || 'null'); } catch (e) { geo = null; }
  function lookup() {
    if (geo) return;
    fetch('https://get.geojs.io/v1/ip/geo.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { geo = { city: d.city || '', region: d.region || '', country: d.country_code || '' }; setSS('drunk_geo', JSON.stringify(geo)); })
      .catch(function () {
        fetch('https://ipapi.co/json/')
          .then(function (r) { return r.json(); })
          .then(function (d) { geo = { city: d.city || '', region: d.region || '', country: d.country_code || '' }; setSS('drunk_geo', JSON.stringify(geo)); })
          .catch(function () { geo = { city: '', region: '', country: '' }; });
      });
  }
  lookup();

  // Places the timer splits into.
  var PLACES = { home: 'home', tavern: 'tavern', club: 'club', exhouse: 'exhouse', map: 'town' };
  function placeNow(st) {
    if (st.mode === 'drive') return 'car';
    if (st.mode === 'curb' || st.mode === 'police') return 'exhouse';
    if (st.mode === 'flow') return 'home';
    return PLACES[st.scene] || st.scene || '';
  }
  var ACTIVE = { play: 1, drive: 1, curb: 1, police: 1, flow: 1 };

  var S = null; // the current session
  function newSession(st, continued) {
    S = {
      id: 's' + rid(), started: new Date().toISOString(), continued: continued,
      secs: { home: 0, tavern: 0, club: 0, exhouse: 0, town: 0, car: 0 },
      path: [], last: '', ending: '', hints: 0, listens: 0, listenFrom: {}, blackouts: 0,
      prevBuzz: st.buzz || 0, dirty: true, sent: false
    };
  }

  var prevMode = 'title';
  function tick() {
    var g = window.__drunk; if (!g || !g.st) return;
    var st = g.st;
    // a session starts when the title screen hands over to the game
    if ((prevMode === 'title' || prevMode === 'over' || !S) && ACTIVE[st.mode]) {
      if (S && S.ending === '') { S.ending = 'quit'; send(); }
      newSession(st, (st.played || 0) > 1);
    }
    if (S && ACTIVE[st.mode] && !document.hidden) {
      var p = placeNow(st);
      if (S.secs[p] !== undefined) S.secs[p] += 1;
      if (p && p !== S.last) { S.path.push(p); S.last = p; }
      S.dirty = true;
    }
    // Buzz hitting 5 is what triggers a blackout
    if (S && (st.buzz || 0) >= 5 && S.prevBuzz < 5) { S.blackouts += 1; S.dirty = true; }
    if (S) S.prevBuzz = st.buzz || 0;
    if (S && st.mode === 'over' && !S.ending) {
      var label = (document.getElementById('fEnding') || {}).textContent || '';
      S.ending = label.replace(/^ENDING:\s*/i, '') || 'over';
      send();
    }
    prevMode = st.mode;
  }
  setInterval(tick, 1000);

  // listens and hints: counted from the buttons the game already has
  document.addEventListener('click', function (e) {
    if (!S) return;
    var a = e.target.closest && e.target.closest('#plats a');
    if (a) {
      S.listens += 1;
      var where = 'button';
      try { where = new URL(a.href).searchParams.get('utm_content') || 'button'; } catch (x) { /* ignore */ }
      S.listenFrom[where] = (S.listenFrom[where] || 0) + 1;
      S.dirty = true; send();
    }
    if (e.target.closest && e.target.closest('#hintBtn')) { S.hints += 1; S.dirty = true; }
  }, true);
  document.addEventListener('keydown', function (e) { if (S && (e.key === 'h' || e.key === 'H')) { S.hints += 1; S.dirty = true; } });

  function payload() {
    var st = (window.__drunk || {}).st || {};
    var g = geo || { city: '', region: '', country: '' };
    var p = new URLSearchParams();
    p.append('type', 'game');
    p.append('v', VERSION);
    p.append('session', S.id);
    p.append('visitor', visitor);
    p.append('returning', returning ? 'Yes' : 'No');
    p.append('started', S.started);
    p.append('device', document.body.classList.contains('phone') ? 'phone' : 'computer');
    p.append('city', g.city); p.append('region', g.region); p.append('country', g.country);
    p.append('source', source); p.append('medium', medium); p.append('campaign', campaign);
    var total = 0; Object.keys(S.secs).forEach(function (k) { total += S.secs[k]; p.append('t_' + k, S.secs[k]); });
    p.append('t_total', total);
    p.append('path', S.path.join(' > ').slice(0, 400));
    p.append('ending', S.ending || 'in progress');
    p.append('continued', S.continued ? 'Yes' : 'No');
    p.append('drinks', st.drinks || 0);
    p.append('blackouts', S.blackouts);
    p.append('cops', st.cops || 0);
    p.append('key', st.key ? 'Yes' : 'No');
    p.append('spell', st.spellSeen ? 'Yes' : 'No');
    p.append('lyrics', (st.journal || []).length);
    p.append('cups', st.cupN || 0);
    p.append('hints', S.hints);
    p.append('listens', S.listens);
    p.append('listenFrom', Object.keys(S.listenFrom).map(function (k) { return k + ':' + S.listenFrom[k]; }).join(', '));
    p.append('backFromSong', st.backs || 0);
    return p;
  }

  // One row per session; later sends update the same row.
  function send() {
    if (!S || !S.dirty) return;
    var total = 0; Object.keys(S.secs).forEach(function (k) { total += S.secs[k]; });
    if (total < 5 && !S.ending) return; // ignore sessions that never really started
    S.dirty = false;
    var body = payload();
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (e) { /* fall through */ }
    try { fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: body, keepalive: true }); } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) send(); });
  addEventListener('pagehide', send);
  setInterval(send, 60000); // a checkpoint each minute so long sessions aren't lost
})();
