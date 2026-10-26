import { Auth, checkPassword, rpc } from "../api.js";
import { alert, badge, btn, checkbox, esc, field, link, onForm, svg } from "../ui.js";

const brand = `<p class="brandmark"><i>${svg("clap", 20)}</i>Film Set</p>`;

const steps = (n) =>
  `<div class="steps" aria-label="Step ${n} of 3">${[1, 2, 3].map((i) => `<span class="${i <= n ? "on" : ""}"></span>`).join("")}</div><p class="muted small">Step ${n} of 3</p>`;

const channelList = (labels) =>
  `<ul class="channels">${labels.map((l, i) => `<li><span class="cdot c${Math.min(i, 3)}"></span>${esc(l)}</li>`).join("")}</ul>`;

const codeInput = (name = "code") =>
  `<input class="code-input" name="${name}" required autocapitalize="characters" autocomplete="off" placeholder="ABC-123456" aria-label="Sign-up code">`;

export async function login({ go, film }) {
  return {
    html: `<main class="auth">${brand}
      <h1 class="big" style="margin-top:28px">Welcome back</h1>
      <p class="muted">Use the username and password you made when you joined.</p>
      <form id="f" class="stack">
        ${field("Username", "username", { attrs: 'autocomplete="username" autocapitalize="none"', required: true })}
        ${field("Password", "password", { type: "password", attrs: 'autocomplete="current-password"', required: true })}
        ${btn("Log in", "primary wide")}
      </form>
      <div class="foot">
        <a href="#/join"><b>I have a sign-up code</b></a>
        <p class="muted">Forgot your password? Ask the production office for a reset code, then enter it under <a href="#/join">sign-up code</a>.</p>
      </div></main>`,
    bind(root) {
      onForm(root, "#f", async (fd) => {
        await Auth.signIn(fd.get("username"), fd.get("password"));
        const mine = await rpc("my_films");
        const keep = mine.films.find((f) => f.filmId === film.id);
        if (keep) return go("home");
        if (mine.films.length === 1) {
          film.set(mine.films[0].filmId);
          return go("home");
        }
        film.set(null);
        go("films");
      });
    },
  };
}

export async function join({ go }) {
  return {
    html: `<main class="auth">${brand}${steps(1)}
      <h1 class="big">Enter your sign-up code</h1>
      <p class="muted">The production office gave you this code on WhatsApp or on a paper slip.</p>
      <form id="f" class="stack grow">
        <label class="field"><span>Your code</span>${codeInput()}</label>
        <p class="muted small center">Capital or small letters both work</p>
        <div class="grow"></div>
        ${btn("Next", "primary wide")}
        <a class="center" href="#/login"><b>I already have an account — Log in</b></a>
      </form></main>`,
    bind(root) {
      onForm(root, "#f", async (fd) => go(`join/${encodeURIComponent(fd.get("code").trim())}`));
    },
  };
}

