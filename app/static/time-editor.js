// Time Editor functionality - Fixed UTC handling
document.addEventListener("DOMContentLoaded", () => {
    let currentEntries = [];
    let editingRow = null;

    // Initialize date inputs with defaults (last 7 days)
    function initializeDates() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        
        document.getElementById('editor-start-date').value = startDate.toISOString().split('T')[0];
        document.getElementById('editor-end-date').value = endDate.toISOString().split('T')[0];
    }

    // Load entries from the backend
    function loadEntries() {
        const startDate = document.getElementById('editor-start-date').value;
        const endDate = document.getElementById('editor-end-date').value;
        
        if (!startDate || !endDate) {
            showMessage('Please select both start and end dates', 'error');
            return;
        }
        
        const params = new URLSearchParams({
            start_date: startDate,
            end_date: endDate
        });
        
        fetch(`/switches/list?${params}`)
            .then(response => response.json())
            .then(entries => {
                currentEntries = entries;
                displayEntries(entries);
                document.getElementById('entries-count').textContent = `${entries.length} entries found`;
                document.getElementById('entries-table-container').style.display = entries.length > 0 ? 'block' : 'none';
                
                if (entries.length === 0) {
                    showMessage('No entries found for the selected date range', 'info');
                }
            })
            .catch(error => {
                console.error('Error loading entries:', error);
                showMessage('Failed to load entries', 'error');
            });
    }

    // Calculate duration using end time or fallback to next entry
    function calculateDuration(entry, nextEntry) {
        let endTime;
        
        if (entry.end_time) {
            // Parse end time as UTC and convert to local time
            endTime = new Date(entry.end_time + 'Z');
        } else if (nextEntry) {
            // Parse next entry timestamp as UTC and convert to local time
            endTime = new Date(nextEntry.timestamp + 'Z');
        } else {
            // No end time and no next entry, duration is ongoing
            return 'ongoing';
        }
        
        // Parse start time as UTC and convert to local time
        const startTime = new Date(entry.timestamp + 'Z');
        
        const diffMs = endTime - startTime;
        const diffSeconds = Math.abs(diffMs / 1000);
        
        if (diffSeconds < 60) {
            return `${Math.round(diffSeconds)}s`;
        } else if (diffSeconds < 3600) {
            const minutes = Math.round(diffSeconds / 60);
            return `${minutes}m`;
        } else if (diffSeconds < 86400) {
            const hours = Math.floor(diffSeconds / 3600);
            const minutes = Math.round((diffSeconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
            const days = Math.floor(diffSeconds / 86400);
            const hours = Math.floor((diffSeconds % 86400) / 3600);
            return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        }
    }

    // Display entries in the table
    function displayEntries(entries) {
        const tbody = document.getElementById('entries-tbody');
        tbody.innerHTML = '';
        
        entries.forEach((entry, index) => {
            // Calculate duration using end time or next entry
            const nextEntry = entries[index + 1]; // Next entry (chronologically after)
            const duration = calculateDuration(entry, nextEntry);
            
            const row = createEntryRow(entry, duration);
            tbody.appendChild(row);
        });
    }

    // Create a table row for an entry
    function createEntryRow(entry, duration) {
        const row = document.createElement('tr');
        row.dataset.id = entry.id;
        
        // Parse timestamp as UTC (database stores in UTC) and convert to local time
        let timestamp = new Date(entry.timestamp + 'Z'); // Add Z to indicate UTC
        
        const formattedTime = timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Format end time if available
        let formattedEndTime = '-';
        if (entry.end_time) {
            // Parse end time as UTC and convert to local time
            let endTimestamp = new Date(entry.end_time + 'Z');
            formattedEndTime = endTimestamp.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        const tagsDisplay = Array.isArray(entry.tags) ? entry.tags.join(', ') : '';
        
        row.innerHTML = `
            <td class="timestamp-cell">${formattedTime}</td>
            <td class="end-time-cell">${formattedEndTime}</td>
            <td class="duration-cell">${duration || '-'}</td>
            <td class="from-task-cell">${escapeHtml(entry.from_task)}</td>
            <td class="to-task-cell">${escapeHtml(entry.to_task)}</td>
            <td class="note-cell">${escapeHtml(entry.note)}</td>
            <td class="tags-cell">${escapeHtml(tagsDisplay)}</td>
            <td class="switch-cell">
                <span class="switch-badge ${entry.is_switch ? 'switch-yes' : 'switch-no'}">
                    ${entry.is_switch ? 'Yes' : 'No'}
                </span>
            </td>
            <td class="actions-cell">
                <button class="btn-edit" onclick="window.timeEditor.editEntry(${entry.id})">Edit</button>
                <button class="btn-delete" onclick="window.timeEditor.deleteEntry(${entry.id})">Delete</button>
            </td>
        `;
        
        return row;
    }

    // Edit an entry
    function editEntry(entryId) {
        const entry = currentEntries.find(e => e.id === entryId);
        if (!entry) return;
        
        const row = document.querySelector(`tr[data-id="${entryId}"]`);
        if (!row) return;
        
        // If already editing, cancel that edit
        if (editingRow) {
            cancelEdit();
        }
        
        editingRow = row;
        
        // Parse timestamp as UTC and convert to local time for editing
        let timestamp = new Date(entry.timestamp + 'Z');
        
        // Find the current duration value to preserve it during editing
        const durationCell = row.querySelector('.duration-cell');
        const currentDuration = durationCell ? durationCell.textContent : '-';
        
        // Convert to local timezone for the input field
        // Format for datetime-local input (YYYY-MM-DDTHH:mm)
        const year = timestamp.getFullYear();
        const month = String(timestamp.getMonth() + 1).padStart(2, '0');
        const day = String(timestamp.getDate()).padStart(2, '0');
        const hours = String(timestamp.getHours()).padStart(2, '0');
        const minutes = String(timestamp.getMinutes()).padStart(2, '0');
        const localISOString = `${year}-${month}-${day}T${hours}:${minutes}`;
        
        // Handle end time for editing
        let endTimeISOString = '';
        if (entry.end_time) {
            // Parse end time as UTC and convert to local time for editing
            let endTimestamp = new Date(entry.end_time + 'Z');
            const endYear = endTimestamp.getFullYear();
            const endMonth = String(endTimestamp.getMonth() + 1).padStart(2, '0');
            const endDay = String(endTimestamp.getDate()).padStart(2, '0');
            const endHours = String(endTimestamp.getHours()).padStart(2, '0');
            const endMinutes = String(endTimestamp.getMinutes()).padStart(2, '0');
            endTimeISOString = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;
        }
        
        row.innerHTML = `
            <td>
                <input type="datetime-local" class="edit-timestamp" value="${localISOString}" />
            </td>
            <td>
                <input type="datetime-local" class="edit-end-time" value="${endTimeISOString}" placeholder="Optional" />
            </td>
            <td class="duration-cell">${currentDuration}</td>
            <td>
                <input type="text" class="edit-from-task" value="${escapeHtml(entry.from_task)}" />
            </td>
            <td>
                <input type="text" class="edit-to-task" value="${escapeHtml(entry.to_task)}" />
            </td>
            <td>
                <textarea class="edit-note">${escapeHtml(entry.note)}</textarea>
            </td>
            <td>
                <input type="text" class="edit-tags" value="${Array.isArray(entry.tags) ? entry.tags.join(', ') : ''}" />
            </td>
            <td>
                <input type="checkbox" class="edit-is-switch" ${entry.is_switch ? 'checked' : ''} />
            </td>
            <td>
                <button class="btn-save" onclick="window.timeEditor.saveEntry(${entryId})">Save</button>
                <button class="btn-cancel" onclick="window.timeEditor.cancelEdit()">Cancel</button>
            </td>
        `;
    }

    // Save edited entry
    function saveEntry(entryId) {
        if (!editingRow) return;
        
        const timestampInput = editingRow.querySelector('.edit-timestamp').value;
        const endTimeInput = editingRow.querySelector('.edit-end-time').value;
        const fromTask = editingRow.querySelector('.edit-from-task').value;
        const toTask = editingRow.querySelector('.edit-to-task').value;
        const note = editingRow.querySelector('.edit-note').value;
        const tagsInput = editingRow.querySelector('.edit-tags').value;
        const isSwitch = editingRow.querySelector('.edit-is-switch').checked;
        
        // Parse tags
        const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
        
        // Convert local datetime input to UTC for storage
        const localDate = new Date(timestampInput);
        const timestamp = localDate.toISOString().replace('Z', ''); // Remove Z to match database format
        
        // Handle end time
        let endTime = null;
        if (endTimeInput) {
            const localEndDate = new Date(endTimeInput);
            endTime = localEndDate.toISOString().replace('Z', ''); // Remove Z to match database format
        }
        
        const updateData = {
            timestamp: timestamp,
            end_time: endTime,
            from_task: fromTask,
            to_task: toTask,
            note: note,
            tags: tags,
            is_switch: isSwitch
        };
        
        console.log('Sending update data:', updateData);
        
        fetch(`/switches/${entryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                showMessage(`Error: ${result.error}`, 'error');
            } else {
                showMessage('Entry updated successfully', 'success');
                // Update the entry in currentEntries
                const entryIndex = currentEntries.findIndex(e => e.id === entryId);
                if (entryIndex !== -1) {
                    currentEntries[entryIndex] = {
                        ...currentEntries[entryIndex],
                        ...updateData
                    };
                }
                // Refresh the entire table to recalculate durations
                displayEntries(currentEntries);
                editingRow = null;
            }
        })
        .catch(error => {
            console.error('Error saving entry:', error);
            showMessage('Failed to save entry', 'error');
        });
    }

    // Cancel editing
    function cancelEdit() {
        if (!editingRow) return;
        
        // Refresh the entire table to ensure durations are correct
        displayEntries(currentEntries);
        editingRow = null;
    }

    // Delete an entry
    function deleteEntry(entryId) {
        if (!confirm('Are you sure you want to delete this entry?')) {
            return;
        }
        
        fetch(`/switches/${entryId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                showMessage(`Error: ${result.error}`, 'error');
            } else {
                showMessage('Entry deleted successfully', 'success');
                // Remove from currentEntries
                currentEntries = currentEntries.filter(e => e.id !== entryId);
                // Remove from table
                const row = document.querySelector(`tr[data-id="${entryId}"]`);
                if (row) {
                    row.remove();
                }
                document.getElementById('entries-count').textContent = `${currentEntries.length} entries found`;
            }
        })
        .catch(error => {
            console.error('Error deleting entry:', error);
            showMessage('Failed to delete entry', 'error');
        });
    }

    // Show message to user
    function showMessage(message, type) {
        const resultDiv = document.getElementById('editor-result');
        resultDiv.textContent = message;
        resultDiv.className = `editor-result ${type}`;
        
        setTimeout(() => {
            resultDiv.textContent = '';
            resultDiv.className = 'editor-result';
        }, 5000);
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Initialize on load
    initializeDates();

    // Event listeners
    document.getElementById('load-entries-btn').addEventListener('click', loadEntries);
    
    // Load entries when dates change
    document.getElementById('editor-start-date').addEventListener('change', loadEntries);
    document.getElementById('editor-end-date').addEventListener('change', loadEntries);

    // Export functions for global access
    window.timeEditor = {
        editEntry,
        saveEntry,
        cancelEdit,
        deleteEntry,
        loadEntries
    };

    // Auto-load entries on tab switch
    window.loadTimeEditor = function() {
        loadEntries();
    };
});