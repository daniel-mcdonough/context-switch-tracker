(function () {
    // Analytics page functionality
    let analyticsMonthView = false;

    // Load analytics data and render visualizations
    function loadAnalytics(view = 'week') {
        Promise.all([
            fetch(`/analytics/time-consumers?view=${view}`).then(r => r.json()),
            fetch(`/analytics/switch-leaders?view=${view}`).then(r => r.json()),
            fetch(`/analytics/insights?view=${view}`).then(r => r.json()),
            fetch(`/analytics/tags?view=${view}`).then(r => r.json())
        ]).then(([timeConsumers, switchLeaders, insights, tagAnalytics]) => {
            renderTimeConsumers(timeConsumers, view);
            renderSwitchLeaders(switchLeaders, view);
            renderProductivityInsights(insights, view);
            renderTagAnalytics(tagAnalytics, view);
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

        // Render tag types
        const typesChartDiv = d3.select("#tag-types-chart");
        const typesListDiv = d3.select("#tag-types-list");
        
        typesChartDiv.selectAll("*").remove();
        typesListDiv.selectAll("*").remove();

        if (!data || !data.top_tag_types || data.top_tag_types.length === 0) {
            typesListDiv.append("p").text("No tag categories found");
        } else {
            // Create horizontal bar chart for tag types
            const margin = { top: 20, right: 60, bottom: 40, left: 120 };
            const width = 400 - margin.left - margin.right;
            const height = Math.max(200, data.top_tag_types.length * 25) - margin.top - margin.bottom;

            const svg = typesChartDiv.append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            const x = d3.scaleLinear()
                .domain([0, d3.max(data.top_tag_types, d => d.count)])
                .range([0, width]);

            const y = d3.scaleBand()
                .domain(data.top_tag_types.map(d => d.type))
                .range([0, height])
                .padding(0.2);

            // Bars
            g.selectAll(".bar")
                .data(data.top_tag_types)
                .enter().append("rect")
                .attr("class", "bar")
                .attr("x", 0)
                .attr("y", d => y(d.type))
                .attr("width", d => x(d.count))
                .attr("height", y.bandwidth())
                .attr("fill", "#7c3aed")
                .attr("rx", 2);

            // Labels
            g.selectAll(".bar-label")
                .data(data.top_tag_types)
                .enter().append("text")
                .attr("class", "bar-label")
                .attr("x", d => x(d.count) + 5)
                .attr("y", d => y(d.type) + y.bandwidth() / 2)
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
            const list = typesListDiv.append("div")
                .style("max-height", "300px")
                .style("overflow-y", "auto");

            list.selectAll(".type-item")
                .data(data.top_tag_types.slice(0, 10))
                .enter().append("div")
                .attr("class", "analytics-item")
                .html(d => `
                    <div class="analytics-item-header">
                        <strong>${d.type}</strong>
                        <span class="analytics-badge" style="background: #7c3aed;">${d.count}</span>
                    </div>
                `);
        }
    }

    // Expose globally
    window.loadAnalytics = loadAnalytics;
    window.analyticsMonthView = analyticsMonthView;
    window.setAnalyticsMonthView = (value) => { analyticsMonthView = value; };
})();