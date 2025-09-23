// Time Sync functionality for syncing Timewarrior to JIRA

let currentTicket = null;

function initializeTimeSync() {
    // Add event listeners
    document.getElementById('load-ticket').addEventListener('click', loadTicket);
    
    // Add enter key listener for ticket input
    document.getElementById('ticket-id-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadTicket();
        }
    });
    
    // Focus on input
    document.getElementById('ticket-id-input').focus();
}

function formatHours(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function formatDateTime(dateStr) {
    console.log(`=== DEBUG formatDateTime ===`);
    console.log(`Input: "${dateStr}"`);
    console.log(`Browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`Browser timezone offset: ${new Date().getTimezoneOffset()} minutes`);
    
    // Test different parsing methods
    console.log(`Direct new Date(): ${new Date(dateStr).toString()}`);
    console.log(`Replace T with space: ${new Date(dateStr.replace('T', ' ')).toString()}`);
    
    let date;
    
    if (dateStr.includes('+') || dateStr.includes('Z') || (dateStr.includes('-') && dateStr.lastIndexOf('-') > 10)) {
        // Has timezone info - use as-is
        date = new Date(dateStr);
        console.log(`Using timezone-aware parsing`);
    } else {
        // No timezone info - treat as local time
        const localStr = dateStr.replace('T', ' ');
        date = new Date(localStr);
        console.log(`Using timezone-naive parsing with: "${localStr}"`);
    }
    
    console.log(`Parsed date object: ${date.toString()}`);
    console.log(`UTC string: ${date.toUTCString()}`);
    console.log(`Local string: ${date.toLocaleString()}`);
    
    const result = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    console.log(`Final formatted result: "${result}"`);
    console.log(`=== END DEBUG ===`);
    return result;
}

function generateTimewarriorEntries(intervals, worklogs = []) {
    if (!intervals || intervals.length === 0) {
        return '<div class="no-entries-small">No entries found</div>';
    }
    
    // Filter out entries less than 60 seconds - these are already filtered on backend
    // but let's be defensive here too
    const validIntervals = intervals.filter(i => i.duration_seconds >= 60);
    
    if (validIntervals.length === 0) {
        return '<div class="no-entries-small">No entries found (entries under 1 minute are excluded)</div>';
    }
    
    let html = '<div class="entries-list-small">';
    
    validIntervals.forEach((interval, index) => {
        const startTime = formatDateTime(interval.start);
        const endTime = formatDateTime(interval.end);
        const duration = formatHours(interval.duration_seconds);
        const note = interval.note ? interval.note : '';
        
        // Check if this Timewarrior entry has a matching JIRA worklog
        const matchType = findMatchingWorklog(interval, worklogs);
        const matchClass = getMatchClass(matchType);
        const matchIndicator = getMatchIndicator(matchType);
        
        const titleText = `Start: ${interval.start}, End: ${interval.end}${note ? '\nNote: ' + note : ''}`;
        
        html += `
            <div class="entry-item ${matchClass}" title="${titleText.replace(/"/g, '&quot;')}">
                <div class="entry-time">${startTime} - ${endTime}</div>
                <div class="entry-duration">${duration}</div>
                ${matchIndicator}
                ${note ? '<div class="entry-note" style="font-size: 0.8em; color: var(--text-secondary); margin-top: 0.2rem;">' + note.substring(0, 50) + (note.length > 50 ? '...' : '') + '</div>' : ''}
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function generateJiraEntries(worklogs, intervals = []) {
    if (!worklogs || worklogs.length === 0) {
        return '<div class="no-entries-small">No worklogs found</div>';
    }
    
    let html = '<div class="entries-list-small">';
    
    worklogs.forEach((worklog) => {
        const startTime = formatDateTime(worklog.started);
        const duration = worklog.timeSpent || formatHours(worklog.timeSpentSeconds || 0);
        const comment = worklog.comment && worklog.comment.trim() ? worklog.comment : 'No comment';
        
        // Check if this JIRA worklog has a matching Timewarrior entry
        const matchType = findMatchingInterval(worklog, intervals);
        const matchClass = getMatchClass(matchType);
        const matchIndicator = getMatchIndicator(matchType);
        
        html += `
            <div class="entry-item jira-entry ${matchClass}" title="Created: ${worklog.started}, Comment: ${comment}">
                <div class="entry-time">${startTime}</div>
                <div class="entry-duration">${duration}</div>
                ${matchIndicator}
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// Diff matching functions
function findMatchingWorklog(interval, worklogs) {
    if (!worklogs || worklogs.length === 0) {
        return 'no-match';
    }
    
    // Skip checking for entries less than 60 seconds
    if (interval.duration_seconds < 60) {
        return 'no-match';
    }
    
    const intervalStart = new Date(interval.start);
    const intervalDuration = interval.duration_seconds;
    const tolerance = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    for (const worklog of worklogs) {
        const worklogStart = new Date(worklog.started);
        const timeDiff = Math.abs(intervalStart.getTime() - worklogStart.getTime());
        const worklogDuration = worklog.timeSpentSeconds || 0;
        const durationDiff = Math.abs(intervalDuration - worklogDuration);
        
        // Debug logging for close matches
        if (timeDiff <= tolerance) {
            console.log('Checking potential match:', {
                intervalStart: interval.start,
                worklogStart: worklog.started,
                timeDiff: timeDiff / 1000 + ' seconds',
                intervalDuration: intervalDuration + ' seconds',
                worklogDuration: worklogDuration + ' seconds',
                durationDiff: durationDiff + ' seconds',
                durationRatio: durationDiff / intervalDuration
            });
        }
        
        // Exact match: within 5 minutes and duration within 30 seconds OR 20% (whichever is larger)
        const durationTolerance = Math.max(30, intervalDuration * 0.2);
        if (timeDiff <= tolerance / 2 && durationDiff <= durationTolerance) {
            return 'exact-match';
        }
        
        // Close match: within 10 minutes
        if (timeDiff <= tolerance) {
            return 'close-match';
        }
    }
    
    return 'no-match';
}

function findMatchingInterval(worklog, intervals) {
    if (!intervals || intervals.length === 0) {
        return 'no-match';
    }
    
    const worklogStart = new Date(worklog.started);
    const worklogDuration = worklog.timeSpentSeconds || 0;
    const tolerance = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    for (const interval of intervals) {
        // Skip intervals less than 60 seconds
        if (interval.duration_seconds < 60) {
            continue;
        }
        
        const intervalStart = new Date(interval.start);
        const timeDiff = Math.abs(worklogStart.getTime() - intervalStart.getTime());
        const intervalDuration = interval.duration_seconds;
        const durationDiff = Math.abs(worklogDuration - intervalDuration);
        
        // Debug logging for close matches
        if (timeDiff <= tolerance) {
            console.log('Checking potential JIRA match:', {
                worklogStart: worklog.started,
                intervalStart: interval.start,
                timeDiff: timeDiff / 1000 + ' seconds',
                worklogDuration: worklogDuration + ' seconds',
                intervalDuration: intervalDuration + ' seconds',
                durationDiff: durationDiff + ' seconds',
                durationRatio: durationDiff / Math.max(worklogDuration, 1)
            });
        }
        
        // Exact match: within 5 minutes and duration within 30 seconds OR 20% (whichever is larger)
        const durationTolerance = Math.max(30, worklogDuration * 0.2);
        if (timeDiff <= tolerance / 2 && durationDiff <= durationTolerance) {
            return 'exact-match';
        }
        
        // Close match: within 10 minutes
        if (timeDiff <= tolerance) {
            return 'close-match';
        }
    }
    
    return 'no-match';
}

function getMatchClass(matchType) {
    switch (matchType) {
        case 'exact-match':
            return 'has-match';
        case 'close-match':
            return 'potential-duplicate';
        default:
            return 'missing-match';
    }
}

function getMatchIndicator(matchType) {
    switch (matchType) {
        case 'exact-match':
            return '<span class="entry-match-indicator">✓</span>';
        case 'close-match':
            return '<span class="entry-match-indicator">~</span>';
        default:
            return '<span class="entry-match-indicator">!</span>';
    }
}

async function loadTicket() {
    const ticketId = document.getElementById('ticket-id-input').value.trim().toUpperCase();
    
    if (!ticketId) {
        alert('Please enter a JIRA ticket ID');
        return;
    }
    
    const button = document.getElementById('load-ticket');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Loading...';
    
    try {
        const url = `/timesync/tickets?ticket_id=${encodeURIComponent(ticketId)}`;
        const response = await fetch(url);
        const tickets = await response.json();
        
        if (response.ok && tickets.length > 0) {
            currentTicket = tickets[0];
            displayTicket(currentTicket);
            document.getElementById('tickets-view').style.display = 'block';
            document.getElementById('sync-results').style.display = 'none';
        } else {
            alert('Failed to load ticket: ' + (tickets.error || 'Ticket not found'));
            document.getElementById('tickets-view').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error fetching ticket:', error);
        alert('Failed to fetch ticket data');
        document.getElementById('tickets-view').style.display = 'none';
        
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function displayTicket(ticket) {
    const container = document.getElementById('tickets-list');
    const summaryDiv = document.querySelector('.tickets-summary');
    
    // Update header
    summaryDiv.innerHTML = `
        <span>Ticket: <strong>${ticket.ticket}</strong></span>
        <button id="sync-ticket" class="btn-success" onclick="syncTicket()" 
                ${ticket.total_seconds === 0 ? 'disabled' : ''}>
            ${ticket.total_seconds > 0 ? 'Sync to JIRA' : 'No Time to Sync'}
        </button>
    `;
    
    // Calculate the difference
    const diffSeconds = ticket.total_seconds - ticket.existing_seconds;
    const diffHours = formatHours(Math.abs(diffSeconds));
    const diffSign = diffSeconds > 0 ? '+' : diffSeconds < 0 ? '-' : '';
    const diffClass = diffSeconds > 0 ? 'positive' : diffSeconds < 0 ? 'negative' : 'zero';
    
    let periodsText = '';
    if (ticket.earliest_start && ticket.latest_end) {
        const startDate = new Date(ticket.earliest_start).toLocaleDateString();
        const endDate = new Date(ticket.latest_end).toLocaleDateString();
        periodsText = `Period: ${startDate} to ${endDate}`;
    } else {
        periodsText = 'No Timewarrior entries found (past 3 months)';
    }
    
    const html = `
        <div class="ticket-card">
            <div class="ticket-header-single">
                <div class="ticket-info">
                    <h3 class="ticket-title">${ticket.ticket}</h3>
                    <div class="ticket-summary">${ticket.summary || 'Loading...'}</div>
                </div>
            </div>
            
            <div class="hours-comparison-single">
                <div class="hours-section">
                    <h4>Time Comparison (Past 3 Months)</h4>
                    <div class="hours-grid">
                        <div class="hours-item jira-section">
                            <div class="hours-row-header">
                                <span class="hours-label">Currently in JIRA:</span>
                                <span class="hours-value existing">${formatHours(ticket.existing_seconds)}</span>
                            </div>
                            <div class="jira-entries">
                                ${generateJiraEntries(ticket.existing_worklogs || [], ticket.intervals || [])}
                            </div>
                        </div>
                        <div class="hours-item timewarrior-section">
                            <div class="hours-row-header">
                                <span class="hours-label">From Timewarrior:</span>
                                <span class="hours-value timewarrior">${formatHours(ticket.total_seconds)}</span>
                            </div>
                            <div class="timewarrior-entries">
                                ${generateTimewarriorEntries(ticket.intervals || [], ticket.existing_worklogs || [])}
                            </div>
                        </div>
                        <div class="hours-item difference-item">
                            <span class="hours-label">Difference:</span>
                            <span class="hours-value difference ${diffClass}">
                                ${diffSign}${diffHours}
                                ${diffSeconds > 0 ? ' (to sync)' : diffSeconds < 0 ? ' (over-logged)' : ' (synced)'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="diff-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: #4CAF50;"></div>
                            <span>✓ Matched entries</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #FF9800;"></div>
                            <span>~ Close matches</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-color" style="background: #FFC107;"></div>
                            <span>! Missing/No match</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="ticket-details-single">
                <div class="detail-stats">
                    <span class="detail-item">
                        <strong>${ticket.interval_count}</strong> Timewarrior entries
                    </span>
                    <span class="detail-item">${periodsText}</span>
                </div>
            </div>
            
            <div class="sync-status" id="status-${ticket.ticket}"></div>
        </div>
    `;
    
    container.innerHTML = html;
}

async function syncTicket() {
    if (!currentTicket || !currentTicket.intervals || currentTicket.intervals.length === 0) {
        alert('No time entries to sync');
        return;
    }

    // Filter out entries less than 60 seconds AND entries that already have matches in JIRA
    const unmatchedIntervals = currentTicket.intervals.filter(interval => {
        // Skip short entries
        if (interval.duration_seconds < 60) {
            return false;
        }

        // Check if this interval already has a match in JIRA
        const matchType = findMatchingWorklog(interval, currentTicket.existing_worklogs || []);

        // Only sync entries that don't have exact matches
        // We'll still sync close matches since they might be different entries
        return matchType !== 'exact-match';
    });

    if (unmatchedIntervals.length === 0) {
        alert('All time entries are already synced to JIRA or are too short (under 1 minute)');
        return;
    }

    // Show confirmation with count of entries to sync
    const confirmMsg = `This will sync ${unmatchedIntervals.length} unmatched time entries to JIRA. Continue?`;
    if (!confirm(confirmMsg)) {
        return;
    }
    
    const button = document.getElementById('sync-ticket');
    const statusDiv = document.getElementById(`status-${currentTicket.ticket}`);
    
    button.disabled = true;
    button.textContent = 'Syncing...';
    statusDiv.textContent = 'Syncing to JIRA...';
    statusDiv.className = 'sync-status syncing';
    
    try {
        const response = await fetch('/timesync/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ intervals: unmatchedIntervals })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const successCount = result.summary.success;
            const failCount = result.summary.failed;
            
            if (successCount > 0) {
                // Calculate the total seconds that were actually synced
                const syncedSeconds = unmatchedIntervals.reduce((sum, interval) => sum + interval.duration_seconds, 0);
                statusDiv.textContent = `✓ Successfully synced ${formatHours(syncedSeconds)} to JIRA (${successCount} entries)`;
                statusDiv.className = 'sync-status success';
                button.textContent = 'Synced!';
                button.disabled = true;
                
                // Refresh the data to show updated state
                setTimeout(() => loadTicket(), 2000);
            } else {
                statusDiv.textContent = `✗ Sync failed - ${failCount} entries failed`;
                statusDiv.className = 'sync-status failed';
                button.textContent = 'Sync to JIRA';
                button.disabled = false;
            }
            
            // Show detailed results if there were issues
            if (failCount > 0) {
                displaySyncResults(result);
            }
        } else {
            statusDiv.textContent = `✗ Error: ${result.error || 'Unknown error'}`;
            statusDiv.className = 'sync-status failed';
            button.textContent = 'Sync to JIRA';
            button.disabled = false;
        }
        
    } catch (error) {
        console.error('Error syncing ticket:', error);
        statusDiv.textContent = '✗ Network error during sync';
        statusDiv.className = 'sync-status failed';
        button.textContent = 'Sync to JIRA';
        button.disabled = false;
    }
}

function displaySyncResults(result) {
    const container = document.getElementById('results-content');
    const resultsDiv = document.getElementById('sync-results');
    
    let html = `
        <div class="sync-summary">
            <h4>Sync Results</h4>
            <p>Total: ${result.summary.total} | 
               Success: <span class="success-count">${result.summary.success}</span> | 
               Failed: <span class="failure-count">${result.summary.failed}</span></p>
        </div>
        <div class="sync-details">
    `;
    
    result.results.forEach(item => {
        const statusClass = item.success ? 'sync-success' : 'sync-failure';
        const icon = item.success ? '✓' : '✗';
        
        html += `
            <div class="sync-result-item ${statusClass}">
                <span class="sync-icon">${icon}</span>
                <span class="sync-duration">${item.duration}</span>
                <span class="sync-message">${item.message}</span>
            </div>
        `;
    });
    
    html += '</div>';
    
    container.innerHTML = html;
    resultsDiv.style.display = 'block';
}

function getJiraUrl(ticketId) {
    const baseUrl = window.JIRA_BASE_URL || 'https://jira.example.com';
    return `${baseUrl}/browse/${ticketId}`;
}

// Initialize when the tab is shown
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the Time Sync tab
    const tabs = document.querySelectorAll('#tabs li');
    tabs.forEach(tab => {
        if (tab.dataset.tab === 'timesync') {
            tab.addEventListener('click', function() {
                setTimeout(initializeTimeSync, 100);
            });
        }
    });
});