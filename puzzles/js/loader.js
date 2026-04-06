;(function(document, window, undefined) {
function parseQueryString() {
    var parts = location.search.replace(/^[?]/, "").split("&"),
        i     = 0,
        l     = parts.length,
        GET   = {};

    for (; i < l; i++) {
        if (!parts[i]) { continue; }
        part = parts[i].split("=");
        GET[decodeURIComponent(part[0])] = decodeURIComponent(part[1]);
    }

    return GET;
}
window.jigsaw = window.jigsaw || {};
jigsaw.GET = parseQueryString();
}(document, window));
