// End-to-end run on a phone-sized browser: two patients, the whole flow.
// Needs the local stack (see test/README.md): Postgres with pilot_schema.sql and
// a catalogue, test/local_api.mjs, and the built app (out/) served on APP_URL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules/");
const { chromium } = require("playwright");

const APP = process.env.APP_URL || "http://127.0.0.1:54340";
const SHOTS = process.env.SHOTS || "/tmp/mmh-shots";
const PHOTO = process.env.PHOTO || path.join(SHOTS, "gps.jpg");
fs.mkdirSync(SHOTS, { recursive: true });
const PSQL = ["-h", "127.0.0.1", "-p", process.env.PGPORT || "54329", "-U", "postgres", "-d", "mmh", "-At"];
const sql = q => execFileSync("psql", [...PSQL, "-c", q], { encoding: "utf8" }).trim();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  ok  ", name); } else { fail++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); } };

const browser = await chromium.launch();
const errors = [], outside = [];
async function phone(dark) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: "he-IL", colorScheme: dark ? "dark" : "light" });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", r => { const u = new URL(r.url()); if (!["127.0.0.1", "localhost"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) outside.push(u.hostname); });
  return { ctx, page };
}
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: full });
// chips are matched on their visible text, ignoring the invisible direction marks around number ranges
const chip = async (page, text) => {
  const i = await page.locator("button.chip").evaluateAll((els, t) => els.findIndex(e => e.textContent.replace(/[\u2066\u2069\u200e]/g, "").trim() === t), text);
  if (i < 0) throw new Error("no chip: " + text);
  await page.locator("button.chip").nth(i).click();
};
const text = page => page.locator("body").innerText();
// on a stuck navigation, say what the screen shows instead of only timing out
async function waitURL(page, test, name = "stuck") {
  try { await page.waitForURL(test, { timeout: 15000 }); }
  catch (e) { await shot(page, "FAIL-" + name, true); console.log("SCREEN:", (await text(page)).slice(0, 600)); throw e; }
}
const next = page => page.locator(".foot .btn.primary").click();

sql("truncate mmh_flags, mmh_photos, mmh_reviews, mmh_sessions, mmh_login_attempts, mmh_rate, mmh_patients cascade");
if (Number(sql("select count(*) from mmh_products where active")) < 100) { console.log("load the real catalogue first (reco-engine: node app/load_catalog.js)"); process.exit(2); }

// ------------------------------------------------------------ patient A ----
console.log("patient A: sign up");
const A = await phone(false);
await A.page.goto(APP + "/");
await A.page.waitForSelector(".hero h1");
await shot(A.page, "01-welcome");
ok("right-to-left Hebrew page", await A.page.evaluate(() => document.documentElement.dir === "rtl" && document.documentElement.lang === "he"));
await A.page.fill('input[autocomplete="username"]', "דני");
await A.page.waitForSelector("small.fine");
ok("free nickname is confirmed while typing", (await text(A.page)).includes("הכינוי פנוי"));
await A.page.fill(".pw input", "123");
await A.page.locator("form .btn.primary").click();
ok("short password explained", (await text(A.page)).includes("6 תווים"));
await A.page.fill(".pw input", "secret1");
await A.page.locator("form .btn.primary").click();
ok("age confirmation required", (await text(A.page)).includes("18"));
await A.page.check('input[type="checkbox"]');
await A.page.locator("form .btn.primary").click();
await waitURL(A.page, /\/card\/?$/);
ok("after sign up the card opens", (await text(A.page)).includes("הכרטיס שלך"));

