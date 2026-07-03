(function () {
  "use strict";

  // ROM picker: fetches a manifest of ROM/disk images from a URL and lets the
  // user pick one to mount + auto-start. Also supports deep links:
  //   ?romlist=<manifest url>   override the default manifest location
  //   ?rom=<name or file>       auto-load a specific entry without the picker
  //
  // Manifest format (JSON):
  //   { "roms": [ { "name": "River Raid", "file": "RiverRaid.atr" }, ... ] }
  // Each entry needs "name" plus either "file" (relative to the manifest URL)
  // or "url" (absolute). Optional: "description".

  const DEFAULT_MANIFEST_URL = "../roms/roms.json";

  let overlay = null;
  let listEl = null;
  let statusEl = null;
  let entries = [];
  let manifestUrl = null;
  let hooks = null;
  let busy = false;

  function getQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch {
      return null;
    }
  }

  function resolveEntryUrl(entry) {
    if (entry.url) return entry.url;
    if (entry.file) {
      try {
        return new URL(entry.file, new URL(manifestUrl, window.location.href)).href;
      } catch {
        return entry.file;
      }
    }
    return null;
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function show() {
    if (!overlay) return;
    overlay.hidden = false;
    setStatus(entries.length ? "" : "No games found in the ROM list.");
  }

  function hide() {
    if (!overlay) return;
    overlay.hidden = true;
  }

  function waitForAppReady(timeoutMs) {
    const app = hooks && hooks.app;
    if (!app || typeof app.isReady !== "function") return Promise.resolve();
    const deadline = Date.now() + (timeoutMs || 10000);
    return new Promise(function (resolve, reject) {
      (function poll() {
        let ready = false;
        try {
          ready = app.isReady() || (typeof app.isRunning === "function" && app.isRunning());
        } catch {
          ready = false;
        }
        if (ready) return resolve();
        if (Date.now() > deadline) {
          return reject(new Error("System ROMs not loaded yet. Load ATARIXL.ROM / ATARIBAS.ROM and retry."));
        }
        window.setTimeout(poll, 150);
      })();
    });
  }

  function loadEntry(entry) {
    if (busy) return Promise.resolve();
    busy = true;
    const url = resolveEntryUrl(entry);
    if (!url) {
      busy = false;
      setStatus("Entry has no file/url: " + (entry.name || "?"), true);
      return Promise.resolve();
    }
    setStatus("Loading " + (entry.name || url) + "…");
    return fetch(url, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status + " fetching " + url);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        return waitForAppReady(10000).then(function () {
          const name = entry.file || decodeURIComponent(url.split("/").pop()) || "disk.atr";
          return hooks.mountDiskAndAutoStart(buffer, name);
        });
      })
      .then(function () {
        setStatus("");
        hide();
        if (hooks && typeof hooks.onGameStarted === "function") hooks.onGameStarted(entry);
      })
      .catch(function (err) {
        console.error("ROM picker: load failed", err);
        setStatus("Failed to load: " + (err && err.message ? err.message : err), true);
      })
      .then(function () {
        busy = false;
      });
  }

  function renderList() {
    if (!listEl) return;
    listEl.textContent = "";
    entries.forEach(function (entry) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "romPickerItem";
      const title = document.createElement("span");
      title.className = "romPickerItemName";
      title.textContent = entry.name || entry.file || entry.url || "Untitled";
      btn.appendChild(title);
      if (entry.description) {
        const desc = document.createElement("span");
        desc.className = "romPickerItemDesc";
        desc.textContent = entry.description;
        btn.appendChild(desc);
      }
      btn.addEventListener("click", function () {
        loadEntry(entry);
      });
      listEl.appendChild(btn);
    });
  }

  function matchEntry(wanted) {
    const norm = String(wanted).toLowerCase();
    return entries.find(function (entry) {
      return (
        (entry.name && entry.name.toLowerCase() === norm) ||
        (entry.file && entry.file.toLowerCase() === norm) ||
        (entry.file && entry.file.toLowerCase().replace(/\.(atr|xex|zip)$/, "") === norm)
      );
    });
  }

  function init(options) {
    hooks = options || {};
    overlay = document.getElementById("romPicker");
    listEl = document.getElementById("romPickerList");
    statusEl = document.getElementById("romPickerStatus");
    if (!overlay || !listEl) return;

    const closeBtn = document.getElementById("romPickerClose");
    if (closeBtn) closeBtn.addEventListener("click", hide);

    manifestUrl = getQueryParam("romlist") || DEFAULT_MANIFEST_URL;

    fetch(manifestUrl, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        entries = (manifest && (manifest.roms || manifest.entries)) || [];
        if (!Array.isArray(entries)) entries = [];
        renderList();
        const wanted = getQueryParam("rom");
        if (wanted) {
          const entry = matchEntry(wanted);
          if (entry) {
            hide();
            return loadEntry(entry);
          }
          setStatus('Game "' + wanted + '" not found in the ROM list.', true);
        }
        show();
      })
      .catch(function (err) {
        // No manifest available: stay out of the way (normal manual flow).
        console.warn("ROM picker: no manifest at " + manifestUrl, err);
        hide();
      });
  }

  window.A8ERomPicker = {
    init: init,
    show: show,
    hide: hide,
  };
})();
