(function () {
  Promise.all([
    d3.csv(
      // "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv",
      "us-counties.csv",
      type
    ),
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  ]).then(([rawData, us]) => {
    // Process data
    const casesByDate = d3.group(rawData, (d) => d.date);
    const allDates = [...casesByDate.keys()];
    const latestCases = casesByDate.get(allDates[allDates.length - 1]);
    const yScale = d3.scaleSqrt(
      [0, d3.max(latestCases, (d) => d.cases)],
      [0, 400]
    );
    const totalByDate = d3.rollup(
      rawData,
      (v) => d3.sum(v, (d) => d.cases),
      (d) => d.date
    );
    const casesByCountyByDate = d3.group(
      rawData,
      (d) => d.fips,
      (d) => d.date
    );

    // Dimensions
    const dpr = window.devicePixelRatio || 1;
    const mapWidth = 975;
    const mapHeight = 610;
    const width = 1200;
    const height = 820;
    const margin = {
      top: height - mapHeight,
      right: (width - mapWidth) / 2,
      bottom: 0,
      left: (width - mapWidth) / 2,
    };

    // Format
    const parseDate = d3.timeParse("%Y-%m-%d");
    const formatDate = d3.timeFormat("%B %-d");
    const formatCount = d3.format(",");

    // Style
    const themeColor = "#cc0000";

    // Containers
    const chart = d3.select("#chart");
    const canvas = chart
      .append("canvas")
      .attr("width", width * dpr)
      .attr("height", height * dpr);
    const context = canvas.node().getContext("2d");
    context.scale(dpr, dpr);
    const svg = chart.append("svg").attr("viewBox", [0, 0, width, height]);
    const totalCount = chart.append("div").attr("class", "total-count");

    const dateScrubber = scrubber(
      allDates,
      chart.append("div").attr("class", "date-control"),
      {
        delay: 250,
        format: (date) => formatDate(parseDate(date)),
      }
    );
    dateScrubber.addEventListener("input", function () {
      const date = allDates[this.valueAsNumber];
      update(date);
    });

    // Us map
    const projection = d3
      .geoAlbersUsaPr()
      .scale(1300)
      .translate([487.5 + margin.left, 305 + margin.top]);
    const path = d3.geoPath(projection, context);

    // Spikes counties
    const counties = topojson
      .feature(us, us.objects.counties)
      .features.filter(
        (d) => !isNaN(path.centroid(d)[1]) && casesByCountyByDate.get(d.id)
      )
      .sort((a, b) => d3.ascending(path.centroid(a)[1], path.centroid(b)[1]));
    counties.forEach((c) => {
      c.casesByDate = casesByCountyByDate.get(c.id);
      c.x = path.centroid(c)[0];
      c.y = path.centroid(c)[1];
    });

    // Render
    context.lineJoin = "round";
    context.lineCap = "round";

    function drawMap() {
      context.save();

      // Nation
      context.beginPath();
      path(topojson.feature(us, us.objects.nation));
      context.fillStyle = "#f3f3f3";
      context.fill();

      // Counties
      context.beginPath();
      path(
        topojson.mesh(
          us,
          us.objects.counties,
          (a, b) => a !== b && ((a.id / 1000) | 0) === ((b.id / 1000) | 0)
        )
      );
      context.lineWidth = 0.5;
      context.strokeStyle = "#e6e6e6";
      context.stroke();

      // States
      context.beginPath();
      path(topojson.mesh(us, us.objects.states, (a, b) => a !== b));
      context.lineWidth = 0.5;
      context.strokeStyle = "#bdbdbd";
      context.stroke();

      context.restore();
    }

    function drawSpikes(counties) {
      context.save();
      context.lineWidth = 1;
      context.strokeStyle = themeColor;
      counties.forEach((c) => {
        context.beginPath();
        context.moveTo(c.x - 6, c.y);
        context.lineTo(c.x, c.y - c.h);
        context.lineTo(c.x + 6, c.y);
        context.fillStyle = createCountySpikeGradient(c);
        context.stroke();
        context.fill();
      });
      context.restore();
    }

    function createCountySpikeGradient(c) {
      const gradient = context.createLinearGradient(0, c.y - c.h, 0, c.y);
      gradient.addColorStop(0, themeColor);
      gradient.addColorStop(1, "#f3f3f3");
      return gradient;
    }

    function drawAnnotations(counties) {
      svg
        .selectAll("text")
        .data(counties, (c) => c.id)
        .join((enter) =>
          enter
            .append("text")
            .style("font-size", ".8em")
            .style("paint-order", "stroke")
            .style("stroke-width", "3")
            .style("stroke", "#fff")
            .style("fill", "#333")
            .style("text-anchor", "middle")
            .call((text) =>
              text
                .append("tspan")
                .attr("class", "county-name")
                .text((d) => d.properties.name)
            )
            .call((text) =>
              text
                .append("tspan")
                .attr("class", "county-count")
                .attr("font-weight", "bold")
                .attr("fill", themeColor)
            )
        )
        .attr("transform", (d) => `translate(${d.x}, ${d.y - d.h - 4})`)
        .select(".county-count")
        .text((d) => ` ${formatCount(d.cases)}`);
    }

    function update(date) {
      const countiesWithCases = counties.filter((c) => {
        if (c.casesByDate.has(date)) {
          const d = c.casesByDate.get(date)[0];
          c.cases = d.cases;
          c.h = yScale(d.cases);
          return true;
        } else {
          return false;
        }
      });
      const topCounties = countiesWithCases
        .slice()
        .sort((a, b) => d3.descending(a.cases, b.cases))
        .slice(0, 10);
      context.clearRect(0, 0, width, height);
      drawMap();
      drawSpikes(countiesWithCases);
      drawAnnotations(topCounties);
      totalCount.text(`${formatCount(totalByDate.get(date))} total cases`);
    }
  });

  function type(d) {
    d.cases = +d.cases;
    if (d.county == "New York City" && d.state == "New York") {
      d.fips = "36061";
    } else if (d.county == "Kansas City" && d.state == "Missouri") {
      d.fips = "29095";
    }
    return d;
  }

  // Scrubber
  // https://observablehq.com/@mbostock/scrubber
  function scrubber(
    values,
    container,
    {
      format = (value) => value,
      initial = 0,
      delay = null,
      autoplay = true,
      loop = true,
      alternate = false,
    } = {}
  ) {
    values = Array.from(values);

    const form = container.append("div").attr("class", "scrubber");
    const button = form.append("button");
    const label = form.append("label");
    const input = label
      .append("input")
      .attr("type", "range")
      .attr("min", 0)
      .attr("max", values.length - 1)
      .attr("value", initial)
      .attr("step", 1);
    const output = label.append("div").attr("class", "output");

    let timer = null;
    let direction = 1;
    function start() {
      button.classed("play-button", false).classed("pause-button", true);
      timer =
        delay === null ? requestAnimationFrame(tick) : setInterval(tick, delay);
    }
    function stop() {
      button.classed("play-button", true).classed("pause-button", false);
      if (delay === null) cancelAnimationFrame(timer);
      else clearInterval(timer);
      timer = null;
    }
    function tick() {
      if (delay === null) timer = requestAnimationFrame(tick);
      if (
        input.node().valueAsNumber ===
        (direction > 0 ? values.length - 1 : direction < 0 ? 0 : NaN)
      ) {
        if (!loop) return stop();
        if (alternate) direction = -direction;
      }
      input.node().valueAsNumber =
        (input.node().valueAsNumber + direction + values.length) %
        values.length;
      input.node().dispatchEvent(
        new CustomEvent("input", {
          bubbles: true,
        })
      );
    }
    input.node().oninput = (event) => {
      if (event && event.isTrusted && timer) button.node().onclick();
      output.text(
        format(
          values[input.node().valueAsNumber],
          input.node().valueAsNumber,
          values
        )
      );
    };
    button.node().onclick = () => {
      if (timer) return stop();
      direction =
        alternate && input.node().valueAsNumber === values.length - 1 ? -1 : 1;
      input.node().valueAsNumber =
        (input.node().valueAsNumber + direction) % values.length;
      input.node().dispatchEvent(
        new CustomEvent("input", {
          bubbles: true,
        })
      );
      start();
    };
    input.node().oninput();
    if (autoplay) start();
    else stop();
    return input.node();
  }
})();
