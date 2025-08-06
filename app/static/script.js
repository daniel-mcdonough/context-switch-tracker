document.addEventListener("DOMContentLoaded", () => {
    let monthView = false;
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
        ticketSel.innerHTML = "<option value='' disabled selected>-- Select a task --</option>";
        fetch("/tasks")
            .then(r => r.json())
            .then(items => {
                items.forEach(item => {
                    const opt = document.createElement("option");
                    opt.value = item.key;
                    opt.textContent = `${item.key}: ${item.summary}`;
                    ticketSel.append(opt);
                });
            })
            .catch(err => {
                ticketSel.innerHTML = "<option value='' disabled selected>Error loading tasks</option>";
                console.error("Failed to load tasks:", err);
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
                    resultDiv.className = "error";
                } else {
                    resultDiv.textContent = `✓ Switched from ${json.from || "idle"} to ${json.to}`;
                    resultDiv.className = "";
                    // clear inputs
                    noteInput.value = "";
                    categoryIn.value = "";
                    ticketSel.value = "";
                    fetchCurrent();
                    // Auto-hide success message after 5 seconds
                    setTimeout(() => {
                        resultDiv.textContent = "";
                    }, 5000);
                }
            })
            .catch(err => {
                resultDiv.textContent = "Error: Failed to switch task";
                resultDiv.className = "error";
                console.error("Switch error:", err);
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
                    addResult.className = "error";
                } else {
                    addResult.textContent = `✓ Added task ${json.key}`;
                    addResult.className = "";
                    // Clear inputs
                    document.getElementById("new-key").value = "";
                    document.getElementById("new-name").value = "";
                    loadTasks();
                    // Auto-hide success message after 5 seconds
                    setTimeout(() => {
                        addResult.textContent = "";
                    }, 5000);
                }
            });
    });

    // Stop current task handler
    document.getElementById("stop-task").addEventListener("click", () => {
        fetch("/stop", { method: "POST" })
            .then(r => r.json())
            .then(json => {
                fetchCurrent();
                resultDiv.textContent = `✓ Stopped task ${json.from || "idle"}`;
                resultDiv.className = "";
                // Auto-hide success message after 5 seconds
                setTimeout(() => {
                    resultDiv.textContent = "";
                }, 5000);
            })
            .catch(err => {
                resultDiv.textContent = "Error: Failed to stop task";
                resultDiv.className = "error";
                console.error("Stop error:", err);
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

    // Month toggle button for metrics
    const monthBtn = document.getElementById("month-view-btn");
    monthBtn.addEventListener("click", () => {
        monthView = !monthView;
        loadMetrics();
    });

    // METRICS: fetch & render
    function loadMetrics() {
        const view = monthView ? "month" : "week";
        // Render the D3 chart
        loadD3Metrics(view);
        // Update the raw switch log
        const logEl = document.getElementById("switch-log");
        logEl.innerHTML = "";
        fetch("/metrics/switches")
            .then(r => r.json())
            .then(items => {
                if (items.length === 0) {
                    const li = document.createElement("li");
                    li.textContent = "No context switches recorded this week";
                    li.style.color = "var(--text-muted)";
                    logEl.append(li);
                } else {
                    items.forEach(it => {
                        const li = document.createElement("li");
                        const time = new Date(it.timestamp).toLocaleString('en-US', { 
                            weekday: 'short', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        });
                        li.innerHTML = `<strong>${time}</strong> — ${it.from || 'idle'} → ${it.to}`
                            + (it.note ? ` <span style="color: var(--text-secondary)">(${it.note})</span>` : "");
                        logEl.append(li);
                    });
                }
            });
    }
});

