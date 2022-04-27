import * as THREE from './three.module.js';
import * as Lut from './lut.js';

/**
* Async function for fetching and parsing JSON files
* @param {String} path - path or url to JSON file
* @returns {object} parsed JSON object
*/
async function fetchJSON(data) {
    // console.log('parsed', data)

    try {
        // waits until the request completes...
        var data = await JSON.parse(data)
    } catch (error) {
        console.log(data)
        throw error
    }
    return data;
}


class CitationNet {

    /**
    * Constructs a new CitationNet object, but does not initialize it. Call object.initialize() right after this.
    * @param {String} jsondata - path or url to citation data as JSON file/stream
    */
    constructor(jsondata = null) {
        // if jsonPath is not provided try to get globJsonPath, show alert if fails
        try {
            if (!(jsondata)) jsondata = jsondata;
        } catch (error) {
            alert("no JSON containing citation data specified, graph cannot be displayed")
        }

        this.jsondata = jsondata;
        this.is_initialized = false;
    }

    /**
    * Fetches and processes data, initializes graph and sets view. Constructors cannot be async in JS, which is needed for fetching and saving data.
    */
    async initialize(make_cylinder = false) {
        this.container = document.getElementById('3d-graph');
        // fetch data (async)
        // this.data = await fetchJSON(this.jsonPath);
        // this.processData();
        await this.getStats();
        this.makeGraph(this.data);

        // variables for control toggle-functions
        this.nodeSize = false;
        this.edgesOnlyInput = true;
        this.distanceFromInputNode = false;

        this.adaptWindowSize();
        this.view('side');
        this.toggleNodeSize();

        if (make_cylinder) {
            this.makeCylinder();
            this.graph.controls()._listeners.change.push(this.renderLabels())
        }

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
    * Instantiate and configure graph object
    * @returns {function} Brief description of the returning value here.
    */
    makeGraph() {
        // sort nodes descending by data.nodes.attributes['ref-by-count'], get first items 'ref-by-count'-attribute
        const maxCites = this.data.nodes.sort((a, b) => (a.attributes['ref-by-count'] > b.attributes['ref-by-count']) ? -1
            : (a.attributes['ref-by-count'] < b.attributes['ref-by-count']) ? 1
                : 0)[0].attributes['ref-by-count'];

        // make Graph object
        this.graph = ForceGraph3D({
            "controlType": 'trackball',
            // turn off antaliasing and alpha for improved performance
            "rendererConfig": { antialias: false, alpha: false }
        })(this.container)
            .graphData({ nodes: this.data.nodes, links: this.data.edges })
            .nodeId('id')
            .nodeLabel(node => {
                var doi = (typeof node.attributes.doi !== 'undefined') ? node.attributes.doi : node.id
                var category_for = (typeof node.attributes.category_for !== 'undefined') ? ", FOR: " + node.attributes.category_for : ""
                return `${doi} @ ${node.attributes.nodeyear}\n <br> cited ${node.attributes['ref-by-count']} times${category_for}`
            }
            )
            .nodeRelSize(0.5)
            .nodeColor(node => fieldOfResearchDivisions[node.attributes.category_for.split(';').map(fors => fors.split(':')).sort((a,b)=>a[1] < b[1])[0][0]][1])
            .nodeOpacity(0.8)
            .nodeVal(node => node.attributes['ref-by-count']) // size based on citation count, changed using this.toggleNodeSize()
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
        this.graph.d3Force('link', this.graph.d3Force('link').strength(0.0)) // show edges, but set strength to 0.0 -> no charge/spring forces

        // vertical positioning according to year of publication
        this.graph.graphData().nodes.forEach((node) => {
            if (node.attributes.nodeyear >= this.inputNode.attributes.nodeyear) {
                node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear);
            } else {
                node.fz = 5 * (node.attributes.nodeyear - this.inputNode.attributes.nodeyear);
            }
        });
        this.inputNode.fz = 0;
        document.getElementById("btnDistanceFromInputNode").style.fontWeight = "normal";
        this.distanceFromInputNode = false;

        return this.graph;
    }

