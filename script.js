fetch("./chicago-area-nets.json")
  .then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  })
  .then((data) => {
    const container = document.getElementById("nets");
    container.innerHTML = "";
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) {
      container.textContent = "No data";
      return;
    }
    const table = document.createElement("table");
    const keys = Object.keys(rows[0]);
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr>" + keys.map((k) => `<th>${k}</th>`).join("") + "</tr>";
    const tbody = document.createElement("tbody");
    rows.forEach((item) => {
      const tr = document.createElement("tr");
      keys.forEach((k) => {
        const td = document.createElement("td");
        td.textContent = item[k] ?? "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
  })
  .catch((err) => {
    document.getElementById("nets").textContent = "Error: " + err.message;
  });

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
