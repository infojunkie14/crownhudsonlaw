/* Crown Hudson intake, version 2: the client answers every judgment the
   drafting pipeline used to guess. Static page, no framework. The goods
   picker searches the USPTO ID Manual's active entries in the browser, so
   the identification is chosen with the client rather than inferred from a
   sentence. Files never leave the browser until the send step, and only when
   INTAKE_ENDPOINT is set; until then the page is a rehearsal and says so. */
(function () {
  "use strict";

  var INTAKE_ENDPOINT = "https://script.google.com/macros/s/AKfycby1MdYjf4mzvcoiY6qMYbTDfyJAYm48Rl-s8pO9Cr69lZKxNuET-9eZWTL8mQJ-1XNb0w/exec";   /* Apps Script web app, deployment @2, 2026-09-03 */
  var MANUAL_URL = "/assets/data/idmanual-active.json";
  var SCHEMA_VERSION = "intake-v3";
  var INTAKE_ENABLED = false; // A tested release and owner approval must open intake.
  var fileIds = new WeakMap(), preparedBody = null;
  function newId(prefix) { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return prefix + Array.from(bytes).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  var submissionId = newId("sub_"), submittedAt = new Date().toISOString();
  function attachmentId(file) { if (!fileIds.has(file)) fileIds.set(file, newId("file_")); return fileIds.get(file); }

  var CLASS_NAMES = {
    "001": "Chemicals", "002": "Paints", "003": "Cosmetics and cleaning", "004": "Fuels and lubricants",
    "005": "Pharmaceuticals and supplements", "006": "Metal goods", "007": "Machines", "008": "Hand tools",
    "009": "Electronics and software", "010": "Medical devices", "011": "Lighting, heating, cooking",
    "012": "Vehicles", "013": "Firearms", "014": "Jewelry and watches", "015": "Musical instruments",
    "016": "Paper goods and printed matter", "017": "Rubber and plastics", "018": "Leather goods and bags",
    "019": "Building materials", "020": "Furniture", "021": "Housewares and kitchen", "022": "Rope and textiles raw",
    "023": "Yarns", "024": "Fabrics and bedding", "025": "Clothing, footwear, headwear", "026": "Lace and trimmings",
    "027": "Floor coverings", "028": "Toys and sporting goods", "029": "Meat, dairy, prepared foods",
    "030": "Staple foods, coffee, baked goods", "031": "Agricultural and pet food", "032": "Beer and soft drinks",
    "033": "Wine and spirits", "034": "Tobacco and vaping", "035": "Advertising, retail, business services",
    "036": "Financial and insurance services", "037": "Construction and repair", "038": "Telecommunications",
    "039": "Transport and travel", "040": "Custom manufacturing and treatment", "041": "Education and entertainment",
    "042": "Software services, design, science", "043": "Restaurants and lodging", "044": "Medical, beauty, agriculture services",
    "045": "Legal, security, personal services"
  };

  /* Everyday words the manual does not use, mapped to words it does. Small on
     purpose: the pipeline's meaning search runs again on the server. */
  var SYNONYMS = {
    hat: ["headwear", "hats", "caps"], hats: ["headwear", "caps"], cap: ["headwear", "caps"],
    tee: ["shirts", "t-shirts"], tees: ["shirts", "t-shirts"], tshirt: ["t-shirts"], tshirts: ["t-shirts"],
    hoodie: ["hooded sweatshirts"], hoodies: ["hooded sweatshirts"], sneaker: ["footwear", "shoes"], sneakers: ["footwear", "shoes"],
    app: ["software", "application"], apps: ["software", "application"], saas: ["software as a service"],
    website: ["online", "internet"], store: ["retail store services"], shop: ["retail store services"],
    cafe: ["cafe services", "coffee shop"], restaurant: ["restaurant services"], bar: ["bar services"],
    gym: ["fitness", "physical fitness"], coaching: ["coaching", "training"], consulting: ["consulting", "consultancy"],
    candle: ["candles"], candles: ["candles"], soap: ["soaps", "soap"], lotion: ["lotions"], vitamins: ["vitamins", "dietary supplements"],
    supplement: ["dietary supplements"], supplements: ["dietary supplements"], coffee: ["coffee"], tea: ["tea"],
    beer: ["beer"], wine: ["wine"], vodka: ["vodka", "distilled spirits"], whiskey: ["whiskey", "distilled spirits"],
    dog: ["pet", "dogs"], cat: ["pet", "cats"], treats: ["treats", "pet treats"], jewelry: ["jewelry"], jewellery: ["jewelry"],
    purse: ["handbags"], purses: ["handbags"], bag: ["bags", "handbags"], bags: ["bags"], backpack: ["backpacks"],
    game: ["games"], games: ["games"], toy: ["toys"], toys: ["toys"], podcast: ["podcasts"], youtube: ["videos", "online videos"],
    photography: ["photography services"], photographer: ["photography services"], realtor: ["real estate"], realty: ["real estate"],
    lawyer: ["legal services"], plumber: ["plumbing"], electrician: ["electrical"], cleaning: ["cleaning services"],
    trucking: ["transport", "freight"], moving: ["moving services"], landscaping: ["landscaping"], salon: ["hair salon services", "beauty salon"],
    barber: ["barber services"], nails: ["nail care services"], spa: ["spa services"], tattoo: ["tattooing"],
    daycare: ["day care", "child care"], tutoring: ["tutoring"], church: ["religious services"], nonprofit: ["charitable"]
  };

  var STOP = { "and": 1, "or": 1, "for": 1, "of": 1, "the": 1, "a": 1, "an": 1, "in": 1, "to": 1, "with": 1, "our": 1, "we": 1, "sell": 1, "make": 1, "i": 1, "my": 1 };

  var state = {
    manual: null, index: null,
    items: {},                        /* id_tx -> {id, cls, desc, inUse, firstAnywhere, firstUS, files:[]} */
    files: {}
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function words(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(function (w) { return w && !STOP[w]; });
  }
  function stem(w) { return w.length > 4 && w.slice(-1) === "s" && w.slice(-2) !== "ss" ? w.slice(0, -1) : w; }

  /* ---------- manual: load and index ---------- */
  function loadManual() {
    var status = $("#manual-status");
    status.textContent = "Loading the USPTO goods and services list.";
    return fetch(MANUAL_URL).then(function (r) { return r.json(); }).then(function (rows) {
      state.manual = rows;
      state.index = rows.map(function (r) { return words(r[1]).map(stem); });
      status.textContent = rows.length.toLocaleString() + " entries loaded. Type what you sell.";
      $("#goods-search").disabled = false;
    }).catch(function () {
      status.textContent = "The list did not load. Describe what you sell in the box below and we will choose the entries with you.";
    });
  }
  function expand(q) {
    var out = [];
    words(q).forEach(function (w) {
      out.push(stem(w));
      (SYNONYMS[w] || []).forEach(function (s) { words(s).forEach(function (x) { out.push(stem(x)); }); });
    });
    return out;
  }
  /* Every query word must be matched, by itself (exact or prefix) or by one
     of its everyday synonyms. Exact beats prefix beats synonym; a short
     entry beats a long one; the entry whose last word is the query word
     (the head noun, "Hats" for "hats") beats one that merely contains it. */
  function matchers(w) {
    var m = [w];
    (SYNONYMS[w] || []).forEach(function (s) { words(s).forEach(function (x) { m.push(stem(x)); }); });
    return m;
  }
  function search(q) {
    if (!state.manual) return [];
    var raw = words(q);
    var qs = raw.map(stem);
    if (!qs.length) return [];
    var ms = raw.map(function (w, i) { return matchers(qs[i]).concat(matchers(w).filter(function (x) { return x !== qs[i]; })); });
    var hits = [];
    for (var i = 0; i < state.manual.length; i++) {
      var toks = state.index[i];
      var score = 0, all = true;
      for (var j = 0; j < qs.length && all; j++) {
        var best = 0;
        for (var a = 0; a < ms[j].length && best < 3; a++) {
          var w = ms[j][a], own = a === 0;
          for (var k = 0; k < toks.length; k++) {
            if (toks[k] === w) { best = Math.max(best, own ? 3 : 2); if (k === toks.length - 1) best += 0.5; break; }
            if (w.length >= 3 && toks[k].indexOf(w) === 0) { best = Math.max(best, own ? 1.5 : 1); }
          }
        }
        if (!best) all = false; else score += best;
      }
      if (all) hits.push([score - toks.length * 0.25, i]);
    }
    hits.sort(function (a, b) { return b[0] - a[0]; });
    return hits.slice(0, 50).map(function (h) { return [state.manual[h[1]], h[0]]; });
  }
  function renderResults(scored) {
    var box = $("#goods-results");
    box.innerHTML = "";
    if (!scored.length) { box.appendChild(el("p", { "class": "hint", text: "No entry matches those words. Try one product at a time, in plain words, or leave it in the description box below." })); return; }
    var byClass = {}, best = {};
    scored.forEach(function (s) { var r = s[0], c = r[0].slice(0, 3); (byClass[c] = byClass[c] || []).push(r); best[c] = Math.max(best[c] || -99, s[1]); });
    Object.keys(byClass).sort(function (a, b) { return best[b] - best[a]; }).forEach(function (c) {
      box.appendChild(el("div", { "class": "cls-head" }, [
        el("span", { "class": "label", text: "Class " + c }),
        el("span", { "class": "cls-name", text: CLASS_NAMES[c] || "" })
      ]));
      byClass[c].forEach(function (r) {
        var id = r[0];
        var on = !!state.items[id];
        box.appendChild(el("label", { "class": "pick" + (on ? " on" : "") }, [
          el("input", { type: "checkbox", "data-id": id, "data-cls": c, "data-desc": r[1], onchange: togglePick }),
          el("span", { text: r[1] })
        ])).querySelector("input").checked = on;
      });
    });
  }
  function togglePick(ev) {
    var i = ev.target, id = i.getAttribute("data-id");
    if (i.checked) {
      if (Object.keys(state.items).length >= 40) { i.checked = false; alert("Forty entries is the most this form takes. Tell us the rest in the description box."); return; }
      state.items[id] = { id: id, cls: i.getAttribute("data-cls"), desc: i.getAttribute("data-desc"), inUse: null, firstAnywhere: "", firstUS: "", form: "", files: [] };
    } else {
      delete state.items[id];
    }
    i.parentNode.classList.toggle("on", i.checked);
    renderSelected();
  }
  function renderSelected() {
    var box = $("#selected"), ids = Object.keys(state.items);
    box.innerHTML = "";
    var classes = {};
    ids.forEach(function (id) { classes[state.items[id].cls] = 1; });
    var cl = Object.keys(classes).sort();
    $("#class-count").textContent = cl.length ? (cl.length + (cl.length === 1 ? " class: " : " classes: ") + cl.join(", ")) : "No entries chosen yet.";
    $("#software-q").hidden = !(classes["009"] || classes["042"]);
    if (!ids.length) { box.appendChild(el("p", { "class": "hint", text: "Chosen entries appear here, each with its own use question." })); return; }
    cl.forEach(function (c) {
      box.appendChild(el("div", { "class": "cls-head" }, [el("span", { "class": "label", text: "Class " + c }), el("span", { "class": "cls-name", text: CLASS_NAMES[c] || "" })]));
      ids.filter(function (id) { return state.items[id].cls === c; }).forEach(function (id) { box.appendChild(itemCard(state.items[id])); });
    });
  }
  function itemCard(it) {
    var card = el("div", { "class": "item", "data-id": it.id });
    card.appendChild(el("div", { "class": "item-head" }, [
      el("span", { "class": "serif item-desc", text: it.desc }),
      el("button", { type: "button", "class": "x", text: "Remove", onclick: function () { delete state.items[it.id]; renderSelected(); var cb = $("input[data-id='" + it.id + "']"); if (cb) { cb.checked = false; cb.parentNode.classList.remove("on"); } } })
    ]));
    /* Intake 5.1b, the TMEP 1402.07(c) fork: printed, downloadable and online
       versions of the same thing sit in three different classes. Asked per
       item, because the answer differs by item. */
    var formQ = el("div", { "class": "q" }, [el("span", { "class": "qt", text: "If this could exist in more than one form, which form do you actually offer?" })]);
    formQ.appendChild(el("select", { onchange: function (e) { it.form = e.target.value; } },
      [["", "Not applicable, it comes in one form"], ["printed", "Printed on paper"], ["download", "A file the customer downloads"], ["online", "Used online without downloading"]].map(function (o) {
        var op = el("option", { value: o[0], text: o[1] }); if (it.form === o[0]) op.selected = true; return op;
      })));
    card.appendChild(formQ);
    var q = el("div", { "class": "q" }, [el("span", { "class": "qt", text: "Are you selling this in the United States under the mark today?" })]);
    ["Yes", "No, not yet"].forEach(function (lab, n) {
      var r = el("label", { "class": "radio" }, [el("input", { type: "radio", name: "use-" + it.id, value: n === 0 ? "yes" : "no", onchange: function () { it.inUse = n === 0; card.querySelector(".use-facts").hidden = !it.inUse; } }), el("span", { text: lab })]);
      if (it.inUse === (n === 0)) r.querySelector("input").checked = true;
      q.appendChild(r);
    });
    card.appendChild(q);
    var facts = el("div", { "class": "use-facts", hidden: "" });
    facts.appendChild(el("div", { "class": "row2" }, [
      field("First used anywhere (month and year)", el("input", { type: "date", value: it.firstAnywhere, oninput: function (e) { it.firstAnywhere = e.target.value; } })),
      field("First used in U.S. commerce (month and year)", el("input", { type: "date", value: it.firstUS, oninput: function (e) { it.firstUS = e.target.value; } }))
    ]));
    var fileIn = el("input", { type: "file", accept: "image/*,application/pdf", multiple: "", onchange: function (e) { specimenCheck(it, e.target.files, card); } });
    var isService = it.cls >= "035";
    facts.appendChild(field(isService
      ? "A photo or screenshot showing the mark while you offer or provide this service: your website page for it, signage, a vehicle, a brochure, or a form used in providing it. The service must already be provided to customers, not just planned."
      : "A photo or screenshot showing the mark on this item itself, its label, tag or packaging, or a page of your online store that shows the item, the mark next to it, and a way to buy it (a price and an add-to-cart or order button). A plain advertisement, a business card, or a page with no way to order does not count.", fileIn));
    facts.appendChild(el("p", { "class": "hint", text: isService
      ? "The USPTO needs to see the mark in the sale or advertising of a service you are actually rendering."
      : "The USPTO needs to see the mark on or with the goods as sold, so a customer would connect the two." }));
    facts.appendChild(el("div", { "class": "spec-report" }));
    if (it.inUse) facts.hidden = false;
    card.appendChild(facts);
    return card;
  }
  function field(label, input) { return el("label", { "class": "field" }, [el("span", { "class": "fl", text: label }), input]); }

  /* Mechanical specimen checks: right kind of file, big enough to read,
     an image rather than a thumbnail. Whether the mark and the goods are
     actually visible is judged after receipt; the client confirms it here. */
  function specimenCheck(it, files, card) {
    var rep = card.querySelector(".spec-report");
    rep.innerHTML = "";
    it.files = [];
    Array.prototype.forEach.call(files, function (f) {
      var line = el("div", { "class": "spec-line" });
      var meta = { id: attachmentId(f), name: f.name, size: f.size, type: f.type, width: null, height: null, ok: false, problems: [] };
      if (!/^image\/|^application\/pdf$/.test(f.type)) meta.problems.push("not an image or PDF");
      if (f.size < 20000) meta.problems.push("smaller than 20 KB, probably a thumbnail");
      if (f.size > 25 * 1024 * 1024) meta.problems.push("larger than 25 MB");
      function done() {
        meta.ok = !meta.problems.length;
        line.className = "spec-line " + (meta.ok ? "ok" : "bad");
        line.textContent = f.name + (meta.width ? " (" + meta.width + " by " + meta.height + " px)" : "") + (meta.ok ? ": accepted" : ": " + meta.problems.join("; "));
        it.files.push(meta);
      }
      if (/^image\//.test(f.type)) {
        var img = new Image();
        img.onload = function () { meta.width = img.naturalWidth; meta.height = img.naturalHeight; if (Math.max(meta.width, meta.height) < 600) meta.problems.push("under 600 px on its long side; take a larger photo"); URL.revokeObjectURL(img.src); done(); };
        img.onerror = function () { meta.problems.push("could not be read as an image"); done(); };
        img.src = URL.createObjectURL(f);
      } else { done(); }
      rep.appendChild(line);
    });
    var conf = el("label", { "class": "check" }, [el("input", { type: "checkbox", "data-spec-confirm": it.id }), el("span", { text: "The mark and this item (or advertising for this service) are both visible in the file." })]);
    rep.appendChild(conf);
  }

  /* ---------- conditional questions ---------- */
  function wire() {
    function productFields() { var k = val("product_kind"); $("#existing_matter").hidden = k === "registration"; $("#lifecycle_facts").hidden = ["registration", "response", "madrid_response"].indexOf(k) >= 0; }
    $("#product_kind").addEventListener("change", productFields); productFields();
    $("#has_instructing_firm").addEventListener("change", function () { $("#instructing_firm_fields").hidden = !this.checked; });
    $("#payer_role").addEventListener("change", function () { $("#third_party_fields").hidden = this.value !== "third_party"; });
    $("#goods-search").addEventListener("input", function (e) { renderResults(search(e.target.value)); });
    $$("[data-show]").forEach(function (ctl) {
      var target = $(ctl.getAttribute("data-show")), val = ctl.getAttribute("data-show-when");
      function upd() { var v = ctl.type === "checkbox" ? (ctl.checked ? "yes" : "no") : ctl.value; target.hidden = (v !== val); }
      ctl.addEventListener("change", upd); upd();
    });
    $$("input[name=mark_kind]").forEach(function (r) { r.addEventListener("change", function () { $("#mark-image").hidden = r.value === "words"; }); });
    $$("input[name=owner_kind]").forEach(function (r) { r.addEventListener("change", function () { $("#entity-block").hidden = r.value === "individual"; $("#individual-block").hidden = r.value !== "individual"; }); });
    $("#dom_street").addEventListener("input", function (e) {
      var v = e.target.value.toLowerCase();
      $("#pobox-warn").hidden = !(/p\.?\s*o\.?\s*box|pmb\b|post office box|mail ?box|registered agent|virtual office|c\/o\b|\bapo\b|\bfpo\b|\bdpo\b|\bcmra\b|\bhcr\b|forwarding/.test(v));
    });
    $("#review-btn").addEventListener("click", review);
    $("#edit-btn").addEventListener("click", function () { $("#review").hidden = true; $("#form").hidden = false; window.scrollTo(0, 0); });
    $("#send-btn").addEventListener("click", send);
    if (!INTAKE_ENDPOINT || !INTAKE_ENABLED) { $("#send-btn").hidden = true; $("#rehearsal").hidden = false; }
  }

  /* ---------- payload ---------- */
  function val(id) { var n = $("#" + id); return n ? (n.type === "checkbox" ? n.checked : n.value.trim()) : null; }
  function radio(name) { var n = $("input[name=" + name + "]:checked"); return n ? n.value : null; }
  function checks(name) { return $$("input[name=" + name + "]:checked").map(function (n) { return n.value; }); }
  function payload() {
    var items = Object.keys(state.items).map(function (id) {
      var it = state.items[id], conf = $("[data-spec-confirm='" + id + "']");
      return { id_tx: it.id, "class": it.cls, description: it.desc, in_use_us: it.inUse, first_use_anywhere: it.firstAnywhere || null, first_use_us: it.firstUS || null,
               form: it.form || null, specimens: it.files, specimen_confirmed: conf ? conf.checked : false };
    });
    var classes = {}; items.forEach(function (i) { classes[i["class"]] = 1; });
    /* Intake 4.10: one radio with four answers becomes two facts, whether the
       mark is a surname and whether anyone connected carries it. */
    var sn = radio("mark_surname");
    var surname = sn === "no" ? "no" : sn === "unsure" ? "unsure" : sn ? "yes" : null;
    var surnameConnected = sn === "yes_connected" ? "yes" : sn === "yes_unconnected" ? "no" : null;
    var isLogo = radio("mark_kind") !== "words";
    var p = {
      schema: SCHEMA_VERSION, submission_id: submissionId, submitted_at: submittedAt,
      product: { kind: val("product_kind") },
      payer: { role: val("payer_role"), name: val("payer_name"), email: val("payer_email"), relationship: val("payer_relationship"), client_consent: val("payer_client_consent") },
      instructing_firm: val("has_instructing_firm") ? { name: val("firm_name"), country: val("firm_country"), email: val("firm_email"), signatory_name: val("firm_signatory_name"), signatory_title: val("firm_signatory_title"), authority_confirmed: val("firm_authority") } : null,
      existing: { serial: val("existing_serial"), basis: val("existing_basis"), action_type: val("action_type"), action_issue_date: val("action_issue_date"), deadline: val("existing_deadline"), ir_number: val("ir_number") },
      lifecycle: { serial: val("existing_serial"), basis: val("existing_basis"), registration_number: val("registration_number"), registration_date: val("registration_date"), maintenance_cycle: val("maintenance_cycle") ? Number(val("maintenance_cycle")) : null, noa_date: val("noa_date"), extensions_granted: val("extensions_granted") !== "" ? Number(val("extensions_granted")) : null, new_owner_or_name: val("new_owner_or_name"), deadline: val("existing_deadline") },
      mark: { text: val("mark_text"), kind: radio("mark_kind"), pronounce: val("mark_pronounce"), has_color: radio("mark_color"), colors: isLogo && radio("mark_color") === "yes" ? val("mark_colors") : null,
              description: isLogo ? val("mark_description") : null, non_english: radio("mark_lang"), translation: val("mark_translation"),
              meaning: val("mark_meaning"), person_name: radio("mark_person"), person_status: radio("person_status"),
              surname: surname, surname_connected: surnameConnected, surname_of: val("mark_surname_of"),
              place: radio("mark_place"), place_name: val("mark_place_name"), place_origin: radio("place_origin"), place_of_origin: val("place_of_origin"), insignia: radio("mark_insignia"),
              descriptive_part: radio("mark_descr"), descriptive_words: val("mark_descr_words") },
      goods: { what_you_sell: val("what_you_sell"), items: items, classes: Object.keys(classes).sort(), maker_or_reseller: radio("reseller"),
               sells_for_others: checks("sells_for_others").filter(function (v) { return v !== "none"; }),
               software_channel: $("#software-q").hidden ? null : radio("software"), audience: radio("audience"), channels: val("channels"), more_later: val("more_later") },
      applicant: { owner_kind: radio("owner_kind"), legal_name: val("legal_name"), other_names: val("other_names"), entity_type: val("entity_type"),
                   org_country: val("org_country"), org_state: val("org_state"), local_form: val("local_form"), citizenship: val("citizenship"),
                   related_use: radio("related_use"), related_use_names: val("related_use_names"),
                   domicile: { street: val("dom_street"), city: val("dom_city"), region: val("dom_region"), postcode: val("dom_post"), country: val("dom_country") },
                   address_note: val("address_note"), mailing_address: val("mailing_address"), applicant_email: val("applicant_email"),
                   principals: val("principals"), corporate_family: val("corporate_family"), others_with_rights: val("others_with_rights"),
                   competitors: val("competitors"), prior_counsel: val("prior_counsel"),
                   uspto_fee_method: radio("uspto_fee_method") },
      foreign: { has_foreign_reg: radio("foreign_reg"), country: val("foreign_country"), number: val("foreign_number"), date: val("foreign_date"), madrid_ir: val("madrid_ir"), origin_country: val("origin_country") },
      history: { prior_us_filings: radio("prior_us"), prior_serials: val("prior_serials"), disputes: radio("disputes"), disputes_party: val("disputes_party"), disputes_text: val("disputes_text"),
                 counsel_order: radio("counsel_order"), counsel_order_text: val("counsel_order_text"), agreements: radio("agreements"), agreements_text: val("agreements_text"),
                 known_similar_owners: val("known_similar") },
      contact: { name: val("c_name"), email: val("c_email"), second_email: val("c_email2"), signer: val("c_signer"), signer_title: val("c_signer_title"), language: val("c_lang"),
                 found_via: val("found_via"), found_detail: val("found_detail") },
      confirmations: { true_and_complete: val("confirm_true"), no_relationship_yet: val("confirm_norel") }
    };
    return p;
  }
  function problems(p, files) {
    var errors = validatePayload(p, files);
    if (p.contact.email !== val('c_email_confirm')) errors.push('The email addresses do not match.');
    return errors;
  }
  async function readFile(file, item, role) {
    var buffer = await file.arrayBuffer();
    var hash = await crypto.subtle.digest('SHA-256', buffer);
    var bytes = new Uint8Array(buffer), encoded = '';
    for (var offset = 0; offset < bytes.length; offset += 8192) encoded += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 8192));
    return { id: attachmentId(file), name: file.name, type: file.type, size: file.size, item: item, role: role,
      sha256: Array.from(new Uint8Array(hash)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''), data: btoa(encoded) };
  }
  async function review() {
    var p = payload(), box = $('#review-body'), errors = [], files = [];
    preparedBody = null; $('#review-btn').disabled = true;
    try {
      var reads = [];
      $$('input[type=file]').forEach(function (input) {
        if (input.closest('[hidden]')) return;
        var card = input.closest('.item'), item = card ? card.getAttribute('data-id') : null;
        var role = card ? 'specimen' : input.id === 'mark_file' ? 'drawing' : input.id === 'office_action_file' ? 'office_action' : 'supporting';
        Array.prototype.forEach.call(input.files, function (f) { reads.push(readFile(f, item, role)); });
      });
      files = await Promise.all(reads);
      if (["registration", "response", "madrid_response"].indexOf(p.product.kind) < 0) {
        p.lifecycle.class_count = val("lifecycle_class_count") ? Number(val("lifecycle_class_count")) : null;
        p.lifecycle.goods = p.goods.items.map(function (i) { return { "class": i["class"], description: i.description }; });
        p.lifecycle.retained_goods = p.goods.items.filter(function (i) { return i.in_use_us === true; }).map(function (i) {
          return { "class": i["class"], description: i.description, first_use_anywhere: i.first_use_anywhere, first_use_us: i.first_use_us,
            specimen_references: files.filter(function (f) { return f.role === "specimen" && f.item === i.id_tx; }).map(function (f) { return { reference: f.id, sha256: f.sha256 }; }) };
        });
        p.lifecycle.continuing_intent_statement = val("continuing_intent_statement");
        p.lifecycle.good_cause_statement = val("good_cause_statement");
        p.lifecycle.effective_date = val("change_effective_date");
        p.lifecycle.new_owner = { legal_name: val("new_owner_or_name"), entity_type: val("new_owner_entity_type"), jurisdiction: val("new_owner_jurisdiction"), address: val("new_owner_address") };
        var source = files.filter(function (f) { return f.role === "supporting"; })[0];
        p.lifecycle.source_document = source ? { reference: source.id, sha256: source.sha256 } : null;
        p.lifecycle.deleted_goods = [];
      }
      errors = problems(p, files);
      if (!errors.length) preparedBody = JSON.stringify({ payload: p, files: files });
    } catch (err) { errors = ['An attachment could not be read. Select it again before sending.']; }
    $('#review-btn').disabled = false; box.innerHTML = '';
    box.appendChild(el('p', { 'class': errors.length ? 'bad' : 'ok', text: errors.length ? 'Please correct these answers:' : 'The required intake fields and attachments are present. The attorney still verifies the facts and scope.' }));
    if (errors.length) box.appendChild(el('ul', {}, errors.map(function (e) { return el('li', { text: e }); })));
    var sum = el('dl', { 'class': 'sum' });
    function row(k, v) { sum.appendChild(el('dt', { text: k })); sum.appendChild(el('dd', { text: v || '(blank)' })); }
    row('Service', p.product.kind.replace(/_/g, ' ')); row('Mark', p.mark.text); row('Applicant', p.applicant.legal_name);
    row('Contact', p.contact.name + ' <' + p.contact.email + '>'); row('Payer', p.payer.name); row('Attachments', String(files.length)); row('Reference', p.submission_id);
    box.appendChild(sum); $('#payload').textContent = JSON.stringify(p, null, 1);
    $('#send-btn').disabled = !!errors.length; $('#form').hidden = true; $('#review').hidden = false; window.scrollTo(0, 0);
  }
  function send() {
    if (!INTAKE_ENABLED || !INTAKE_ENDPOINT || !preparedBody) return;
    $('#send-btn').disabled = true;
    fetch(INTAKE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: preparedBody })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error || 'Submission was not accepted.');
        $('#done-ref').textContent = j.ref; $('#review').hidden = true; $('#done').hidden = false; window.scrollTo(0, 0);
      }).catch(function (err) {
        $('#send-btn').disabled = false;
        alert('Receipt was not confirmed. Retry the same submission; it keeps reference ' + submissionId + '. Do not create a second request. ' + String(err.message || ''));
      });
  }

  document.addEventListener("DOMContentLoaded", function () { wire(); renderSelected(); loadManual(); });
})();
