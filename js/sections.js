
/**
 * scrollVis - encapsulates
 * all the code for the visualization
 * using reusable charts pattern:
 * http://bost.ocks.org/mike/chart/
 */
 var scrollVis = function () {
  // constants to define the size
  // and margins of the vis area.
  var width = 600;
  var height = 520;
  var margin = { top: 10, left: 50, bottom: 30, right: 50 };

  // Keep track of which visualization
  // we are on and which was the last
  // index activated. When user scrolls
  // quickly, we want to call all the
  // activate functions that they pass.
  var lastIndex = -1;
  var activeIndex = 0;


  // main svg used for visualization
  var svg = null;

  // d3 selection that will be used
  // for displaying visualizations
  var g = null;

  var video = document.getElementById('video');

  var t_open = null;
  var t_close = null;

  var tau_open = 0;      
  var tau_close = null;  // video duration (unit: seconds)
  var delta_tau_s = null;
  

  // if it is their turn, put them where they belong
    
  // two timescales: F is for the start of the viz
  //                 G is for the end of the viz
  // then during the viz, we interpolate between the two.
  var gui_stretch = 30;  // should always be >> 1
  var timeScaleF = null; // TODO refactor timeScaleF to xAtStart

  var timeScaleG = null;

  // given datum's t, compute the tau for when it should enter the viz
  var t_to_tau_cross = null;
  var tau_to_p = null;
  var t_to_p = null;
  var pressure_to_y = null;
  var gyroscope_to_y = null;
  
  var viewBoxXMin = null;

  var x_reveal = 600;


  // for revealing time-series
  var transition_duration = 1000;  // unit ms

  // for time-series plot height
  var ts_group_height = 100;  // vertical axis length + margin
  var ts_plot_proportion = 0.9;
  var ts_plot_height = ts_plot_proportion*ts_group_height;   // vertical axis length
  var otherViewBoxCoords = " 0 " + width + " " + ts_plot_height;
  var percent_upper_bound = 100*(ts_group_height - ts_plot_height)/(2*ts_group_height);
  var percent_lower_bound = 100*(ts_group_height + ts_plot_height)/(2*ts_group_height);

  // map of values to always be initialized for touchData.
  var touchSpec = {
    "id": d => d.i, // id is hardcoded instead of being indexed as
                    // `(d, i) => i` so that id is preserved between re-enters
    "cx": d => timeScaleF(d.time),
    "cy": "50%",
    "r": 20,
    "fill": "red",
    "opacity": 0.7
  };
  
  var pressureSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => pressure_to_y(d.one) + "%",
    "r": 2,
    "fill": "blue",
    "opacity": 0.8
  };

  var gyroscopeOneSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.one) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8
  }

  var gyroscopeTwoSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.two) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8
  }

  var gyroscopeThreeSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.three) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8
  }

  
  // When scrolling to a new section, the activation function 
  // for that section is called.
  var activateFunctions = [];
  // If a section has an update function, then it is continuously
  // called while scrolling through.
  var updateFunctions = [];

  /**
   * chart
   *
   * @param selection - the current d3 selection(s)
   *  to draw the visualization in. For this
   *  example, we will be drawing it in #vis
   */
  var chart = function (selection) {
    selection.each(function (rawData) {
      // create svg and give it a width and height
      // svg = d3.select(this).selectAll('svg').data([wordData]);

      // TODO not sure why data should be bound here
      svg = d3.select(this).selectAll('svg').data([rawData]);

      var svgE = svg.enter().append('svg');
      // @v4 use merge to combine enter and existing selection
      svg = svg.merge(svgE);

      svg.attr('width', width + margin.left + margin.right);
      svg.attr('height', height + margin.top + margin.bottom);

      svg.append('g');


      // this group element will be used to contain all
      // other elements.
      g = svg.select('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

      // ALL DATA PRE-COMPUTATIONS FOLLOW HERE
      var touchData = rawData.touch_actual;
      var pressureData = rawData.pressure_data;
      var gyroscopeData = rawData.gyroscope_data;

      t_open = rawData.t_open[0];
      t_close = rawData.t_close[0];
      tau_close = rawData.tau_close[0];
      delta_tau_s = tau_close - tau_open;
      

      // build all of our conversion functions using t_open, t_close
      timeScaleF = d3.scaleLinear()  // TODO refactor timeScaleF to xAtStart
      .domain([t_open, t_close])
      .range([width, width*(1+gui_stretch)]);

      timeScaleG = d3.scaleLinear()
      .domain([t_open, t_close])
      .range([width*(1-gui_stretch), width]);



      t_to_tau_cross = d3.scaleLinear()
      .domain([t_open, t_close])
      .range([tau_open,tau_close]);

      t_to_p = d3.scaleLinear()
      .domain([t_open, t_close])
      .range([0,1]);

      tau_to_p = d3.scaleLinear()
      .domain([tau_open, tau_close])
      .range([0,1]);
      
      pressure_to_y = d3.scaleLinear()
        // extent of pressure data
        .domain(d3.extent(pressureData, d => d.one))
        .range([percent_lower_bound, percent_upper_bound]);

      gyroscope_to_y = d3.scaleLinear()
        .domain([-1, 1])
        .range([percent_lower_bound, percent_upper_bound]);

      viewBoxXMin = d3.scaleLinear()
        .domain([tau_open, tau_close])
        .range([0, width*gui_stretch]);

      // pre-compute initial and ending x points using functions F and G
      /**
       * modify a time-series-array in-place, using 
       * @param {*} time_series 
       */
      let precompute = function(time_series) {
        let x_totalWidth = width*gui_stretch;
        for (i = 0; i < time_series.length; i++) {  
          d = time_series[i];
          let t = d.time;  // TODO are looped re-allocations weird?
          d.x_start = t_to_p(t)*x_totalWidth + width;
          d.x_end = d.x_start - x_totalWidth;
          let p_reveal = (d.x_start - x_reveal)/(x_totalWidth);
          d.tau_reveal = p_reveal*delta_tau_s;  // range [0,tau_close]
          d.check = xScaleH(time_series[i], tau_to_p(d.tau_reveal));
          d.id = i;
        }
      }

      precompute(touchData);
      precompute(pressureData);
      precompute(gyroscopeData);

      setupVis(touchData, pressureData, gyroscopeData);

      setupSections();
    });
  };


  /**
   * setupVis - creates initial elements for all
   * sections of the visualization.
   *
   * @param wordData - data object for each word.
   * @param fillerCounts - nested data that includes
   *  element for each filler word type.
   * @param histData - binned histogram data
   */
  
  var setupVis = function (touchData, pressureData, gyroscopeData) {
    // count openvis title
    g.append('text')
      .attr('class', 'title openvis-title')
      .attr('x', width / 2)
      .attr('y', height / 3)
      .text('');

    g.append('text')
      .attr('class', 'sub-title openvis-title')
      .attr('x', width / 2)
      .attr('y', (height / 3) + (height / 5))
      .text('');

    g.selectAll('.openvis-title')
      .attr('opacity', 0);

    // count filler word count title
    g.append('text')
      .attr('class', 'title count-title highlight')
      .attr('x', width / 2)
      .attr('y', height / 3)
      .text('180');

    g.append('text')
      .attr('class', 'sub-title count-title')
      .attr('x', width / 2)
      .attr('y', (height / 3) + (height / 5))
      .text('Filler Words');

    g.selectAll('.count-title')
      .attr('opacity', 0);

    // SECTION 0: video
    video.loop = false;
    video.volume = 0;
    video.controls = false;
    video.parentElement.append('rect')
    
    // setup the video listeners
    
    
    video.addEventListener('playing', startAnimation);
    video.addEventListener('pause', function() {
      
      console.log("pausing?");
      if (video.currentTime == video.duration) {
        video.currentTime = 0;
        setTimeout(function() {video.play()}, 500);
      } else {
        stopAnimation();
      }
    });
    
    video.addEventListener('seeking', seekToState);

    //setup

    // SECTION 0.5: gradient
    svg.append('defs')
      .html('\
      <linearGradient id="Gradient0" x1="0" x2="1" y1="0" y2="0">\
        <stop offset="0%" stop-color="white" stop-opacity="1" />\
        <stop offset="100%" stop-color="white" stop-opacity="0" />\
      </linearGradient')

    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', 100)
      .attr('height', 700)
      .attr('fill', 'url(#Gradient0)');

    // SECTION 1 - epsilon: INNER FUNCTION
    
    
    /**
     * 
     * @param {Array of tuples} time_series a dataset with at least the column of time
     * @param {number | function} cx 
     * @param {number | function} cy 
     * @param {number | function} r 
     * @param {string} fill HTML color (hex or named)
     * @param {string} containerName HTML id with no hash, e.g. "touchContainer"
     * @param {string} transform for the containing <g>, e.g. "translate(0,120)"
     */
    let plot_time_series = function(time_series, spec, 
      containerName, transform) {
      // start with a container
      let container = g.append("svg")
        .attr("id", containerName)
        // .attr('x', width)
        // .attr('y', height/4)
        .attr("height", ts_group_height)
        .attr('transform', transform)
        .attr('opacity', 0);  // always init with opacity 0, reveal later.

      // subcontainer for horizontal and vertical axes
      let axes = container.append("g")
        .attr("class", "axes");
      axes.append("line")  // horizontal
        .attr("x1", 0)
        .attr("y1", "50%")
        .attr("x2", width)
        .attr("y2", "50%")
        .attr("style", "stroke:rgb(220,220,220);stroke-width:2")
        .attr("opacity", 1);
      axes.append("line")  // vertical
        .attr("x1", width)
        .attr("y1", percent_upper_bound + "%") 
        .attr("x2", width)
        .attr("y2", percent_lower_bound + "%")
        .attr("style", "stroke:rgb(220,220,220);stroke-width:2")
        .attr("opacity", 1);
      
      // data init
      container.append('g')
        .attr("class", "data")
        .selectAll('circle')
        .data(time_series)
        .enter()
        .append('circle')
        .attr("id", spec["id"])
        .attr("cx", spec["cx"])
        .attr("cy", spec["cy"])
        .attr("r", spec["r"])
        .attr("fill", spec["fill"])
        .attr("opacity", spec["opacity"]);
    }

    /**
     * Creates the basic structure for a graph
     * @param {Object} time_series 
     * @param {Object} spec 
     * @param {string} containerName 
     * @param {string} transform 
     * @returns dataContainer
     */
    let plot_time_series_new = function(time_series, spec, 
      containerName, transform) {
        let container = g.append("svg")
          .attr("id", containerName)
          .attr("transform", transform)
          .attr("height", ts_group_height)
          .attr("opacity", 1); // FIXME back to 0
        
        let axes = container.append("g")
          .attr("class", "axes");
        axes.append("line")  // horizontal
          .attr("class", "horizontal-line")
          .attr("x1", 0)
          .attr("y1", "50%")
          .attr("x2", width)
          .attr("y2", "50%")
          .attr("style", "stroke:rgb(220,220,220);stroke-width:2");
        axes.append("line")  // vertical
          .attr("class", "vertical-line")
          .attr("x1", width)
          .attr("y1", percent_upper_bound + "%") 
          .attr("x2", width)
          .attr("y2", percent_lower_bound + "%")
          .attr("style", "stroke:rgb(220,220,220);stroke-width:2");
        
        let labels = container.append("g")
          .attr("class", "labels");
        
        let viewport = container.append("svg")
          .attr("class", "dataViewPort")
          .attr("height", ts_plot_height)
          .attr("width", width)
          .attr("viewBox", "0" + otherViewBoxCoords);

        let graph = viewport.append("svg")
          .attr("height", ts_plot_height)
          .attr("width", width*gui_stretch + width);
        
        graph.selectAll("circle")
          .data(time_series)
          .enter()
          .append('circle')
          .attr("id", spec["id"])
          .attr("cx", spec["cx"])
          .attr("cy", spec["cy"])
          .attr("r", spec["r"])
          .attr("fill", spec["fill"])
          .attr("opacity", spec["opacity"]);

        return container;
    }

    var touch = plot_time_series(touchData, touchSpec, "touchContainer", "translate(0,0)");
    // plot_time_series(pressureData, pressureSpec, "pressureContainer", "translate(0,120)");
    var pressure = plot_time_series_new(pressureData, pressureSpec, "pressureContainer", "translate(0,120)");
    var gyroscopeOne = plot_time_series_new(gyroscopeData, gyroscopeOneSpec, "gyroscopeOneContainer", "translate(0,240)");
    var gyroscopeTwo = plot_time_series_new(gyroscopeData, gyroscopeTwoSpec, "gyroscopeTwoContainer", "translate(0,340)");
    var gyroscopeThree = plot_time_series_new(gyroscopeData, gyroscopeThreeSpec, "gyroscopeThreeContainer", "translate(0,440)");
  };

  /**
   * setupSections - each section is activated
   * by a separate function. Here we associate
   * these functions to the sections based on
   * the section's index.
   *
   */
  var setupSections = function () {
    // first, init empty functions
    for (var i = 0; i < 9; i++) {
      activateFunctions[i] = function () {};
    }
    for (var i = 0; i < 9; i++) {
      updateFunctions[i] = function () {};
    }

    // activateFunctions are called each
    // time the active section changes
    activateFunctions[0] = showTitle;
    activateFunctions[1] = showTouchAndVideo;
    activateFunctions[2] = showPressure;
    activateFunctions[3] = showGyroscope;
    

    // updateFunctions are called while
    // in a particular section to update
    // the scroll progress in that section.
    // Most sections do not need to be updated
    // for all scrolling and so are set to
    // no-op functions
    
    // (update functions go here)
};

  /**
   * ACTIVATE FUNCTIONS
   *
   * These will be called their
   * section is scrolled to.
   *
   * General pattern is to ensure
   * all content for the current section
   * is transitioned in, while hiding
   * the content for the previous section
   * as well as the next section (as the
   * user may be scrolling up or down).
   *
   */

  
  function showTitle() {
    g.select("#touchContainer")
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
  }

  /**
   * hides: pressure graph
   * shows: touch and video
   */
  function showTouchAndVideo() {
    video.play();
    video.controls = "true";

    g.select("#touchContainer")
      .transition()
      .attr("opacity", 1)
      .duration(transition_duration);

    g.select("#pressureContainer")
       // only need to change the opacity of the container itself
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
  }

  /**
   * hides: gyroscope
   * shows: pressure
   */
  function showPressure() {
    g.select("#pressureContainer")
      .transition()
      .attr("opacity", 1)
      .duration(transition_duration);

    g.selectAll("#gyroscopeOneContainer, #gyroscopeTwoContainer, #gyroscopeThreeContainer")
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
  }

  /**
   * hides: TODO
   * shows: gyroscope
   */
  function showGyroscope() {
    g.selectAll("#gyroscopeOneContainer, #gyroscopeTwoContainer, #gyroscopeThreeContainer")
      .transition()
      .attr("opacity", 1)
      .duration(transition_duration);
  }

  /**
   * Whatever time the video's at, set the whole canvas to that time.
   * (NO ANIMATING DONE HERE)
   */
  function seekToState() {
    console.log("seekToState()")
    
    var tauCurr = video.currentTime;
    var p_from = p_tau(tauCurr);

    var touches = g.select("#touchContainer").select(".data").selectAll("*");
    
    // some touches may be removed from DOM, and have to be re-added.
    // TODO ...makes you wonder if removing from the DOM is ever a good idea.
    var touchesE = touches.data(d3.select("#vis").datum()["touch_actual"])
      .enter()
      .append("circle")
      .attr("id", touchSpec["id"])
      .attr('cx', 1000)  // if it's not their turn, they'll hang off-screen
      .attr('cy', touchSpec["cy"])
      .attr('r', touchSpec["r"])
      .attr('fill', touchSpec["fill"])
      .attr('opacity', touchSpec["opacity"]);

    for (const series of ["#pressureContainer", "#gyroscopeOneContainer", 
      "#gyroscopeTwoContainer", "#gyroscopeThreeContainer"]) {
      g.select(series)
        .select(".dataViewPort")
        .transition()
        .attrTween("viewBox", function() {
          return d3.interpolateString(this.getAttribute("viewBox"), viewBoxXMin(tauCurr) + otherViewBoxCoords);
        })
        .duration(250);
    }
    
    

    touches = touches.merge(touchesE);
        
    // FIXME
    for (const series of [touches]) {
      series
        // TODO do I really need a `selection.data(d3.select("#vis").datum()["touch_actual"])` ?
        .transition()
        .duration(250)
        // if it is their turn, put them where they belong
        .attr('cx', d => xScaleH(d, p_from));
        // TODO we don't want data to enter the canvas early. 
        //      it would interfere with the axis labels.
        //      we ought to set opacity to zero
        //      i.e.   .attr("opacity", d => (d.tau_reveal > tauCurr) ? 0 : 0.8)
        //      but how do we set the opacity back to 0.8 without breaking the transition animation pt 2?
        //      let's try transition.merge later.
        // cd .. for good measure hahaha
    }
  }
  
  function startAnimation() {
    // first bring the points to the x corresponding to tau_from
    seekToState();

    console.log("startAnimation() ");
    var tau_from = video.currentTime;
    var tau_curr = video.currentTime; 
    var tau_to = tau_close;
    var p_close = p_tau(tau_close);

    // TODO encapsulate all this in a function that returns an array of these selections
    var touches = g.select("#touchContainer").select(".data").selectAll("*");
    
    
    for (const series of [touches]) {
      // then bring each to the x_width when it's their turn to be revealed
      series
      .transition()
      .attr('cx', width)
      .delay(function(d) { return 1000*(d.tau_reveal - tau_from) })  // each datum is revealed at time tau_reveal
      .duration(0);
      
      // then continue the rest of the transition
      series.transition()
      .attr('cx', function(d) {return xScaleH(d, p_close)})
      .delay(function(d) { return 1000*(d.tau_reveal - tau_from) })
      .ease(d3.easeLinear)
      .duration(function(d) { return 1000*(tau_to - d.tau_reveal) });
      
      var elementRemoveDelay_s = 2;  
      // elements disappear after 2 seconds
      series.transition()
        .delay(function(d) { return 1000*(d.tau_reveal - tau_from + elementRemoveDelay_s) })
        .duration(0)
        .remove();
    }

    for (const series of ["#pressureContainer", "#gyroscopeOneContainer",
      "#gyroscopeTwoContainer", "#gyroscopeThreeContainer"]) {
      g.select(series)
        .select(".dataViewPort")
        .transition()
        .ease(d3.easeLinear)
        .attrTween("viewBox", function() {
          return d3.interpolateString(this.getAttribute("viewBox"), viewBoxXMin(tau_close) + otherViewBoxCoords);
        })
        .duration(1000*(tau_close - tau_curr));
    }
  }

  function stopAnimation() {
    // TODO can I just use a global reference to these variables?
    // after all, i assume d3 selections are simply pointers, 
    // and so a single *static* selection statement has *dynamic* value through the program runtime.
    var subcontainers = ["#touchContainer", ];
    for (const subcontainer of subcontainers) {
      g.select(subcontainer).select(".data").selectAll("*").interrupt();
    }
    
    subcontainers = ["#pressureContainer", "#gyroscopeOneContainer", 
      "#gyroscopeTwoContainer", "#gyroscopeThreeContainer"];
    for (const subcontainer of subcontainers) {
      g.select(subcontainer).select(".dataViewPort").interrupt();
    }
  }


  /**
   * Linear mapping from [tau_open, tau_close] -> [0, 1]
   *                         (seconds in video)    
   * Useful for linear combinations.
   */
  function p_tau(tau_curr) {
    return (tau_curr - tau_open) / (tau_close - tau_open);
  }

  function p_t(t_curr) {
    return (t_curr - t_open) / (t_close - t_open);
  }

  /**
   * Given a time-series datum, figure out where it belongs at the given time
   * Interpolates between a datum's x_start and x_end
   * @param {datum} d, a tuple containing time and pre-computed x_start, x_end 
   * @param {[0,1]} p_tau_curr
   */
  function xScaleH(d, p_tau_curr) {
    return d.x_start*(1-p_tau_curr) + d.x_end*(p_tau_curr);
  }

  /**
   * UPDATE FUNCTIONS
   *
   * These will be called within a section
   * as the user scrolls through it.
   *
   * We use an immediate transition to
   * update visual elements based on
   * how far the user has scrolled
   *
   */


  /**
   * DATA FUNCTIONS
   *
   * Used to coerce the data into the
   * formats we need to visualize
   *
   */
  /**
   * activate -
   *
   * @param index - index of the activated section
   */
  chart.activate = function (index) {
    activeIndex = index;
    var sign = (activeIndex - lastIndex) < 0 ? -1 : 1;
    var scrolledSections = d3.range(lastIndex + sign, activeIndex + sign, sign);
    scrolledSections.forEach(function (i) {
      activateFunctions[i]();
    });
    lastIndex = activeIndex;
  };

  /**
   * update
   *
   * @param index
   * @param progress
   */
  chart.update = function (index, progress) {
    updateFunctions[index](progress);
  };

  // return chart function
  return chart;
};


/**
 * display - called once data
 * has been loaded.
 * sets up the scroller and
 * displays the visualization.
 *
 * @param data - loaded tsv data
 */
function display(data) {
  // create a new plot and
  // display it
  var plot = scrollVis();
  d3.select('#vis')
    .datum(data)
    .call(plot);

  // setup scroll functionality
  var scroll = scroller()
    .container(d3.select('#graphic'));

  // pass in .step selection as the steps
  scroll(d3.selectAll('.step'));

  // setup event handling
  scroll.on('active', function (index) {
    // highlight current step text
    d3.selectAll('.step')
      .style('opacity', function (d, i) { return i === index ? 1 : 0.1; });

    // activate current section
    plot.activate(index);
  });

  scroll.on('progress', function (index, progress) {
    plot.update(index, progress);
  });
}

// load data and display
// d3.tsv('data/words.tsv', display);
d3.json('data/viz_data.json', display);
