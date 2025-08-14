


(function () {
    // D3-based metrics renderer with calendar grid view (Sunday-first weeks)
    function loadD3Metrics(view) {
        const svg = d3.select("#metrics-chart");
        svg.selectAll("*").remove();
        
        // Create calendar header
        const calendarDiv = d3.select("#calendar-grid");
        if (calendarDiv.empty()) {
            d3.select("#metrics").insert("div", "#metrics-chart")
                .attr("id", "calendar-grid");
        }
        
        const margin = { top: 40, right: 20, bottom: 60, left: 30 };
        const cellSize = 54;
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        Promise.all([
            fetch(`/metrics/counts?view=${view}`).then(r => r.json()),
            fetch(`/metrics/switches?view=${view}`).then(r => r.json())
        ]).then(([days, switches]) => {
            if (!days || days.length === 0) return;

            // Group switches by date
            const switchesByDate = d3.group(switches, d => d.timestamp.slice(0, 10));
            const maxCount = d3.max(days, d => d.count);
            
            // Enhanced color scale with muted tones
            const colorScale = d3.scaleThreshold()
                .domain([0, 1, 3, 5, 10])
                .range(['#f8fafc', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569']);

            // Calculate calendar grid dimensions (Sunday = 0)
            // Parse dates as local time by appending 'T00:00:00'
            const firstDate = new Date(days[0].date + 'T00:00:00');
            const lastDate = new Date(days[days.length - 1].date + 'T00:00:00');
            
            // Calculate Sunday offset for first day
            const firstDayOffset = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Calculate total weeks needed
            const totalDays = Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000)) + 1;
            const totalCells = totalDays + firstDayOffset;
            const numWeeks = Math.ceil(totalCells / 7);
            
            const width = 7 * cellSize + margin.left + margin.right;
            const height = numWeeks * cellSize + margin.top + margin.bottom;
            svg.attr("width", width).attr("height", height);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // Add day of week headers
            g.selectAll("text.day-header")
                .data(dayLabels)
                .enter().append("text")
                .attr("class", "day-header")
                .attr("x", (d, i) => i * cellSize + cellSize / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "600")
                .attr("fill", "#64748b")
                .text(d => d);

            // Create tooltip
            let tooltip = d3.select("body").select("#tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("id", "tooltip");
            }

            // Create data map for easy lookup
            const dataMap = new Map(days.map(d => [d.date, d]));

            // Generate all dates in the range
            const allDates = [];
            const currentDate = new Date(firstDate);
            // Move back to the Sunday of the week containing the first date
            currentDate.setTime(currentDate.getTime() - (firstDayOffset * 24 * 60 * 60 * 1000));
            
            for (let i = 0; i < numWeeks * 7; i++) {
                const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time
                const dayData = dataMap.get(dateStr);
                const today = new Date();
                const todayStr = today.toLocaleDateString('en-CA');
                allDates.push({
                    date: dateStr,
                    count: dayData ? dayData.count : 0,
                    inRange: dayData !== undefined,
                    dayOfMonth: currentDate.getDate(),
                    isToday: dateStr === todayStr
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Draw calendar cells
            const cells = g.selectAll("g.day-cell")
                .data(allDates)
                .enter().append("g")
                .attr("class", "day-cell")
                .attr("transform", (d, i) => {
                    const week = Math.floor(i / 7);
                    const day = i % 7;
                    return `translate(${day * cellSize}, ${week * cellSize})`;
                });

            // Add rectangles
            cells.append("rect")
                .attr("width", cellSize - 2)
                .attr("height", cellSize - 2)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", d => d.inRange ? colorScale(d.count) : '#f8fafc')
                .attr("stroke", d => d.isToday ? '#dc2626' : (d.inRange ? '#e2e8f0' : '#f1f5f9'))
                .attr("stroke-width", d => d.isToday ? 2 : 1)
                .style("cursor", d => d.inRange ? "pointer" : "default")
                .on("mouseover", (event, d) => {
                    if (!d.inRange) return;
                    const list = switchesByDate.get(d.date) || [];
                    const dateObj = new Date(d.date + 'T00:00:00');
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                    const formatDate = dateObj.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    
                    let html = `<strong>${dayName}, ${formatDate}</strong><br>`;
                    html += `Context switches: ${d.count}<br>`;
                    
                    if (list.length > 0) {
                        html += '<br>Recent switches:<br>';
                        const recent = list.slice(-3);
                        html += recent.map(it => 
                            `<span style="font-size: 0.75rem">${it.timestamp.slice(11, 16)} ${it.from || 'idle'} → ${it.to}</span>`
                        ).join('<br>');
                        if (list.length > 3) {
                            html += `<br><span style="font-size: 0.75rem; opacity: 0.8">+${list.length - 3} more</span>`;
                        }
                    }
                    
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            // Add day numbers
            cells.append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "13px")
                .attr("font-weight", d => d.isToday ? "bold" : "normal")
                .attr("fill", d => {
                    if (!d.inRange) return '#cbd5e1';
                    if (d.isToday) return '#dc2626';
                    return d.count > 5 ? '#ffffff' : '#1e293b';
                })
                .text(d => d.dayOfMonth);

            // Add count indicators for days with switches
            cells.filter(d => d.count > 0)
                .append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize - 8)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", d => d.count > 5 ? '#ffffff' : '#64748b')
                .text(d => d.count);

            // Add week numbers on the left
            g.selectAll("text.week-number")
                .data(d3.range(numWeeks))
                .enter().append("text")
                .attr("class", "week-number")
                .attr("x", -10)
                .attr("y", (d, i) => i * cellSize + cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", "12px")
                .attr("fill", "#94a3b8")
                .text((d, i) => {
                    const weekDate = new Date(firstDate);
                    weekDate.setDate(weekDate.getDate() + (i * 7) - firstDayOffset);
                    const weekNum = Math.ceil((weekDate.getDate()) / 7);
                    return weekNum;
                });
        });
    }

    // Hours calendar renderer
    function loadHoursCalendar(view) {
        const svg = d3.select("#hours-chart");
        svg.selectAll("*").remove();
        
        // Create calendar header
        const calendarDiv = d3.select("#hours-calendar-grid");
        if (calendarDiv.empty()) {
            d3.select("#hours-metrics").insert("div", "#hours-chart")
                .attr("id", "hours-calendar-grid");
        }
        
        const margin = { top: 40, right: 20, bottom: 60, left: 30 };
        const cellSize = 54;
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyColumnWidth = cellSize * 0.8;

        fetch(`/metrics/hours?view=${view}`)
        .then(r => r.json())
        .then(days => {
            if (!days || days.length === 0) return;

            const maxHours = d3.max(days, d => d.hours);
            
            // Enhanced color scale for hours (green to yellow to red based on work hours)
            const colorScale = d3.scaleThreshold()
                .domain([0, 1, 3, 5, 6.5, 7])
                .range(['#f8fafc', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#fbbf24', '#ef4444']);

            // Calculate calendar grid dimensions (Sunday = 0)
            // Parse dates as local time by appending 'T00:00:00'
            const firstDate = new Date(days[0].date + 'T00:00:00');
            const lastDate = new Date(days[days.length - 1].date + 'T00:00:00');
            
            // Calculate Sunday offset for first day
            const firstDayOffset = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Calculate total weeks needed
            const totalDays = Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000)) + 1;
            const totalCells = totalDays + firstDayOffset;
            const numWeeks = Math.ceil(totalCells / 7);
            
            const width = 7 * cellSize + weeklyColumnWidth + 10 + margin.left + margin.right;
            const height = numWeeks * cellSize + margin.top + margin.bottom;
            svg.attr("width", width).attr("height", height);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // Add day of week headers
            g.selectAll("text.day-header")
                .data(dayLabels)
                .enter().append("text")
                .attr("class", "day-header")
                .attr("x", (d, i) => i * cellSize + cellSize / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "600")
                .attr("fill", "#64748b")
                .text(d => d);

            // Add weekly total header
            g.append("text")
                .attr("class", "day-header")
                .attr("x", 7 * cellSize + 5 + weeklyColumnWidth / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "600")
                .attr("fill", "#64748b")
                .text("Week");

            // Create tooltip
            let tooltip = d3.select("body").select("#hours-tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("id", "hours-tooltip");
            }

            // Create data map for easy lookup
            const dataMap = new Map(days.map(d => [d.date, d]));

            // Generate all dates in the range
            const allDates = [];
            const currentDate = new Date(firstDate);
            // Move back to the Sunday of the week containing the first date
            currentDate.setTime(currentDate.getTime() - (firstDayOffset * 24 * 60 * 60 * 1000));
            
            for (let i = 0; i < numWeeks * 7; i++) {
                const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time
                const dayData = dataMap.get(dateStr);
                const today = new Date();
                const todayStr = today.toLocaleDateString('en-CA');
                allDates.push({
                    date: dateStr,
                    hours: dayData ? dayData.hours : 0,
                    inRange: dayData !== undefined,
                    dayOfMonth: currentDate.getDate(),
                    isToday: dateStr === todayStr
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Calculate weekly totals
            const weeklyTotals = [];
            for (let week = 0; week < numWeeks; week++) {
                let weekTotal = 0;
                for (let day = 0; day < 7; day++) {
                    const index = week * 7 + day;
                    if (index < allDates.length) {
                        weekTotal += allDates[index].hours;
                    }
                }
                weeklyTotals.push({
                    week: week,
                    total: Math.round(weekTotal * 10) / 10 // Round to 1 decimal
                });
            }

            // Draw calendar cells
            const cells = g.selectAll("g.day-cell")
                .data(allDates)
                .enter().append("g")
                .attr("class", "day-cell")
                .attr("transform", (d, i) => {
                    const week = Math.floor(i / 7);
                    const day = i % 7;
                    return `translate(${day * cellSize}, ${week * cellSize})`;
                });

            // Add rectangles
            cells.append("rect")
                .attr("width", cellSize - 2)
                .attr("height", cellSize - 2)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", d => d.inRange ? colorScale(d.hours) : '#f8fafc')
                .attr("stroke", d => d.isToday ? '#dc2626' : (d.inRange ? '#e2e8f0' : '#f1f5f9'))
                .attr("stroke-width", d => d.isToday ? 2 : 1)
                .style("cursor", d => d.inRange ? "pointer" : "default")
                .on("mouseover", (event, d) => {
                    if (!d.inRange) return;
                    const dateObj = new Date(d.date + 'T00:00:00');
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                    const formatDate = dateObj.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    
                    let html = `<strong>${dayName}, ${formatDate}</strong><br>`;
                    html += `Estimated hours: ${d.hours}h<br>`;
                    
                    if (d.hours > 0) {
                        let productivity = 'Low';
                        if (d.hours >= 7) productivity = 'Overwork';
                        else if (d.hours >= 6.5) productivity = 'Long Day';
                        else if (d.hours >= 5) productivity = 'Full Day';
                        else if (d.hours >= 3) productivity = 'Half Day';
                        
                        html += `<span style="font-size: 0.75rem">Assessment: ${productivity}</span>`;
                    }
                    
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            // Add day numbers
            cells.append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "13px")
                .attr("font-weight", d => d.isToday ? "bold" : "normal")
                .attr("fill", d => {
                    if (!d.inRange) return '#cbd5e1';
                    if (d.isToday) return '#dc2626';
                    return d.hours >= 6.5 ? '#ffffff' : '#1e293b';
                })
                .text(d => d.dayOfMonth);

            // Add hours indicators for days with work
            cells.filter(d => d.hours > 0)
                .append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize - 8)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", d => d.hours >= 6.5 ? '#ffffff' : '#22c55e')
                .text(d => d.hours + 'h');

            // Add week numbers on the left
            g.selectAll("text.week-number")
                .data(d3.range(numWeeks))
                .enter().append("text")
                .attr("class", "week-number")
                .attr("x", -10)
                .attr("y", (d, i) => i * cellSize + cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", "12px")
                .attr("fill", "#94a3b8")
                .text((d, i) => {
                    const weekDate = new Date(firstDate);
                    weekDate.setDate(weekDate.getDate() + (i * 7) - firstDayOffset);
                    const weekNum = Math.ceil((weekDate.getDate()) / 7);
                    return weekNum;
                });

            // Add weekly total cells
            const weeklyColorScale = d3.scaleThreshold()
                .domain([0, 10, 20, 30, 40])
                .range(['#f8fafc', '#dcfce7', '#86efac', '#fbbf24', '#ef4444']);

            const weeklyCells = g.selectAll("g.week-total")
                .data(weeklyTotals)
                .enter().append("g")
                .attr("class", "week-total")
                .attr("transform", d => `translate(${7 * cellSize + 5}, ${d.week * cellSize})`);

            weeklyCells.append("rect")
                .attr("width", weeklyColumnWidth)
                .attr("height", cellSize - 2)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", d => weeklyColorScale(d.total))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-width", 1)
                .style("cursor", "pointer")
                .on("mouseover", (event, d) => {
                    let assessment = 'Light week';
                    if (d.total >= 40) assessment = 'Heavy week';
                    else if (d.total >= 30) assessment = 'Busy week';
                    else if (d.total >= 20) assessment = 'Normal week';
                    
                    let html = `<strong>Week ${d.week + 1}</strong><br>`;
                    html += `Total hours: ${d.total}h<br>`;
                    html += `<span style="font-size: 0.75rem">${assessment}</span>`;
                    
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            weeklyCells.append("text")
                .attr("x", weeklyColumnWidth / 2)
                .attr("y", cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", d => d.total >= 30 ? '#ffffff' : '#1e293b')
                .text(d => d.total + 'h');
        });
    }

    // ActivityWatch calendar renderer
    function loadActivityWatchCalendar(view) {
        const svg = d3.select("#aw-chart");
        svg.selectAll("*").remove();
        
        // Create calendar header
        const calendarDiv = d3.select("#aw-calendar-grid");
        if (calendarDiv.empty()) {
            d3.select("#aw-metrics").insert("div", "#aw-chart")
                .attr("id", "aw-calendar-grid");
        }
        
        const margin = { top: 40, right: 20, bottom: 60, left: 30 };
        const cellSize = 54;
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyColumnWidth = cellSize * 0.8;

        fetch(`/metrics/activitywatch-hours?view=${view}`)
        .then(r => r.json())
        .then(days => {
            if (!days || days.length === 0) {
                // Show message if ActivityWatch is not available
                svg.append("text")
                    .attr("x", 200)
                    .attr("y", 50)
                    .attr("text-anchor", "middle")
                    .attr("font-size", "14px")
                    .attr("fill", "#6b7280")
                    .text("ActivityWatch not available");
                return;
            }

            const maxHours = d3.max(days, d => d.hours);
            
            // Enhanced color scale for ActivityWatch hours (blue theme)
            const colorScale = d3.scaleThreshold()
                .domain([0, 1, 3, 5, 6.5, 7])
                .range(['#f8fafc', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#fbbf24', '#ef4444']);

            // Calculate calendar grid dimensions (Sunday = 0)
            // Parse dates as local time by appending 'T00:00:00'
            const firstDate = new Date(days[0].date + 'T00:00:00');
            const lastDate = new Date(days[days.length - 1].date + 'T00:00:00');
            
            // Calculate Sunday offset for first day
            const firstDayOffset = firstDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Calculate total weeks needed
            const totalDays = Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000)) + 1;
            const totalCells = totalDays + firstDayOffset;
            const numWeeks = Math.ceil(totalCells / 7);
            
            const width = 7 * cellSize + weeklyColumnWidth + 10 + margin.left + margin.right;
            const height = numWeeks * cellSize + margin.top + margin.bottom;
            svg.attr("width", width).attr("height", height);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // Add day of week headers
            g.selectAll("text.day-header")
                .data(dayLabels)
                .enter().append("text")
                .attr("class", "day-header")
                .attr("x", (d, i) => i * cellSize + cellSize / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "600")
                .attr("fill", "#64748b")
                .text(d => d);

            // Add weekly total header
            g.append("text")
                .attr("class", "day-header")
                .attr("x", 7 * cellSize + 5 + weeklyColumnWidth / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .attr("font-size", "14px")
                .attr("font-weight", "600")
                .attr("fill", "#64748b")
                .text("Week");

            // Create tooltip
            let tooltip = d3.select("body").select("#aw-tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("id", "aw-tooltip");
            }

            // Create data map for easy lookup
            const dataMap = new Map(days.map(d => [d.date, d]));

            // Generate all dates in the range
            const allDates = [];
            const currentDate = new Date(firstDate);
            // Move back to the Sunday of the week containing the first date
            currentDate.setTime(currentDate.getTime() - (firstDayOffset * 24 * 60 * 60 * 1000));
            
            for (let i = 0; i < numWeeks * 7; i++) {
                const dateStr = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time
                const dayData = dataMap.get(dateStr);
                const today = new Date();
                const todayStr = today.toLocaleDateString('en-CA');
                allDates.push({
                    date: dateStr,
                    hours: dayData ? dayData.hours : 0,
                    inRange: dayData !== undefined,
                    dayOfMonth: currentDate.getDate(),
                    isToday: dateStr === todayStr
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Calculate weekly totals
            const weeklyTotals = [];
            for (let week = 0; week < numWeeks; week++) {
                let weekTotal = 0;
                for (let day = 0; day < 7; day++) {
                    const index = week * 7 + day;
                    if (index < allDates.length) {
                        weekTotal += allDates[index].hours;
                    }
                }
                weeklyTotals.push({
                    week: week,
                    total: Math.round(weekTotal * 10) / 10 // Round to 1 decimal
                });
            }

            // Draw calendar cells
            const cells = g.selectAll("g.day-cell")
                .data(allDates)
                .enter().append("g")
                .attr("class", "day-cell")
                .attr("transform", (d, i) => {
                    const week = Math.floor(i / 7);
                    const day = i % 7;
                    return `translate(${day * cellSize}, ${week * cellSize})`;
                });

            // Add rectangles
            cells.append("rect")
                .attr("width", cellSize - 2)
                .attr("height", cellSize - 2)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", d => d.inRange ? colorScale(d.hours) : '#f8fafc')
                .attr("stroke", d => d.isToday ? '#dc2626' : (d.inRange ? '#e2e8f0' : '#f1f5f9'))
                .attr("stroke-width", d => d.isToday ? 2 : 1)
                .style("cursor", d => d.inRange ? "pointer" : "default")
                .on("mouseover", (event, d) => {
                    if (!d.inRange) return;
                    const dateObj = new Date(d.date + 'T00:00:00');
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                    const formatDate = dateObj.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                    });
                    
                    let html = `<strong>${dayName}, ${formatDate}</strong><br>`;
                    html += `Active hours: ${d.hours}h<br>`;
                    
                    if (d.hours > 0) {
                        let status = 'Light activity';
                        if (d.hours >= 7) status = 'Heavy usage';
                        else if (d.hours >= 6.5) status = 'Extended usage';
                        else if (d.hours >= 5) status = 'Full day';
                        else if (d.hours >= 3) status = 'Half day';
                        
                        html += `<span style="font-size: 0.75rem">Usage: ${status}</span>`;
                    }
                    
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            // Add day numbers
            cells.append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "13px")
                .attr("font-weight", d => d.isToday ? "bold" : "normal")
                .attr("fill", d => {
                    if (!d.inRange) return '#cbd5e1';
                    if (d.isToday) return '#dc2626';
                    return d.hours >= 6.5 ? '#ffffff' : '#1e293b';
                })
                .text(d => d.dayOfMonth);

            // Add hours indicators for days with activity
            cells.filter(d => d.hours > 0)
                .append("text")
                .attr("x", cellSize / 2)
                .attr("y", cellSize - 8)
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", d => d.hours >= 6.5 ? '#ffffff' : '#3b82f6')
                .text(d => d.hours + 'h');

            // Add week numbers on the left
            g.selectAll("text.week-number")
                .data(d3.range(numWeeks))
                .enter().append("text")
                .attr("class", "week-number")
                .attr("x", -10)
                .attr("y", (d, i) => i * cellSize + cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", "12px")
                .attr("fill", "#94a3b8")
                .text((d, i) => {
                    const weekDate = new Date(firstDate);
                    weekDate.setDate(weekDate.getDate() + (i * 7) - firstDayOffset);
                    const weekNum = Math.ceil((weekDate.getDate()) / 7);
                    return weekNum;
                });

            // Add weekly total cells
            const weeklyColorScale = d3.scaleThreshold()
                .domain([0, 10, 20, 30, 40])
                .range(['#f8fafc', '#dbeafe', '#60a5fa', '#fbbf24', '#ef4444']);

            const weeklyCells = g.selectAll("g.week-total")
                .data(weeklyTotals)
                .enter().append("g")
                .attr("class", "week-total")
                .attr("transform", d => `translate(${7 * cellSize + 5}, ${d.week * cellSize})`);

            weeklyCells.append("rect")
                .attr("width", weeklyColumnWidth)
                .attr("height", cellSize - 2)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", d => weeklyColorScale(d.total))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-width", 1)
                .style("cursor", "pointer")
                .on("mouseover", (event, d) => {
                    let assessment = 'Light week';
                    if (d.total >= 40) assessment = 'Heavy week';
                    else if (d.total >= 30) assessment = 'Busy week';
                    else if (d.total >= 20) assessment = 'Normal week';
                    
                    let html = `<strong>Week ${d.week + 1}</strong><br>`;
                    html += `Active hours: ${d.total}h<br>`;
                    html += `<span style="font-size: 0.75rem">${assessment}</span>`;
                    
                    tooltip.html(html)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            weeklyCells.append("text")
                .attr("x", weeklyColumnWidth / 2)
                .attr("y", cellSize / 2)
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", "11px")
                .attr("font-weight", "bold")
                .attr("fill", d => d.total >= 30 ? '#ffffff' : '#1e293b')
                .text(d => d.total + 'h');
        });
    }

    // Expose globally for script.js
    window.loadD3Metrics = loadD3Metrics;
    window.loadHoursCalendar = loadHoursCalendar;
    window.loadActivityWatchCalendar = loadActivityWatchCalendar;
})();