console.log("patient A: card");
await next(A.page);
ok("age is required", (await text(A.page)).includes("קבוצת גיל"));
await chip(A.page, "35–44"); await chip(A.page, "גבר"); await chip(A.page, "1–3 שנים"); await chip(A.page, "30");
await shot(A.page, "02-card-about", true);
await next(A.page);
await next(A.page);
ok("a reason for use is required", (await text(A.page)).includes("סיבת שימוש"));
await chip(A.page, "כאב"); await chip(A.page, "שינה"); await chip(A.page, "ערב"); await chip(A.page, "לפני השינה");
await shot(A.page, "03-card-why");
await next(A.page);
await chip(A.page, "אדמתי"); await chip(A.page, "לחץ או חרדה"); await chip(A.page, "עד 300 ₪");
await shot(A.page, "04-card-likes", true);
await next(A.page);
for (const q of ["lakota", "אר אס 11"]) {
  await A.page.fill('input[type="search"]', q);
  await A.page.locator(".list button").first().click();
}
ok("two tried strains listed", await A.page.locator(".label").count() === 2);
await next(A.page);
ok("each tried strain needs a verdict", (await text(A.page)).includes("לכל זן"));
for (const l of await A.page.locator(".label").all()) await l.locator("button.like").click();
await shot(A.page, "05-card-tried", true);
await next(A.page);
await next(A.page);
ok("sharing must be chosen, not assumed", (await text(A.page)).includes("צריך לבחור"));
await A.page.locator("button", { hasText: "כן, לשתף באופן אנונימי" }).click();
await A.page.locator('[role="switch"]').click();
await shot(A.page, "06-card-share", true);
await next(A.page);
await waitURL(A.page, /\/reco\/?$/);
await A.page.waitForSelector("a.label");
ok("card saved, recommendations shown", await A.page.locator("a.label").count() >= 5);
ok("card stored with only band values", sql("select card->>'age' || '|' || (card->>'grams') || '|' || (card ? 'name')::text from mmh_patients where nick='דני'") === "35-44|30|false");
ok("the two tried strains became reviews", sql("select count(*) from mmh_reviews where source='history' and verdict='like' and publish and share_context") === "2");
await A.page.waitForTimeout(400);
await shot(A.page, "07-reco", true);
const recoText = await text(A.page);
ok("reasons carry an evidence tier", /ראשוני|אנקדוטלי/.test(recoText));
ok("genetic link to a liked strain is explained", /שאהבת/.test(recoText));
ok("stock date is shown", recoText.includes("נכון ל־24.9.2026"));
ok("only the licence category by default", !(await A.page.locator("a.label .tag.en").allInnerTexts()).some(t => t !== "T22/C4"));

