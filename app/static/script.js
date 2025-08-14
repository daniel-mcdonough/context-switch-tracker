document.addEventListener("DOMContentLoaded", () => {
    // Theme management
    const themeToggle = document.getElementById('theme-toggle');
    const themeLabel = document.getElementById('theme-label');
    const themeIcon = document.getElementById('theme-icon');
    const themeSelector = document.getElementById('theme-selector');
    
    const themes = ['warm', 'win95', 'miku'];
    const themeNames = {
        'warm': 'Warm',
        'win95': 'Windows 95', 
        'miku': 'Hatsune Miku'
    };
    
    // Load saved theme or default to warm
    const savedTheme = localStorage.getItem('theme') || 'warm';
    applyTheme(savedTheme);
    
    // Theme toggle functionality (cycles through themes)
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || '';
        let currentIndex;
        if (currentTheme === '') {
            currentIndex = 0; // warm theme
        } else {
            currentIndex = themes.indexOf(currentTheme);
        }
        const nextIndex = (currentIndex + 1) % themes.length;
        const newTheme = themes[nextIndex];
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    // Theme selector functionality
    if (themeSelector) {
        themeSelector.addEventListener('change', (e) => {
            const newTheme = e.target.value || 'warm';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
    
    function applyTheme(theme) {
        // Remove all theme attributes first
        document.documentElement.removeAttribute('data-theme');
        
        if (theme === 'win95') {
            document.documentElement.setAttribute('data-theme', 'win95');
            themeLabel.textContent = 'Hatsune Miku';
            themeIcon.innerHTML = `
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <rect x="7" y="8" width="10" height="8" rx="1" ry="1"></rect>
                <path d="m8 2 0 2"></path>
                <path d="m16 2 0 2"></path>
                <path d="m21 12-2 0"></path>
            `;
        } else if (theme === 'miku') {
            document.documentElement.setAttribute('data-theme', 'miku');
            themeLabel.textContent = 'Warm';
            themeIcon.innerHTML = `
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM7 13.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zm10 0c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zm-5 5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z"/>
            `;
        } else {
            // warm theme (default)
            themeLabel.textContent = 'Windows 95';
            themeIcon.innerHTML = `
                <circle cx="12" cy="12" r="5"></circle>
                <path d="m12 1 0 6m0 6 0 6"></path>
                <path d="m4.2 4.2 4.2 4.2m5.6 5.6 4.2 4.2"></path>
                <path d="m1 12 6 0m6 0 6 0"></path>
                <path d="m4.2 19.8 4.2-4.2m5.6-5.6 4.2-4.2"></path>
            `;
        }
        
        // Update theme selector if it exists
        if (themeSelector) {
            themeSelector.value = theme === 'warm' ? '' : theme;
        }
    }

    let monthView = true; // Default to month view
    const currentEl = document.getElementById("current-task");
    const ticketSel = document.getElementById("ticket-select");
    const noteInput = document.getElementById("note");
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
        const is_switch = isSwitchCheckbox.checked;
        const tags = selectedTags;
        if (!to_task) return alert("Please select a ticket.");

        fetch("/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to_task, note, is_switch, tags })
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

    // Add internal task handler
    document.getElementById("add-task").addEventListener("click", () => {
        const name = document.getElementById("new-name").value.trim();
        const description = document.getElementById("new-description").value.trim();
        if (!name) {
            return alert("Task name is required");
        }
        fetch("/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description })
        })
            .then(r => r.json())
            .then(json => {
                const addResult = document.getElementById("add-result");
                if (json.error) {
                    addResult.textContent = "Error: " + json.error;
                    addResult.className = "error";
                } else {
                    addResult.textContent = `✓ Created task ${json.ticket_id}: ${json.name}`;
                    addResult.className = "";
                    // Clear inputs
                    document.getElementById("new-name").value = "";
                    document.getElementById("new-description").value = "";
                    loadTasks();
                    loadKanbanBoard();
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
            } else if (tab.dataset.tab === "kanban") {
                loadKanbanBoard();
            } else if (tab.dataset.tab === "settings") {
                loadSettings();
            }
        });
    });

    // Month view is now always enabled (no toggle button)

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
        // Render the hours worked calendar
        if (window.loadHoursCalendar) {
            loadHoursCalendar(view);
        }
        // Render the ActivityWatch calendar
        if (window.loadActivityWatchCalendar) {
            loadActivityWatchCalendar(view);
        }
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
        // Theme selector is now handled by the main theme management code above
    }

    function loadKanbanBoard() {
        // Load tasks for each status column
        loadKanbanColumn('todo');
        loadKanbanColumn('in_progress');
        loadKanbanColumn('done');
    }

    function loadKanbanColumn(status) {
        const container = document.getElementById(`kanban-${status.replace('_', '-')}`);
        container.innerHTML = '<div class="kanban-loading">Loading...</div>';
        
        fetch(`/tasks/internal?status=${status}`)
            .then(r => r.json())
            .then(tasks => {
                container.innerHTML = '';
                
                if (tasks.length === 0) {
                    container.innerHTML = '<div class="kanban-empty">No tasks</div>';
                    return;
                }

                tasks.forEach(task => {
                    const taskCard = document.createElement('div');
                    taskCard.className = 'kanban-task';
                    taskCard.dataset.taskId = task.ticket_id;
                    taskCard.innerHTML = `
                        <div class="kanban-task-header">
                            <span class="kanban-task-id">${task.ticket_id}</span>
                            <button class="kanban-task-delete" data-task-id="${task.ticket_id}" title="Delete task">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 6L6 18"></path>
                                    <path d="M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="kanban-task-title">${task.name}</div>
                        ${task.description ? `<div class="kanban-task-description">${task.description}</div>` : ''}
                        <div class="kanban-task-actions">
                            ${status !== 'todo' ? `<button class="kanban-action-btn" data-task-id="${task.ticket_id}" data-action="${status === 'in_progress' ? 'todo' : 'in_progress'}">← ${status === 'in_progress' ? 'To Do' : 'In Progress'}</button>` : ''}
                            ${status !== 'done' ? `<button class="kanban-action-btn" data-task-id="${task.ticket_id}" data-action="${status === 'todo' ? 'in_progress' : 'done'}"> ${status === 'todo' ? 'Start' : 'Complete'} →</button>` : ''}
                        </div>
                    `;
                    container.appendChild(taskCard);
                });

                // Add event listeners for action buttons
                container.querySelectorAll('.kanban-action-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const taskId = e.target.dataset.taskId;
                        const newStatus = e.target.dataset.action;
                        updateTaskStatus(taskId, newStatus);
                    });
                });

                // Add event listeners for delete buttons
                container.querySelectorAll('.kanban-task-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const taskId = e.target.closest('.kanban-task-delete').dataset.taskId;
                        if (confirm(`Are you sure you want to delete task ${taskId}?`)) {
                            deleteInternalTask(taskId);
                        }
                    });
                });
            })
            .catch(err => {
                container.innerHTML = '<div class="kanban-error">Failed to load tasks</div>';
                console.error(`Failed to load ${status} tasks:`, err);
            });
    }

    function updateTaskStatus(taskId, newStatus) {
        fetch(`/tasks/${taskId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                showKanbanMessage(`Error: ${result.error}`, 'error');
            } else {
                showKanbanMessage(`Task moved to ${newStatus.replace('_', ' ')}`, 'success');
                loadKanbanBoard();
                loadTasks(); // Refresh task selector if needed
            }
        })
        .catch(err => {
            showKanbanMessage('Failed to update task status', 'error');
            console.error('Status update error:', err);
        });
    }

    function deleteInternalTask(taskId) {
        fetch(`/tasks/${taskId}`, {
            method: 'DELETE'
        })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                showKanbanMessage(`Error: ${result.error}`, 'error');
            } else {
                showKanbanMessage(`Task ${taskId} deleted`, 'success');
                loadKanbanBoard();
                loadTasks(); // Refresh task selector
            }
        })
        .catch(err => {
            showKanbanMessage('Failed to delete task', 'error');
            console.error('Delete error:', err);
        });
    }

    function showKanbanMessage(message, type) {
        const resultDiv = document.getElementById('kanban-result');
        resultDiv.textContent = message;
        resultDiv.className = type === 'error' ? 'error' : '';
        setTimeout(() => {
            resultDiv.textContent = '';
            resultDiv.className = '';
        }, 3000);
    }


    // Expose functions globally
    window.loadSettings = loadSettings;
    window.loadKanbanBoard = loadKanbanBoard;
});

