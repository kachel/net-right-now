let netsVisible = true;
let locationFilter = "all"; // 'chicago', 'chicagoland', or 'all'

function setLocationFilter(filter) {
  locationFilter = filter;
  const filterBtns = document.querySelectorAll(".location-filter-btn");
  filterBtns.forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.filter === filter) {
      btn.classList.add("active");
    }
  });
  // Only update the upcoming nets (next-net). Do NOT re-render the all-nets container.
  updateNextNetDisplay();
}

function toggleNetsVisibility() {
  netsVisible = !netsVisible;
  const container = document.querySelector(".nets-container") || document.getElementById("nets");
  const toggleBtn = document.getElementById("toggle-nets-btn");

  if (container) {
    container.style.display = netsVisible ? "flex" : "none";
  }

  if (toggleBtn) {
    toggleBtn.textContent = netsVisible ? "Hide All Nets" : "Show All Nets";
    toggleBtn.setAttribute("aria-pressed", netsVisible);
  }
}

// Attach click listener to toggle button
document.addEventListener("DOMContentLoaded", function () {
  const toggleBtn = document.getElementById("toggle-nets-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleNetsVisibility);
  }

  // Attach location filter listeners
  const filterBtns = document.querySelectorAll(".location-filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      setLocationFilter(this.dataset.filter);
    });
  });

  // Set initial active button
  document.querySelector('[data-filter="all"]')?.classList.add("active");
});

// Filter nets by location
function filterNetsByLocation(nets) {
  if (locationFilter === "chicago") {
    return nets.filter((net) => net.Location && net.Location.toLowerCase().includes("chicago"));
  } else if (locationFilter === "chicagoland") {
    return nets.filter((net) => !net.Location || !net.Location.toLowerCase().includes("chicago"));
  }
  return nets;
}

// GET NETS
async function renderNetsFromJson() {
  try {
    const res = await fetch("./chicago-area-nets.json");
    if (!res.ok) throw new Error(res.statusText);
    let data = await res.json();

    // NOTE: Do NOT apply the locationFilter here — keep the nets-container unfiltered.
    // data = filterNetsByLocation(data); <-- removed

    const container = document.querySelector(".nets-container") || document.getElementById("nets");
    if (!container) return;
    container.innerHTML = "";

    const esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );

    data.forEach((item) => {
      const net = document.createElement("div");
      net.className = "net";

      const title = document.createElement("h2");
      title.className = "name title";
      title.textContent = item["Name Of Net"] || item.Name || "";
      net.appendChild(title);

      const inner = document.createElement("div");
      inner.className = "net-container";

      Object.entries(item).forEach(([key, val]) => {
        if (key === "ID" || key === "Name Of Net") return;

        const fieldClass = key
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\-]/g, "");
        const field = document.createElement("div");
        field.className = fieldClass;

        const label = document.createElement("div");
        label.className = `${fieldClass}-label`;
        label.innerHTML = esc(key) + ":&nbsp;";

        const info = document.createElement("div");
        info.className = ` ${fieldClass}-info`;

        const text = String(val ?? "").trim();
        if (key.toLowerCase().includes("site") || /^https?:\/\//i.test(text)) {
          if (text) {
            const a = document.createElement("a");
            a.href = text.startsWith("http") ? text : "https://" + text;
            a.textContent = text;
            a.target = "_blank";
            info.appendChild(a);
          } else {
            info.textContent = "";
          }
        } else {
          info.textContent = text;
        }

        field.appendChild(label);
        field.appendChild(info);
        inner.appendChild(field);
      });

      net.appendChild(inner);
      container.appendChild(net);
    });
  } catch (err) {
    const errEl = document.getElementById("nets") || document.body;
    errEl.textContent = "Error: " + err.message;
  }
}

//   TIME

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

  const cstTime = now.toLocaleString("en-US", options);

  document.getElementById("cst-time").textContent = cstTime;
}

displayCSTTime();

setInterval(displayCSTTime, 1000);

// Get CST Time Helper
function getCSTTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
}

