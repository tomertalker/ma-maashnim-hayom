// Backend tests. They call the functions the way the app does (through the
// local REST stand-in, as the anon role) against a real Postgres.
//   node test/local_api.mjs &   then   node test/db_test.mjs
import { execFileSync } from "node:child_process";

const API = process.env.API_URL || "http://127.0.0.1:54330";
const PSQL = ["-h", "127.0.0.1", "-p", process.env.PGPORT || "54329", "-U", "postgres", "-d", "mmh", "-At", "-v", "ON_ERROR_STOP=1"];
const sql = q => execFileSync("psql", [...PSQL, "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let IP = "10.0.0.1";   // the network address the next calls appear to come from
const rpc = async (fn, args = {}, ip = IP) => {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST",
    headers: { apikey: "test", "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json() };
};
const call = async (fn, args, ip) => (await rpc(fn, args, ip)).body;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  ok  ", name); } else { fail++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); } };

// start and end markers + padding is enough for the server-side checks
const jpegBuf = (n, extra) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), extra || Buffer.alloc(0), Buffer.alloc(Math.max(100, n), 7), Buffer.from([0xff, 0xd9])]);
const jpeg = (n, extra) => jpegBuf(n, extra).toString("base64");

sql(`truncate mmh_flags, mmh_photos, mmh_reviews, mmh_sessions, mmh_login_attempts, mmh_rate, mmh_patients, mmh_products cascade;
     delete from mmh_settings where key in ('admin_key_hash'); update mmh_settings set value='null' where key='invite_code';`);

console.log("access");
for (const t of ["mmh_patients", "mmh_reviews", "mmh_photos", "mmh_products", "mmh_sessions", "mmh_settings", "mmh_flags"]) {
  let denied = false; try { sql(`set role anon; select count(*) from ${t}`); } catch { denied = true; }
  ok(`anon cannot read ${t}`, denied);
}
const NOARGS = { mmh__auth: { p_token: "x" }, mmh__new_session: { p_patient: "00000000-0000-0000-0000-000000000000" }, mmh__setting: { p_key: "invite_code" },
  mmh__ip_hash: {}, mmh__check_pass: { p_id: "00000000-0000-0000-0000-000000000000", p_pass: "x" }, mmh__rate: { p_kind: "x", p_limit: 1, p_window: "1 hour" },
  mmh_admin_set_key: { p_key: "0123456789abcdefgh" }, mmh_admin_reset_password: { p_nick: "a", p_new: "bbbbbbbb" }, mmh_admin_set_invite: { p_code: "x" },
  mmh_admin_unhide: { p_review_id: "00000000-0000-0000-0000-000000000000" }, mmh_admin_overview: {} };
