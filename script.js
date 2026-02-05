// ...existing code...
(async function renderNetsFromJson() {
  try {
    const res = await fetch("./chicago-area-nets.json");
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
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
        if (key === "ID" || key === "Name Of Net") return; // skip if desired

        const fieldClass = key
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\-]/g, "");
        const field = document.createElement("div");
        field.className = fieldClass;

        const label = document.createElement("div");
        label.className = `${fieldClass}-label`;
        label.textContent = key + ":";

        const info = document.createElement("div");
        info.className = `${fieldClass}-info`;

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
})();

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
