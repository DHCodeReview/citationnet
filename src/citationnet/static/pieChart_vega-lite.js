const forChartDiv = document.getElementById("forChartDiv");
const forChartDivvis = document.getElementById("forChartDivvis");
const forChartDivloader = document.getElementById("forChartDivloader");

dragElement(forChartDiv);

function toggleFORChart() {
    if (forChartDiv.hidden) {
        showFOR();
    } else {
        hideFOR();
    }
}

async function showFOR() {
    document.getElementById("btnFORChart").style.fontWeight = "bolder";
    forChartDivvis.hidden = true
    forChartDivloader.hidden = false
    forChartDiv.hidden = false

    await loadFOR();

    forChartDivvis.hidden = false
    forChartDivloader.hidden = true
}

function hideFOR() {
    document.getElementById("btnFORChart").style.fontWeight = "normal";
    forChartDiv.hidden = true
}

async function loadFOR() {
    const stats = await window.net.getStats();
    const resp = await fetch("/static/vegaLiteSpec.json");
    const vegaLiteSpec = await resp.json();
    const domain = stats.map(value => value.category);
    const range = stats.map(value => "#".concat(value.color));

    vegaLiteSpec.data.values = stats;
    vegaLiteSpec.encoding.color.scale.domain = domain;
    vegaLiteSpec.encoding.color.scale.range = range;

    console.log(vegaLiteSpec)

    vegaEmbed('#forChartDivvis', vegaLiteSpec);
}

function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById(elmnt.id + "header")) {
        /* if present, the header is where you move the DIV from:*/
        document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
    } else {
        /* otherwise, move the DIV from anywhere inside the DIV:*/
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        // elmnt.style.right = "";
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        /* stop moving when mouse button is released:*/
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
