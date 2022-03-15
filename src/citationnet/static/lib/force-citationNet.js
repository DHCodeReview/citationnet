/** 
* Async function for fetching and parsing JSON files 
* @param {String} path - path or url to JSON file
* @return {object} parsed JSON object
*/
async function fetchJSON(path) {
    try {
        var res = await fetch(path);
        // waits until the request completes...
        var data = await res.json()
    } catch (error) {
        console.log(path)
        throw error
    }


    return data;
}

class CitationNet {

    /** 
    * Constructs a new CitationNet object, but does not initialize it. Call object.initialize() right after this.
    * @param {String} jsonPath - path or url to citation data as JSON file/stream
    */
    constructor(jsonPath = null) {
        // if jsonPath is not provided try to get globJsonPath, show alert if fails
        try {
            if (!(jsonPath)) jsonPath = globJsonPath;
        } catch (error) {
            alert("no path or URL to JSON containing citation data specified, graph cannot be displayed")
        }

        this.jsonPath = jsonPath;
        this.is_initialized = false;
    }

    /** 
    * Fetches and processes data, initializes graph and sets view. Constructors cannot be async in JS, which is needed for fetching and saving data.
    */
    async initialize() {
        // fetch data (async)
        this.data = await fetchJSON(this.jsonPath);
        this.processData();
        this.graph = CitationNet.makeGraph(this.data);

        // variables for control toggle-functions
        this.nodeSize = false;
        this.edgesOnlyInput = false;
        this.distanceFromInputNode = true;

        this.adaptWindowSize();
        this.view('top');

        this.is_initialized = true;
    }

    /** 
    * Reads current window size, adapts canvas size and camera projection settings  to it.
    */
    adaptWindowSize() {
        this.graph.height(window.innerHeight - document.getElementsByClassName("navbar")[0].scrollHeight);
        this.graph.width(window.innerWidth);

        this.graph.camera().left = this.graph.width() / -2;
        this.graph.camera().right = this.graph.width() / 2;
        this.graph.camera().top = this.graph.height() / 2;
        this.graph.camera().bottom = this.graph.height() / -2;
        this.graph.camera().updateProjectionMatrix();
    }

    /** 
    * Static method to instantiate and configure graph
    * @param {object} data - preprocessed citation data
    * @return {function} Brief description of the returning value here.
    */
    static makeGraph(data) {
        // sort nodes descending by data.nodes.attributes['ref-by-count'], get first items 'ref-by-count'-attribute
        const maxCites = data.nodes.sort((a, b) => (a.attributes['ref-by-count'] > b.attributes['ref-by-count']) ? -1
            : (a.attributes['ref-by-count'] < b.attributes['ref-by-count']) ? 1
                : 0)[0].attributes['ref-by-count'];

        // make Graph object
        var graph = ForceGraph3D({ "controlType": 'trackball' })
            (document.getElementById('3d-graph'))
            .graphData({ nodes: data.nodes, links: data.edges })
            .nodeId('id')
            .nodeLabel(node => {
                var doi = (typeof node.attributes.doi !== 'undefined') ? node.attributes.doi : node.id
                var category_for = (typeof node.attributes.category_for !== 'undefined') ? ", FOR: " + node.attributes.category_for : ""
                return `${doi} @ ${node.attributes.nodeyear}\n cited ${node.attributes['ref-by-count']} times${category_for}`
            }
            )
            .nodeRelSize(0.5)
            .nodeAutoColorBy(node => node.attributes.category_for)
            .nodeVal(1.0) // uniform size, is changed using this.toggleNodeSize()
            .d3Force('center', null) // disable center force
            .d3Force('charge', null) // disable charge force
            .d3Force('radialInner', d3.forceRadial(0).strength(0.1)) // weak force pulling the nodes towards the middle axis of the cylinder 

            // force pulling the nodes towards the outer radius of the cylinder, strength is dynamic (, look at strengthFuncFactory for details)
            .d3Force('radialOuter', d3.forceRadial(100).strength(CitationNet.strengthFuncFactory(0.0, 1.0, 0, 200)))

            .enableNodeDrag(false)
            .onNodeClick(node => {
                var doi = (typeof node.attributes.doi !== 'undefined') ? node.attributes.doi : node.id
                window.open(`https://doi.org/${doi}`)
            }) // open using doi when node is clicked
            ;

        // somehow this needs to be done after graph instantiated or else it breaks layouting
        graph.d3Force('link', graph.d3Force('link').strength(0.0)) // show edges, but set strength to 0.0 -> no charge/spring forces
        return graph;
    }

