


(function () {
    // D3-based metrics renderer with tooltips
    function loadD3Metrics(view) {
        const svg = d3.select("#metrics-chart");
        svg.selectAll("*").remove();
        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const cellSize = 24;

        // WEEK VIEW: single-line layout
        if (view === "week") {
            // Set svg dimensions for one row
            Promise.all([
                fetch(`/metrics/counts?view=${view}`).then(r => r.json()),
                fetch("/metrics/switches").then(r => r.json())
            ]).then(([days, switches]) => {
                const width = days.length * cellSize + margin.left + margin.right;
                const height = cellSize + margin.top + margin.bottom;
                svg.attr("width", width).attr("height", height);

                const gWeek = svg.append("g")
                    .attr("transform", `translate(${margin.left},${margin.top})`);

                // Tooltip div
                let tooltip = d3.select("body").select("#tooltip");
                if (tooltip.empty()) {
                    tooltip = d3.select("body").append("div").attr("id", "tooltip");
                }

                // Group switches by date (YYYY-MM-DD)
                const switchesByDate = d3.group(switches, d => d.timestamp.slice(0, 10));
                const maxCount = d3.max(days, d => d.count);
                const colorScale = d3.scaleLinear()
                    .domain([0, maxCount || 1])
                    .range(["#eee", "#1f77b4"]);

                // Render day rectangles in one line
                gWeek.selectAll("rect")
                    .data(days)
                    .enter().append("rect")
                    .attr("x", (d, i) => i * cellSize)
                    .attr("y", 0)
                    .attr("width", cellSize - 2)
                    .attr("height", cellSize - 2)
                    .attr("fill", d => colorScale(d.count))
                    .on("mouseover", (event, d) => {
                        const list = switchesByDate.get(d.date) || [];
                        const html = list.length
                            ? list.map(it =>
                                `${it.timestamp.slice(11, 19)} ${it.from || "idle"}→${it.to || ""}`
                                + (it.note ? ` (${it.note})` : "")
                            ).join("<br>")
                            : "No switches";
                        tooltip.html(`<strong>${d.date}</strong><br>Count: ${d.count}<br>${html}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY + 10) + "px")
                            .style("display", "block");
                    })
                    .on("mouseout", () => {
                        tooltip.style("display", "none");
                    });

                // Add count labels centered in each cell
                gWeek.selectAll("text.count")
                    .data(days)
                    .enter().append("text")
                    .attr("class", "count")
                    .attr("x", (d, i) => i * cellSize + (cellSize - 2) / 2)
                    .attr("y", (cellSize - 2) / 2)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "middle")
                    .attr("fill", d => d.count > maxCount / 2 ? "#fff" : "#000")
                    .attr("font-size", "10px")
                    .text(d => d.count);
            });
            // Skip default multi-row layout
            return;
        }

        // --- Weekly grid layout definitions ---
        // These will be available in scope for .attr blocks below.
        let firstDate, msPerDay, offset, numCols, numRows, totalCells, width, height;

        Promise.all([
            fetch(`/metrics/counts?view=${view}`).then(r => r.json()),
            fetch("/metrics/switches").then(r => r.json())
        ]).then(([days, switches]) => {
            // Group switches by date (YYYY-MM-DD)
            const switchesByDate = d3.group(switches, d => d.timestamp.slice(0, 10));
            const maxCount = d3.max(days, d => d.count);
            const colorScale = d3.scaleLinear()
                .domain([0, maxCount || 1])
                .range(["#eee", "#1f77b4"]);

            // Compute weekly grid parameters
            msPerDay = 24 * 60 * 60 * 1000;
            firstDate = new Date(days[0]?.date);
            // For week view, align to Monday; for month, align to first day of month
            if (view === "week") {
                offset = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1; // Monday=0, Sunday=6
                numCols = 7;
            } else {
                // For month, align to first day of week in the month
                offset = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1;
                numCols = 7;
            }
            totalCells = days.length + offset;
            numRows = Math.ceil(totalCells / numCols);
            width = numCols * cellSize + margin.left + margin.right;
            height = numRows * cellSize + margin.top + margin.bottom;
            svg.attr("width", width).attr("height", height);

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);

            // Tooltip div
            let tooltip = d3.select("body").select("#tooltip");
            if (tooltip.empty()) {
                tooltip = d3.select("body").append("div").attr("id", "tooltip");
            }

            // Draw cells
            g.selectAll("rect")
                .data(days)
                .enter().append("rect")
                .attr("x", d => {
                    const cur = new Date(d.date);
                    const daysSince = Math.round((cur - firstDate) / msPerDay);
                    const idx = daysSince + offset;
                    return (idx % numCols) * cellSize;
                })
                .attr("y", d => {
                    const cur = new Date(d.date);
                    const daysSince = Math.round((cur - firstDate) / msPerDay);
                    const idx = daysSince + offset;
                    return Math.floor(idx / numCols) * cellSize;
                })
                .attr("width", cellSize - 2)
                .attr("height", cellSize - 2)
                .attr("fill", d => colorScale(d.count))
                .on("mouseover", (event, d) => {
                    const list = switchesByDate.get(d.date) || [];
                    const html = list.length
                        ? list.map(it =>
                            `${it.timestamp.slice(11, 19)} ${it.from || "idle"}→${it.to || ""}`
                            + (it.note ? ` (${it.note})` : "")
                        ).join("<br>")
                        : "No switches";
                    tooltip.html(`<strong>${d.date}</strong><br>Count: ${d.count}<br>${html}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY + 10) + "px")
                        .style("display", "block");
                })
                .on("mouseout", () => {
                    tooltip.style("display", "none");
                });

            // Add count labels
            g.selectAll("text.count")
                .data(days)
                .enter().append("text")
                .attr("class", "count")
                .attr("x", d => {
                    const cur = new Date(d.date);
                    const daysSince = Math.round((cur - firstDate) / msPerDay);
                    const idx = daysSince + offset;
                    return (idx % numCols) * cellSize + (cellSize - 2) / 2;
                })
                .attr("y", d => {
                    const cur = new Date(d.date);
                    const daysSince = Math.round((cur - firstDate) / msPerDay);
                    const idx = daysSince + offset;
                    return Math.floor(idx / numCols) * cellSize + (cellSize - 2) / 2;
                })
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("fill", d => d.count > maxCount / 2 ? "#fff" : "#000")
                .attr("font-size", "10px")
                .text(d => d.count);
        });
    }

    // Expose globally for script.js
    window.loadD3Metrics = loadD3Metrics;
})();