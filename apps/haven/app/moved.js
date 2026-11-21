// The prototype that used to live here kept an account seed in this origin's localStorage.
// Nothing reads it any more; do not leave it lying around on an origin shared with other pages.
try { localStorage.removeItem("haven.seed"); } catch (_) {}
location.replace("https://haven.wemiller.com/app/" + location.hash);