export async function confirm({ params, go, film }) {
  const info = await rpc("code_info", { p_code: params.code });
  if (!info.ok) {
    return {
      html: `<main class="auth">${steps(1)}<h1 class="big">That code didn't work</h1>${alert(esc(info.reason), "", "danger")}<div class="grow"></div>${link("Try again", "#/join", "primary wide")}</main>`,
    };
  }
  if (info.purpose === "reset") {
    return {
      html: `<main class="auth"><h1 class="big">Set a new password</h1>
        <p class="muted">For ${esc(info.name)} (username <b>${esc(info.username)}</b>). This signs you out on other phones.</p>
        <form id="f" class="stack">
          ${field("New password", "password", { type: "password", hint: "At least 8 letters or numbers, with one number", required: true, attrs: 'autocomplete="new-password"' })}
          ${field("Type it again", "confirm", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}
          ${btn("Save password", "primary wide")}
        </form></main>`,
      bind(root) {
        onForm(root, "#f", async (fd) => {
          const err = checkPassword(fd.get("password"), fd.get("confirm"));
          if (err) throw new Error(err);
          const r = await rpc("reset_password", { p_code: info.code, p_password: fd.get("password") });
          await Auth.signIn(r.username, fd.get("password"));
          go("films");
        });
      },
    };
  }
  const initials = info.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const loggedIn = !!Auth.user;
  return {
    html: `<main class="auth">${steps(2)}
      <h1 class="big">Is this you?</h1>
      <section class="who">
        <div class="avatar">${esc(initials)}</div>
        <p class="who-name">${esc(info.name)}</p>
        <p>${esc(info.roleLabel)}${info.character ? ` · “${esc(info.character)}”` : ""}</p>
        <p class="muted">${info.department ? `${esc(info.department)} · ` : ""}${esc(info.film)}</p>
      </section>
      <section class="box">
        <p class="label">This code gives you access to</p>
        ${channelList(info.channels)}
        <p class="muted small">Nothing else. Only the production office can change this.</p>
      </section>
      <div class="grow"></div>
      ${
        loggedIn
          ? info.alreadyOnFilm
            ? alert(`You're already on ${esc(info.film)}.`, "", "info")
            : `<form id="add" class="stack"><p class="muted center small">You're logged in as <b>${esc(Auth.user.username)}</b>. This movie will be added to your account.</p>${btn("Yes — add this movie", "primary wide")}</form>`
          : link("Yes, that's me", `#/account/${encodeURIComponent(info.code)}`, "primary wide")
      }
      <a class="center pad" href="#/join"><b>No, this isn't me — call the production office</b></a>
    </main>`,
    bind(root) {
      onForm(root, "#add", async () => {
        const r = await rpc("claim_code", { p_code: info.code });
        film.set(r.filmId);
        go("home");
      });
    },
  };
}

export async function account({ params, go, film }) {
  const info = await rpc("code_info", { p_code: params.code });
  if (!info.ok || info.purpose !== "join") return { html: `<main class="auth">${alert(esc(info.reason || "This code can't be used."), "", "danger")}${link("Back", "#/join", "outline wide")}</main>` };
  return {
    html: `<main class="auth">${steps(3)}
      <h1 class="big">Make your login</h1>
      <p class="muted">You'll use these every time you open the app.</p>
      <form id="f" class="stack grow">
        ${field("Username", "username", { hint: "Small letters, numbers, dots or underscores — e.g. mani.lights", required: true, attrs: 'autocapitalize="none" autocomplete="username"' })}
        ${field("Password", "password", { type: "password", hint: "At least 8 letters or numbers, with one number", required: true, attrs: 'autocomplete="new-password"' })}
        ${field("Type the password again", "confirm", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}
        <div class="grow"></div>
        ${btn("Finish", "primary wide")}
      </form></main>`,
    bind(root) {
      onForm(root, "#f", async (fd) => {
        const err = checkPassword(fd.get("password"), fd.get("confirm"));
        if (err) throw new Error(err);
        // If the account was made on an earlier attempt, don't make it again — just claim the code.
        if (!Auth.user) await Auth.signUp(fd.get("username"), fd.get("password"));
        const r = await rpc("claim_code", { p_code: info.code });
        film.set(r.filmId);
        go("welcome");
      });
    },
  };
}

export async function welcome({ me }) {
  return {
    html: `<main class="page center-col">
      <div class="big-check">${svg("check", 52)}</div>
      <h1 class="big">You're in</h1>
      <p class="muted">Welcome to ${esc(me.film.title)}</p>
      <p class="tip">Add this app to your home screen (browser menu → <b>Add to Home screen</b>) so you can open it like an app, and check your Inbox for every change.</p>
      ${link("Open my call sheet", "#/home", "primary wide")}
    </main>`,
  };
}

export async function films({ go, film }) {
  const mine = await rpc("my_films");
  return {
    html: `<main class="auth">
      ${brand}<div class="row"><h1>Your movies</h1><button class="btn ghost small" id="out">Log out</button></div>
      <p class="muted">Logged in as ${esc(mine.username || Auth.user?.username)}</p>
      <div class="stack">
        ${mine.films.length ? "" : `<p class="empty">You're not on any movie right now. Add one with a code below.</p>`}
        ${mine.films
          .map(
            (f) => `<button class="film ${f.filmId === film.id ? "current" : ""}" data-film="${esc(f.filmId)}">
              <span><b>${esc(f.title)}</b><small>${esc(f.roleLabel)}${f.department ? ` · ${esc(f.department)}` : ""}${f.status === "wrapped" ? " · wrapped" : ""}</small></span>
              ${f.filmId === film.id ? '<em>OPEN NOW</em>' : f.unread ? `<b class="dot">${f.unread}</b>` : ""}</button>`,
          )
          .join("")}
      </div>
      <form id="add" class="addmovie stack">
        <p class="h">${svg("plus", 22)} Add another movie</p>
        <label class="muted" for="newcode">Enter the code from that movie's production office</label>
        ${codeInput().replace('name="code"', 'name="code" id="newcode"')}
        <p class="muted small">Each movie has its own code. Your login stays the same.</p>
        ${btn("Add movie", "primary wide")}
      </form>
      ${mine.isOwner ? `<a class="center pad" href="#/owner"><b>Company: create a new film</b></a>` : ""}
    </main>`,
    bind(root) {
      root.querySelectorAll("[data-film]").forEach((b) =>
        b.addEventListener("click", () => {
          film.set(b.dataset.film);
          go("home");
        }),
      );
      root.querySelector("#out").addEventListener("click", async () => {
        await Auth.signOut();
        film.set(null);
        go("login");
      });
      onForm(root, "#add", async (fd) => go(`join/${encodeURIComponent(fd.get("code").trim())}`));
    },
  };
}

export async function setup({ go, film }) {
  const needed = await rpc("setup_needed");
  if (!needed) return { html: `<main class="auth"><h1 class="big">Setup is done</h1><p class="muted">This page only works once.</p>${link("Log in", "#/login", "primary wide")}</main>` };
  return {
    html: `<main class="auth">${brand}
      <h1 class="big">First-time setup</h1>
      <p class="muted">Creates your company and your owner login. This page stops working once it's done.</p>
      <form id="f" class="stack">
        ${field("Setup code", "secret", { required: true, attrs: 'autocomplete="off"' })}
        ${field("Company name", "company", { required: true })}
        ${field("Your name", "name", { required: true })}
        ${field("Username", "username", { required: true, attrs: 'autocapitalize="none" autocomplete="username"' })}
        ${field("Password", "password", { type: "password", required: true, hint: "At least 8 letters or numbers, with one number", attrs: 'autocomplete="new-password"' })}
        ${field("Type the password again", "confirm", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}
        ${btn("Create my company", "primary wide")}
      </form></main>`,
    bind(root) {
      onForm(root, "#f", async (fd) => {
        const err = checkPassword(fd.get("password"), fd.get("confirm"));
        if (err) throw new Error(err);
        if (!Auth.user) await Auth.signUp(fd.get("username"), fd.get("password"));
        await rpc("setup_company", { p_secret: fd.get("secret").trim(), p_company: fd.get("company"), p_name: fd.get("name") });
        film.set(null);
        go("owner");
      });
    },
  };
}

export async function owner({ go, film }) {
  const mine = await rpc("my_films");
  if (!mine.isOwner) return { html: `<main class="auth">${alert("Only the company owner can open this page.", "", "danger")}${link("Your movies", "#/films", "outline wide")}</main>` };
  return {
    html: `<main class="auth">
      <a href="#/films"><b>← Your movies</b></a>
      <h1>${esc(mine.company)}</h1>
      <section class="card"><p class="label">Films</p>${
        mine.ownedFilms.length ? mine.ownedFilms.map((f) => `<div class="line"><span>${esc(f.title)}</span>${badge(f.status)}</div>`).join("") : `<p class="muted">No films yet.</p>`
      }</section>
      <section class="card"><h2>Create a new film</h2>
        <form id="f" class="stack">
          ${field("Film title", "title", { required: true })}
          ${checkbox("I am the producer on this film", "me", true)}
          ${field("Producer's name (if it's someone else)", "producer", { hint: "They get a sign-up code to join as producer" })}
          ${btn("Create film", "primary wide")}
        </form>
      </section></main>`,
    bind(root) {
      onForm(root, "#f", async (fd) => {
        const meProducer = fd.get("me") === "on";
        const r = await rpc("create_film", { p_title: fd.get("title"), p_owner_is_producer: meProducer, p_producer_name: fd.get("producer") || null });
        if (meProducer) {
          film.set(r.filmId);
          go("home");
          return;
        }
        return `Film created. Producer's sign-up code: ${r.code} (works once, for 7 days).`;
      });
    },
  };
}
