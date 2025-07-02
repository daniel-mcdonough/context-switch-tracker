document.addEventListener("DOMContentLoaded", () => {
    const currentEl = document.getElementById("current-task");
    const ticketSel = document.getElementById("ticket-select");
    const noteInput = document.getElementById("note");
    const categoryIn = document.getElementById("category");
    const isSwitchCheckbox = document.getElementById("is-switch");
    const resultDiv = document.getElementById("result");
    const form = document.getElementById("switch-form");

    // Helper to fetch and display the current Timewarrior summary
    function fetchCurrent() {
        fetch("/current")
            .then(r => r.json())
            .then(data => {
                currentEl.textContent = data.summary || "idle";
            });
    }

    // Fetch and display current task
    fetchCurrent();

    // Load tasks (Jira + custom)
    function loadTasks() {
        ticketSel.innerHTML = "<option value='' disabled selected>-- select task --</option>";
        fetch("/tasks")
            .then(r => r.json())
            .then(items => {
                items.forEach(item => {
                    const opt = document.createElement("option");
                    opt.value = item.key;
                    opt.textContent = `${item.key}: ${item.summary}`;
                    ticketSel.append(opt);
                });
            });
    }
    loadTasks();

    // Handle the switch form submission
    form.addEventListener("submit", e => {
        e.preventDefault();
        const to_task = ticketSel.value;
        const note = noteInput.value.trim();
        const category = categoryIn.value.trim();
        const is_switch = isSwitchCheckbox.checked;
        if (!to_task) return alert("Please select a ticket.");

        fetch("/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to_task, note, category, is_switch })
        })
            .then(r => r.json())
            .then(json => {
                if (json.error) {
                    resultDiv.textContent = "Error: " + json.error;
                } else {
                    // currentEl.textContent = json.to;
                    resultDiv.textContent = `Switched from ${json.from || "idle"} to ${json.to}`;
                    // clear inputs
                    noteInput.value = "";
                    categoryIn.value = "";
                    fetchCurrent();
                }
            });
    });

    // Add custom task handler
    document.getElementById("add-task").addEventListener("click", () => {
        const key = document.getElementById("new-key").value.trim();
        const name = document.getElementById("new-name").value.trim();
        if (!key) {
            return alert("Key is required");
        }
        fetch("/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, name })
        })
            .then(r => r.json())
            .then(json => {
                const addResult = document.getElementById("add-result");
                if (json.error) {
                    addResult.textContent = "Error: " + json.error;
                } else {
                    addResult.textContent = `Added task ${json.key}`;
                    loadTasks();
                }
            });
    });

    // Stop current task handler
    document.getElementById("stop-task").addEventListener("click", () => {
        fetch("/stop", { method: "POST" })
            .then(r => r.json())
            .then(json => {
                fetchCurrent();
                resultDiv.textContent = `Stopped task ${json.from || "idle"}`;
            });
    });

    // TAB SWITCHING
    document.querySelectorAll("#tabs li").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelector("#tabs li.active").classList.remove("active");
            tab.classList.add("active");
            document.querySelectorAll(".tab-pane").forEach(p => p.style.display = "none");
            document.getElementById(tab.dataset.tab).style.display = "block";
            if (tab.dataset.tab === "metrics") loadMetrics();
        });
    });

    // METRICS: fetch & render
    function loadMetrics() {
        const gridEl = document.getElementById("grid");
        const logEl = document.getElementById("switch-log");
        gridEl.innerHTML = "";
        logEl.innerHTML = "";

        // Daily counts
        fetch("/metrics/counts")
            .then(r => r.json())
            .then(days => {
                days.forEach(d => {
                    const box = document.createElement("div");
                    box.innerHTML = `<strong>${d.date.slice(5)}</strong><br>${d.count}`;
                    box.style.border = "1px solid #ddd";
                    box.style.padding = "0.5rem";
                    gridEl.append(box);
                });
            });

        // Raw switches
        fetch("/metrics/switches")
            .then(r => r.json())
            .then(items => {
                items.forEach(it => {
                    const li = document.createElement("li");
                    li.textContent = `${it.timestamp.slice(11, 19)} - ${it.from} — ${it.to}` + (it.note ? ` (${it.note})` : "");
                    logEl.append(li);
                });
            });
    }
});