    /**
    * Function factory for dynamic strength functions using linear interpolation. If input is outside the interval minStrength or maxStrength is used.
    * @param {number} minStrength - minimum strength, default = 0.0
    * @param {number} maxStrength - maximum strength, default = 1.0
    * @param {number} min - lower interval boundary, default = 0.0
    * @param {number} min - upper interval boundary, default = 100.0
    * @param {number} exp - exponent (used for adjusting spacing between nodes), default = 1.0
    * @returns {function} Interpolation function
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
        this.inputNode = data.nodes.filter(o => o.attributes.is_input_DOI == true)[0];
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
            if (typeof a != "undefined" && typeof b != "undefined") {
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
            }
        }
      );
    }

    /**
    * Move camera to default view point. Triggered by UI.
    * @param {String} viewPoint - either "top" or "side"
    * @returns {ReturnValueDataTypeHere} Brief description of the returning value here.
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
        console.log("reheating")
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
        let nodes = this.graph.graphData().nodes;
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
        console.log("reheating")
        this.graph.d3ReheatSimulation();
    }

    /**
     * Get field of research statistics
     * @returns {Array}
     */
    async getStats() {
        this.data = await fetchJSON(this.jsondata);
        this.processData();

        var nodes = this.data.nodes
        // var nodes = this.graph.graphData().nodes
        this.stats = []
        // var cumulative = 0.0;

        for (var division in fieldOfResearchDivisions){
            const reducer = (accumulator, curr) => accumulator + curr;
            var divnodesContain = nodes.filter(node => node.attributes.category_for.includes(division + ':'));
            // console.log(divnodesContain)
            var divnodesElements = divnodesContain.map(node => node.attributes.category_for.split(';')).flat(1);
            // console.log(divnodesElements)
            var divnodes = divnodesElements.filter(forcode => forcode.includes(division));
            // console.log(divnodes)
            var divnumVals = divnodes.map(elem => elem.split(':')[1]);
            // console.log(divnumVals)
            // const myArray = text.split(";").filter(forcode => forcode.includes('03')).map(forcode => forcode.split(':')[1]).map(val => parseFloat(val)).reduce(reducer, 0);
            var x = divnumVals.map(val => parseFloat(val)).reduce(reducer, 0)/nodes.length;
            // console.log(division, x)
            this.stats.push({ 'category': fieldOfResearchDivisions[division][0], 'color': fieldOfResearchDivisions[division][1], 'value': x, 'amount': divnodesContain.length });
            // cumulative += x
        };

        return this.stats
    }
}



const lutFOR = new Lut.Lut('rainbow', 22);
lutFOR.setMax(22);
const lutGray = new Lut.Lut('grayscale', 10);

var fieldOfResearchDivisions = {
     '01': ['01 Mathematical Sciences', lutFOR.getColor(22).getHexString()],
     '02': ['02 Physical Sciences', lutFOR.getColor(21).getHexString()],
     '03': ['03 Chemical Sciences', lutFOR.getColor(3).getHexString()],
     '04': ['04 Earth Sciences', lutFOR.getColor(4).getHexString()],
     '05': ['05 Environmental Sciences', lutFOR.getColor(5).getHexString()],
     '06': ['06 Biological Sciences', lutFOR.getColor(6).getHexString()],
     '07': ['07 Agricultural and Veterinary Sciences', lutFOR.getColor(7).getHexString()],
     '08': ['08 Information and Computing Sciences', lutFOR.getColor(8).getHexString()],
     '09': ['09 Engineering', lutFOR.getColor(9).getHexString()],
     '10': ['10 Technology', lutFOR.getColor(10).getHexString()],
     '12': ['12 Built Environment and Design', lutFOR.getColor(11).getHexString()],
     '11': ['11 Medical and Health Sciences', lutFOR.getColor(12).getHexString()],
     '13': ['13 Education', lutFOR.getColor(13).getHexString()],
     '14': ['14 Economics', lutFOR.getColor(14).getHexString()],
     '15': ['15 Commerce, Management, Tourism and Services', lutFOR.getColor(15).getHexString()],
     '16': ['16 Studies in Human Society', lutFOR.getColor(16).getHexString()],
     '17': ['17 Psychology and Cognitive Sciences', lutFOR.getColor(17).getHexString()],
     '18': ['18 Law and Legal Studies', lutFOR.getColor(18).getHexString()],
     '19': ['19 Studies in Creative Arts and Writing', lutFOR.getColor(19).getHexString()],
     '20': ['20 Language, Communication and Culture', lutFOR.getColor(20).getHexString()],
     '21': ['21 History and Archaeology', lutFOR.getColor(2).getHexString()],
     '22': ['22 Philosophy and Religious Studies', lutFOR.getColor(1).getHexString()],
     '00': ['00 No FOR code', lutGray.getColor(0.5).getHexString()],
};

export { CitationNet };
