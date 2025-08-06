


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
            const firstDate = new Date(days[0].date);
            const lastDate = new Date(days[days.length - 1].date);
            
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
            currentDate.setDate(currentDate.getDate() - firstDayOffset); // Start from Sunday
            
            for (let i = 0; i < numWeeks * 7; i++) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayData = dataMap.get(dateStr);
                allDates.push({
                    date: dateStr,
                    count: dayData ? dayData.count : 0,
                    inRange: dayData !== undefined,
                    dayOfMonth: currentDate.getDate(),
                    isToday: dateStr === new Date().toISOString().split('T')[0]
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
                    const dayName = new Date(d.date).toLocaleDateString('en-US', { weekday: 'long' });
                    const formatDate = new Date(d.date).toLocaleDateString('en-US', { 
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

    // Expose globally for script.js
    window.loadD3Metrics = loadD3Metrics;
})();