    /** 
    * Function factory for dynamic strength functions using linear interpolation. If input is outside the interval minStrength or maxStrength is used. 
    * @param {number} minStrength - minimum strength, default = 0.0
    * @param {number} maxStrength - maximum strength, default = 1.0
    * @param {number} min - lower interval boundary, default = 0.0
    * @param {number} min - upper interval boundary, default = 100.0
    * @param {number} exp - exponent (used for adjusting spacing between nodes), default = 1.0
    * @return {function} Interpolation function
    */
    static strengthFuncFactory(minStrength = 0.0, maxStrength, min = 0, max = 100, exp = 1.0) {

        let strengthFunc = function (node, i, nodes) {
            let x = node.attributes['ref-by-count'];
            // linear interpolation
            let out = minStrength + (x - min) * (maxStrength - minStrength) / (max - min);

            // return minStrength if out smaller than minStrength
            // return maxStrength if out larger than maxStrength
            // return out ** 
            return out <= minStrength ? minStrength
                : out >= maxStrength ? maxStrength
                    : out ** exp;
        }
        return strengthFunc;
    }

    /** 
    * Preprocess this.data
    */
    processData() {
        var data = this.data;
        var id_map = {};

        // find input node
        this.inputNode = data.nodes.filter(o => o.attributes.is_input_DOI == "True")[0];
        var inputNode = this.inputNode;

        for (let i = 0; i < data.nodes.length; i++) {
            id_map[data.nodes[i].id] = i;
            data.nodes[i].outgoingLinks = [];
            data.nodes[i].outgoingLinkTo = [];
            data.nodes[i].incomingLinks = [];
            data.nodes[i].incomingLinkFrom = [];

            // delete unused attributes
            delete data.nodes[i].color;
            delete data.nodes[i].size;
            delete data.nodes[i].x;
            delete data.nodes[i].y;

            // fix z-coordinate of nodes depending on publication year
            // 20 units between input node and years before/after
            // 5 units spacing between years
            if (data.nodes[i].attributes.nodeyear >= inputNode.attributes.nodeyear) {
                data.nodes[i].fz = 5 * (data.nodes[i].attributes.nodeyear - inputNode.attributes.nodeyear + 20);
            } else {
                data.nodes[i].fz = 5 * (data.nodes[i].attributes.nodeyear - inputNode.attributes.nodeyear - 20);
            }
        }

        // fix position of input node, color red
        inputNode.fx = 0.0;
        inputNode.fy = 0.0;
        inputNode.fz = 0.0;
        inputNode.color = 'red';

        // cross-link node objects
        data.edges.forEach(edge => {
            var a = data.nodes[id_map[edge.source]];
            var b = data.nodes[id_map[edge.target]];

            !a.outgoingLinks && (a.outgoingLinks = []);
            a.outgoingLinks.push(edge);

            !a.outgoingLinkTo && (a.outgoingLinkTo = [])
            a.outgoingLinkTo.push(b);

            !b.incomingLinks && (b.incomingLinks = []);
            b.incomingLinks.push(edge);

            !b.incomingLinkFrom && (b.incomingLinkFrom = []);
            b.incomingLinkFrom.push(a);

            delete edge.color;
            delete edge.size;
        });
    }