for (const [f, a] of Object.entries(NOARGS)) {
  const r = await rpc(f, a);
  ok(`anon cannot call ${f}`, r.status === 404 && r.body.code === "42501", r);
}
ok("only the 19 intended functions are callable by anon", sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'mmh%' and has_function_privilege('anon', p.oid, 'execute')`) === "19");

console.log("sign up and sign in");
ok("free nickname", (await call("mmh_nick_available", { p_nick: "דני" })).available === true);
ok("nickname too short", (await call("mmh_nick_available", { p_nick: "א" })).error === "nick_invalid");
ok("nickname with @", (await call("mmh_signup", { p_nick: "a@b.c", p_pass: "secret1" })).error === "nick_invalid");
ok("short password", (await call("mmh_signup", { p_nick: "דני", p_pass: "123" })).error === "pass_invalid");
const A = await call("mmh_signup", { p_nick: "  דני  ", p_pass: "secret1" });
ok("sign up returns a token", A.ok && A.token.length === 64 && A.nick === "דני", A);
ok("nickname now taken", (await call("mmh_nick_available", { p_nick: "דני" })).available === false);
ok("same nickname refused", (await call("mmh_signup", { p_nick: "דני", p_pass: "other12" })).error === "nick_taken");
ok("case and spaces do not make a new nickname", (await call("mmh_signup", { p_nick: "Green  Leaf", p_pass: "secret1" })).ok
  && (await call("mmh_signup", { p_nick: "green leaf", p_pass: "secret1" })).error === "nick_taken");
ok("wrong password", (await call("mmh_login", { p_nick: "דני", p_pass: "nope12" })).error === "bad_login");
ok("unknown nickname gives the same error", (await call("mmh_login", { p_nick: "אין כזה", p_pass: "nope12" })).error === "bad_login");
const A2 = await call("mmh_login", { p_nick: "דני", p_pass: "secret1" });
ok("second device signs in with the same nickname", A2.ok && A2.token !== A.token);
ok("password is stored hashed", sql(`select pass_hash like '$2a$%' and pass_hash not like '%secret1%' from mmh_patients where nick='דני'`) === "t");
ok("token is stored hashed", sql(`select count(*) from mmh_sessions where encode(token_hash,'hex') = '${A.token}'`) === "0");
ok("bad token", (await call("mmh_me", { p_token: "x".repeat(64) })).error === "auth");
ok("null token", (await call("mmh_me", { p_token: null })).error === "auth");

console.log("lockout");
await call("mmh_signup", { p_nick: "lockme", p_pass: "secret1" });
for (let i = 0; i < 8; i++) await call("mmh_login", { p_nick: "lockme", p_pass: "wrong-pass" });
ok("locked after 8 wrong passwords", (await call("mmh_login", { p_nick: "lockme", p_pass: "secret1" })).error === "locked");
ok("admin reset unlocks", sql(`select mmh_admin_reset_password('lockme','newpass1')`) === "ok"
  && (await call("mmh_login", { p_nick: "lockme", p_pass: "newpass1" })).ok === true);

console.log("invite code");
sql(`select mmh_admin_set_invite('Ultra')`);
ok("sign up without the code refused", (await call("mmh_signup", { p_nick: "nocode", p_pass: "secret1" })).error === "invite_required");
ok("sign up with the code", (await call("mmh_signup", { p_nick: "withcode", p_pass: "secret1", p_invite: " ultra " })).ok === true);
sql(`select mmh_admin_set_invite(null)`);

console.log("card");
ok("no card yet", (await call("mmh_me", { p_token: A.token })).card === null);
ok("incomplete card refused", (await call("mmh_save_card", { p_token: A.token, p_card: { age: "25-34", uses: [] } })).error === "card_incomplete");
const card = { age: "35-44", sex: "m", years: "1-3", grams: "30", license: ["T22/C4", "bogus"], uses: ["pain", "sleep", "hack"],
  times: ["evening", "night"], flavors: ["citrus"], avoid: ["anxiety"], budget: 300, budget_hard: false, name: "Real Name", phone: "050" };
const me = await call("mmh_save_card", { p_token: A.token, p_card: card, p_share: true, p_share_context: true });
ok("card saved", me.ok && me.card.age === "35-44" && me.share_default === true && me.share_context_default === true, me);
ok("unknown keys and values dropped", !("name" in me.card) && !("phone" in me.card) && me.card.license.length === 1 && me.card.uses.length === 2, me.card);
const me2 = await call("mmh_save_card", { p_token: A.token, p_card: { ...card, grams: "40" } });
ok("card can be edited, sharing choice kept", me2.card.grams === "40" && me2.share_default === true);

console.log("catalogue");
const products = [
  { id: "lakota", he: "לקוטה", en: "Lakota", cat: "T22/C4", type: "flower", cls: "indica", price: 250 },
  { id: "rs11", he: "אר אס 11", en: "RS11", cat: "T22/C4", type: "flower", cls: "hybrid", price: 320 },
  { id: "old-one", he: "ישן", en: "Old", cat: "T22/C4", type: "flower", cls: "sativa", price: 200 },
];
ok("loader refused before a key is set", (await call("mmh_admin_load_catalog", { p_key: "whatever-key-123456", p_products: products })).error === "admin_key");
ok("short admin key refused", sql(`select mmh_admin_set_key('short')`) !== "ok");
sql(`select mmh_admin_set_key('pilot-admin-key-0001')`);
ok("loader refused with a wrong key", (await call("mmh_admin_load_catalog", { p_key: "pilot-admin-key-0002", p_products: products })).error === "admin_key");
const L1 = await call("mmh_admin_load_catalog", { p_key: "pilot-admin-key-0001", p_products: products, p_fetched_at: "2026-10-11T10:00:00Z" });
ok("catalogue loaded", L1.ok && L1.active === 3, L1);
ok("catalogue needs a session", (await call("mmh_catalog", { p_token: "nope" })).error === "auth");
const cat = await call("mmh_catalog", { p_token: A.token });
ok("catalogue returned to a signed-in patient", cat.products.length === 3 && cat.fetched_at.startsWith("2026-10-11"));

console.log("reviews");
ok("unknown product refused", (await call("mmh_save_review", { p_token: A.token, p_review: { product_id: "nope", verdict: "like" } })).error === "product_unknown");
ok("no product refused", (await call("mmh_save_review", { p_token: A.token, p_review: { verdict: "like" } })).error === "product_missing");
const R1 = await call("mmh_save_review", { p_token: A.token, p_review: { product_id: "lakota", verdict: "like", stars: 5,
  helped: ["pain", "sleep", "bogus"], bothered: ["dry_mouth"], note: "  עוזר לי לישון  ", source: "reco", publish: true, share_context: true } });
ok("review created", R1.ok && R1.created && R1.review.verdict === "like" && R1.review.helped.length === 2 && R1.review.note === "עוזר לי לישון", R1);
const R1b = await call("mmh_save_review", { p_token: A.token, p_review: { product_id: "lakota", stars: 4 } });
ok("same product updates the same review", R1b.ok && !R1b.created && R1b.review.id === R1.review.id && R1b.review.stars === 4 && R1b.review.verdict === "like" && R1b.review.publish === true);
const R1c = await call("mmh_save_review", { p_token: A.token, p_review: { id: R1.review.id, bought: true } });
ok("bought again counts", R1c.review.buys === 2);
const R2 = await call("mmh_save_review", { p_token: A.token, p_review: { product_id: "rs11", verdict: "dislike", bothered: ["anxiety"], publish: false, share_context: true } });
ok("private review: context cannot be shared without publishing", R2.review.publish === false && R2.review.share_context === false);
const R3 = await call("mmh_save_review", { p_token: A.token, p_review: { product_name: "זן מחבר", verdict: "unsure", publish: true } });
ok("free-text strain", R3.ok && R3.review.product_id === null && R3.review.product_name === "זן מחבר");
const R4 = await call("mmh_save_review", { p_token: A.token, p_review: { product_id: "old-one", source: "reco", publish: true } });
ok("purchase without a verdict yet", R4.ok && R4.review.verdict === null);
ok("my reviews", (await call("mmh_my_reviews", { p_token: A.token })).reviews.length === 4);

console.log("second patient and the feed");
const B = await call("mmh_signup", { p_nick: "מיכל", p_pass: "secret2" });
await call("mmh_save_card", { p_token: B.token, p_card: { age: "25-34", uses: ["sleep"], grams: "20" }, p_share: true });
ok("B cannot edit A's review", (await call("mmh_save_review", { p_token: B.token, p_review: { id: R1.review.id, verdict: "dislike" } })).error === "not_found");
ok("B cannot delete A's review", (await call("mmh_delete_review", { p_token: B.token, p_id: R1.review.id })).error === "not_found");
ok("B has no reviews of their own", (await call("mmh_my_reviews", { p_token: B.token })).reviews.length === 0);
const feed = (await call("mmh_feed", { p_token: B.token })).items;
ok("feed shows only published reviews", feed.length === 3 && !feed.some(i => i.product_id === "rs11"), feed.map(i => i.product_id));
const fl = feed.find(i => i.product_id === "lakota");
ok("feed item has the review", fl.verdict === "like" && fl.stars === 4 && fl.buys === 2 && fl.note === "עוזר לי לישון" && fl.mine === false);
ok("context shown only when chosen", fl.ctx && fl.ctx.uses.includes("pain") && fl.ctx.grams === "40" && feed.find(i => i.product_name === "זן מחבר").ctx === null);
const allowed = ["id", "product_id", "product_name", "verdict", "stars", "helped", "bothered", "note", "source", "buys", "month", "photos", "ctx", "mine"];
ok("feed fields are whitelisted", feed.every(i => Object.keys(i).every(k => allowed.includes(k))) && /^\d{4}-\d{2}$/.test(fl.month), Object.keys(fl));
ok("no nickname, patient id or timestamp anywhere in the feed", !JSON.stringify(feed).includes("דני") && !/patient|created_at|updated_at|feed_at|T\d\d:\d\d/.test(JSON.stringify(feed)));
ok("context never carries age or sex", !("age" in fl.ctx) && !("sex" in fl.ctx), fl.ctx);
ok("feed filter by verdict", (await call("mmh_feed", { p_token: B.token, p_kind: "like" })).items.length === 1);
ok("feed filter by product", (await call("mmh_feed", { p_token: B.token, p_product_id: "old-one" })).items.length === 1);
ok("feed 'like me' needs a shared indication", (await call("mmh_feed", { p_token: B.token, p_like_me: true })).items.length === 1);
ok("A sees their own items marked", (await call("mmh_feed", { p_token: A.token })).items.every(i => i.mine === true));
ok("paging", (await call("mmh_feed", { p_token: B.token, p_limit: 2 })).items.length === 2 && (await call("mmh_feed", { p_token: B.token, p_offset: 2, p_limit: 2 })).items.length === 1);
const st = (await call("mmh_stats", { p_token: B.token })).stats;
ok("community counts", st.lakota.like === 1 && st.lakota.like_me === 1 && !("rs11" in st), st);
ok("own reviews are not counted as community", Object.keys((await call("mmh_stats", { p_token: A.token })).stats).length === 0);

console.log("unpublish");
const R1u = await call("mmh_save_review", { p_token: A.token, p_review: { id: R1.review.id, publish: false, share_context: false } });
ok("a review shown with context can be taken out of the feed", R1u.ok && R1u.review.publish === false && R1u.review.share_context === false, R1u);
const R1p = await call("mmh_save_review", { p_token: A.token, p_review: { id: R1.review.id, publish: true, share_context: true } });
ok("and put back, with its context", R1p.ok && R1p.review.publish && R1p.review.share_context, R1p);
const R1q = await call("mmh_save_review", { p_token: A.token, p_review: { id: R1.review.id, publish: false } });
ok("unpublishing without mentioning context also works", R1q.ok && !R1q.review.share_context, R1q);
await call("mmh_save_review", { p_token: A.token, p_review: { id: R1.review.id, publish: true, share_context: true } });
await call("mmh_save_review", { p_token: A.token, p_review: { id: R3.review.id, publish: false } });
ok("unpublished review leaves the feed", (await call("mmh_feed", { p_token: B.token })).items.length === 2);

console.log("photos");
ok("not a jpeg refused", (await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: Buffer.from("hello world").toString("base64"), p_thumb: jpeg(100) })).error === "photo_invalid");
ok("too big refused", (await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: jpeg(700000), p_thumb: jpeg(100) })).error === "photo_too_big");
ok("B cannot add a photo to A's review", (await call("mmh_add_photo", { p_token: B.token, p_review_id: R1.review.id, p_full: jpeg(1000), p_thumb: jpeg(100) })).error === "not_found");
const P1 = await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: jpeg(300000), p_thumb: jpeg(8000), p_w: 1280, p_h: 960 });
ok("photo saved", P1.ok && !!P1.id, P1);
const P2 = await call("mmh_add_photo", { p_token: A.token, p_review_id: R2.review.id, p_full: jpeg(1000), p_thumb: jpeg(100) });
await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: jpeg(1000), p_thumb: jpeg(100) });
await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: jpeg(1000), p_thumb: jpeg(100) });
ok("at most 3 photos per review", (await call("mmh_add_photo", { p_token: A.token, p_review_id: R1.review.id, p_full: jpeg(1000), p_thumb: jpeg(100) })).error === "photo_limit");
const got = await call("mmh_photo", { p_token: B.token, p_id: P1.id, p_size: "full" });
ok("B can open a photo of a published review, bytes intact", got.ok && Buffer.from(got.jpeg, "base64").length === 300006 && !got.jpeg.includes("\n"));
ok("B cannot open a photo of a private review", (await call("mmh_photo", { p_token: B.token, p_id: P2.id })).error === "not_found");
ok("A can open their own private photo", (await call("mmh_photo", { p_token: A.token, p_id: P2.id })).ok === true);
ok("feed lists the photo ids", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items[0].photos.length === 3);
ok("B cannot delete A's photo", (await call("mmh_delete_photo", { p_token: B.token, p_id: P1.id })).error === "not_found");

console.log("flags and moderation");
ok("flag accepted", (await call("mmh_flag", { p_token: B.token, p_review_id: R1.review.id, p_reason: "שם מלא בתמונה" })).ok === true);
ok("cannot flag a private review", (await call("mmh_flag", { p_token: B.token, p_review_id: R2.review.id })).error === "not_found");
ok("one flag does not hide", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items.length === 1);
const C = await call("mmh_signup", { p_nick: "flag2", p_pass: "secret3" }, "10.0.0.2"), D = await call("mmh_signup", { p_nick: "flag3", p_pass: "secret3" }, "10.0.0.3");
const N = await call("mmh_signup", { p_nick: "fresh1", p_pass: "secret3" }, "10.0.0.4");
for (const t of [C, D, N]) await call("mmh_save_card", { p_token: t.token, p_card: { age: "25-34", uses: ["sleep"] } });
await call("mmh_flag", { p_token: C.token, p_review_id: R1.review.id });
await call("mmh_flag", { p_token: N.token, p_review_id: R1.review.id });
ok("flags from brand-new accounts do not hide", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items.length === 1);
sql(`update mmh_patients set created_at = now() - interval '2 days' where nick in ('מיכל','flag2','flag3')`);
await call("mmh_flag", { p_token: B.token, p_review_id: R1.review.id });
ok("the same patient flagging twice counts once", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items.length === 1);
await call("mmh_flag", { p_token: D.token, p_review_id: R1.review.id });
ok("three established patients flagging hides the review", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items.length === 0);
ok("a hidden review's photo is closed to others", (await call("mmh_photo", { p_token: B.token, p_id: P1.id })).error === "not_found");
ok("the writer still sees it, marked hidden", (await call("mmh_my_reviews", { p_token: A.token })).reviews.find(r => r.id === R1.review.id).hidden === true);
ok("Tomer puts it back", sql(`select mmh_admin_unhide('${R1.review.id}')`) === "ok" && sql(`select count(*) from mmh_flags where review_id='${R1.review.id}'`) === "0");
for (const t of [B, C, D]) await call("mmh_flag", { p_token: t.token, p_review_id: R1.review.id });
ok("once put back, new flags do not hide it again", (await call("mmh_feed", { p_token: B.token, p_product_id: "lakota" })).items.length === 1);

console.log("catalogue refresh");
const L2 = await call("mmh_admin_load_catalog", { p_key: "pilot-admin-key-0001", p_products: products.slice(0, 2).map(p => ({ ...p, price: p.price + 10 })) });
ok("missing product turns inactive, not deleted", L2.active === 2 && L2.inactive === 1, L2);
ok("price updated", (await call("mmh_catalog", { p_token: A.token })).products.find(p => p.id === "lakota").price === 260);
ok("review of a delisted product survives", (await call("mmh_my_reviews", { p_token: A.token })).reviews.some(r => r.product_id === "old-one"));

console.log("password change, sign out, delete");
ok("change password needs the old one", (await call("mmh_change_password", { p_token: A.token, p_old: "wrong11", p_new: "newpass9" })).error === "bad_login");
ok("password changed", (await call("mmh_change_password", { p_token: A.token, p_old: "secret1", p_new: "newpass9" })).ok === true);
ok("other devices are signed out", (await call("mmh_me", { p_token: A2.token })).error === "auth" && (await call("mmh_me", { p_token: A.token })).ok === true);
ok("old password no longer works", (await call("mmh_login", { p_nick: "דני", p_pass: "secret1" })).error === "bad_login");
const A3 = await call("mmh_login", { p_nick: "דני", p_pass: "newpass9" });
ok("new phone: same nickname brings the card and reviews back", A3.ok && (await call("mmh_me", { p_token: A3.token })).card.grams === "40" && (await call("mmh_my_reviews", { p_token: A3.token })).reviews.length === 4);
await call("mmh_logout", { p_token: A3.token });
ok("signed-out token is dead", (await call("mmh_me", { p_token: A3.token })).error === "auth");
sql(`update mmh_sessions set expires_at = now() - interval '1 minute' where patient_id = (select id from mmh_patients where nick='מיכל')`);
ok("expired session is refused", (await call("mmh_me", { p_token: B.token })).error === "auth");
ok("delete account needs the password", (await call("mmh_delete_account", { p_token: A.token, p_pass: "nope11" })).error === "bad_login");
ok("account deleted", (await call("mmh_delete_account", { p_token: A.token, p_pass: "newpass9" })).ok === true);
ok("everything the patient wrote is gone", sql(`select (select count(*) from mmh_reviews r join mmh_patients p on p.id=r.patient_id where p.nick='דני') + (select count(*) from mmh_photos) + (select count(*) from mmh_patients where nick='דני')`) === "0");
ok("the nickname is free again", (await call("mmh_nick_available", { p_nick: "דני" })).available === true);
ok("overview for Tomer", sql(`select patients > 0 and products = 2 and photos = 0 from mmh_admin_overview()`) === "t");


console.log("hardening");
sql(`truncate mmh_flags, mmh_photos, mmh_reviews, mmh_sessions, mmh_login_attempts, mmh_rate, mmh_patients cascade`);
// nicknames that look the same are the same nickname
const H = await call("mmh_signup", { p_nick: "Dani", p_pass: "secret11" });
for (const [label, n] of [["zero-width space", "Da​ni"], ["direction mark", "‏Dani"], ["no-break space", "Dani "], ["tab", "\tDani"], ["fullwidth letters", "Ｄａｎｉ"], ["soft hyphen", "Da­ni"]]) {
  ok(`look-alike nickname is taken (${label})`, (await call("mmh_nick_available", { p_nick: n })).available === false);
}
ok("Cyrillic look-alike is refused", (await call("mmh_nick_available", { p_nick: "Dаni" })).error === "nick_invalid");
ok("invisible-only nickname is refused", (await call("mmh_signup", { p_nick: "​​", p_pass: "secret11" })).error === "nick_invalid");
ok("the patient signs in with the plain spelling", (await call("mmh_login", { p_nick: " dani ", p_pass: "secret11" })).ok === true);
ok("common password refused", (await call("mmh_signup", { p_nick: "user1", p_pass: "123456" })).error === "pass_invalid");
ok("password equal to the nickname refused", (await call("mmh_signup", { p_nick: "tree house", p_pass: "TREE HOUSE" })).error === "pass_invalid");
ok("password over 72 bytes refused (bcrypt would ignore the rest)", (await call("mmh_signup", { p_nick: "user2", p_pass: "א".repeat(40) })).error === "pass_invalid");
ok("a 20,000-character nickname is just a failed login", (await call("mmh_login", { p_nick: "x".repeat(20000), p_pass: "secret11" })).error === "bad_login");

// lockout is per network address; a stranger cannot lock the owner out
for (let i = 0; i < 8; i++) await call("mmh_login", { p_nick: "dani", p_pass: "wrong-pass" }, "10.9.9.9");
ok("8 wrong passwords lock that address", (await call("mmh_login", { p_nick: "dani", p_pass: "secret11" }, "10.9.9.9")).error === "locked");
ok("the owner on another address still gets in", (await call("mmh_login", { p_nick: "dani", p_pass: "secret11" }, "10.1.1.1")).ok === true);
const race = await Promise.all(Array.from({ length: 30 }, () => call("mmh_login", { p_nick: "dani", p_pass: "wrong-pass" }, "10.8.8.8")));
ok("parallel guesses cannot exceed the 8 allowed", race.filter(r => r.error === "bad_login").length === 8, race.filter(r => r.error === "bad_login").length);
for (let i = 0; i < 30; i++) await call("mmh_login", { p_nick: "dani", p_pass: "wrong-pass" }, "10.7." + i + ".1");
ok("30 wrong passwords from many addresses lock the nickname for an hour", (await call("mmh_login", { p_nick: "dani", p_pass: "secret11" }, "10.1.1.1")).error === "locked");
ok("admin reset clears every lock", sql(`select mmh_admin_reset_password('dani','secret12')`) === "ok" && (await call("mmh_login", { p_nick: "dani", p_pass: "secret12" }, "10.9.9.9")).ok === true);
const H2 = await call("mmh_login", { p_nick: "dani", p_pass: "secret12" });
for (let i = 0; i < 8; i++) await call("mmh_change_password", { p_token: H2.token, p_old: "guess-" + i, p_new: "newpass-1" });
ok("guessing the password inside a session locks too", (await call("mmh_change_password", { p_token: H2.token, p_old: "secret12", p_new: "newpass-1" })).error === "locked");

// sign-up flooding
sql(`update mmh_settings set value='3' where key='signup_hourly_per_ip'`);
const flood = [];
for (let i = 0; i < 5; i++) flood.push(await call("mmh_signup", { p_nick: "flood" + i, p_pass: "secret11" }, "10.5.5.5"));
ok("one address can open only so many accounts an hour", flood.filter(r => r.ok).length === 3 && flood.slice(3).every(r => r.error === "busy"), flood.map(r => r.error || "ok"));
ok("other addresses are not affected", (await call("mmh_signup", { p_nick: "neighbour", p_pass: "secret11" }, "10.6.6.6")).ok === true);
sql(`update mmh_settings set value='40' where key='signup_hourly_per_ip'`);
sql(`select mmh_admin_set_invite('k7-ultra-q2')`);
const inv = [];
for (let i = 0; i < 22; i++) inv.push((await call("mmh_signup", { p_nick: "guess" + i, p_pass: "secret11", p_invite: "code" + i }, "10.4.4.4")).error);
ok("guessing the invite code is cut off", inv.slice(0, 20).every(e => e === "invite_required") && inv.slice(20).every(e => e === "busy"), inv.slice(18));
sql(`select mmh_admin_set_invite(null)`);

// input that used to raise
const Hc = (await call("mmh_login", { p_nick: "neighbour", p_pass: "secret11" })).token;
ok("absurd budget is clamped, not an error", (await call("mmh_save_card", { p_token: Hc, p_card: { age: "25-34", uses: ["sleep"], budget: 1e12, budget_hard: "yes" } })).card.budget === 1000);
sql(`insert into mmh_products(id, data) values ('x1', '{"id":"x1","he":"זן איקס","type":"flower"}') on conflict do nothing`);
const odd = await call("mmh_save_review", { p_token: Hc, p_review: { product_id: "x1", stars: 99999999999, publish: "yes please", share_context: {}, bought: 5, verdict: "like" } });
ok("odd types are ignored, not an error", odd.ok && odd.review.stars === 5 && odd.review.publish === false, odd);
const same = await Promise.all(Array.from({ length: 8 }, () => call("mmh_save_review", { p_token: Hc, p_review: { product_name: "זן של חבר", verdict: "like" } })));
ok("8 parallel first saves of one strain give one review, no error", same.every(r => r.ok) && new Set(same.map(r => r.review.id)).size === 1, same.map(r => r.error));
ok("the same free-text name, other case, is the same review", (await call("mmh_save_review", { p_token: Hc, p_review: { product_name: "  זן של חבר ", stars: 2 } })).review.id === same[0].review.id);
ok("control characters are removed from notes", (await call("mmh_save_review", { p_token: Hc, p_review: { product_id: "x1", note: "שלום\u0007עולם" } })).review.note === "שלוםעולם");

// publishing needs a card
const nocard = await call("mmh_signup", { p_nick: "nocard", p_pass: "secret11" });
ok("no card, no publishing", (await call("mmh_save_review", { p_token: nocard.token, p_review: { product_id: "x1", verdict: "like", publish: true } })).error === "card_incomplete"
  && sql(`select count(*) from mmh_reviews r join mmh_patients p on p.id=r.patient_id where p.nick='nocard'`) === "0");

// quotas
sql(`update mmh_settings set value='3' where key='reviews_daily_cap'`);
const q = [];
for (let i = 0; i < 5; i++) q.push((await call("mmh_save_review", { p_token: Hc, p_review: { product_name: "flood " + i, verdict: "like" } })).error || "ok");
ok("new reviews per day are capped", q.filter(x => x === "ok").length === 1 && q.slice(1).every(x => x === "too_many"), q);
ok("editing an existing review is not capped", (await call("mmh_save_review", { p_token: Hc, p_review: { product_id: "x1", stars: 3 } })).ok === true);
sql(`update mmh_settings set value='30' where key='reviews_daily_cap'`);

// photos
const rid = odd.review.id;
ok("a JPEG that still has EXIF is refused", (await call("mmh_add_photo", { p_token: Hc, p_review_id: rid, p_full: jpeg(500, Buffer.from("\xff\xe1\x00\x10Exif\x00\x00GPS", "latin1")), p_thumb: jpeg(100) })).error === "photo_invalid");
ok("a JPEG with an XMP block is refused", (await call("mmh_add_photo", { p_token: Hc, p_review_id: rid, p_full: jpeg(500, Buffer.from("http://ns.adobe.com/xap/1.0/")), p_thumb: jpeg(100) })).error === "photo_invalid");
ok("a cut-off JPEG is refused", (await call("mmh_add_photo", { p_token: Hc, p_review_id: rid, p_full: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("<html><script>x</script>"), Buffer.alloc(200)]).toString("base64"), p_thumb: jpeg(100) })).error === "photo_invalid");
ok("missing photo data is refused", (await call("mmh_add_photo", { p_token: Hc, p_review_id: rid, p_full: null, p_thumb: null })).error === "photo_invalid");
const up = await Promise.all(Array.from({ length: 12 }, () => call("mmh_add_photo", { p_token: Hc, p_review_id: rid, p_full: jpeg(1000), p_thumb: jpeg(100) })));
ok("12 parallel uploads still stop at 3", up.filter(r => r.ok).length === 3 && sql(`select count(*) from mmh_photos where review_id='${rid}'`) === "3", up.filter(r => r.ok).length);
sql(`update mmh_settings set value='4' where key='photos_total_cap'`);
const other = (await call("mmh_save_review", { p_token: Hc, p_review: { product_name: "עוד זן", verdict: "like" } })).review.id;
const tot = [];
for (let i = 0; i < 3; i++) tot.push((await call("mmh_add_photo", { p_token: Hc, p_review_id: other, p_full: jpeg(1000), p_thumb: jpeg(100) })).error || "ok");
ok("photos per patient are capped", tot.join() === "ok,too_many,too_many", tot);
sql(`update mmh_settings set value='60' where key='photos_total_cap'`);

// what the feed shows
await call("mmh_save_card", { p_token: Hc, p_card: { age: "25-34", uses: ["sleep", "pain"], grams: "30", license: ["T22/C4"] }, p_share: true, p_share_context: true });
const pub = (await call("mmh_save_review", { p_token: Hc, p_review: { product_id: "x1", publish: true, share_context: true } })).review;
const viewer = (await call("mmh_login", { p_nick: "dani", p_pass: "secret12", }, "10.2.2.2")).token;
let item = (await call("mmh_feed", { p_token: viewer, p_product_id: "x1" })).items[0];
ok("the feed context has no licence", item.ctx && item.ctx.grams === "30" && !("license" in item.ctx), item.ctx);
await call("mmh_save_card", { p_token: Hc, p_card: { age: "25-34", uses: ["sleep", "pain", "ptsd"], grams: "70+" } });
item = (await call("mmh_feed", { p_token: viewer, p_product_id: "x1" })).items[0];
ok("a later card change does not rewrite old shared reviews", item.ctx.grams === "30" && !item.ctx.uses.includes("ptsd"), item.ctx);
const before = sql(`select feed_at from mmh_reviews where id='${pub.id}'`);
await call("mmh_save_review", { p_token: Hc, p_review: { id: pub.id, bought: true } });
ok("buying again does not move the review up the feed", sql(`select feed_at from mmh_reviews where id='${pub.id}'`) === before && sql(`select buys from mmh_reviews where id='${pub.id}'`) === "2");

// a strain that left the catalogue keeps its name
sql(`update mmh_products set active=false where id='x1'`);
ok("delisted strain: the feed still names it", (await call("mmh_feed", { p_token: viewer, p_product_id: "x1" })).items[0].product_name === "זן איקס");
ok("delisted strain: the writer's journal still names it", (await call("mmh_my_reviews", { p_token: Hc })).reviews.find(r => r.id === pub.id).product_name === "זן איקס");
ok("delisted strain: not in the catalogue any more", !(await call("mmh_catalog", { p_token: Hc })).products.some(p => p.id === "x1"));
sql(`delete from mmh_reviews where product_id='x1'; delete from mmh_products where id='x1'`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
