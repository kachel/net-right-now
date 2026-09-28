const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_CHIPS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Daily"];
const BAND_ORDER = ["10m", "6m", "2m", "1.25m", "70cm", "40m", "80m", "160m"];
const NON_HAM_BANDS = ["GMRS", "Internet"];
const CATEGORY_ORDER = ["Amateur Radio", "GMRS", "Internet"];

const FAVORITES_KEY = "chz-favorites";

let allNets = [];
let netsVisible = true;
let locationFilter = "all"; // 'chicago', 'chicagoland', or 'all'
let categoryFilter = "all";
let dayFilter = "all";
let bandFilter = "all";
let searchQuery = "";
let sortKey = null;
let sortDir = "asc";
let favorites = new Set();
let favoritesOnly = false;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------------------------------- */
/* time helpers                        */
/* ---------------------------------- */

function getCSTTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
}

function timeToMinutes(timeStr) {
  const match = String(timeStr ?? "").match(/(\d{1,2}):(\d{2})(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function runsOnDay(dayStr, dayNum) {
  const day = DAYS_OF_WEEK[dayNum];
  if (!dayStr) return false;

  if (dayStr === "Daily") return true;
  if (dayStr === day) return true;
  if (dayStr === "Weekdays") return dayNum >= 1 && dayNum <= 5;
  if (dayStr.includes("-")) {
    const [start, end] = dayStr.split("-").map((d) => d.trim());
    const startIdx = DAYS_OF_WEEK.indexOf(start);
    const endIdx = DAYS_OF_WEEK.indexOf(end);
    if (startIdx !== -1 && endIdx !== -1 && dayNum >= startIdx && dayNum <= endIdx) return true;
  }

  // Fallback for irregular schedules like "1st Thursday", "4th Wednesday",
  // "First & Third Tuesday" — match on the weekday name appearing anywhere.
  return dayStr.toLowerCase().includes(day.toLowerCase());
}

function displayCSTTime() {
  const now = new Date();
  const options = {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
    timeZoneName: "short",
  };
  const el = document.getElementById("cst-time");
  if (el) el.textContent = now.toLocaleString("en-US", options);
}

/* ---------------------------------- */
/* filtering                           */
/* ---------------------------------- */

function filterByLocation(nets) {
  if (locationFilter === "chicago") {
    return nets.filter((net) => net.Location && net.Location.toLowerCase().includes("chicago"));
  } else if (locationFilter === "chicagoland") {
    return nets.filter((net) => !net.Location || !net.Location.toLowerCase().includes("chicago"));
  }
  return nets;
}

function filterByCategory(nets) {
  if (categoryFilter === "all") return nets;
  return nets.filter((net) => net.Category === categoryFilter);
}

function filterByDay(nets) {
  if (dayFilter === "all") return nets;
  if (dayFilter === "Daily") return nets.filter((net) => net.Day === "Daily");
  const dayNum = DAYS_OF_WEEK.indexOf(dayFilter);
  if (dayNum === -1) return nets;
  return nets.filter((net) => runsOnDay(net.Day, dayNum));
}

function filterByBand(nets) {
  if (bandFilter === "all") return nets;
  return nets.filter((net) => net.Band === bandFilter);
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    favorites = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    favorites = new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // localStorage unavailable (private browsing, storage full) — favorites just won't persist
  }
}

function isFavorite(net) {
  return favorites.has(String(net.ID));
}

function toggleFavorite(id) {
  id = String(id);
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  updateFavoritesCount();
}

function updateFavoritesCount() {
  const label = document.getElementById("favorites-toggle-label");
  if (label) label.textContent = favorites.size > 0 ? `Favorites (${favorites.size})` : "Favorites";
}

function favStarHtml(net) {
  const fav = isFavorite(net);
  const label = fav ? "Remove from favorites" : "Add to favorites";
  return `<button type="button" class="fav-star${fav ? " active" : ""}" data-fav-id="${esc(net.ID)}" aria-pressed="${fav}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.5 5.6 6.1.6-4.6 4.1 1.4 6-5.4-3.2-5.4 3.2 1.4-6-4.6-4.1 6.1-.6z" /></svg></button>`;
}

function filterByFavorites(nets) {
  if (!favoritesOnly) return nets;
  return nets.filter((net) => isFavorite(net));
}

function filterBySearch(nets) {
  if (!searchQuery) return nets;
  const q = searchQuery.toLowerCase();
  return nets.filter((net) => {
    const name = (net["Name Of Net"] || "").toLowerCase();
    const sponsor = (net.Sponsor || "").toLowerCase();
    return name.includes(q) || sponsor.includes(q);
  });
}

function getFilteredNets({ includeSearch = true } = {}) {
  let nets = allNets;
  nets = filterByLocation(nets);
  nets = filterByCategory(nets);
  nets = filterByDay(nets);
  nets = filterByBand(nets);
  nets = filterByFavorites(nets);
  if (includeSearch) nets = filterBySearch(nets);
  return nets;
}

/* ---------------------------------- */
/* next net / status panel             */
/* ---------------------------------- */

function getNextNetGroups() {
  const nets = getFilteredNets().filter((net) => net.Category !== "Internet");
  const cstTime = getCSTTime();
  const today = cstTime.getDay();
  const currentMinutes = cstTime.getHours() * 60 + cstTime.getMinutes();

  const happeningNets = [];
  const likelyHappeningNets = [];
  const upcomingNets = [];

  nets.forEach((net) => {
    if (net["Name Of Net"] && runsOnDay(net.Day, today)) {
      const netMinutes = timeToMinutes(net["Time CST"]);
      if (netMinutes !== null) {
        const timeDiff = currentMinutes - netMinutes;

        if (timeDiff >= 0 && timeDiff <= 30) {
          happeningNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        } else if (timeDiff > 30 && timeDiff < 60) {
          likelyHappeningNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        } else if (timeDiff < 0) {
          upcomingNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        }
      }
    }
  });

  upcomingNets.sort((a, b) => a.minutesUntil - b.minutesUntil);

  return { happeningNets, likelyHappeningNets, upcomingNets };
}

function createNetCard(net, status, timeInfo = "") {
  return `
<div class="next-net-card ${status}">
  <div>
    <div class="net-name">${favStarHtml(net)}${esc(net["Name Of Net"])}<span>@ ${esc(net["Time CST"])} CST</span></div>
    <div class="net-sponsor">Sponsor: <a href="${esc(net.Website || "#")}">${esc(net.Sponsor || "—")}</a></div>
    <div class="net-location">${esc(net.Location || "")}</div>
    <div class="next-net-details">
      <span>Freq: <strong>${esc(net.Frequency || "—")}</strong></span>
      <span>Offset: <strong>${esc(net.Offset || "—")}</strong></span>
      <span>PL: <strong>${esc(net["PL Tone"] || "None")}</strong></span>
    </div>
  </div>
  ${timeInfo ? `<div class="net-countdown">Starts in<strong>${timeInfo}</strong></div>` : ""}
</div>`;
}

function displayNextNet() {
  const { happeningNets, likelyHappeningNets, upcomingNets } = getNextNetGroups();
  const container = document.getElementById("next-net");
  if (!container) return;

  let html = "";

  if (happeningNets.length > 0) {
    html += `<h3 class="status-group-heading"><span class="led led-live"></span>Happening Now</h3>`;
    happeningNets.forEach(({ net }) => {
      html += createNetCard(net, "happening");
    });
  }

  if (likelyHappeningNets.length > 0) {
    html += `<h3 class="status-group-heading"><span class="led led-likely"></span>Likely Happening</h3>`;
    likelyHappeningNets.forEach(({ net }) => {
      html += createNetCard(net, "likely");
    });
  }

  if (upcomingNets.length > 0) {
    html += `<h3 class="status-group-heading"><span class="led led-upcoming"></span>Upcoming</h3>`;
    const { net, minutesUntil } = upcomingNets[0];
    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;
    html += createNetCard(net, "upcoming", `${hours}h ${minutes}m`);
  }

  if (html === "") {
    html = `<p class="status-empty">No nets found for the selected area right now.</p>`;
  }

  container.innerHTML = html;
}

/* ---------------------------------- */
/* schedule table                      */
/* ---------------------------------- */

function isNetLiveNow(net) {
  const cstTime = getCSTTime();
  const today = cstTime.getDay();
  const currentMinutes = cstTime.getHours() * 60 + cstTime.getMinutes();

  if (!net["Name Of Net"] || !runsOnDay(net.Day, today)) return false;
  const netMinutes = timeToMinutes(net["Time CST"]);
  if (netMinutes === null) return false;
  const timeDiff = currentMinutes - netMinutes;
  return timeDiff >= 0 && timeDiff <= 30;
}

function dayForSort(dayStr) {
  if (!dayStr) return 99;
  if (dayStr === "Daily") return -1;
  if (dayStr === "Weekdays") return 1;
  for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
    if (dayStr.toLowerCase().includes(DAYS_OF_WEEK[i].toLowerCase())) return i;
  }
  return 99;
}

function bandForSort(bandStr) {
  const idx = BAND_ORDER.indexOf(bandStr);
  return idx === -1 ? 99 : idx;
}

function sortNets(nets) {
  if (!sortKey) return nets;
  const sorted = [...nets];
  const dir = sortDir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case "day":
        av = dayForSort(a.Day);
        bv = dayForSort(b.Day);
        if (av === bv) {
          av = timeToMinutes(a["Time CST"]) ?? 0;
          bv = timeToMinutes(b["Time CST"]) ?? 0;
        }
        break;
      case "time":
        av = timeToMinutes(a["Time CST"]) ?? 0;
        bv = timeToMinutes(b["Time CST"]) ?? 0;
        break;
      case "band":
        av = bandForSort(a.Band);
        bv = bandForSort(b.Band);
        break;
      case "name":
        av = (a["Name Of Net"] || "").toLowerCase();
        bv = (b["Name Of Net"] || "").toLowerCase();
        break;
      case "sponsor":
        av = (a.Sponsor || "").toLowerCase();
        bv = (b.Sponsor || "").toLowerCase();
        break;
      case "frequency":
        av = parseFloat(a.Frequency) || 0;
        bv = parseFloat(b.Frequency) || 0;
        break;
      case "location":
        av = (a.Location || "").toLowerCase();
        bv = (b.Location || "").toLowerCase();
        break;
      default:
        av = 0;
        bv = 0;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return sorted;
}

function renderTableHeaderSortState() {
  document.querySelectorAll(".nets-table th[data-sort]").forEach((th) => {
    const key = th.dataset.sort;
    if (key === sortKey) {
      th.setAttribute("aria-sort", sortDir === "asc" ? "ascending" : "descending");
    } else {
      th.removeAttribute("aria-sort");
    }
  });
}

const URL_PREFIX_RE = /^https?:\/\//i;

function toHref(url) {
  return URL_PREFIX_RE.test(url) ? url : `https://${url}`;
}

function renderLink(href, label) {
  return `<a href="${esc(toHref(href))}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function linkCell(text) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  if (URL_PREFIX_RE.test(value)) {
    return renderLink(value, value.replace(URL_PREFIX_RE, ""));
  }
  return esc(value);
}

function sponsorCell(net) {
  const sponsor = String(net.Sponsor ?? "").trim();
  const website = String(net.Website ?? "").trim();
  const label = sponsor || website || "—";
  if (website) return renderLink(website, label);
  return linkCell(sponsor) || esc(label);
}

function connectionCell(net) {
  const freq = String(net.Frequency ?? "").trim();
  if (freq) return esc(freq);
  const link = String(net["Internet Link"] ?? "").trim();
  if (!link) return '<span class="cell-muted">—</span>';
  const lines = link.split(/\r?\n/).filter(Boolean);
  const summary = lines[0] + (lines.length > 1 ? " …" : "");
  const full = lines.join(" · ");
  return `<span class="cell-connect" title="${esc(full)}">${esc(summary)}</span>`;
}

function anyFilterActive() {
  return (
    locationFilter !== "all" ||
    categoryFilter !== "all" ||
    dayFilter !== "all" ||
    bandFilter !== "all" ||
    favoritesOnly ||
    searchQuery !== ""
  );
}

function updateResetFiltersVisibility() {
  const resetBtn = document.getElementById("reset-filters-btn");
  if (resetBtn) resetBtn.hidden = !anyFilterActive();
}

function fadeSwap(el, updateFn) {
  if (!el.children.length) {
    updateFn();
    return;
  }
  el.style.opacity = "0";
  window.setTimeout(() => {
    updateFn();
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
  }, 120);
}

function renderTable() {
  const tbody = document.getElementById("nets-tbody");
  const noResults = document.getElementById("no-results");
  const resultCount = document.getElementById("result-count");
  if (!tbody) return;

  updateResetFiltersVisibility();

  let nets = getFilteredNets();
  nets = sortNets(nets);

  if (resultCount) {
    resultCount.textContent = `${nets.length} net${nets.length === 1 ? "" : "s"}`;
  }

  fadeSwap(tbody, () => {
    if (nets.length === 0) {
      tbody.innerHTML = "";
      if (noResults) noResults.hidden = false;
      return;
    }
    if (noResults) noResults.hidden = true;

    tbody.innerHTML = nets
      .map((net) => {
        const live = isNetLiveNow(net);
        return `
<tr class="${live ? "row-live" : ""}">
  <td data-label="Day">${esc(net.Day || "")}</td>
  <td class="cell-mono" data-label="Time CST">${esc(net["Time CST"] || "")}</td>
  <td class="cell-name" data-label="Net">${favStarHtml(net)}${esc(net["Name Of Net"] || "")}</td>
  <td data-label="Sponsor">${sponsorCell(net)}</td>
  <td class="cell-mono" data-label="Freq / Link">${connectionCell(net)}</td>
  <td data-label="Band">${net.Band ? `<span class="band-tag">${esc(net.Band)}</span>` : ""}</td>
  <td data-label="Location">${esc(net.Location || "")}</td>
</tr>`;
      })
      .join("");

    renderTableHeaderSortState();
  });
}

/* ---------------------------------- */
/* filter chip UI                      */
/* ---------------------------------- */

function buildChipGroup(container, values, current, onSelect) {
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "chip";
  allBtn.textContent = "All";
  allBtn.dataset.value = "all";
  container.appendChild(allBtn);

  values.forEach((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = value;
    btn.dataset.value = value;
    container.appendChild(btn);
  });

  const updateActive = () => {
    container.querySelectorAll(".chip").forEach((btn) => {
      const isActive = btn.dataset.value === current();
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  };

  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      onSelect(btn.dataset.value);
      updateActive();
      syncStateToURL();
    });
  });

  updateActive();
  return updateActive;
}

function getUniqueBands() {
  const found = new Set();
  allNets.forEach((net) => {
    if (net.Band && !NON_HAM_BANDS.includes(net.Band)) found.add(net.Band);
  });
  const ordered = BAND_ORDER.filter((b) => found.has(b));
  const extras = [...found].filter((b) => !BAND_ORDER.includes(b)).sort();
  return [...ordered, ...extras];
}

function getUniqueCategories() {
  const found = new Set();
  allNets.forEach((net) => {
    if (net.Category) found.add(net.Category);
  });
  const ordered = CATEGORY_ORDER.filter((c) => found.has(c));
  const extras = [...found].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...ordered, ...extras];
}

/* ---------------------------------- */
/* URL state sync                      */
/* ---------------------------------- */

function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("loc")) locationFilter = params.get("loc");
  if (params.has("cat")) categoryFilter = params.get("cat");
  if (params.has("day")) dayFilter = params.get("day");
  if (params.has("band")) bandFilter = params.get("band");
  if (params.has("fav")) favoritesOnly = params.get("fav") === "1";
  if (params.has("q")) searchQuery = params.get("q");
  if (params.has("sort")) sortKey = params.get("sort");
  if (params.has("dir")) sortDir = params.get("dir") === "desc" ? "desc" : "asc";
}

function syncStateToURL() {
  const params = new URLSearchParams();
  if (locationFilter !== "all") params.set("loc", locationFilter);
  if (categoryFilter !== "all") params.set("cat", categoryFilter);
  if (dayFilter !== "all") params.set("day", dayFilter);
  if (bandFilter !== "all") params.set("band", bandFilter);
  if (favoritesOnly) params.set("fav", "1");
  if (searchQuery) params.set("q", searchQuery);
  if (sortKey) {
    params.set("sort", sortKey);
    params.set("dir", sortDir);
  }
  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", newUrl);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setDisclosureExpanded(el, expand) {
  if (!el) return;
  const inner = el.querySelector(".disclosure-inner") || el;

  if (expand) el.removeAttribute("inert");

  if (prefersReducedMotion()) {
    el.getAnimations().forEach((a) => a.cancel());
    el.classList.toggle("expanded", expand);
    el.style.height = expand ? "auto" : "0px";
    if (!expand) el.setAttribute("inert", "");
    return;
  }

  const startHeight = el.getBoundingClientRect().height;
  el.getAnimations().forEach((a) => a.cancel());
  el.classList.toggle("expanded", expand);
  const endHeight = expand ? inner.scrollHeight : 0;

  el.style.height = `${startHeight}px`;
  const anim = el.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], {
    duration: 280,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  });
  anim.onfinish = () => {
    el.style.height = expand ? "auto" : "0px";
    if (!expand) el.setAttribute("inert", "");
  };
}

/* ---------------------------------- */
/* toggle / render orchestration       */
/* ---------------------------------- */

function toggleNetsVisibility() {
  netsVisible = !netsVisible;
  const wrap = document.getElementById("schedule-disclosure");
  const toggleBtn = document.getElementById("toggle-nets-btn");

  setDisclosureExpanded(wrap, netsVisible);
  if (toggleBtn) {
    toggleBtn.textContent = netsVisible ? "Hide Schedule" : "Show Schedule";
    toggleBtn.setAttribute("aria-pressed", String(netsVisible));
    toggleBtn.setAttribute("aria-expanded", String(netsVisible));
  }
}

function refreshAll() {
  displayNextNet();
  renderTable();
}

function renderLoadError() {
  const container = document.getElementById("next-net");
  if (!container) return;
  container.innerHTML = `
<div class="status-error">
  <div class="status-error-title">Couldn't load the schedule</div>
  <p class="status-error-body">The net list didn't come through — check your connection and try again.</p>
  <button type="button" class="btn-toggle" id="retry-load-btn">Try again</button>
</div>`;
  document.getElementById("retry-load-btn")?.addEventListener("click", () => {
    container.innerHTML = "";
    attemptLoad();
  });
}

async function loadNets() {
  const res = await fetch("./chicago-area-nets.json");
  if (!res.ok) throw new Error(res.statusText);
  allNets = await res.json();
}

async function attemptLoad() {
  try {
    await loadNets();
  } catch (err) {
    renderLoadError();
    return;
  }
  initUI();
}

function init() {
  loadFavorites();
  displayCSTTime();
  setInterval(displayCSTTime, 1000);
  setInterval(refreshAll, 60000);
  attemptLoad();
}

function initUI() {
  loadStateFromURL();

  // More filters disclosure (Day/Band)
  const moreFiltersBtn = document.getElementById("more-filters-btn");
  const moreFiltersPanel = document.getElementById("more-filters");
  const setMoreFiltersExpanded = (expanded) => {
    if (!moreFiltersBtn || !moreFiltersPanel) return;
    moreFiltersBtn.setAttribute("aria-expanded", String(expanded));
    setDisclosureExpanded(moreFiltersPanel, expanded);
    moreFiltersBtn.querySelector(".more-filters-btn-label").textContent = expanded
      ? "Fewer Filters"
      : "More Filters";
  };
  if (moreFiltersBtn) {
    moreFiltersBtn.addEventListener("click", () => {
      setMoreFiltersExpanded(moreFiltersBtn.getAttribute("aria-expanded") !== "true");
    });
  }
  if (dayFilter !== "all" || bandFilter !== "all") setMoreFiltersExpanded(true);

  // Location chips
  const filterBtns = document.querySelectorAll(".location-filter-btn");
  const updateLocationChips = () => {
    filterBtns.forEach((b) => {
      const isActive = b.dataset.filter === locationFilter;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
  };
  updateLocationChips();
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      locationFilter = btn.dataset.filter;
      updateLocationChips();
      refreshAll();
      syncStateToURL();
    });
  });

  // Favorites toggle
  const favToggleBtn = document.getElementById("favorites-toggle-btn");
  updateFavoritesCount();
  if (favToggleBtn) {
    favToggleBtn.setAttribute("aria-pressed", String(favoritesOnly));
    favToggleBtn.addEventListener("click", () => {
      favoritesOnly = !favoritesOnly;
      favToggleBtn.setAttribute("aria-pressed", String(favoritesOnly));
      refreshAll();
      syncStateToURL();
    });
  }

  // Favorite-star clicks (event delegation, since rows/cards are re-rendered)
  document.getElementById("nets-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".fav-star");
    if (!btn) return;
    toggleFavorite(btn.dataset.favId);
    refreshAll();
  });
  document.getElementById("next-net")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".fav-star");
    if (!btn) return;
    toggleFavorite(btn.dataset.favId);
    refreshAll();
  });

  // Category chips
  const updateCategoryChips = buildChipGroup(
    document.getElementById("category-filter-group"),
    getUniqueCategories(),
    () => categoryFilter,
    (value) => {
      categoryFilter = value;
      refreshAll();
    },
  );

  // Day chips
  const updateDayChips = buildChipGroup(
    document.getElementById("day-filter-group"),
    DAY_CHIPS,
    () => dayFilter,
    (value) => {
      dayFilter = value;
      refreshAll();
    },
  );

  // Band chips
  const updateBandChips = buildChipGroup(
    document.getElementById("band-filter-group"),
    getUniqueBands(),
    () => bandFilter,
    (value) => {
      bandFilter = value;
      refreshAll();
    },
  );

  // Search
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.value = searchQuery;
    const debouncedSearch = debounce(() => {
      searchQuery = searchInput.value.trim();
      refreshAll();
      syncStateToURL();
    }, 150);
    searchInput.addEventListener("input", debouncedSearch);
  }

  // Reset filters
  const resetBtn = document.getElementById("reset-filters-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      locationFilter = "all";
      categoryFilter = "all";
      dayFilter = "all";
      bandFilter = "all";
      favoritesOnly = false;
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      updateLocationChips();
      updateCategoryChips();
      updateDayChips();
      updateBandChips();
      favToggleBtn?.setAttribute("aria-pressed", "false");
      refreshAll();
      syncStateToURL();
      resetBtn.blur();
    });
  }

  // Sortable headers
  document.querySelectorAll(".nets-table th[data-sort] .th-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.parentElement.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      renderTable();
      syncStateToURL();
    });
  });

  // Show/hide schedule
  const toggleBtn = document.getElementById("toggle-nets-btn");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleNetsVisibility);

  refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
