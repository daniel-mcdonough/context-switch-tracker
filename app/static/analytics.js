(function () {
    // Analytics page functionality
    let analyticsMonthView = false;

    // Load analytics data and render visualizations
    function loadAnalytics(view = 'week') {
        Promise.all([
            fetch(`/analytics/time-consumers?view=${view}`).then(r => r.json()),
            fetch(`/analytics/switch-leaders?view=${view}`).then(r => r.json()),
            fetch(`/analytics/insights?view=${view}`).then(r => r.json()),
            fetch(`/analytics/tags?view=${view}`).then(r => r.json()),
            fetch(`/analytics/chaos?view=${view}`).then(r => r.json())
        ]).then(([timeConsumers, switchLeaders, insights, tagAnalytics, chaosData]) => {
            renderTimeConsumers(timeConsumers, view);
            renderSwitchLeaders(switchLeaders, view);
            renderProductivityInsights(insights, view);
            renderTagAnalytics(tagAnalytics, view);
            renderChaosChart(chaosData);
        }).catch(err => {
            console.error('Failed to load analytics:', err);
        });
    }

    function renderTimeConsumers(data, view) {
        const chartDiv = d3.select("#time-consumers-chart");
        const listDiv = d3.select("#time-consumers-list");
        
        chartDiv.selectAll("*").remove();
        listDiv.selectAll("*").remove();

        if (!data || data.length === 0) {
            listDiv.append("p").text("No time tracking data available");
            return;
        }

        // Create horizontal bar chart
        const margin = { top: 20, right: 60, bottom: 40, left: 120 };
        const width = 400 - margin.left - margin.right;
        const height = Math.max(200, data.length * 25) - margin.top - margin.bottom;

        const svg = chartDiv.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.total_hours)])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.task))
            .range([0, height])
            .padding(0.2);

        // Bars
        g.selectAll(".bar")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", 0)
            .attr("y", d => y(d.task))
            .attr("width", d => x(d.total_hours))
            .attr("height", y.bandwidth())
            .attr("fill", "#64748b")
            .attr("rx", 2);

        // Labels
        g.selectAll(".bar-label")
            .data(data)
            .enter().append("text")
            .attr("class", "bar-label")
            .attr("x", d => x(d.total_hours) + 5)
            .attr("y", d => y(d.task) + y.bandwidth() / 2)
            .attr("dy", "0.35em")
            .style("font-size", "11px")
            .style("fill", "#64748b")
            .text(d => `${d.total_hours}h`);

        // Y axis
        g.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "10px")
            .style("fill", "#64748b");

        // Create detailed list
        const list = listDiv.append("div")
            .style("max-height", "300px")
            .style("overflow-y", "auto");

        list.selectAll(".time-item")
            .data(data.slice(0, 10))
            .enter().append("div")
            .attr("class", "analytics-item")
            .html(d => `
                <div class="analytics-item-header">
                    <strong>${d.task}</strong>
                    <span class="analytics-badge">${d.total_hours}h</span>
                </div>
                <div class="analytics-item-details">
                    ${d.switch_count} sessions • Avg: ${d.avg_session_minutes}min
                </div>
            `);
    }

    function renderSwitchLeaders(data, view) {
        const chartDiv = d3.select("#switch-leaders-chart");
        const listDiv = d3.select("#switch-leaders-list");
        
        chartDiv.selectAll("*").remove();
        listDiv.selectAll("*").remove();

        if (!data || data.length === 0) {
            listDiv.append("p").text("No context switch data available");
            return;
        }

        // Create horizontal bar chart
        const margin = { top: 20, right: 60, bottom: 40, left: 120 };
        const width = 400 - margin.left - margin.right;
        const height = Math.max(200, data.length * 25) - margin.top - margin.bottom;

        const svg = chartDiv.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.total_switches)])
            .range([0, width]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.task))
            .range([0, height])
            .padding(0.2);

        // Bars
        g.selectAll(".bar")
            .data(data)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", 0)
            .attr("y", d => y(d.task))
            .attr("width", d => x(d.total_switches))
            .attr("height", y.bandwidth())
            .attr("fill", "#dc2626")
            .attr("rx", 2);

        // Labels
        g.selectAll(".bar-label")
            .data(data)
            .enter().append("text")
            .attr("class", "bar-label")
            .attr("x", d => x(d.total_switches) + 5)
            .attr("y", d => y(d.task) + y.bandwidth() / 2)
            .attr("dy", "0.35em")
            .style("font-size", "11px")
            .style("fill", "#64748b")
            .text(d => d.total_switches);

        // Y axis
        g.append("g")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "10px")
            .style("fill", "#64748b");

        // Create detailed list
        const list = listDiv.append("div")
            .style("max-height", "300px")
            .style("overflow-y", "auto");

        list.selectAll(".switch-item")
            .data(data.slice(0, 10))
            .enter().append("div")
            .attr("class", "analytics-item")
            .html(d => `
                <div class="analytics-item-header">
                    <strong>${d.task}</strong>
                    <span class="analytics-badge analytics-badge-danger">${d.total_switches}</span>
                </div>
                <div class="analytics-item-details">
                    From: ${d.switched_from} • To: ${d.switched_to}
                </div>
            `);
    }

    function renderProductivityInsights(insights, view) {
        const container = d3.select("#productivity-insights");
        container.selectAll("*").remove();

        if (!insights) {
            container.append("p").text("No insights available");
            return;
        }

        // Create insights grid
        const grid = container.append("div")
            .attr("class", "insights-grid");

        // Total switches card
        const totalCard = grid.append("div")
            .attr("class", "insight-card");

        totalCard.append("div")
            .attr("class", "insight-value")
            .text(insights.total_switches);

        totalCard.append("div")
            .attr("class", "insight-label")
            .text(`Total Switches Last ${view === 'month' ? '30 Days' : 'Week'}`);

        // Average per day card
        const avgCard = grid.append("div")
            .attr("class", "insight-card");

        avgCard.append("div")
            .attr("class", "insight-value")
            .text(insights.avg_switches_per_day);

        avgCard.append("div")
            .attr("class", "insight-label")
            .text("Average Switches Per Day");

        // Most active day card
        if (insights.most_active_day && insights.most_active_day.date) {
            const activeCard = grid.append("div")
                .attr("class", "insight-card");

            const date = new Date(insights.most_active_day.date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

            activeCard.append("div")
                .attr("class", "insight-value")
                .text(insights.most_active_day.switches);

            activeCard.append("div")
                .attr("class", "insight-label")
                .text(`Switches on ${dayName}`);
        }

        // Hourly distribution chart (if data available)
        if (insights.hourly_distribution && insights.hourly_distribution.length > 0) {
            const hourlySection = container.append("div")
                .style("margin-top", "20px");

            hourlySection.append("h3")
                .style("font-size", "14px")
                .style("margin-bottom", "10px")
                .text("Switch Distribution by Hour");

            const hourlyChart = hourlySection.append("svg")
                .attr("width", 600)
                .attr("height", 100);

            const hourlyData = insights.hourly_distribution;
            const margin = { top: 10, right: 10, bottom: 30, left: 30 };
            const chartWidth = 600 - margin.left - margin.right;
            const chartHeight = 100 - margin.top - margin.bottom;

            const g = hourlyChart.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            const x = d3.scaleLinear()
                .domain([0, 23])
                .range([0, chartWidth]);

            const y = d3.scaleLinear()
                .domain([0, d3.max(hourlyData, d => d.switches)])
                .range([chartHeight, 0]);

            // Bars
            g.selectAll(".hour-bar")
                .data(hourlyData)
                .enter().append("rect")
                .attr("class", "hour-bar")
                .attr("x", d => x(d.hour) - 8)
                .attr("y", d => y(d.switches))
                .attr("width", 16)
                .attr("height", d => chartHeight - y(d.switches))
                .attr("fill", "#64748b")
                .attr("rx", 2);

            // X axis
            g.append("g")
                .attr("transform", `translate(0,${chartHeight})`)
                .call(d3.axisBottom(x).tickFormat(d => `${d}h`))
                .selectAll("text")
                .style("font-size", "10px");
        }
    }

    function renderTagAnalytics(data, view) {
        // Render top tags
        const tagsChartDiv = d3.select("#tag-analytics-chart");
        const tagsListDiv = d3.select("#tag-analytics-list");
        
        tagsChartDiv.selectAll("*").remove();
        tagsListDiv.selectAll("*").remove();

        if (!data || !data.top_tags || data.top_tags.length === 0) {
            tagsListDiv.append("p").text("No tagged switches found");
        } else {
            // Create horizontal bar chart for tags
            const margin = { top: 20, right: 60, bottom: 40, left: 120 };
            const width = 400 - margin.left - margin.right;
            const height = Math.max(200, data.top_tags.length * 25) - margin.top - margin.bottom;

            const svg = tagsChartDiv.append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            const x = d3.scaleLinear()
                .domain([0, d3.max(data.top_tags, d => d.count)])
                .range([0, width]);

            const y = d3.scaleBand()
                .domain(data.top_tags.map(d => d.tag))
                .range([0, height])
                .padding(0.2);

            // Bars
            g.selectAll(".bar")
                .data(data.top_tags)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", 0)
                .attr("y", d => y(d.tag))
                .attr("width", d => x(d.count))
                .attr("height", y.bandwidth())
                .attr("fill", "#059669")
                .attr("rx", 2);

            // Labels
            g.selectAll(".bar-label")
                .data(data.top_tags)
                .enter().append("text")
                .attr("class", "bar-label")
                .attr("x", d => x(d.count) + 5)
                .attr("y", d => y(d.tag) + y.bandwidth() / 2)
                .attr("dy", "0.35em")
                .style("font-size", "11px")
                .style("fill", "#64748b")
                .text(d => d.count);

            // Y axis
            g.append("g")
                .call(d3.axisLeft(y))
                .selectAll("text")
                .style("font-size", "10px")
                .style("fill", "#64748b");

            // Create detailed list
            const list = tagsListDiv.append("div")
                .style("max-height", "300px")
                .style("overflow-y", "auto");

            list.selectAll(".tag-item")
                .data(data.top_tags.slice(0, 10))
                .enter().append("div")
                .attr("class", "analytics-item")
                .html(d => `
                    <div class="analytics-item-header">
                        <strong>${d.tag}</strong>
                        <span class="analytics-badge">${d.count}</span>
                    </div>
                `);
        }
    }

    function renderChaosChart(data) {
        const chartDiv = d3.select("#chaos-chart");
        const legendDiv = d3.select("#chaos-legend");

        chartDiv.selectAll("*").remove();
        legendDiv.selectAll("*").remove();

        if (!data || data.length === 0) {
            chartDiv.append("p").text("No chaos data available. Run chaos-tracker to collect metrics.");
            return;
        }

        // Handle error response
        if (data.error) {
            chartDiv.append("p")
                .style("color", "#64748b")
                .style("font-style", "italic")
                .text(data.error);
            return;
        }

        // Chart dimensions
        const margin = { top: 20, right: 60, bottom: 60, left: 50 };
        const width = 800 - margin.left - margin.right;
        const height = 300 - margin.top - margin.bottom;

        const svg = chartDiv.append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Parse dates
        data.forEach(d => {
            d.parsedDate = new Date(d.date);
        });

        // Scales
        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.parsedDate))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([height, 0]);

        // Color scale for chaos levels
        function getChaosColor(score) {
            if (score >= 75) return "#dc2626"; // HIGH - red
            if (score >= 50) return "#f59e0b"; // MEDIUM - orange
            if (score >= 25) return "#eab308"; // LOW - yellow
            return "#10b981"; // CALM - green
        }

        // Area generator for avg score
        const area = d3.area()
            .x(d => x(d.parsedDate))
            .y0(height)
            .y1(d => y(d.avg_score))
            .curve(d3.curveMonotoneX);

        // Draw filled area
        g.append("path")
            .datum(data)
            .attr("fill", "url(#chaos-gradient)")
            .attr("opacity", 0.3)
            .attr("d", area);

        // Define gradient
        const gradient = svg.append("defs")
            .append("linearGradient")
            .attr("id", "chaos-gradient")
            .attr("x1", "0%")
            .attr("x2", "0%")
            .attr("y1", "0%")
            .attr("y2", "100%");

        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", "#dc2626");

        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", "#10b981");

        // Line generator for avg score
        const line = d3.line()
            .x(d => x(d.parsedDate))
            .y(d => y(d.avg_score))
            .curve(d3.curveMonotoneX);

        // Draw avg score line
        g.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "#64748b")
            .attr("stroke-width", 2)
            .attr("d", line);

        // Draw points with chaos level colors
        g.selectAll(".chaos-dot")
            .data(data)
            .enter().append("circle")
            .attr("class", "chaos-dot")
            .attr("cx", d => x(d.parsedDate))
            .attr("cy", d => y(d.avg_score))
            .attr("r", 4)
            .attr("fill", d => getChaosColor(d.avg_score))
            .attr("stroke", "white")
            .attr("stroke-width", 2)
            .on("mouseover", function(event, d) {
                const tooltip = chartDiv.append("div")
                    .attr("class", "chaos-tooltip")
                    .style("position", "absolute")
                    .style("background", "rgba(0,0,0,0.8)")
                    .style("color", "white")
                    .style("padding", "8px")
                    .style("border-radius", "4px")
                    .style("font-size", "12px")
                    .style("pointer-events", "none")
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");

                let level = "CALM";
                if (d.avg_score >= 75) level = "HIGH";
                else if (d.avg_score >= 50) level = "MEDIUM";
                else if (d.avg_score >= 25) level = "LOW";

                tooltip.html(`
                    <strong>${d.date}</strong><br/>
                    Chaos Score: ${d.avg_score} (${level})<br/>
                    Max: ${d.max_score}<br/>
                    Branch switches: ${d.branches}<br/>
                    App switches: ${d.apps}<br/>
                    Active hours: ${d.active_hours}
                `);

                d3.select(this).attr("r", 6);
            })
            .on("mouseout", function() {
                chartDiv.selectAll(".chaos-tooltip").remove();
                d3.select(this).attr("r", 4);
            });

        // Reference lines for chaos levels
        const levels = [
            { y: 25, label: "LOW", color: "#eab308" },
            { y: 50, label: "MEDIUM", color: "#f59e0b" },
            { y: 75, label: "HIGH", color: "#dc2626" }
        ];

        levels.forEach(level => {
            g.append("line")
                .attr("x1", 0)
                .attr("x2", width)
                .attr("y1", y(level.y))
                .attr("y2", y(level.y))
                .attr("stroke", level.color)
                .attr("stroke-dasharray", "3,3")
                .attr("opacity", 0.3);
        });

        // Axes
        g.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%m/%d")))
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)");

        g.append("g")
            .call(d3.axisLeft(y))
            .append("text")
            .attr("fill", "#64748b")
            .attr("transform", "rotate(-90)")
            .attr("y", -40)
            .attr("x", -height / 2)
            .attr("text-anchor", "middle")
            .text("Chaos Score");

        // Legend
        legendDiv.html(`
            <span style="color: #10b981;">●</span> CALM (0-24) &nbsp;&nbsp;
            <span style="color: #eab308;">●</span> LOW (25-49) &nbsp;&nbsp;
            <span style="color: #f59e0b;">●</span> MEDIUM (50-74) &nbsp;&nbsp;
            <span style="color: #dc2626;">●</span> HIGH (75-100)
        `);
    }

    // Expose globally
    window.loadAnalytics = loadAnalytics;
    window.analyticsMonthView = analyticsMonthView;
    window.setAnalyticsMonthView = (value) => { analyticsMonthView = value; };
})();