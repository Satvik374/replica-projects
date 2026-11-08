/* Anvel — page-shaped blueprints: marketing sites and read-mostly surfaces. */

import { site, esc, slug, storage } from "./gen-kit.js";

const nav = (name, items) => `<header class="topbar">
      <div class="wrap bar">
        <a class="brand" href="#top"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        <nav class="links" aria-label="Primary">
          ${items.map((i) => `<a href="#${slug(i)}">${esc(i)}</a>`).join("\n          ")}
        </nav>
        <div class="bar-actions">
          <a class="btn btn-ghost" href="#start">Sign in</a>
          <a class="btn" href="#start">Get started</a>
        </div>
        <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav">Menu</button>
      </div>
      <nav id="mobile-nav" class="mobile-nav" aria-label="Mobile" hidden>
        ${items.map((i) => `<a href="#${slug(i)}">${esc(i)}</a>`).join("\n        ")}
      </nav>
    </header>`;

export const landing = {
  key: "landing",
  label: "Landing page",
  test: (p) =>
    /landing|home ?page|marketing|website for|startup|saas|agency|product page|company site|promo|announce/.test(p),
  build(ctx) {
    const name = ctx.name;
    const line = ctx.tagline;
    const body = `<div id="top"></div>
    ${nav(name, ["Product", "How it works", "Pricing", "FAQ"])}
    <main>
      <section class="hero">
        <div class="wrap hero-inner">
          <p class="pill"><span class="dot" aria-hidden="true"></span>${esc(ctx.badge)}</p>
          <h1>${esc(ctx.headline)}<br /><span class="accent">${esc(ctx.headlineAccent)}</span></h1>
          <p class="lede">${esc(line)}</p>
          <div class="cta-row">
            <a class="btn" href="#start">${esc(ctx.cta)}</a>
            <a class="btn btn-ghost" href="#how">See how it works</a>
          </div>
          <p class="fine">No card required · cancel when you like · set up in minutes</p>
        </div>
        <div class="wrap">
          <div class="hero-shot" role="img" aria-label="Product preview">
            <div class="shot-bar"><span></span><span></span><span></span></div>
            <div class="shot-body">
              <div class="shot-side">
                <div class="sk strong"></div><div class="sk"></div><div class="sk"></div><div class="sk short"></div>
              </div>
              <div class="shot-main">
                <div class="shot-cards">
                  <div class="mini"><p class="mini-k">This week</p><p class="mini-v">1,248</p><div class="spark"></div></div>
                  <div class="mini"><p class="mini-k">Activation</p><p class="mini-v">72%</p><div class="spark alt"></div></div>
                  <div class="mini"><p class="mini-k">Hours saved</p><p class="mini-v">96</p><div class="spark"></div></div>
                </div>
                <div class="sk chart"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="logos" aria-label="Used by">
        <div class="wrap logo-row">
          ${["Northline", "Cobalt", "Fernway", "Halstead", "Meridian", "Quarry"]
            .map((n) => `<span>${n}</span>`)
            .join("\n          ")}
        </div>
      </section>

      <section class="section" id="product">
        <div class="wrap">
          <h2>Built for the work that never ends</h2>
          <p class="section-lede">Three things teams tell us they need on day one. Everything else can wait.</p>
          <div class="grid-3">
            ${[
              ["One place for the messy middle", "Briefs, files and decisions stop living in five tools. Pick up any thread a week later and know exactly where it stands."],
              ["Answers without a meeting", "Every update writes itself down. Search yesterday's decision instead of booking thirty minutes to relive it."],
              ["Quiet by default", "Notifications are a setting, not a personality. You hear about what you own — nothing else."]
            ]
              .map(
                ([title, text], i) => `<article class="card feature">
              <span class="num">0${i + 1}</span>
              <h3>${esc(title)}</h3>
              <p>${esc(text)}</p>
            </article>`
              )
              .join("\n            ")}
          </div>
        </div>
      </section>

      <section class="section alt" id="how">
        <div class="wrap how">
          <div>
            <h2>Three steps, then it is out of your way</h2>
            <ol class="steps">
              <li><strong>Bring the work in.</strong> Paste a link, drop a file, or start from a template that already knows your process.</li>
              <li><strong>Set the rhythm.</strong> Decide what a week looks like for your team. It takes one screen and about four minutes.</li>
              <li><strong>Ship and look back.</strong> Every shipped item leaves a trail, so the next one starts further ahead.</li>
            </ol>
          </div>
          <div class="card quote">
            <p class="q">“We stopped having the same status meeting three times a week. That is the whole review.”</p>
            <p class="who"><span class="avatar" aria-hidden="true">R</span> Riya M. · Head of Ops, Fernway</p>
            <div class="stars" aria-label="Five out of five">★★★★★</div>
          </div>
        </div>
      </section>

      <section class="section" id="pricing">
        <div class="wrap">
          <div class="price-head">
            <div>
              <h2>Simple pricing</h2>
              <p class="section-lede">Start free. Pay when the team is in it every day.</p>
            </div>
            <div class="toggle" role="group" aria-label="Billing period">
              <button type="button" data-period="month" aria-pressed="true">Monthly</button>
              <button type="button" data-period="year" aria-pressed="false">Yearly · save 20%</button>
            </div>
          </div>
          <div class="grid-3 tiers">
            ${[
              ["Free", "0", "0", "For trying it on one project.", ["1 project", "3 teammates", "7-day history", "Community support"]],
              ["Team", "12", "115", "For teams that live in it.", ["Unlimited projects", "Unlimited teammates", "Full history", "Email support"]],
              ["Studio", "29", "279", "For agencies with clients.", ["Everything in Team", "Client spaces", "Custom domain", "Priority support"]]
            ]
              .map(
                ([tier, month, year, blurb, features], i) => `<article class="card tier${i === 1 ? " featured" : ""}">
              ${i === 1 ? '<p class="tag">Most teams pick this</p>' : ""}
              <h3>${tier}</h3>
              <p class="price"><span class="amount" data-month="${month}" data-year="${year}">$${month}</span><span class="per">/ month</span></p>
              <p class="tier-blurb">${esc(blurb)}</p>
              <ul>${features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
              <a class="btn ${i === 1 ? "" : "btn-quiet"}" href="#start">Choose ${tier}</a>
            </article>`
              )
              .join("\n            ")}
          </div>
        </div>
      </section>

      <section class="section alt" id="faq">
        <div class="wrap narrow">
          <h2>Questions people actually ask</h2>
          <div class="faq">
            ${[
              ["Can we move our existing projects over?", "Yes. Import from CSV or bring a folder of files and we will map the fields for you during setup."],
              ["What happens when someone leaves the team?", "Their work stays. Seats are freed the day you remove them, and the next invoice reflects it."],
              ["Is there a limit on history?", "Free keeps 7 days. Paid keeps everything for as long as the account is open."],
              ["Can we get our data back out?", "Any time, in one click, as JSON and CSV. No email to support required."]
            ]
              .map(
                ([q, a], i) => `<details${i === 0 ? " open" : ""}>
              <summary>${esc(q)}</summary>
              <p>${esc(a)}</p>
            </details>`
              )
              .join("\n            ")}
          </div>
        </div>
      </section>

      <section class="section" id="start">
        <div class="wrap cta-card card">
          <div>
            <h2>Try it on your next real project</h2>
            <p class="section-lede">Free while you decide. No card, no call.</p>
          </div>
          <form class="cta-form" novalidate>
            <label class="sr" for="cta-email">Work email</label>
            <input class="input" id="cta-email" type="email" placeholder="you@company.com" required />
            <button class="btn" type="submit">Create account</button>
            <p class="cta-note" role="status" aria-live="polite"></p>
          </form>
        </div>
      </section>
    </main>
    <footer class="footer">
      <div class="wrap foot-row">
        <p>© 2026 ${esc(name)}. Built with Anvel.</p>
        <nav aria-label="Footer">
          <a href="#product">Product</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="#start">Contact</a>
        </nav>
      </div>
    </footer>`;

    const css = `
.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:28px;height:68px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;text-decoration:none;font-size:18px}
.mark{width:22px;height:22px;border-radius:7px;background:var(--accent);display:inline-block;position:relative}
.mark::after{content:"";position:absolute;inset:6px;border-radius:3px;background:var(--bg);opacity:.85}
.links{display:flex;gap:22px;font-size:14px;color:var(--muted)}
.links a{text-decoration:none}
.links a:hover{color:var(--ink)}
.bar-actions{margin-left:auto;display:flex;gap:10px}
.bar-actions .btn{height:40px;padding:0 16px;font-size:14px}
.menu-btn{display:none;margin-left:auto;height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;cursor:pointer}
.mobile-nav{display:flex;flex-direction:column;gap:4px;padding:8px 24px 16px;border-top:1px solid var(--line)}
.mobile-nav a{padding:10px 0;text-decoration:none;color:var(--muted)}
.hero{padding:72px 0 40px;text-align:center}
.hero-inner{display:flex;flex-direction:column;align-items:center;gap:20px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
h1{font-size:clamp(38px,6vw,68px);max-width:16ch}
.accent{color:var(--accent)}
.lede{font-size:19px;color:var(--muted);max-width:56ch}
.cta-row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:4px}
.fine{font-size:13px;color:var(--muted);margin-top:-4px}
.hero-shot{margin:56px auto 0;border:1px solid var(--line);border-radius:18px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden;max-width:900px}
.shot-bar{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.shot-bar span{width:10px;height:10px;border-radius:50%;background:var(--line)}
.shot-body{display:flex;min-height:280px}
.shot-side{width:180px;padding:20px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.shot-main{flex:1;padding:20px}
.shot-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.mini{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--surface-2)}
.mini-k{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.mini-v{font-size:22px;font-weight:650;margin-top:4px}
.spark{height:26px;margin-top:10px;border-radius:6px;background:linear-gradient(90deg,var(--accent) 0%,color-mix(in srgb,var(--accent) 25%,transparent) 100%);opacity:.65}
.spark.alt{background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 40%,#8a8) 0%,transparent 100%)}
.sk{height:10px;border-radius:5px;background:color-mix(in srgb,var(--ink) 10%,transparent)}
.sk.strong{height:14px;width:70%}
.sk.short{width:45%}
.sk.chart{height:150px;border-radius:10px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 18%,transparent),transparent)}
.logos{border-block:1px solid var(--line);margin-top:24px;background:var(--surface)}
.logo-row{display:flex;flex-wrap:wrap;gap:36px;justify-content:center;padding:22px 0;font-weight:600;color:var(--muted);opacity:.75;font-size:14px;letter-spacing:.04em}
.section{padding:84px 0}
.section.alt{background:var(--surface);border-block:1px solid var(--line)}
h2{font-size:clamp(26px,3.4vw,38px);max-width:22ch}
.section-lede{color:var(--muted);margin-top:12px;max-width:60ch}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:36px}
.feature{padding:26px}
.num{font-variant-numeric:tabular-nums;font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.1em}
.feature h3{font-size:19px;margin:10px 0 8px}
.feature p{color:var(--muted);font-size:15px}
.how{display:grid;grid-template-columns:1.2fr .8fr;gap:44px;align-items:start}
.steps{margin:24px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:16px;color:var(--muted)}
.steps strong{color:var(--ink);display:block;margin-bottom:2px}
.quote{padding:26px;display:flex;flex-direction:column;gap:16px}
.q{font-size:19px;line-height:1.45}
.who{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted)}
.avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:700}
.stars{color:var(--accent);letter-spacing:.2em;font-size:13px}
.price-head{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}
.toggle{display:inline-flex;padding:4px;border-radius:999px;border:1px solid var(--line);background:var(--surface)}
.toggle button{border:0;background:transparent;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;color:var(--muted)}
.toggle button[aria-pressed="true"]{background:var(--surface-2);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.tiers{align-items:start}
.tier{padding:26px;display:flex;flex-direction:column;gap:10px}
.tier.featured{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.tag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.price{display:flex;align-items:baseline;gap:6px}
.price .amount{font-size:38px;font-weight:700;letter-spacing:-.03em}
.per{color:var(--muted);font-size:14px}
.tier-blurb{color:var(--muted);font-size:14px;min-height:42px}
.tier ul{list-style:none;margin:6px 0 14px;padding:0;display:flex;flex-direction:column;gap:8px;font-size:14px;color:var(--muted)}
.tier li::before{content:"✓";color:var(--accent);margin-right:8px;font-weight:700}
.narrow{max-width:760px}
.faq{margin-top:26px;display:flex;flex-direction:column;gap:8px}
details{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:16px 18px}
summary{cursor:pointer;font-weight:600}
details p{color:var(--muted);margin-top:10px;font-size:15px}
.cta-card{display:flex;justify-content:space-between;align-items:center;gap:28px;padding:34px;flex-wrap:wrap}
.cta-form{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cta-form .input{width:260px}
.cta-note{flex-basis:100%;font-size:13px;color:var(--success);min-height:20px}
.footer{border-top:1px solid var(--line);padding:26px 0;background:var(--surface)}
.foot-row{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.foot-row nav{display:flex;gap:18px}
.foot-row a{text-decoration:none}
@media (max-width:900px){
  .links,.bar-actions{display:none}
  .menu-btn{display:block}
  .grid-3{grid-template-columns:1fr}
  .how{grid-template-columns:1fr}
  .hero{padding-top:44px}
  .shot-side{display:none}
  .section{padding:56px 0}
  .cta-form .input{width:100%}
}
`;

    const js = `var menuBtn = document.querySelector(".menu-btn");
var mobileNav = document.getElementById("mobile-nav");
if (menuBtn && mobileNav) {
  menuBtn.addEventListener("click", function () {
    var open = menuBtn.getAttribute("aria-expanded") === "true";
    menuBtn.setAttribute("aria-expanded", String(!open));
    mobileNav.hidden = open;
  });
}

var toggle = document.querySelector(".toggle");
if (toggle) {
  toggle.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-period]");
    if (!button) return;
    var period = button.getAttribute("data-period");
    toggle.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b === button));
    });
    document.querySelectorAll(".amount").forEach(function (amount) {
      amount.textContent = "$" + amount.getAttribute(period === "year" ? "data-year" : "data-month");
    });
    document.querySelectorAll(".per").forEach(function (per) {
      per.textContent = period === "year" ? "/ month, billed yearly" : "/ month";
    });
  });
}

var form = document.querySelector(".cta-form");
if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var input = form.querySelector("input");
    var note = form.querySelector(".cta-note");
    if (!input.value || input.value.indexOf("@") < 0) {
      note.style.color = "var(--danger)";
      note.textContent = "That address is missing something.";
      input.focus();
      return;
    }
    note.style.color = "var(--success)";
    note.textContent = "Check your inbox — the invite is on its way to " + input.value + ".";
    form.reset();
  });
}

document.querySelectorAll(".faq details").forEach(function (item) {
  item.addEventListener("toggle", function () {
    if (!item.open) return;
    document.querySelectorAll(".faq details").forEach(function (other) {
      if (other !== item) other.open = false;
    });
  });
});
`;

    return {
      name,
      summary: ctx.summary,
      files: site(ctx, {
        title: name + " — " + ctx.headline,
        description: ctx.tagline,
        body,
        css,
        js
      })
    };
  }
};

export const dashboard = {
  key: "dashboard",
  label: "Dashboard",
  test: (p) => /dashboard|analytics|admin panel|metrics|stats|crm|reporting|back ?office|management system/.test(p),
  build(ctx) {
    const name = ctx.name;
    const rows = [
      ["Langford & Co", "Growth", "Active", "$12,480", "4m ago"],
      ["Meridian Labs", "Enterprise", "Active", "$8,900", "22m ago"],
      ["Fernway Supply", "Growth", "Trial", "$0", "1h ago"],
      ["Quarry Studio", "Starter", "Active", "$1,240", "3h ago"],
      ["Halstead Group", "Enterprise", "At risk", "$21,300", "yesterday"]
    ];
    const body = `<div class="shell">
      <aside class="side">
        <div class="side-top">
          <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        </div>
        <nav aria-label="Sections">
          ${["Overview", "Customers", "Revenue", "Reports", "Settings"]
            .map(
              (item, i) => `<a class="nav-item${i === 0 ? " active" : ""}" href="#${slug(item)}"${i === 0 ? ' aria-current="page"' : ""}>
            <span class="nav-dot" aria-hidden="true"></span>${item}
          </a>`
            )
            .join("\n          ")}
        </nav>
        <div class="side-foot">
          <div class="avatar big" aria-hidden="true">A</div>
          <div><p class="who-name">Avery Stone</p><p class="who-role">Owner</p></div>
        </div>
      </aside>
      <main class="main">
        <header class="main-head">
          <div>
            <p class="crumb">Workspace / Overview</p>
            <h1>Good morning, Avery</h1>
          </div>
          <div class="head-actions">
            <label class="sr" for="period">Period</label>
            <select id="period" class="input small">
              <option value="7">Last 7 days</option>
              <option value="30" selected>Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <button class="btn" type="button" id="export">Export</button>
          </div>
        </header>
        <section class="stats" aria-label="Key metrics">
          ${[
            ["Revenue", "$48,290", "+12.4%", "up"],
            ["Active customers", "1,284", "+3.1%", "up"],
            ["Churn", "1.8%", "-0.4%", "up"],
            ["Avg. deal", "$612", "-2.0%", "down"]
          ]
            .map(
              ([label, value, delta, dir]) => `<article class="card stat">
            <p class="stat-label">${label}</p>
            <p class="stat-value" data-stat="${label}">${value}</p>
            <p class="delta ${dir}">${delta} vs. previous period</p>
          </article>`
            )
            .join("\n          ")}
        </section>
        <section class="card chart-card">
          <div class="card-head">
            <h2>Revenue by week</h2>
            <p class="muted small-text">Net of refunds</p>
          </div>
          <svg class="chart" viewBox="0 0 640 220" role="img" aria-label="Revenue by week bar chart">
            <g class="grid">
              <line x1="0" y1="40" x2="640" y2="40"></line>
              <line x1="0" y1="90" x2="640" y2="90"></line>
              <line x1="0" y1="140" x2="640" y2="140"></line>
              <line x1="0" y1="190" x2="640" y2="190"></line>
            </g>
            <g class="bars">
              ${[52, 74, 61, 96, 82, 118, 104, 132]
                .map(
                  (h, i) =>
                    `<rect x="${16 + i * 78}" y="${190 - h}" width="44" height="${h}" rx="6" data-bar="${h}"></rect>`
                )
                .join("\n              ")}
            </g>
          </svg>
        </section>
        <section class="card table-card">
          <div class="card-head">
            <h2>Recent customers</h2>
            <a class="link" href="#customers">View all</a>
          </div>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th class="right">MRR</th><th class="right">Last activity</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (r, i) => `<tr>
                  <td><span class="avatar" aria-hidden="true">${r[0][0]}</span>${r[0]}</td>
                  <td>${r[1]}</td>
                  <td><span class="status ${slug(r[2])}">${r[2]}</span></td>
                  <td class="right num">${r[3]}</td>
                  <td class="right muted">${r[4]}</td>
                </tr>`
                  )
                  .join("\n                ")}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>`;

    const css = `
.shell{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
.side{border-right:1px solid var(--line);background:var(--surface);padding:20px 14px;display:flex;flex-direction:column;gap:22px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;padding:0 6px}
.mark{width:20px;height:20px;border-radius:6px;background:var(--accent)}
nav{display:flex;flex-direction:column;gap:2px}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;text-decoration:none;color:var(--muted);font-size:14px;font-weight:500}
.nav-item:hover{background:var(--surface-2);color:var(--ink)}
.nav-item.active{background:var(--surface-2);color:var(--ink);font-weight:600}
.nav-dot{width:6px;height:6px;border-radius:2px;background:currentColor;opacity:.4}
.nav-item.active .nav-dot{background:var(--accent);opacity:1}
.side-foot{margin-top:auto;display:flex;align-items:center;gap:10px;padding:10px 6px;border-top:1px solid var(--line)}
.who-name{font-size:13px;font-weight:600}
.who-role{font-size:12px;color:var(--muted)}
.avatar{width:26px;height:26px;border-radius:50%;display:inline-grid;place-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:700;margin-right:8px}
.avatar.big{width:32px;height:32px;font-size:13px}
.main{padding:28px 32px 60px;display:flex;flex-direction:column;gap:18px;min-width:0}
.main-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.crumb{font-size:12px;color:var(--muted);margin-bottom:6px;letter-spacing:.02em}
h1{font-size:26px}
.head-actions{display:flex;gap:10px;align-items:center}
.input.small{height:40px;width:auto;padding:0 34px 0 12px;font-size:13px;background:var(--surface)}
.input.small:focus{outline:2px solid var(--accent);outline-offset:1px}
.btn{height:40px;padding:0 16px;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.stat{padding:16px 18px}
.stat-label{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.stat-value{font-size:26px;font-weight:650;margin:6px 0 4px;letter-spacing:-.02em}
.delta{font-size:12px;color:var(--success)}
.delta.down{color:var(--danger)}
.chart-card{padding:20px}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
h2{font-size:17px}
.small-text{font-size:12px}
.chart{width:100%;height:236px}
.grid line{stroke:var(--line);stroke-width:1}
.bars rect{fill:var(--accent);opacity:.85;transition:height .3s ease,y .3s ease}
.table-card{padding:20px}
.link{color:var(--accent);font-size:13px;text-decoration:none;font-weight:600}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:620px}
th{text-align:left;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);padding:0 12px 10px;border-bottom:1px solid var(--line);font-weight:600}
td{padding:13px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--surface-2)}
.right{text-align:right}
.num{font-variant-numeric:tabular-nums}
.status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--surface-2);color:var(--muted)}
.status.active{color:var(--success);background:color-mix(in srgb,var(--success) 14%,transparent)}
.status.trial{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.status.at-risk{color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
@media (max-width:1000px){
  .shell{grid-template-columns:1fr}
  .side{position:static;height:auto;flex-direction:row;align-items:center;overflow-x:auto;gap:12px;border-right:0;border-bottom:1px solid var(--line)}
  .side nav{flex-direction:row}
  .side-foot{display:none}
  .stats{grid-template-columns:repeat(2,1fr)}
  .main{padding:20px 16px 48px}
}
@media (max-width:560px){.stats{grid-template-columns:1fr}}
`;

    const js = `var period = document.getElementById("period");
var FACTORS = { "7": 0.32, "30": 1, "90": 2.7 };
var BASE = { Revenue: 48290, "Active customers": 1284, Churn: 1.8, "Avg. deal": 612 };
var BARS = { "7": [38, 52, 44, 61, 58, 74, 66], "30": [52, 74, 61, 96, 82, 118, 104, 132], "90": [96, 118, 104, 132, 122, 150, 141, 168] };

function format(key, value) {
  if (key === "Churn") return value.toFixed(1) + "%";
  if (key === "Revenue") return "$" + Math.round(value).toLocaleString("en-US");
  return Math.round(value).toLocaleString("en-US");
}

function render(days) {
  var factor = FACTORS[days] || 1;
  var jitter = { Revenue: 1, "Active customers": 1, Churn: 1, "Avg. deal": 1 };
  Object.keys(BASE).forEach(function (key) {
    var el = document.querySelector('[data-stat="' + key + '"]');
    if (!el) return;
    var next = BASE[key] * (key === "Avg. deal" ? 1 : factor) * jitter[key];
    var text = format(key, key === "Churn" ? BASE[key] * (1 + (factor - 1) * 0.2) : next);
    el.textContent = text;
    el.animate([{ opacity: 0.3, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], 220);
  });

  var heights = BARS[days] || BARS["30"];
  var bars = document.querySelectorAll(".bars rect");
  bars.forEach(function (bar, index) {
    var value = heights[index % heights.length];
    bar.setAttribute("height", String(value));
    bar.setAttribute("y", String(190 - value));
  });
}

if (period) period.addEventListener("change", function () { render(period.value); });

var exportBtn = document.getElementById("export");
if (exportBtn) {
  exportBtn.addEventListener("click", function () {
    exportBtn.textContent = "Preparing…";
    exportBtn.disabled = true;
    setTimeout(function () {
      exportBtn.textContent = "Downloaded";
      setTimeout(function () {
        exportBtn.textContent = "Export";
        exportBtn.disabled = false;
      }, 1600);
    }, 900);
  });
}
`;

    return {
      name,
      summary: ctx.summary,
      files: site(ctx, { title: name + " — Dashboard", description: "Operations dashboard", body, css, js })
    };
  }
};

export const waitlist = {
  key: "waitlist",
  label: "Waitlist page",
  test: (p) => /waitlist|coming soon|early access|launch page|signup page|sign-up page|newsletter/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <div class="glow" aria-hidden="true"></div>
      <header class="top">
        <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        <p class="pill">Private beta</p>
      </header>
      <section class="hero">
        <h1>${esc(ctx.headline)} <span class="accent">${esc(ctx.headlineAccent)}</span></h1>
        <p class="lede">${esc(ctx.tagline)}</p>
        <form class="join" novalidate>
          <label class="sr" for="email">Email</label>
          <input class="input" id="email" type="email" placeholder="you@company.com" autocomplete="email" required />
          <button class="btn" type="submit">Get early access</button>
          <p class="note" role="status" aria-live="polite"></p>
        </form>
        <div class="proof">
          <div class="faces" aria-hidden="true"><span>A</span><span>K</span><span>M</span><span>J</span></div>
          <p><strong>1,204</strong> builders ahead of you · joining from 41 countries</p>
        </div>
      </section>
      <section class="grid">
        ${[
          ["Set it up in four minutes", "Connect what you already use. No migration project, no consultant."],
          ["Works while you sleep", "Background jobs keep the boring parts current, not your calendar."],
          ["Yours to leave", "Export everything as JSON or CSV whenever you like."]
        ]
          .map(
            ([t, d]) => `<article class="card">
          <h2>${esc(t)}</h2>
          <p>${esc(d)}</p>
        </article>`
          )
          .join("\n        ")}
      </section>
      <footer class="foot"><p>© 2026 ${esc(name)} · built with Anvel</p><a href="#privacy">Privacy</a></footer>
    </main>`;

    const css = `
.stage{position:relative;min-height:100vh;display:flex;flex-direction:column;padding:24px clamp(20px,5vw,64px) 32px;overflow:hidden}
.glow{position:absolute;inset:-30% -10% auto;height:70vh;background:radial-gradient(60% 60% at 50% 0%,color-mix(in srgb,var(--accent) 34%,transparent),transparent 70%);filter:blur(20px);pointer-events:none}
.top{display:flex;justify-content:space-between;align-items:center;position:relative}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}
.mark{width:22px;height:22px;border-radius:7px;background:var(--accent)}
.hero{position:relative;max-width:760px;margin:clamp(40px,10vh,120px) auto 0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:22px}
h1{font-size:clamp(36px,5.4vw,62px);letter-spacing:-.03em}
.accent{color:var(--accent)}
.lede{font-size:19px;color:var(--muted);max-width:52ch}
.join{display:flex;gap:10px;width:100%;max-width:520px;flex-wrap:wrap;justify-content:center}
.join .input{flex:1 1 260px;height:50px}
.join .btn{height:50px}
.note{flex-basis:100%;font-size:13px;min-height:18px;color:var(--success)}
.proof{display:flex;align-items:center;gap:12px;margin-top:8px;color:var(--muted);font-size:13px}
.faces{display:flex}
.faces span{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;background:var(--accent);border:2px solid var(--bg);margin-left:-8px}
.faces span:first-child{margin-left:0}
.faces span:nth-child(2){background:color-mix(in srgb,var(--accent) 60%,#000)}
.faces span:nth-child(3){background:color-mix(in srgb,var(--accent) 60%,#777)}
.faces span:nth-child(4){background:color-mix(in srgb,var(--accent) 40%,#555)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:clamp(48px,9vh,110px) auto 0;width:100%;max-width:980px}
.grid .card{padding:22px}
.grid h2{font-size:16px;margin-bottom:8px}
.grid p{color:var(--muted);font-size:14px}
.foot{margin-top:auto;padding-top:40px;display:flex;justify-content:space-between;font-size:12px;color:var(--muted);max-width:980px;width:100%;margin-inline:auto}
.foot a{text-decoration:none}
@media (max-width:820px){.grid{grid-template-columns:1fr}.top .pill{display:none}}
`;

    const js = `var form = document.querySelector(".join");
var note = document.querySelector(".note");
var input = document.getElementById("email");

if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = input.value.trim();
    var ok = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(value);
    if (!ok) {
      note.style.color = "var(--danger)";
      note.textContent = "That email looks incomplete — check it and try again.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    form.querySelector("button").disabled = true;
    form.querySelector("button").textContent = "Adding you…";
    setTimeout(function () {
      form.innerHTML = '<p class="joined" role="status">You are number <strong>1,205</strong>. We will email ' + value + " when your invite is ready.</p>";
      var joined = form.querySelector(".joined");
      if (joined) joined.style.cssText = "font-size:15px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;width:100%";
    }, 900);
  });
}
`;

    return {
      name,
      summary: ctx.summary,
      files: site(ctx, { title: name + " — early access", description: ctx.tagline, body, css, js })
    };
  }
};

export const pages = [landing, dashboard, waitlist];
