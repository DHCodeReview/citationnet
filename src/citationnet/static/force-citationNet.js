// import * as THREE from './three.module.js';
import * as Lut from './lut.js';

/**
* Async function for fetching and parsing JSON files
* @param {String} path - path or url to JSON file
* @returns {object} parsed JSON object
*/
async function fetchJSON(data) {
    console.log('parsed', data)

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
        this.edgesOnlyInput = false;
        this.distanceFromInputNode = true;

        this.adaptWindowSize();
        this.view('top');
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
            .nodeAutoColorBy(node => node.attributes.category_for)
            .nodeOpacity(1.0)
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
        var cumulative = 0.0;

        fieldOfResearchDivisions.forEach(division => {
            var x = nodes.filter(node => node.attributes.category_for == division).length / nodes.length;
            this.stats.push({ 'category': division, 'value': x, 'start': cumulative, 'end': cumulative + x, 'amount': nodes.filter(node => node.attributes.category_for == division).length });
            cumulative += x
        });

        console.log(this.stats.filter(stat => stat.category == ""));
        console.log(this.stats.filter(stat => stat.category == "")[0]);
        this.stats.filter(stat => stat.category == "")[0].category = "none";

        return this.stats
    }

    /**
     * Create pie chart using THREE.js cylinder slices and 2D text labels
     * @returns {object} object containing lists of all cylinder slices (THREE.Mesh) and corresponding text labels
     */
    makeCylinder() {
        const stats = this.stats.filter(category_for => category_for.value);
        this.pie = { "slices": [], "labels": [] }
        const radius = document.getElementById("rngLayoutRadius").value;

        const lut = new Lut.Lut('rainbow', 512);

        stats.forEach(category_for => {
            var thetastart = category_for.start * 2 * Math.PI;
            var theta = category_for.value * 2 * Math.PI;
            var color = lut.getColor(category_for.start);

            var geometry = new THREE.CylinderGeometry(radius, radius, 1, 128, 1, false, thetastart, theta);
            var material = new THREE.MeshBasicMaterial({ color: color });
            var cylinder = new THREE.Mesh(geometry, material);

            cylinder.rotateX(Math.PI * 0.5);
            this.graph.scene().add(cylinder);
            this.pie.slices.push(cylinder);

            category_for.category = (category_for.category == "") ? "no FOR matched" : category_for.category

            if (category_for.value >= 0.02) {
                var text = _createTextLabel();
                text.setHTML("<p>" + category_for.category + "</p>");
                text.setParent(cylinder);
                this.pie.labels.push(text);
                this.container.appendChild(text.element);

                text.element.className = 'Absolute-Center'

                let phi = thetastart + theta / 2
                text.phi = phi
                var f = 0.5
                text.position = new THREE.Vector3(f * radius * Math.sin(phi), -f * radius * Math.cos(phi), 0.0)
                console.log(text.position)
            }
        });

        return this.pie
    }

    /**
     * Trigger `render2D()` for all existing text labels.
     * @returns {object} callable object
     */
    renderLabels() {
        return { call: () => this.pie.labels.forEach(label => label.render2D()) }
    }
}

/**
 * Create a custom object for a text label containing a `div` element.
 * Position is calculated using `render2D` method, which is called by a listener for graph controls.
 * @returns {object} custom object containing
*/
function _createTextLabel() {
    var div = document.createElement('div');
    div.className = 'text-label';
    div.style.position = 'absolute';
    div.style.width = 100;
    div.style.height = 100;
    div.innerHTML = "hi there!";
    div.style.top = -1000;
    div.style.left = -1000;

    return {
        element: div,
        parent: false,
        position: new THREE.Vector3(0, 0, 0),
        setHTML: function (html) {
            this.element.innerHTML = html;
        },
        setParent: function (threejsobj) {
            this.parent = threejsobj;
        },
        render2D: function () {
            // if (this.parent) {
            //     if (this.parent.geometry.boundingSphere !== null) {
            //         this.position.copy(this.parent.geometry.boundingSphere.center);
            //     }
            // }
            window.net.graph.camera().updateMatrixWorld();
            var coords2d = this.get2DCoords(this.position, window.net.graph.camera());
            this.element.style.left = coords2d.x + 'px';
            this.element.style.top = coords2d.y + 'px';
        },
        get2DCoords: function (position, camera) {
            var vector = new THREE.Vector3();
            vector.copy(position);
            vector.project(camera);
            vector.x = (vector.x + 1) / 2 * window.innerWidth;
            vector.y = -(vector.y - 1) / 2 * window.innerHeight;
            return vector;
        }
    }
}
var fieldOfResearchDivisions = [
    "00",
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
]

export { CitationNet };