    /** 
    * Move camera to default view point. Triggered by UI.
    * @param {String} viewPoint - either "top" or "side"
    * @return {ReturnValueDataTypeHere} Brief description of the returning value here.
    */
    view(viewPoint) {
        if (viewPoint == 'top') {
            // indicate view point using bold font
            document.getElementById("btnTopView").style.fontWeight = "bold";
            document.getElementById("btnSideView").style.fontWeight = "normal";
            // set camera position, zoom and viewing direction (up-vector)
            this.graph.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 500);
            this.graph.camera().up.set(0.0, 1.0, 0.0);
            this.graph.camera().zoom = 2.0;
            this.graph.camera().updateProjectionMatrix();
        } else if (viewPoint == 'side') {
            // indicate view point using bold font
            document.getElementById("btnSideView").style.fontWeight = "bold";
            document.getElementById("btnTopView").style.fontWeight = "normal";
            // set camera position, zoom and viewing direction (up-vector)
            this.graph.cameraPosition({ x: 0, y: -500, z: 0 }, { x: 0, y: 0, z: 0 }, 500);
            this.graph.camera().up.set(0.0, 0.0, 1.0);
            this.graph.camera().zoom = 1.0;
            this.graph.camera().updateProjectionMatrix();
        }
    }

    /** 
    * Toggle on/off relative node size by number of citations. Triggered by UI.
    */
    toggleNodeSize() {
        if (this.nodeSize) {
            // indicate state using bold font
            document.getElementById("btnNodeSize").style.fontWeight = "normal";
            // set constant nodeVal
            this.graph.nodeVal(1.0);
            this.nodeSize = false;
        } else {
            // indicate state using bold font
            document.getElementById("btnNodeSize").style.fontWeight = "bolder";
            // set ref-by-count attribute as nodeVal
            this.graph.nodeVal(node => node.attributes['ref-by-count']);
            this.nodeSize = true;
        }
    }

    /** 
    * Read relative node size from range slider and apply to graph. Triggered by UI.
    */
    readNodeSize() {
        var size = document.getElementById("rngNodeSize").value;
        this.graph.nodeRelSize(size);
    }


    /** 
    * Read layout options from range sliders and apply to graph. Triggered by UI.
    */
    readLayout() {
        var radius = document.getElementById("rngLayoutRadius").value;
        var outerValue = document.getElementById("rngLayoutOuterValue").value;

        // set constant strength if  outerValue == 0 (-> all nodes are moved towards outer shell)
        if (outerValue == 0) {
            this.graph.d3Force('radialOuter', d3.forceRadial(radius).strength(1.0));
        } else {
            this.graph.d3Force('radialOuter', d3.forceRadial(radius).strength(CitationNet.strengthFuncFactory(0.0, 1.0, 0, outerValue)));
        }

        this.graph.d3ReheatSimulation();
    }

    /** 
    * Toggle on/off viewing only edges that connect to input node directly. Triggered by UI.
    */
    toggleEdgesOnlyInput() {
        if (this.edgesOnlyInput) {
            this.graph.graphData({ nodes: this.data.nodes, links: this.data.edges });
            document.getElementById("btnEdgesOnlyInput").style.fontWeight = "normal";
            this.edgesOnlyInput = false;
        } else {
            // get all edges, filter edges that directly attach to input node
            var edges = this.data.edges;
            var filteredEdges = edges.filter(edge => edge.source.id == this.inputNode.id || edge.target.id == this.inputNode.id);
            // display all nodes but only filtered edges
            this.graph.graphData({ nodes: this.data.nodes, links: filteredEdges });
            document.getElementById("btnEdgesOnlyInput").style.fontWeight = "bold";
            this.edgesOnlyInput = true;
        }
    }

    toggleDistanceFromInputNode() {
        let nodes = this.graph.graphData()['nodes'];
        if (this.distanceFromInputNode) {
            nodes.forEach((node) => {
                if (node.attributes.nodeyear >= this.inputNode.attributes.nodeyear) {
                    node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear);
                } else {
                    node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear);
                }
            });
            this.inputNode.fz = 0;
            document.getElementById("btnDistanceFromInputNode").style.fontWeight = "normal";
            this.distanceFromInputNode = false;
        } else {
            nodes.forEach((node) => {
                if (node.attributes.nodeyear >= this.inputNode.attributes.nodeyear) {
                    node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear + 20);
                } else {
                    node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear - 20);
                }
            });
            this.inputNode.fz = 0;
            document.getElementById("btnDistanceFromInputNode").style.fontWeight = "bold";
            this.distanceFromInputNode = true;
        }
    }
}