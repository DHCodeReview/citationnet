/* Set the width of the sidebar to 250px and the left margin of the page content to 250px */
function openNav() {
    document.getElementById("sidebar").style.width = "300px";
    document.getElementById("main").style.marginLeft = "300px";
    // document.getElementById("3d-graph").style.marginLeft = "250px";
    adaptWindowSize();
}
  
/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
function closeNav() {
    document.getElementById("sidebar").style.width = "0";
    document.getElementById("main").style.marginLeft = "0";
    // document.getElementById("3d-graph").style.marginLeft = "0";
    adaptWindowSize();
}

function toggleNav() {
    document.getElementById("sidebar").style.width == "300px" ? closeNav() : openNav();
}