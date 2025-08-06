document.addEventListener("DOMContentLoaded", () => {
    // Theme management
    const themeToggle = document.getElementById('theme-toggle');
    const themeLabel = document.getElementById('theme-label');
    const themeIcon = document.getElementById('theme-icon');
    
    // Load saved theme or default to modern
    const savedTheme = localStorage.getItem('theme') || 'modern';
    applyTheme(savedTheme);
    
    // Theme toggle functionality
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'modern';
        const newTheme = currentTheme === 'win95' ? 'modern' : 'win95';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    function applyTheme(theme) {
        if (theme === 'win95') {
            document.documentElement.setAttribute('data-theme', 'win95');
            themeLabel.textContent = 'Modern';
            // Update icon to modern theme icon
            themeIcon.innerHTML = `
                <circle cx="12" cy="12" r="5"></circle>
                <path d="m12 1 0 6m0 6 0 6"></path>
                <path d="m4.2 4.2 4.2 4.2m5.6 5.6 4.2 4.2"></path>
                <path d="m1 12 6 0m6 0 6 0"></path>
                <path d="m4.2 19.8 4.2-4.2m5.6-5.6 4.2-4.2"></path>
            `;
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeLabel.textContent = 'Windows 95';
            // Update icon to retro computer icon
            themeIcon.innerHTML = `
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <rect x="7" y="8" width="10" height="8" rx="1" ry="1"></rect>
                <path d="m8 2 0 2"></path>
                <path d="m16 2 0 2"></path>
                <path d="m21 12-2 0"></path>
            `;
        }
    }

    let monthView = false;
    const currentEl = document.getElementById("current-task");
    const ticketSel = document.getElementById("ticket-select");
    const noteInput = document.getElementById("note");
    const categoryIn = document.getElementById("category");
    const isSwitchCheckbox = document.getElementById("is-switch");
    const resultDiv = document.getElementById("result");
    const form = document.getElementById("switch-form");

    // Tag system elements
    const tagsInput = document.getElementById("tags-input");
    const tagSuggestions = document.getElementById("tag-suggestions");
    const selectedTagsContainer = document.getElementById("selected-tags");
    let selectedTags = [];
    let availableTagPresets = [];

    // Tag system functions
    function loadTagPresets() {
        fetch("/tags/presets")
            .then(r => r.json())
            .then(presets => {
                availableTagPresets = presets;
            })
            .catch(err => console.error("Failed to load tag presets:", err));
    }

    function showTagSuggestions(query) {
        const filtered = availableTagPresets.filter(preset => 
            preset.tag.toLowerCase().includes(query.toLowerCase()) ||
            (preset.description && preset.description.toLowerCase().includes(query.toLowerCase()))
        );

        if (filtered.length === 0 || query.trim() === "") {
            tagSuggestions.style.display = "none";
            return;
        }

        tagSuggestions.innerHTML = "";
        filtered.slice(0, 8).forEach(preset => {
            const div = document.createElement("div");
            div.className = "tag-suggestion";
            div.innerHTML = `
                <div class="tag-suggestion-main">${preset.tag}</div>
                ${preset.description ? `<div class="tag-suggestion-desc">${preset.description}</div>` : ''}
            `;
            div.addEventListener("click", () => addTag(preset.tag));
            tagSuggestions.appendChild(div);
        });

        tagSuggestions.style.display = "block";
    }

    function addTag(tag) {
        if (!selectedTags.includes(tag)) {
            selectedTags.push(tag);
            renderSelectedTags();
        }
        tagsInput.value = "";
        tagSuggestions.style.display = "none";
    }

    function removeTag(tag) {
        selectedTags = selectedTags.filter(t => t !== tag);
        renderSelectedTags();
    }

    function renderSelectedTags() {
        selectedTagsContainer.innerHTML = "";
        selectedTags.forEach(tag => {
            const span = document.createElement("span");
            span.className = "selected-tag";
            span.innerHTML = `
                ${tag}
                <span class="remove-tag" data-tag="${tag}">×</span>
            `;
            span.querySelector(".remove-tag").addEventListener("click", (e) => {
                removeTag(e.target.dataset.tag);
            });
            selectedTagsContainer.appendChild(span);
        });
    }

    // Tag input event listeners
    if (tagsInput) {
        tagsInput.addEventListener("input", (e) => {
            const query = e.target.value;
            if (query.trim()) {
                showTagSuggestions(query);
            } else {
                tagSuggestions.style.display = "none";
            }
        });

        tagsInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const value = tagsInput.value.trim();
                if (value) {
                    addTag(value);
                }
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener("click", (e) => {
            if (!document.getElementById("tags-container").contains(e.target)) {
                tagSuggestions.style.display = "none";
            }
        });
    }

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

    // Load tag presets
    loadTagPresets();

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
        const tags = selectedTags;
        if (!to_task) return alert("Please select a ticket.");

        fetch("/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to_task, note, category, is_switch, tags })
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
                    selectedTags = [];
                    renderSelectedTags();
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
            if (tab.dataset.tab === "metrics") {
                loadMetrics();
            } else if (tab.dataset.tab === "analytics") {
                const view = window.analyticsMonthView ? "month" : "week";
                loadAnalytics(view);
            } else if (tab.dataset.tab === "settings") {
                loadSettings();
            }
        });
    });

    // Month toggle button for metrics
    const monthBtn = document.getElementById("month-view-btn");
    monthBtn.addEventListener("click", () => {
        monthView = !monthView;
        loadMetrics();
    });

    // Analytics toggle button
    const analyticsBtn = document.getElementById("analytics-view-btn");
    if (analyticsBtn) {
        analyticsBtn.addEventListener("click", () => {
            window.analyticsMonthView = !window.analyticsMonthView;
            const view = window.analyticsMonthView ? "month" : "week";
            analyticsBtn.textContent = window.analyticsMonthView ? "Weekly View" : "30-Day View";
            loadAnalytics(view);
        });
    }

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

    // Settings page functionality
    function loadSettings() {
        loadCustomTasks();
        
        // Update theme toggle in settings
        const settingsThemeToggle = document.getElementById('settings-theme-toggle');
        const settingsThemeLabel = document.getElementById('settings-theme-label');
        if (settingsThemeToggle && settingsThemeLabel) {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'modern';
            settingsThemeLabel.textContent = currentTheme === 'win95' ? 'Modern' : 'Windows 95';
            
            settingsThemeToggle.addEventListener('click', () => {
                // Trigger the main theme toggle
                themeToggle.click();
                // Update the settings display
                setTimeout(() => {
                    const newTheme = document.documentElement.getAttribute('data-theme') || 'modern';
                    settingsThemeLabel.textContent = newTheme === 'win95' ? 'Modern' : 'Windows 95';
                }, 100);
            });
        }
    }

    function loadCustomTasks() {
        const container = document.getElementById('custom-tasks-list');
        container.innerHTML = '<p>Loading custom tasks...</p>';
        
        fetch('/tasks/custom')
            .then(r => r.json())
            .then(tasks => {
                container.innerHTML = '';
                
                if (tasks.length === 0) {
                    container.innerHTML = '<p class="no-tasks">No custom tasks created yet.</p>';
                    return;
                }

                tasks.forEach(task => {
                    const taskItem = document.createElement('div');
                    taskItem.className = 'custom-task-item';
                    taskItem.innerHTML = `
                        <div class="task-info">
                            <strong>${task.key}</strong>
                            ${task.name ? `<span class="task-name">${task.name}</span>` : ''}
                        </div>
                        <button class="btn-danger delete-task-btn" data-key="${task.key}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    `;
                    container.appendChild(taskItem);
                });

                // Add delete event listeners
                document.querySelectorAll('.delete-task-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const taskKey = e.target.closest('.delete-task-btn').dataset.key;
                        if (confirm(`Are you sure you want to delete the custom task "${taskKey}"?`)) {
                            deleteCustomTask(taskKey);
                        }
                    });
                });
            })
            .catch(err => {
                container.innerHTML = '<p class="error">Failed to load custom tasks.</p>';
                console.error('Failed to load custom tasks:', err);
            });
    }

    function deleteCustomTask(taskKey) {
        const resultDiv = document.getElementById('delete-result');
        
        fetch(`/tasks/${encodeURIComponent(taskKey)}`, {
            method: 'DELETE'
        })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                resultDiv.textContent = `Error: ${result.error}`;
                resultDiv.className = 'error';
            } else {
                resultDiv.textContent = `✓ Task "${taskKey}" deleted successfully`;
                resultDiv.className = '';
                // Reload the custom tasks list
                loadCustomTasks();
                // Reload the task selector on the switcher page
                loadTasks();
                // Auto-hide success message after 3 seconds
                setTimeout(() => {
                    resultDiv.textContent = '';
                }, 3000);
            }
        })
        .catch(err => {
            resultDiv.textContent = 'Error: Failed to delete task';
            resultDiv.className = 'error';
            console.error('Delete error:', err);
        });
    }

    // Expose loadSettings globally
    window.loadSettings = loadSettings;
});