function timeToMinutes(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function runsOnDay(dayStr, dayNum) {
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = daysOfWeek[dayNum];

  if (dayStr === "Daily") return true;
  if (dayStr === day) return true;
  if (dayStr === "Weekdays") return dayNum >= 1 && dayNum <= 5;
  if (dayStr.includes("-")) {
    const [start, end] = dayStr.split("-").map((d) => d.trim());
    const startIdx = daysOfWeek.indexOf(start);
    const endIdx = daysOfWeek.indexOf(end);
    return dayNum >= startIdx && dayNum <= endIdx;
  }

  return false;
}

// Next Net Finder

async function getNextNet() {
  const res = await fetch("./chicago-area-nets.json");
  let nets = await res.json();

  // Apply location filter
  nets = filterNetsByLocation(nets);

  const cstTime = getCSTTime();
  const today = cstTime.getDay();
  const currentMinutes = cstTime.getHours() * 60 + cstTime.getMinutes();

  let happeningNets = [];
  let likelyHappeningNets = [];
  let upcomingNets = [];

  nets.forEach((net) => {
    if (net["Name Of Net"] && runsOnDay(net.Day, today)) {
      const netMinutes = timeToMinutes(net["Time CST"]);
      if (netMinutes !== null) {
        const timeDiff = currentMinutes - netMinutes;

        // Net started within last 30 minutes - HAPPENING
        if (timeDiff >= 0 && timeDiff <= 30) {
          happeningNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        }
        // Net started within last hour - LIKELY HAPPENING
        else if (timeDiff > 30 && timeDiff < 60) {
          likelyHappeningNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        }
        // Net is in the future - UPCOMING
        else if (timeDiff < 0) {
          upcomingNets.push({ net, timeDiff, minutesUntil: -timeDiff });
        }
      }
    }
  });

  // Sort upcoming nets by time until they start
  upcomingNets.sort((a, b) => a.minutesUntil - b.minutesUntil);

  return { happeningNets, likelyHappeningNets, upcomingNets };
}

async function displayNextNet() {
  const { happeningNets, likelyHappeningNets, upcomingNets } = await getNextNet();
  const container = document.getElementById("next-net");

  if (!container) return;

  let html = "";

  // Display happening nets
  if (happeningNets.length > 0) {
    html += `<h3 class="net-status happening title">🔴 Happening Now</h3>`;
    happeningNets.forEach(({ net }) => {
      html += createNetCard(net, "happening");
    });
  }

  // Display likely happening nets
  if (likelyHappeningNets.length > 0) {
    html += `<h3 class="net-status likely title">🟡 Likely Happening</h3>`;
    likelyHappeningNets.forEach(({ net }) => {
      html += createNetCard(net, "likely");
    });
  }

  // Display upcoming nets
  if (upcomingNets.length > 0) {
    html += `<h3 class="net-status upcoming title">🟢 Upcoming</h3>`;
    const { net, minutesUntil } = upcomingNets[0];
    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;
    html += createNetCard(net, "upcoming", `${hours}h ${minutes}m`);
  }

  if (html === "") {
    html = "<p>No nets found for selected location</p>";
  }

  container.innerHTML = html;
  updateCountdown();
}

function createNetCard(net, status, timeInfo = "") {
  return `
<div class="next-net-card ${status}">
  <div class="net-name">${net["Name Of Net"]}<span> @ ${net["Time CST"]} CST</span></div>
  <div class="net-sponsor">
    Sponsor: 
    <a class="dark-link" href="${net.Website}">${net.Sponsor}</a>
  </div>
  <div>${net.Location || ""}</div>
  <div class="next-net-details">
    <div class="net-frequency">Frequency: ${net.Frequency}&nbsp;</div>
    <div class="net-offset">Offset: ${net.Offset || ""}&nbsp;</div>
    <div class="net-pl">PL: ${net["PL Tone"] || "None"}&nbsp;</div>
  </div>
  ${
    timeInfo
      ? `
  <div class="net-countdown">Starts in: <strong>${timeInfo}</strong></div>
  `
      : ""
  }
</div>
  `;
}

// Update next net display and countdown
async function updateNextNetDisplay() {
  await displayNextNet();
}

async function updateCountdown() {
  const { happeningNets, likelyHappeningNets, upcomingNets } = await getNextNet();
  const container = document.getElementById("next-net");

  if (!container) return;

  // Update countdown for upcoming nets
  upcomingNets.forEach(({ net, minutesUntil }, index) => {
    const countdownElements = container.querySelectorAll(".net-countdown strong");
    if (countdownElements[index]) {
      const hours = Math.floor(minutesUntil / 60);
      const minutes = minutesUntil % 60;
      countdownElements[index].textContent = `${hours}h ${minutes}m`;
    }
  });
}

// Initial display and updates
renderNetsFromJson();
updateNextNetDisplay();
setInterval(updateCountdown, 60000); // Update every minute
