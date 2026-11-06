/* Waveform — a clean-room study of a streaming web player.
   Seed catalogue, artwork and copy are original to this project. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     Seed data
     --------------------------------------------------------------------- */
  const ART = {
    indigo: ["#4b3fd4", "#181046"],
    jade:   ["#1c8f6f", "#06221c"],
    ember:  ["#d4562b", "#2a0d06"],
    plum:   ["#8c2f9e", "#220a2c"],
    sand:   ["#c9a227", "#2b2107"],
    ice:    ["#2f7ec2", "#071b2c"],
    rose:   ["#c2405f", "#2a0710"],
    moss:   ["#5f8f2f", "#16210a"],
    slate:  ["#55606e", "#12161b"],
    coral:  ["#e0654f", "#2b0f0a"]
  };

  const tracks = [
    { id: "t1",  title: "Night Shift Radio",   artist: "Halcyon Ridge",  duration: 222, art: "indigo", plays: "48,201,776" },
    { id: "t2",  title: "Paper Lanterns",      artist: "Mina Vale",      duration: 178, art: "sand",   plays: "31,884,502" },
    { id: "t3",  title: "Slow Gold",           artist: "The Kestrels",   duration: 245, art: "ember",  plays: "27,190,338" },
    { id: "t4",  title: "Concrete Garden",     artist: "Ayo Brixton",    duration: 196, art: "slate",  plays: "22,004,915" },
    { id: "t5",  title: "Afterglow Avenue",    artist: "Sable Hours",    duration: 207, art: "plum",   plays: "19,552,071" },
    { id: "t6",  title: "Hollow Bones",        artist: "Nia Okafor",     duration: 231, art: "moss",   plays: "17,308,640" },
    { id: "t7",  title: "Static Bloom",        artist: "Villanelle",     duration: 189, art: "rose",   plays: "15,772,129" },
    { id: "t8",  title: "Copperline",          artist: "Halcyon Ridge",  duration: 254, art: "coral",  plays: "14,115,880" },
    { id: "t9",  title: "Low Tide Talking",    artist: "Mina Vale",      duration: 203, art: "ice",    plays: "12,660,412" },
    { id: "t10", title: "Westbound Static",    artist: "The Kestrels",   duration: 218, art: "jade",   plays: "11,488,206" },
    { id: "t11", title: "Ghost Frequency",     artist: "Sable Hours",    duration: 236, art: "indigo", plays: "10,204,773" },
    { id: "t12", title: "Every Other Sunday",  artist: "Nia Okafor",     duration: 172, art: "sand",   plays: "9,331,908" }
  ];

  const artists = [
    { id: "a1", title: "Halcyon Ridge",  art: "indigo", listeners: "12,904,331 monthly listeners" },
    { id: "a2", title: "Mina Vale",      art: "sand",   listeners: "9,772,014 monthly listeners" },
    { id: "a3", title: "Ayo Brixton",    art: "slate",  listeners: "8,140,662 monthly listeners" },
    { id: "a4", title: "Nia Okafor",     art: "moss",   listeners: "7,559,208 monthly listeners" },
    { id: "a5", title: "Sable Hours",    art: "plum",   listeners: "6,820,455 monthly listeners" },
    { id: "a6", title: "Villanelle",     art: "rose",   listeners: "5,301,970 monthly listeners" },
    { id: "a7", title: "The Kestrels",   art: "ember",  listeners: "4,988,116 monthly listeners" }
  ];

  const albums = [
    { id: "b1", title: "Night Shift Radio",  artist: "Halcyon Ridge", art: "indigo" },
    { id: "b2", title: "Paper Lanterns EP",  artist: "Mina Vale",     art: "sand" },
    { id: "b3", title: "Slow Gold",          artist: "The Kestrels",  art: "ember" },
    { id: "b4", title: "Concrete Garden",    artist: "Ayo Brixton",   art: "slate" },
    { id: "b5", title: "Afterglow Avenue",   artist: "Sable Hours",   art: "plum" },
    { id: "b6", title: "Hollow Bones",       artist: "Nia Okafor",    art: "moss" },
    { id: "b7", title: "Static Bloom",       artist: "Villanelle",    art: "rose" }
  ];

  const stations = [
    { id: "r1", title: "Halcyon Ridge Radio", art: "indigo", sub: "With Mina Vale, The Kestrels and more" },
    { id: "r2", title: "Mina Vale Radio",     art: "sand",   sub: "With Sable Hours, Villanelle and more" },
    { id: "r3", title: "Ayo Brixton Radio",   art: "slate",  sub: "With Nia Okafor, Halcyon Ridge and more" },
    { id: "r4", title: "Nia Okafor Radio",    art: "moss",   sub: "With The Kestrels, Mina Vale and more" },
    { id: "r5", title: "Sable Hours Radio",   art: "plum",   sub: "With Villanelle, Ayo Brixton and more" }
  ];

  const charts = [
    { id: "c1", title: "Top 50 — Global",    art: "ice",   sub: "Daily update · 50 songs" },
    { id: "c2", title: "Top 50 — Local",     art: "coral", sub: "Daily update · 50 songs" },
    { id: "c3", title: "Viral 50",           art: "rose",  sub: "Daily update · 50 songs" },
    { id: "c4", title: "New Releases",       art: "jade",  sub: "Fresh this week" }
  ];

  const SECTIONS = [
    { id: "trending", title: "Trending songs",            type: "track", items: tracks.slice(0, 7) },
    { id: "artists",  title: "Popular artists",           type: "artist", items: artists },
    { id: "albums",   title: "Popular albums and singles", type: "album", items: albums },
    { id: "radio",    title: "Popular radio",             type: "radio", items: stations },
    { id: "charts",   title: "Featured charts",           type: "chart", items: charts }
  ];

  /* ---------------------------------------------------------------------
     Elements
     --------------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const feed = $("feed");
  const skeleton = $("skeleton");
  const dock = $("dock");
  const banner = $("banner");
  const player = $("player");
  const toastEl = $("toast");
  const announcer = $("announcer");
  const searchInput = $("search");

  /* ---------------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------------- */
  function el(tag, attrs, kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        const value = attrs[key];
        if (value === undefined || value === null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else if (key === "style") node.setAttribute("style", value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    (kids || []).forEach((kid) => kid && node.appendChild(kid));
    return node;
  }

  function icon(name, cls) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (cls) svg.setAttribute("class", cls);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  const initials = (text) =>
    text.replace(/[^A-Za-z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("");

  const clock = (seconds) => {
    const total = Math.max(0, Math.round(seconds));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  };

  const artStyle = (key) => {
    const pair = ART[key] || ART.slate;
    return "--art-a:" + pair[0] + ";--art-b:" + pair[1];
  };

  /* ---------------------------------------------------------------------
     Toast
     --------------------------------------------------------------------- */
  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function announce(message) {
    announcer.textContent = "";
    window.setTimeout(() => { announcer.textContent = message; }, 40);
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-toast]");
    if (trigger) toast(trigger.dataset.toast);
  });

  /* ---------------------------------------------------------------------
     Cards and sections
     --------------------------------------------------------------------- */
  function cardFor(item, type) {
    const isArtist = type === "artist";
    const sub = isArtist
      ? item.listeners || "Artist"
      : type === "radio" || type === "chart"
        ? item.sub || ""
        : item.artist || "";
    const playable = type === "track" || type === "album";

    const art = el("button", {
      class: "card__art" + (isArtist ? " card__art--round" : ""),
      type: "button",
      style: artStyle(item.art),
      "aria-label": playable ? "Play " + item.title + " by " + item.artist : "Open " + item.title
    }, [el("span", { class: "card__monogram", text: initials(item.title) })]);
    art.addEventListener("click", () => onCardActivate(item, type));

    const artKids = [art];
    if (playable) {
      const play = el("button", {
        class: "card__play",
        type: "button",
        "aria-label": "Play " + item.title,
        dataset: { play: item.id }
      }, [icon("play")]);
      play.addEventListener("click", (event) => {
        event.stopPropagation();
        onCardActivate(item, type);
      });
      artKids.push(play);
    }

    const kids = [el("div", { class: "card__artwrap" }, artKids)];

    kids.push(el("div", { class: "card__text" }, [
      el("a", { class: "card__title", href: "#main", text: item.title }),
      el("p", { class: "card__sub", text: sub })
    ]));

    return el("article", { class: "card", dataset: { card: item.id } }, kids);
  }

  function onCardActivate(item, type) {
    if (type === "track") { playTrack(item); return; }
    if (type === "album") {
      const match = tracks.find((track) => track.artist === item.artist) || tracks[0];
      playTrack(match);
      return;
    }
    toast("Opening " + item.title + " is not part of this build.");
  }

  function sectionFor(section) {
    const row = el("div", {
      class: "row",
      id: "row-" + section.id,
      role: "list",
      "aria-label": section.title
    }, section.items.map((item) => cardFor(item, section.type)));

    const prev = el("button", { class: "row-nav row-nav--prev", type: "button", "aria-label": "Scroll " + section.title + " left" }, [icon("chevron")]);
    const next = el("button", { class: "row-nav row-nav--next", type: "button", "aria-label": "Scroll " + section.title + " right" }, [icon("chevron")]);
    prev.addEventListener("click", () => row.scrollBy({ left: -row.clientWidth * 0.9 }));
    next.addEventListener("click", () => row.scrollBy({ left: row.clientWidth * 0.9 }));

    const node = el("section", { class: "section", "aria-labelledby": "h-" + section.id }, [
      el("div", { class: "section__head" }, [
        el("h2", { class: "section__title", id: "h-" + section.id, text: section.title }),
        el("a", {
          class: "show-all", href: "#main", text: "Show all",
          onclick: (event) => { event.preventDefault(); toast("The full " + section.title.toLowerCase() + " page is out of scope."); }
        })
      ]),
      el("div", { class: "row-wrap" }, [prev, row, next])
    ]);

    const syncNav = () => {
      const max = row.scrollWidth - row.clientWidth;
      prev.disabled = row.scrollLeft <= 2;
      next.disabled = row.scrollLeft >= max - 2;
    };
    row.addEventListener("scroll", syncNav, { passive: true });
    window.addEventListener("resize", syncNav);
    requestAnimationFrame(syncNav);
    return node;
  }

  function renderSections(sections) {
    const fragment = document.createDocumentFragment();
    sections.forEach((section) => fragment.appendChild(sectionFor(section)));
    feed.replaceChildren(fragment);
    syncCardStates();
  }

  /* ---------------------------------------------------------------------
     Search
     --------------------------------------------------------------------- */
  function searchSections(query) {
    const q = query.trim().toLowerCase();
    if (!q) return { sections: SECTIONS, empty: false };

    const matchedTracks = tracks.filter((track) =>
      track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q));
    const matchedArtists = artists.filter((artist) => artist.title.toLowerCase().includes(q));
    const matchedAlbums = albums.filter((album) =>
      album.title.toLowerCase().includes(q) || album.artist.toLowerCase().includes(q));

    const sections = [];
    if (matchedTracks.length) sections.push({ id: "results-tracks", title: "Songs", type: "track", items: matchedTracks });
    if (matchedArtists.length) sections.push({ id: "results-artists", title: "Artists", type: "artist", items: matchedArtists });
    if (matchedAlbums.length) sections.push({ id: "results-albums", title: "Albums", type: "album", items: matchedAlbums });

    return { sections, empty: sections.length === 0, query: query.trim() };
  }

  function renderEmpty(query) {
    feed.replaceChildren(el("div", { class: "empty" }, [
      el("p", { class: "empty__title", text: "Nothing found for “" + query + "”" }),
      el("p", { text: "Try a different spelling, or search for an artist, song or album." })
    ]));
  }

  function applySearch(query) {
    const result = searchSections(query);
    if (result.empty) renderEmpty(result.query);
    else renderSections(result.sections);
  }

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const value = searchInput.value;
    searchTimer = setTimeout(() => applySearch(value), 120);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { searchInput.value = ""; applySearch(""); }
  });
  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    applySearch(searchInput.value);
  });
  document.querySelector(".search__browse").addEventListener("click", () => {
    toast("Browse categories live behind an account.");
  });

  /* ---------------------------------------------------------------------
     Player
     --------------------------------------------------------------------- */
  const state = {
    queue: tracks.slice(),
    index: -1,
    playing: false,
    elapsed: 0,
    duration: 0,
    volume: 70,
    muted: false,
    shuffle: false,
    repeat: false,
    liked: new Set()
  };

  let ticker;

  const nowArt = $("now-art");
  const nowTitle = $("now-title");
  const nowArtist = $("now-artist");
  const toggle = $("toggle");
  const toggleIcon = $("toggle-icon");
  const scrub = $("scrub");
  const scrubFill = $("scrub-fill");
  const timeElapsed = $("time-elapsed");
  const timeTotal = $("time-total");
  const likeBtn = $("like");

  function syncCardStates() {
    const current = state.queue[state.index];
    document.querySelectorAll(".card").forEach((card) => {
      const button = card.querySelector("[data-play]");
      if (!button) return;
      const titleNode = card.querySelector(".card__title");
      const title = titleNode ? titleNode.textContent : "track";
      const isCurrent = Boolean(current && card.dataset.card === current.id);
      const showingPause = isCurrent && state.playing;
      button.setAttribute("aria-label", (showingPause ? "Pause " : "Play ") + title);
      const use = button.querySelector("use");
      if (use) use.setAttribute("href", showingPause ? "#i-pause" : "#i-play");
      if (isCurrent) button.dataset.active = "true";
      else delete button.dataset.active;
    });
  }

  function renderNow() {
    const track = state.queue[state.index];
    if (!track) return;
    banner.hidden = true;
    player.hidden = false;
    nowArt.setAttribute("style", artStyle(track.art));
    nowArt.textContent = initials(track.title);
    nowTitle.textContent = track.title;
    nowArtist.textContent = track.artist;
    toggleIcon.setAttribute("href", state.playing ? "#i-pause" : "#i-play");
    toggle.setAttribute("aria-label", state.playing ? "Pause" : "Play");
    timeTotal.textContent = clock(state.duration);
    likeBtn.setAttribute("aria-pressed", String(state.liked.has(track.id)));
    likeBtn.setAttribute("aria-label", state.liked.has(track.id) ? "Remove from your library" : "Save to your library");
    const heart = likeBtn.querySelector("use");
    if (heart) heart.setAttribute("href", state.liked.has(track.id) ? "#i-heart-filled" : "#i-heart");
    paintProgress();
    syncCardStates();
  }

  function paintProgress() {
    const ratio = state.duration ? Math.min(1, state.elapsed / state.duration) : 0;
    const percent = (ratio * 100).toFixed(2) + "%";
    scrubFill.style.width = percent;
    scrub.style.setProperty("--thumb", percent);
    timeElapsed.textContent = clock(state.elapsed);
    scrub.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    scrub.setAttribute("aria-valuetext", clock(state.elapsed) + " of " + clock(state.duration));
  }

  function startTicker() {
    stopTicker();
    ticker = window.setInterval(() => {
      if (!state.playing) return;
      state.elapsed += 1;
      if (state.elapsed >= state.duration) {
        state.elapsed = state.duration;
        paintProgress();
        advance(1, true);
        return;
      }
      paintProgress();
    }, 1000);
  }
  function stopTicker() { if (ticker) window.clearInterval(ticker); ticker = null; }

  function playTrack(track) {
    const index = state.queue.findIndex((candidate) => candidate.id === track.id);
    state.index = index >= 0 ? index : 0;
    state.duration = track.duration;
    state.elapsed = 0;
    state.playing = true;
    renderNow();
    startTicker();
    announce("Playing " + track.title + " by " + track.artist);
  }

  function playPause() {
    const track = state.queue[state.index];
    if (!track) {
      playTrack(state.queue[0]);
      return;
    }
    state.playing = !state.playing;
    renderNow();
    announce(state.playing ? "Playing " + track.title : "Paused " + track.title);
  }

  function advance(step, auto) {
    if (!state.queue.length) return;
    if (auto && state.repeat) {
      state.elapsed = 0;
      state.playing = true;
      renderNow();
      return;
    }
    let index;
    if (state.shuffle && !auto) {
      do { index = Math.floor(Math.random() * state.queue.length); }
      while (state.queue.length > 1 && index === state.index);
    } else {
      index = (state.index + step + state.queue.length) % state.queue.length;
    }
    state.index = index;
    const track = state.queue[index];
    state.duration = track.duration;
    state.elapsed = 0;
    state.playing = true;
    renderNow();
    announce("Playing " + track.title + " by " + track.artist);
  }

  toggle.addEventListener("click", playPause);
  $("next").addEventListener("click", () => advance(1, false));
  $("prev").addEventListener("click", () => {
    if (state.elapsed > 3) { state.elapsed = 0; paintProgress(); return; }
    advance(-1, false);
  });

  $("shuffle").addEventListener("click", (event) => {
    state.shuffle = !state.shuffle;
    event.currentTarget.setAttribute("aria-pressed", String(state.shuffle));
    event.currentTarget.setAttribute("aria-label", state.shuffle ? "Disable shuffle" : "Enable shuffle");
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
  });

  $("repeat").addEventListener("click", (event) => {
    state.repeat = !state.repeat;
    event.currentTarget.setAttribute("aria-pressed", String(state.repeat));
    event.currentTarget.setAttribute("aria-label", state.repeat ? "Disable repeat" : "Enable repeat");
    toast(state.repeat ? "Repeat on" : "Repeat off");
  });

  likeBtn.addEventListener("click", () => {
    const track = state.queue[state.index];
    if (!track) return;
    if (state.liked.has(track.id)) {
      state.liked.delete(track.id);
      toast("Removed from your library");
    } else {
      state.liked.add(track.id);
      toast("Saved to your library");
    }
    renderNow();
  });

  /* ---------------------------------------------------------------------
     Sliders (seek + volume)
     --------------------------------------------------------------------- */
  function bindSlider(node, onRatio, onKey) {
    let dragging = false;
    const ratioFrom = (event) => {
      const rect = node.getBoundingClientRect();
      return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    };
    node.addEventListener("pointerdown", (event) => {
      dragging = true;
      node.setPointerCapture(event.pointerId);
      onRatio(ratioFrom(event));
    });
    node.addEventListener("pointermove", (event) => {
      if (dragging) onRatio(ratioFrom(event));
    });
    node.addEventListener("pointerup", (event) => {
      dragging = false;
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    });
    node.addEventListener("keydown", (event) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      onKey(event.key);
    });
  }

  bindSlider(scrub, (ratio) => {
    state.elapsed = Math.min(state.duration, Math.round(state.duration * ratio));
    paintProgress();
  }, (key) => {
    const step = key === "PageUp" || key === "PageDown" ? 10 : 5;
    if (key === "Home") state.elapsed = 0;
    else if (key === "End") state.elapsed = state.duration;
    else if (key === "ArrowRight" || key === "ArrowUp" || key === "PageUp") state.elapsed = Math.min(state.duration, state.elapsed + step);
    else state.elapsed = Math.max(0, state.elapsed - step);
    paintProgress();
  });

  const volumeNode = $("volume");
  const volumeFill = $("volume-fill");

  function paintVolume() {
    const value = state.muted ? 0 : state.volume;
    volumeFill.style.width = value + "%";
    volumeNode.setAttribute("aria-valuenow", String(value));
    volumeNode.style.setProperty("--thumb", value + "%");
    $("mute").setAttribute("aria-pressed", String(state.muted));
    $("mute").setAttribute("aria-label", state.muted ? "Unmute" : "Mute");
  }

  bindSlider(volumeNode, (ratio) => {
    state.volume = Math.round(ratio * 100);
    state.muted = state.volume === 0;
    paintVolume();
  }, (key) => {
    const step = 5;
    if (key === "Home") state.volume = 0;
    else if (key === "End") state.volume = 100;
    else if (key === "ArrowRight" || key === "ArrowUp" || key === "PageUp") state.volume = Math.min(100, state.volume + step);
    else state.volume = Math.max(0, state.volume - step);
    state.muted = state.volume === 0;
    paintVolume();
    toast("Volume " + state.volume + "%");
  });

  $("mute").addEventListener("click", () => {
    state.muted = !state.muted;
    paintVolume();
    toast(state.muted ? "Muted" : "Volume " + state.volume + "%");
  });

  /* ---------------------------------------------------------------------
     Keyboard shortcuts, like the original's space bar
     --------------------------------------------------------------------- */
  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target.isContentEditable;
    if (typing) return;
    if (event.code === "Space") {
      event.preventDefault();
      playPause();
    }
    if (event.key === "ArrowRight" && event.shiftKey) advance(1, false);
    if (event.key === "ArrowLeft" && event.shiftKey) advance(-1, false);
  });

  /* ---------------------------------------------------------------------
     Boot: skeleton, then content
     --------------------------------------------------------------------- */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    if (skeleton && skeleton.parentNode) skeleton.remove();
    renderSections(SECTIONS);
    paintVolume();
  }, reduced ? 0 : 550);

  paintVolume();
})();
