
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
  var margin = { top: 10, left: 50, bottom: 30, right: 150 };

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

  // sub-selections used for individual visualizations
  var touch = null;
  var pressure = null;
  var gyroscopeOne = null;
  var gyroscopeTwo = null;
  var gyroscopeThree = null;
  var touchBar = null;


  // gsap selection for animating time series
  var containers = null;  // for height
  var canvasses = null;   // for time

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

  var tau_to_p = null;
  var t_to_p = null;
  var pressure_to_y = null;
  var gyroscope_to_y = null;
  var touchConfidence_to_y;
  
  
  var canvasX = null;

  var x_reveal = 600;


  // for revealing time-series
  var transition_duration = 1000;  // unit ms

  // for time-series plot height
  var ts_group_height = "18%";  // vertical axis length + margin
  var ts_plot_proportion = 0.8;
  var ts_plot_height = ts_plot_proportion * 100 + "%"

  var percent_upper_bound = (1 - ts_plot_proportion)/2 * 100 + "%";
  var percent_lower_bound = (1 + ts_plot_proportion)/2 * 100 + "%";

  var right_margin_position = (margin.top + width) / (margin.top + width + margin.right) * 100 + "%";
  console.log(right_margin_position);

  // map of values to always be initialized for touchData.
  var touchSpec = {
    "id": d => d.i, // id is hardcoded instead of being indexed as
                    // `(d, i) => i` so that id is preserved between re-enters
    "cx": d => timeScaleF(d.time),
    "cy": "50%",
    "r": 20,
    // "fill": "red",
    "fill": "url(#diglett)",
    "opacity": 1,
    "y": "0%",
    "title": "touches"
  };
  
  var pressureSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => pressure_to_y(d.one) + "%",
    "r": 2,
    "fill": "blue",
    "opacity": 0.8,
    "y": "20%",
    "title": "air pressure",
    "cy_baseFunction": () => pressure_to_y
  };

  var gyroscopeOneSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.one) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8,
    "y": "40%",
    "title": "gyroscope (x)",
    "cy_baseFunction": () => gyroscope_to_y
  }

  var gyroscopeTwoSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.two) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8,
    "y": "60%",
    "title": "gyroscope (y)",
    "cy_baseFunction": () => gyroscope_to_y
  }

  var gyroscopeThreeSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => gyroscope_to_y(d.three) + "%",
    "r": 2,
    "fill": "green",
    "opacity": 0.8,
    "y": "80%",
    "title": "gyroscope (z)",
    "cy_baseFunction": () => gyroscope_to_y
  }

  var touchConfidenceSpec = {
    "id": d => d.i,
    "cx": d => timeScaleF(d.time),
    "cy": d => touchConfidence_to_y(d.p) + "%",
    "r": 4,
    "fill": "cyan",
    "opacity": 0.8,
    "y": "60%",
    "title": "touch model",
    "cy_baseFunction": () => touchConfidence_to_y
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
      var touchConfidence = rawData.touch_confidence;

      t_open = rawData.t_open[0];
      t_close = rawData.t_close[0];
      tau_close = rawData.tau_close[0];
      delta_tau_s = tau_close - tau_open;


      // build all of our conversion functions using t_open, t_close
      timeScaleF = d3.scaleLinear()  // TODO refactor timeScaleF to xAtStart
      .domain([t_open, t_close])
      .range([0, width*gui_stretch]);

      t_to_p = d3.scaleLinear()
      .domain([t_open, t_close])
      .range([0,1]);

      tau_to_p = d3.scaleLinear()
      .domain([tau_open, tau_close])
      .range([0,1]);
      

      pressure_to_y = d3.scaleLinear()
        // extent of pressure data
        .domain(d3.extent(pressureData, d => d.one))
        .range([100,0]);

      gyroscope_to_y = d3.scaleLinear()
        .domain([-1, 1])
        .range([100,0]);
      
      touchConfidence_to_y = d3.scaleLinear()
        .domain([0,1])
        .range([100,0]);

      viewBoxXMin = d3.scaleLinear()
        .domain([tau_open, tau_close])
        .range([0, width*gui_stretch]);

      canvasX = d3.scaleLinear()
        .domain([tau_open, tau_close])
        .range([0,-1*width*gui_stretch]);

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
      precompute(touchConfidence);

      setupVis(touchData, pressureData, gyroscopeData, touchConfidence);

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
  
  var setupVis = function (touchData, pressureData, gyroscopeData, touchConfidence) {
    // count openvis title
    
    // SECTION 0: video
    video.loop = false;
    video.volume = 0;
    video.controls = true;
    video.style = "visibility: hidden;";
    // video.parentElement.append('rect');  // TODO cover the video with white
    
    // setup the video listeners
    
    
    video.addEventListener('seeking', seekToState);
    video.addEventListener('playing', startAnimation);
    video.addEventListener('pause', function() {
      if (video.currentTime == video.duration) {
        video.currentTime = 0;
        setTimeout(function() {video.play()}, 500);
      } else {
        stopAnimation();
      }
    });

    video.play();
    //setup

    // SECTION 0.5: gradient
    svg.append('defs')
      .html('\
      <linearGradient id="Gradient0" x1="0" x2="1" y1="0" y2="0">\
        <stop offset="0%" stop-color="white" stop-opacity="1" />\
        <stop offset="90%" stop-color="white" stop-opacity="1" />\
        <stop offset="100%" stop-color="white" stop-opacity="0" />\
      </linearGradient>\
      <pattern id="diglett" height="1" width="1" patternContentUnits="objectBoundingBox" background-color:"red">\
        <rect height="1" width="1" fill="red" opacity="0.6"></rect>\
        <image x="0.15" y="0.15" height="0.7" width="0.7" xlink:href="https://user-images.githubusercontent.com/11370378/221710561-2943c652-35a2-4841-8a0b-6bd8f5c215bc.png" preserveAspectRatio="none"></image>\
      </pattern>\
      <linearGradient id="heightGradient" gradientTransform="rotate(90)">\
        <stop offset=5">\
      </linearGradient>')

    svg.append('rect')
      .attr('id', 'cover')
      .attr('x', "0%")
      .attr('y', margin.top)
      .attr('width', "100%")
      .attr('height', 700)
      .attr('fill', 'url(#Gradient0)');

    // SECTION 1: INNER FUNCTION
    
    /**
     * Creates the basic structure for a graph.
     * <svg id="containerName">
     *   <g class="axes" />
     *   <svg class="dataViewPort"> outer bounding box, fixed height/width
     *     <g class="canvas">  hosts the x-transformation, inherits height
     *       VIZ GOES HERE
     *     </g>
     *   </svg>
     *   <g class="plotLabels" />
     * </svg>
     * @param {Object} time_series 
     * @param {Object} spec 
     * @param {string} containerName 
     * @param {string} transform 
     * @returns dataContainer
     */
    let plot_time_series = function(time_series, spec, 
      containerName) {
        let container = g.append("svg")
          .attr("id", containerName)
          .attr("class", "timeSeriesContainer")
          .attr("y", spec["y"])
          .attr("height", ts_group_height)
          .attr("opacity", 0);

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
          .attr("y1", percent_upper_bound) 
          .attr("x2", width)
          .attr("y2", percent_lower_bound)
          .attr("style", "stroke:rgb(220,220,220);stroke-width:2");
        
        // creates a bounding box to see our elements
        let viewport = container.append("svg")
          .attr("class", "dataViewPort")
          .attr("y", percent_upper_bound)
          .attr("height", ts_plot_height)
          .attr("width", width);

        viewport.append("g")
          .attr("class", "canvasShifter")  // for static (un-animated) translation
          .attr("transform", "translate(" + width + " 0)")
          //.attr("x", "200")
          .attr("overflow", "visible")
          .append("g")
          .attr("class", "canvas");  // do visualization in here, then animate translation
          
        let labels = container.append("g")
          .attr("class", "plotLabels");
        

        var returnObj = {
          "container": container,
          "data": time_series,
          "spec": spec
        }

        return returnObj;
    }

    
    touch = plot_time_series(touchData, touchSpec, "touchContainer");
    pressure = plot_time_series(pressureData, pressureSpec, "pressureContainer");
    gyroscopeOne = plot_time_series(gyroscopeData, gyroscopeOneSpec, "gyroscopeOneContainer");
    gyroscopeTwo = plot_time_series(gyroscopeData, gyroscopeTwoSpec, "gyroscopeTwoContainer");
    gyroscopeThree = plot_time_series(gyroscopeData, gyroscopeThreeSpec, "gyroscopeThreeContainer");
    touchBar = plot_time_series(touchData, touchSpec, "touchBarContainer");
    touchConfidence = plot_time_series(touchConfidence, touchConfidenceSpec, "touchConfidenceContainer");

    // create touchBars
    touchBar.container
      .attr("y", "0")
      .attr("height", "100%")
      .select(".dataViewPort")
      .attr("height", "100%");
    touchBar.container.select(".axes").remove();
    touchBar.container.select(".canvasShifter").select(".canvas")
      .append("g")
      .attr("class", "lineContainer")
      .attr("opacity", 0.3)
      .attr("stroke", "red")
      .attr("stroke-width", "2")
      .selectAll("line")
      .data(touchBar.data)
      .enter()
      .append("line")
      .attr("x1", touchSpec["cx"])
      .attr("y1", "0%")
      .attr("x2", touchSpec["cx"])
      .attr("y2", "100%");

    containers = document.querySelectorAll(".timeSeriesContainer");
    canvasses = document.querySelectorAll(".canvas");
    console.log(touch.container);
    console.log(containers[0]);
    
    
    // plot circles
    for (obj of [touch, pressure, gyroscopeOne, gyroscopeTwo, gyroscopeThree, touchConfidence]) {
      // plot circles according to spec
      obj.container.select(".dataViewPort")
        .select(".canvasShifter")
        .select(".canvas")
        .append("g")
        .attr("class", "circleContainer")
        .attr("opacity", obj.spec["opacity"])
        .selectAll("circle")
        .data(obj.data)
        .enter()
        .append('circle')
        .attr("id", obj.spec["id"])
        .attr("cx", obj.spec["cx"])
        .attr("cy", obj.spec["cy"])
        .attr("r", obj.spec["r"])
        .attr("fill", obj.spec["fill"]);
      
      // add plot title
      obj.container.select(".plotLabels")
        .append("text")
        .attr("class", "plotLabel plotTitle")
        .attr("x", width)
        .attr("y", "50%")
        .attr("fill", obj.spec.fill)
        .text(obj.spec.title)
    }

    // plot lines
    /* TODO cd .. plot touchConfidence as a line
    for (obj of [touchConfidence]) {
      let line = d3.line()
        .x(obj.spec["cx"])
        .y(d => obj.spec.cy_baseFunction())

      obj.container.select(".dataViewPort")
        .select(".canvasShifter")
        .select(".canvas")
        .append("g")
        .attr("class", "lineContainer")
        .attr("opacity", obj.spec["opacity"])
        .
    }
    */

    // fix color of touch title
    touch.container.select(".plotLabels").select(".plotTitle").attr("fill","red");
    
    
    
    
    // add y-axis limits
    for (obj of [pressure, gyroscopeOne, gyroscopeTwo, gyroscopeThree, touchConfidence]) {
      labels = obj.container.select(".plotLabels");
      labels.append("text")
        .attr("class", "plotLabel bound")
        .attr("x", width)
        .attr("y", percent_upper_bound)
        .attr("fill", "#999")
        .text(obj.spec["cy_baseFunction"]().domain()[1]);
      labels.append("text")
        .attr("class", "plotLabel bound")
        .attr("x", width)
        .attr("y", percent_lower_bound)
        .attr("fill", "#999")
        .text(obj.spec["cy_baseFunction"]().domain()[0]);
    }
    
    // add vertical lines to pressure
    pressure.container
      .select(".dataViewPort")
      .select(".canvasShifter")
      .select(".canvas")
      .append("g")
      .attr("class", "vLineContainer")
      .attr("opacity", 0.3)
      .selectAll("line")
      .data(pressure.data)
      .enter()
      .append("line")
      .attr("id", pressure.spec["id"])
      .attr("x1", pressure.spec["cx"])
      .attr("y1", "100%")
      .attr("x2", pressure.spec["cx"])
      .attr("y2", pressure.spec["cy"])
      .attr("stroke", pressure.spec["fill"]);

    // move horizontal axis to bottom
    for (const obj of [pressure, touchConfidence]) {
      obj.container
        .select(".axes")
        .select(".horizontal-line")
        .attr("y1", (1+ts_plot_proportion)/2 * 100 + "%")
        .attr("y2", (1+ts_plot_proportion)/2 * 100 + "%");
    }

    // add vertical lines to gyroscope
    for (const obj of [gyroscopeOne, gyroscopeTwo, gyroscopeThree]) {
      obj.container
        .select(".dataViewPort")
        .select(".canvasShifter")
        .select(".canvas")        
        .append("g")
        .attr("class", "vLineContainer")
        .attr("opacity", 0.3)
        .selectAll("line")
        .data(obj.data)
        .enter()
        .append("line")
        .attr("id", obj.spec["id"])
        .attr("x1", obj.spec["cx"])
        .attr("y1", "50%")
        .attr("x2", obj.spec["cx"])
        .attr("y2", obj.spec["cy"])
        .attr("stroke", obj.spec["fill"]);
    }

    touchConfidence.container.attr("height", "36%");

    let todoContainer = svg.append("g")
      .attr('id', 'todoContainer')
      .attr('opacity', 0);

    todoContainer.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'white')
      .attr('opacity', '0.62');

    todoContainer.append('text')
      .attr('class', 'title openvis-title')
      .attr('x', width / 2)
      .attr('y', height / 3)
      .text('// TODO');

    todoContainer.append('text')
      .attr('class', 'sub-title openvis-title')
      .attr('x', width / 2)
      .attr('y', (height / 3) + (height / 5))
      .text('Everything below this is');

      todoContainer.append('text')
      .attr('class', 'sub-title openvis-title')
      .attr('x', width / 2)
      .attr('y', (height * 2/3) - (height / 30))
      .text('a work in progress.');
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
    activateFunctions[4] = focusPressure;
    activateFunctions[5] = showTouchConfidence;
    activateFunctions[6] = showToDo;
    

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

    d3.select("#keep-scrolling")
      .transition()
      .style("opacity", 1)
      .duration(400);
    
    video.style = "visibility: hidden;";

    
    svg.select("#cover")
      .transition()
      .attr("x", "0%")
      .delay(transition_duration);
  }

  /**
   * hides: pressure graph
   * shows: touch and video
   */
  function showTouchAndVideo() {
  d3.select("#keep-scrolling")
      .transition()
      .style("opacity", 0)
      .duration(400);

    // TODO video should fade in using a canvas like https://jsfiddle.net/7sk5k4gp/13/ 
    video.style = "";
    //video.controls = "true";

    svg.select("#cover")
      .transition()
      .attr("x", "-80%")
      .duration(3500);

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
    /*g.selectAll("#gyroscopeOneContainer, #gyroscopeTwoContainer, #gyroscopeThreeContainer")
      .transition()
      .attr("opacity", 1)
      .duration(transition_duration);*/
    
    g.select("#touchBarContainer")
      .transition()
      .attr("opacity", "0")
      .duration(transition_duration);

    g.select("#pressureContainer")
      .transition()
      .attr("height", "18%")
      .attr("opacity", "1")
      .duration(transition_duration);
    
    g.select("#gyroscopeOneContainer")
      .transition()
      .attr("y", "40%")
      .attr("height","18%")
      .attr("opacity", "1")
      .duration(transition_duration);

    g.select("#gyroscopeTwoContainer")
      .transition()
      .attr("y", "60%")
      .attr("height","18%")
      .attr("opacity", "1")
      .duration(transition_duration);

    g.select("#gyroscopeThreeContainer")
      .transition()
      .attr("y", "80%")
      .attr("height","18%")
      .attr("opacity","1")
      .duration(transition_duration);

    pressure.container
      .select(".dataViewPort")
      .select(".canvasShifter")
      .select(".canvas")
      .select(".circleContainer")
      .attr("opacity", pressure.spec["opacity"])
      .selectAll("circle")
      .transition()
      .attr("fill", pressure.spec["fill"])
      .attr("r", pressure.spec["r"])
      .delay(transition_duration/2);
  }

  /**
   * moves: pressure and gyroscope
   * hides: touchConfidence
   */
  function focusPressure() {
    /*
    g.select("#touchBarContainer")
      .transition()
      .attr("opacity", "1")
      .duration(transition_duration);
      */
    touchBar.container
      .transition()
      .attr("opacity", "1")
      .duration(transition_duration);

    
    pressure.container
      .transition()
      .attr("height", "38%")
      .duration(transition_duration);
    
    gyroscopeOne.container
      .transition()
      .attr("y", "60%")
      .attr("height", "11%")
      .duration(transition_duration);

    gyroscopeTwo.container
      .transition()
      .attr("y", "73%")
      .attr("height", "11%")
      .duration(transition_duration);
  
    gyroscopeThree.container
      .transition()
      .attr("y", "86%")
      .attr("height", "11%")
      .duration(transition_duration);

    pressure.container
      .select(".dataViewPort")
      .select(".canvasShifter")
      .select(".canvas")
      .select(".circleContainer")
      .selectAll("*")
      .transition()
      .attr("r", 4)
      .duration(transition_duration);

    
    pressure.container
      .select(".dataViewPort")
      .select(".canvasShifter")
      .select(".canvas")
      .select(".circleContainer")
      .attr("opacity", 1)
      .selectAll("circle")
      .attr("fill", d => d3.interpolatePlasma((pressure_to_y(d.one))/100));
    
    g.select("#touchConfidenceContainer")
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
  }

  /**
   * hides: gyroscope
   * shows: touch confidence
   */
  function showTouchConfidence() {
    g.selectAll("#gyroscopeOneContainer, #gyroscopeTwoContainer, #gyroscopeThreeContainer")
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
    
    g.select("#touchConfidenceContainer")
      .transition()
      .attr("opacity", 1)
      .duration(transition_duration);
    
    hideToDo();
  }


  function hideToDo() {
    svg.select("#todoContainer")
      .transition()
      .attr("opacity", 0)
      .duration(transition_duration);
  }

  function showToDo() {
    console.log("showToDo()");
    svg.select("#todoContainer")
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
    

    
    var canvasses = document.querySelectorAll(".canvas");
    gsap.killTweensOf(canvasses);
    gsap.to(canvasses, {
      duration: 0.25,
      x: canvasX(tauCurr), 
      ease: "none"
    });
  }
  
  function startAnimation() {
    // first bring the points to the x corresponding to tau_from
    // seekToState();

    console.log("startAnimation() ");
    var tau_from = video.currentTime;
    var tau_curr = video.currentTime; 
    var tau_to = tau_close;
    var p_close = p_tau(tau_close);

    /*
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
    */
    gsap.killTweensOf(canvasses);
    gsap.fromTo(canvasses, {
      x: canvasX(tau_curr), 
    }, 
    {
      x: canvasX(tau_to),
      duration: tau_to - tau_curr, 
      ease: "none"
    });
  }

  
  function stopAnimation() {
    // TODO can I just use a global reference to these variables?
    // after all, i assume d3 selections are simply pointers, 
    // and so a single *static* selection statement has *dynamic* value through the program runtime.
    

    var canvasses = document.querySelectorAll(".canvas");
    gsap.killTweensOf(canvasses);
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
      .transition()
      .style('opacity', function (d, i) { return i <= index ? 1 : 0.1; })
      .duration(200);

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
