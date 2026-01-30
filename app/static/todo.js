// Todo sidebar functionality
document.addEventListener("DOMContentLoaded", () => {
    let currentTodos = [];
    let currentFilter = 'pending';
    let availableTickets = [];

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Load todos from backend
    function loadTodos() {
        let url = '/todos';
        if (currentFilter === 'pending') {
            url += '?completed=false';
        } else if (currentFilter === 'completed') {
            url += '?completed=true';
        }

        fetch(url)
            .then(response => response.json())
            .then(todos => {
                currentTodos = todos;
                renderTodos(todos);
                updateStats();
            })
            .catch(error => {
                console.error('Error loading todos:', error);
                document.getElementById('todo-list').innerHTML =
                    '<li class="todo-empty">Error loading todos</li>';
            });
    }

    // Load available tickets for the dropdown
    function loadTicketsForDropdown() {
        fetch('/tasks')
            .then(response => response.json())
            .then(tasks => {
                availableTickets = tasks;
                const select = document.getElementById('todo-ticket-select');
                select.innerHTML = '<option value="">No ticket</option>';

                tasks.forEach(task => {
                    const option = document.createElement('option');
                    // Handle both JIRA tickets (key/summary) and internal tasks (ticket_id/name)
                    const ticketId = task.key || task.ticket_id;
                    const name = task.summary || task.name;
                    option.value = ticketId;
                    option.textContent = `${ticketId}: ${name.substring(0, 25)}${name.length > 25 ? '...' : ''}`;
                    select.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading tickets:', error);
            });
    }

    // Render todos to the list
    function renderTodos(todos) {
        const list = document.getElementById('todo-list');
        list.innerHTML = '';

        if (todos.length === 0) {
            const emptyText = currentFilter === 'pending' ? 'No pending todos' :
                             currentFilter === 'completed' ? 'No completed todos' : 'No todos found';
            list.innerHTML = `<li class="todo-empty">${emptyText}</li>`;
            return;
        }

        todos.forEach(todo => {
            const li = createTodoItem(todo);
            list.appendChild(li);
        });
    }

    // Create a single todo item element
    function createTodoItem(todo) {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''} priority-${todo.priority}`;
        li.dataset.id = todo.id;

        const ticketBadge = todo.ticket_id ?
            `<div class="todo-ticket-badge">${escapeHtml(todo.ticket_id)}</div>` : '';

        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} />
            <div class="todo-item-content">
                <span class="todo-content">${escapeHtml(todo.content)}</span>
                ${ticketBadge}
            </div>
            <div class="todo-actions">
                <button class="todo-action-btn edit" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="todo-action-btn delete" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;

        // Event listeners
        li.querySelector('.todo-checkbox').addEventListener('change', () => toggleComplete(todo.id));
        li.querySelector('.edit').addEventListener('click', () => editTodo(todo.id));
        li.querySelector('.delete').addEventListener('click', () => deleteTodo(todo.id));

        return li;
    }

    // Add new todo
    function addTodo() {
        const input = document.getElementById('todo-input');
        const ticketSelect = document.getElementById('todo-ticket-select');
        const content = input.value.trim();
        const ticketId = ticketSelect.value || null;

        if (!content) return;

        fetch('/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, priority: 0, ticket_id: ticketId })
        })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                console.error('Error adding todo:', result.error);
            } else {
                input.value = '';
                ticketSelect.value = '';
                loadTodos();
            }
        })
        .catch(error => {
            console.error('Error adding todo:', error);
        });
    }

    // Toggle completion
    function toggleComplete(id) {
        fetch(`/todos/${id}/complete`, { method: 'PUT' })
            .then(response => response.json())
            .then(result => {
                if (!result.error) {
                    loadTodos();
                }
            })
            .catch(error => {
                console.error('Error toggling todo:', error);
            });
    }

    // Delete todo
    function deleteTodo(id) {
        if (!confirm('Delete this todo?')) return;

        fetch(`/todos/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(result => {
                if (!result.error) {
                    loadTodos();
                }
            })
            .catch(error => {
                console.error('Error deleting todo:', error);
            });
    }

    // Edit todo (inline editing)
    function editTodo(id) {
        const todo = currentTodos.find(t => t.id === id);
        if (!todo) return;

        const li = document.querySelector(`li[data-id="${id}"]`);
        const contentSpan = li.querySelector('.todo-content');
        const originalContent = todo.content;

        contentSpan.innerHTML = `
            <input type="text" class="todo-edit-input" value="${escapeHtml(originalContent)}" />
        `;

        const input = contentSpan.querySelector('.todo-edit-input');
        input.focus();
        input.select();

        function saveEdit() {
            const newContent = input.value.trim();
            if (newContent && newContent !== originalContent) {
                fetch(`/todos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newContent })
                })
                .then(() => loadTodos())
                .catch(error => {
                    console.error('Error updating todo:', error);
                    loadTodos();
                });
            } else {
                loadTodos();
            }
        }

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                loadTodos();
            }
        });
    }

    // Update stats display
    function updateStats() {
        fetch('/todos?completed=false')
            .then(r => r.json())
            .then(pending => {
                const count = Array.isArray(pending) ? pending.length : 0;
                document.getElementById('todo-count').textContent =
                    `${count} pending`;
            })
            .catch(() => {
                document.getElementById('todo-count').textContent = '-- pending';
            });
    }

    // Filter buttons
    document.querySelectorAll('.todo-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('.todo-filter.active').classList.remove('active');
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            loadTodos();
        });
    });

    // Add todo handlers
    document.getElementById('add-todo-btn').addEventListener('click', addTodo);
    document.getElementById('todo-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTodo();
        }
    });

    // Sidebar collapse toggle
    const sidebar = document.getElementById('todo-sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');
    const expandBtn = document.getElementById('todo-expand-btn');
    const appLayout = document.querySelector('.app-layout');

    function collapseSidebar() {
        sidebar.classList.add('collapsed');
        appLayout.classList.add('sidebar-collapsed');
        expandBtn.classList.add('visible');
        localStorage.setItem('todoSidebarCollapsed', 'true');
    }

    function expandSidebar() {
        sidebar.classList.remove('collapsed');
        appLayout.classList.remove('sidebar-collapsed');
        expandBtn.classList.remove('visible');
        localStorage.setItem('todoSidebarCollapsed', 'false');
    }

    toggleBtn.addEventListener('click', collapseSidebar);
    expandBtn.addEventListener('click', expandSidebar);

    // Restore sidebar state
    if (localStorage.getItem('todoSidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
        appLayout.classList.add('sidebar-collapsed');
        expandBtn.classList.add('visible');
    }

    // Mobile FAB and overlay handling
    const fab = document.getElementById('todo-fab');
    const overlay = document.getElementById('todo-overlay');

    if (fab) {
        fab.addEventListener('click', () => {
            sidebar.classList.add('open');
            sidebar.classList.remove('collapsed');
            overlay.classList.add('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Close sidebar on mobile when clicking toggle
    toggleBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }
    });

    // Initial load
    loadTodos();
    loadTicketsForDropdown();

    // Export for global access
    window.todoSidebar = { loadTodos, addTodo, loadTicketsForDropdown };
});
