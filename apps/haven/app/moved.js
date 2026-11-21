// The prototype that used to live here kept an account seed in this origin's localStorage.
// Nothing reads it any more; do not leave it lying around on an origin shared with other pages.
try { localStorage.removeItem("haven.seed"); } catch (_) {}

// Send people on only once the client is really there. It is published with a Haven release, and
// a redirect to a page that does not exist yet is a dead end.
const target = "https://haven.wemiller.com/app/";
fetch(target + "index.html", { cache: "no-store" })
  .then((r) => (r.ok ? r.text() : ""))
  .then((html) => {
    if (html.includes('name="haven-host" content="site"')) location.replace(target + location.hash);
    else document.getElementById("soon").hidden = false;
  })
  .catch(() => { document.getElementById("soon").hidden = false; });