console.log("patient A: strain page and purchase report");
const firstName = (await A.page.locator("a.label .name").first().innerText()).split("\n")[0];
await A.page.locator("a.label").first().click();
await waitURL(A.page, /\/strain\//);
await A.page.waitForSelector(".bars");
await A.page.waitForTimeout(400);
await shot(A.page, "08-strain", true);
const st = await text(A.page);
ok("strain page: name, bars, terpenes, genetics", st.includes(firstName) && st.includes("טרפנים") && st.includes("גנטיקה") && st.includes("למה זה מתאים לך"));
await A.page.locator(".foot .btn.primary", { hasText: "קניתי את זה" }).click();
await waitURL(A.page, /\/report\//);
await A.page.waitForSelector(".label .name");
ok("report opens with the strain already chosen", (await A.page.locator(".label .name").first().innerText()).includes(firstName));
await A.page.locator(".foot .btn.primary").click();
ok("a verdict (or 'not tried yet') is required", (await text(A.page)).includes("איך היה"));
await A.page.locator(".verdicts button.like").click();
await A.page.locator(".stars button").nth(3).click();
await chip(A.page, "שינה"); await chip(A.page, "יובש בפה");
await A.page.fill("textarea", "עוזר לי להירדם תוך חצי שעה. טעם אדמתי נעים.");
await A.page.setInputFiles('input[type="file"]', PHOTO);
await A.page.waitForSelector(".photos .ph img");
ok("sharing switch starts from the patient's own choice", await A.page.locator('[role="switch"]').first().getAttribute("aria-checked") === "true");
await A.page.waitForTimeout(300);
await shot(A.page, "09-report", true);
await A.page.locator(".foot .btn.primary").click();
await waitURL(A.page, u => new URL(u).pathname === "/");
await A.page.waitForSelector("article.label");
await A.page.waitForSelector(".photos img");
await A.page.waitForTimeout(500);
await shot(A.page, "10-feed-A", true);
ok("after saving, the feed shows the report as mine", (await text(A.page)).includes("הדיווח שלך") && (await text(A.page)).includes(firstName));
ok("purchase recorded as bought on a recommendation", sql("select source || '|' || stars || '|' || verdict from mmh_reviews where note like 'עוזר לי%'") === "reco|4|like");

console.log("photo privacy");
const hex = sql("select encode(full_jpeg,'hex') from mmh_photos limit 1");
const buf = Buffer.from(hex, "hex");
const src = fs.readFileSync(PHOTO);
ok("the test photo really carries EXIF with GPS", src.includes(Buffer.from("Exif")) && src.includes(Buffer.from("GPS-CANARY")));
ok("the stored photo is a JPEG", buf[0] === 0xff && buf[1] === 0xd8 && buf.length > 2000, buf.length);
ok("the stored photo has no EXIF and no GPS", !buf.includes(Buffer.from("Exif")) && !buf.includes(Buffer.from("GPS-CANARY")));
ok("the stored photo is within the size limit", buf.length <= 600000 && sql("select octet_length(thumb_jpeg) < 60000 from mmh_photos limit 1") === "t", buf.length);

// ------------------------------------------------------------ patient B ----
console.log("patient B: nickname taken, private report");
const B = await phone(true);
await B.page.goto(APP + "/");
await B.page.fill('input[autocomplete="username"]', "דני");
await B.page.waitForSelector("small.err");
await B.page.waitForFunction(() => document.querySelectorAll("small.err button").length > 0);
await shot(B.page, "11-nick-taken-dark");
ok("taken nickname is said, with free alternatives", (await text(B.page)).includes("הכינוי תפוס") && await B.page.locator("small.err button").count() >= 1);
await B.page.fill(".pw input", "secret2"); await B.page.check('input[type="checkbox"]');
await B.page.locator("form .btn.primary").click();
await B.page.waitForSelector(".err-box");
ok("sign up with a taken nickname is refused", (await text(B.page)).includes("תפוס") && sql("select count(*) from mmh_patients") === "1");
await B.page.fill('input[autocomplete="username"]', "מיכל");
await B.page.waitForSelector("small.fine");
await B.page.locator("form .btn.primary").click();
await waitURL(B.page, /\/card\/?$/);
await chip(B.page, "25–34"); await next(B.page);
await chip(B.page, "שינה"); await chip(B.page, "ריכוז וקשב"); await next(B.page);
await next(B.page);
await B.page.locator(".foot .btn", { hasText: "לדלג" }).click();
await B.page.locator("button", { hasText: "לא, לשמור רק אצלי" }).click();
await next(B.page);
await waitURL(B.page, /\/reco\/?$/);
await B.page.waitForSelector("a.label");
ok("without liked strains the app says the ranking rests on the card", (await text(B.page)).includes("עוד לא סימנת זנים"));
await shot(B.page, "12-reco-dark", true);

await B.page.locator(".nav a", { hasText: "פיד" }).click();
await B.page.waitForSelector("article.label");
await B.page.waitForTimeout(500);
const feedB = await text(B.page);
ok("B sees A's three reports", await B.page.locator("article.label").count() === 3, await B.page.locator("article.label").count());
ok("the feed never shows the writer's nickname", !feedB.includes("דני"));
ok("indication and dosage appear, because A chose to show them", feedB.includes("כאב, שינה") && feedB.includes("30 גרם בחודש"));
ok("a month, not a date", /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר) 20\d\d/.test(feedB) && !/\d{1,2}\.\d{1,2}\.20\d\d/.test(feedB));
ok("B's feed shows the photo", await B.page.locator("article .photos img").count() === 1);
await shot(B.page, "13-feed-B-dark", true);
await B.page.locator(".filters .chip", { hasText: "לא התאים" }).click();
await B.page.waitForSelector(".empty");
ok("filter with no results explains itself", (await text(B.page)).includes("אין דיווחים שמתאימים"));
await B.page.locator(".filters .chip", { hasText: "מטופלים כמוני" }).click();
await B.page.waitForSelector("article.label");
ok("'patients like me' finds A through the shared reason (sleep)", await B.page.locator("article.label").count() === 3);
await B.page.locator("article .photos .ph button").first().click();
await B.page.waitForSelector(".viewer img");
await B.page.waitForFunction(() => { const i = document.querySelector(".viewer img"); return i && i.naturalWidth > 600; });
ok("tapping the photo opens the full picture", true);
await shot(B.page, "14-photo-viewer");
await B.page.locator(".viewer button").click();
await B.page.locator("article .who button", { hasText: "לא מתאים?" }).first().click();
await B.page.locator(".sheet .list button").first().click();
await B.page.waitForSelector(".toast");
ok("a report on unfit content is recorded", sql("select count(*) from mmh_flags") === "1");

await B.page.locator(".nav a.add").click();
await waitURL(B.page, /\/report\//);
await B.page.fill('input[type="search"]', "טמסקל");
await B.page.locator(".list button").first().click();
await B.page.locator(".verdicts button.dislike").click();
await chip(B.page, "דופק מהיר");
ok("B's report starts private, as B chose", await B.page.locator('[role="switch"]').first().getAttribute("aria-checked") === "false");
await B.page.locator(".foot .btn.primary").click();
await waitURL(B.page, /\/journal\/?$/);
await B.page.waitForSelector("article.label");
ok("a private report lands in the journal", (await text(B.page)).includes("פרטי") && (await text(B.page)).includes("טמסקל"));
await B.page.locator(".nav a", { hasText: "המלצות" }).click();
await B.page.waitForSelector("a.label");
ok("the disliked strain left B's recommendations", !(await B.page.locator("a.label .name").allInnerTexts()).some(t => t.startsWith("טמסקל")));

await A.page.reload();
await A.page.waitForSelector("article.label");
ok("B's private report is not in A's feed", await A.page.locator("article.label").count() === 3 && !(await text(A.page)).includes("טמסקל"));

// a free-text strain and a "bought, not tried yet"
await B.page.locator(".nav a.add").click();
await B.page.fill('input[type="search"]', "זן מהחבר");
await B.page.locator(".list button", { hasText: "לא ברשימה" }).click();
await B.page.locator("button.chip", { hasText: "עוד לא ניסיתי" }).click();
await B.page.locator('[role="switch"]').first().click();
await B.page.locator(".foot .btn.primary").click();
await waitURL(B.page, u => new URL(u).pathname === "/");
await B.page.waitForSelector("article.label");
ok("a purchase without a verdict appears in the feed as bought", (await text(B.page)).includes("זן מהחבר") && (await text(B.page)).includes("עוד בלי חוות דעת"));

// ------------------------------------------------- A on a new phone ----
console.log("patient A on a new phone");
const A2 = await phone(false);
await A2.page.goto(APP + "/journal/");
await A2.page.waitForSelector(".hero h1");
ok("a deep link without a session shows sign in", true);
await A2.page.locator(".seg button", { hasText: "יש לי כינוי" }).click();
await A2.page.fill('input[autocomplete="username"]', "דני");
await A2.page.fill(".pw input", "wrong-pass");
await A2.page.locator("form .btn.primary").click();
await A2.page.waitForSelector(".err-box");
ok("wrong password is refused without saying which part is wrong", (await text(A2.page)).includes("הכינוי או הסיסמה לא נכונים"));
await A2.page.fill(".pw input", "secret1");
await A2.page.locator("form .btn.primary").click();
await A2.page.waitForSelector("article.label");
ok("new phone: the journal is back", await A2.page.locator("article.label").count() === 3);
await A2.page.waitForTimeout(400);
await shot(A2.page, "15-journal", true);
await A2.page.locator("article .who button", { hasText: "קניתי שוב" }).first().click();
await A2.page.waitForSelector(".toast");
ok("'bought again' counts", sql("select max(buys) from mmh_reviews") === "2" && (await text(A2.page)).includes("נקנה 2 פעמים"));
await A2.page.locator(".top .btn", { hasText: "דוח לרופא" }).click();
await A2.page.waitForSelector("table.report");
await shot(A2.page, "16-doctor", true);
ok("doctor report lists the rated strains", await A2.page.locator("table.report tbody tr").count() === 3);
await A2.page.locator(".top .btn", { hasText: "חזרה" }).click();

await A2.page.locator("article .who a", { hasText: "עריכה" }).first().click();
await waitURL(A2.page, /\/report\//);
await A2.page.waitForSelector(".verdicts");
await A2.page.locator('[role="switch"]', { hasText: "להציג בפיד" }).click();
await A2.page.locator(".foot .btn.primary").click();
await waitURL(A2.page, /\/journal\/?$/);
await A2.page.waitForSelector("article.label");
ok("turning sharing off on one report removes it from the feed", sql("select count(*) from mmh_reviews r join mmh_patients p on p.id=r.patient_id where p.nick='דני' and publish") === "2");

await A2.page.locator(".nav a", { hasText: "הכרטיס שלי" }).click();
await A2.page.waitForSelector("table.report");
await shot(A2.page, "17-me", true);
ok("the card is shown back to the patient", (await text(A2.page)).replace(/[\u2066\u2069]/g, "").includes("35–44") && (await text(A2.page)).includes("כאב, שינה"));
await A2.page.locator("a.btn", { hasText: "עריכת הכרטיס" }).click();
await waitURL(A2.page, /\/card\/?$/);
ok("editing opens pre-filled", await A2.page.locator('button.chip[aria-pressed="true"]', { hasText: "44" }).count() === 1);
await chip(A2.page, "40"); await next(A2.page); await next(A2.page); await next(A2.page);
await waitURL(A2.page, /\/me\/?$/);
ok("the card can be corrected after saving", sql("select card->>'grams' from mmh_patients where nick='דני'") === "40");

await A2.page.locator(".list button", { hasText: "יציאה מהחשבון" }).click();
await A2.page.waitForSelector(".hero h1");
ok("sign out returns to the welcome screen and clears the phone", await A2.page.evaluate(() => !localStorage.getItem("mmh.session") && !localStorage.getItem("mmh.catalog")));

console.log("account deletion");
await B.page.locator(".nav a", { hasText: "הכרטיס שלי" }).click();
await B.page.locator(".list button", { hasText: "מחיקת החשבון" }).click();
await B.page.fill(".sheet .pw input", "secret2");
await shot(B.page, "18-delete-dark");
await B.page.locator(".sheet .btn.danger").click();
await B.page.waitForSelector(".hero h1");
ok("deleting the account removes the patient and their reports", sql("select count(*) from mmh_patients where nick='מיכל'") === "0" && sql("select count(*) from mmh_reviews where product_name='זן מהחבר'") === "0");

console.log("layout");
for (const [name, p] of [["feed", "/"], ["reco", "/reco/"], ["journal", "/journal/"], ["me", "/me/"], ["report", "/report/"]]) {
  await A.page.goto(APP + p);
  await A.page.waitForSelector(".top h1");
  await A.page.waitForTimeout(300);
  const w = await A.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(`no sideways scroll on ${name}`, w[0] <= w[1], w);
}
const small = await A.page.evaluate(() => [...document.querySelectorAll("button, a.btn, .nav a")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 36); }).map(e => e.innerText.slice(0, 20)));
ok("touch targets are at least 36px tall", small.length === 0, small);
ok("no script errors during the whole run", errors.length === 0, errors.slice(0, 5));
ok("the app contacts nothing but its own server", outside.length === 0, [...new Set(outside)]);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${SHOTS}`);
process.exit(fail ? 1 : 0);
