# הפעלת הפיילוט מהטלפון

ארבעה צעדים, בערך רבע שעה. אחריהם יש קישור אחד שמחלקים למטופלים.

## לפני שמתחילים: לבדוק אם יש בטלפון גרסה שלא עלתה ל-GitHub

ב-Termux:

```sh
cd ~/mmh/app && git fetch && git status -sb && git log origin/main..HEAD --oneline
```

אם השורה האחרונה ריקה וב-`status` אין קבצים, אין בטלפון שום דבר שחסר ב-GitHub ואפשר להמשיך. אם יש שם משהו, לעצור ולשלוח לי את הפלט לפני המיזוג.

## 1. מסד הנתונים (Supabase, פרויקט הסקר)

1. לפתוח ב-GitHub את `supabase/pilot_schema.sql` בענף `pilot-v1`, ללחוץ Raw, לסמן הכל ולהעתיק.
2. ב-Supabase: הפרויקט של הסקר ← SQL Editor ← להדביק ← Run. אמור להסתיים ב-Success. אפשר להריץ שוב בלי נזק.
3. באותו מקום, להריץ שורה אחת עם מפתח שתמציא (16 תווים לפחות, לשמור אותו בצד):

```sql
select public.mmh_admin_set_key('כאן-מפתח-ארוך-משלך');
```

4. מומלץ: קוד פיילוט, כדי שרק מי שקיבל את הקישור יוכל להירשם. קוד אקראי של 10 תווים לפחות (לא שם בית המרקחת):

```sql
select public.mmh_admin_set_invite('k7m2-q9x4-ul');
```

את הקישור מחלקים עם הקוד בסופו, למשל `https://ma-maashnim-hayom.vercel.app/?c=k7m2-q9x4-ul`. הקוד ממולא אצל המטופל לבד. כדאי להפוך את הקישור ל-QR ולתלות ליד הקופה.

הקובץ מוסיף רק טבלאות ופונקציות שמתחילות ב-`mmh_`. הטבלאות של הסקר לא משתנות.

## 2. הקטלוג

הקטלוג נטען מתוך `reco-engine`. המלאי ששמור שם הוא מ-24.9, אז כדאי לרענן לפני הטעינה. להדביק ל-Claude Code:

```text
Work only in ~/mmh/reco-engine. Reply in English.
1. git fetch && git checkout pilot-v1 && git pull
2. Refresh the Ultra Pharm inventory, within the owner limits in inventory/LEAD_DECISION.json:
   node inventory/fetch_ultra.js probe --new
   node inventory/fetch_ultra.js rest
   If either command reports a stop, do not retry and do not work around it: skip to step 4 and tell me.
3. Build and enrich the new snapshot (use today's date where a date is needed):
   node inventory/build_catalog.js
   node inventory/enrich_catalog.js <YYYY-MM-DD>
4. Dry run, then load. I will type the key myself; do not write it to any file:
   node app/load_catalog.js --dry
   MMH_ADMIN_KEY=<I will paste it> node app/load_catalog.js
5. Run node test/run_app.js and report: the "loaded" line, the summary line, and the test totals.
Do not commit the key. Commit the new catalogue files and push.
```

בסוף צריכה להופיע שורה כמו `loaded: {"ok":true,"active":215,...}`.

## 3. פרסום

למזג את הענף `pilot-v1` ל-`main` (יש Pull Request פתוח).

- **Vercel** (האתר `ma-maashnim-hayom.vercel.app`): אם הפרויקט שם עדיין מחובר ל-GitHub, המיזוג מפרסם לבד תוך דקה־שתיים. אין צורך במשתני סביבה; משתנים ישנים שנשארו שם מפברואר לא משפיעים.
- **רק אם Vercel לא מחובר**: GitHub Pages. בריפו ← Settings ← Pages ← Source: **GitHub Actions**, ואז Actions ← Deploy to GitHub Pages ← Run workflow. הכתובת: `https://tomertalker.github.io/ma-maashnim-hayom/`. החיסרון: האפליקציה חולקת שם את אחסון הדפדפן עם כל אתר אחר שלך ב-github.io, כך שעדיף Vercel.

## 4. בדיקה לפני שמחלקים קישור (5 דקות, בטלפון)

1. לפתוח את הקישור. אמור להופיע "מה מעשנים היום" עם הרשמה.
2. להירשם בכינוי וסיסמה, למלא כרטיס, לסמן זן או שניים שניסית.
3. במסך ההמלצות: יש רשימה, ולכל זן נימוקים.
4. לפתוח זן ← "קניתי את זה" ← לסמן, לצרף תמונה, לשמור עם "להציג בפיד".
5. בפיד: הדיווח מופיע עם התמונה.
6. מטלפון אחר (או חלון גלישה בסתר): לנסות להירשם באותו כינוי. אמור להופיע "הכינוי תפוס". להירשם בכינוי אחר ולראות את הדיווח הראשון בפיד, בלי כינוי ובלי תאריך מדויק.
7. בחלון הראשון: "הכרטיס שלי" ← יציאה, ואז כניסה מחדש עם הכינוי והסיסמה. הכרטיס והיומן חוזרים.

אם שלב 2 נכשל עם "משהו השתבש בשרת", צעד 1 לא הושלם. אם ההמלצות ריקות עם "הקטלוג עוד לא נטען", צעד 2 לא הושלם.

## במהלך הפיילוט

הכל מה-SQL Editor של Supabase:

| מה | איך |
|---|---|
| מספרים: מטופלים, כרטיסים, דיווחים, תמונות ונפח שלהן, דגלים, תאריך המלאי | `select * from public.mmh_admin_overview();` |
| מטופל שכח סיסמה | `select public.mmh_admin_reset_password('הכינוי', 'סיסמה-חדשה');` |
| לפתוח הרשמה לכולם (בלי קוד) | `select public.mmh_admin_set_invite(null);` |
| להסיר דיווח מהפיד | Table Editor ← `mmh_reviews` ← לסמן `hidden`. שלושה מטופלים ותיקים (יותר מ-12 שעות, עם כרטיס) שמסמנים "לא מתאים" מסתירים אותו לבד |
| להחזיר דיווח שהוסתר, סופית | `select public.mmh_admin_unhide('מזהה-הדיווח');` |
| לראות מה סומן כלא מתאים | Table Editor ← `mmh_flags` |
| לשנות מגבלה (הרשמות לשעה, דיווחים ליום, תמונות למטופל) | Table Editor ← `mmh_settings` |
| לרענן מלאי ומחירים | להריץ שוב את צעד 2 |

## מה חשוב לדעת

- **אין שחזור סיסמה אוטומטי**, כי אין אימייל. מטופל ששכח פונה אליך.
- **מגבלות נגד ניצול**: 40 הרשמות לשעה מאותה רשת (וויי-פיי של בית מרקחת נחשב רשת אחת), 8 סיסמאות שגויות ברבע שעה, 30 דיווחים חדשים ביום ו-60 תמונות למטופל. אם ביום הפיילוט נרשמים יותר מ-40 איש בשעה מאותו וויי-פיי, להגדיל את `signup_hourly_per_ip` ב-`mmh_settings`.
- **התמונות נשמרות בתוך מסד הנתונים** של פרויקט הסקר. בחשבון החינמי של Supabase יש 500MB; כל תמונה תופסת עד חצי מגה. את הנפח רואים ב-`mmh_admin_overview()`.
- **הנתונים בסידני** (פרויקט הסקר). לפיילוט זה מה שבחרת; לפני הפצה רחבה עוברים לפרויקט באירופה: מריצים שם את אותו קובץ SQL ומחליפים כתובת ב-`lib/config.js`.
- **הקטלוג גלוי רק למטופל מחובר**, והוא לא נמצא בריפו הציבורי. זה נשאר כך עד האישור הכתוב מקנאביז.
- **הפיד אנונימי אבל הקבוצה קטנה.** מי שבוחר להציג סיבת שימוש ומינון עלול להיות מזוהה על ידי מכרים. האפליקציה אומרת את זה למטופל במקום שבו הוא בוחר.
- **נימוקי ההמלצה מסומנים "ראשוני" או "אנקדוטלי"**, כי הקשר בין טרפנים להשפעה לא מבוסס קלינית. אין במנוע שום טענה שמסומנת "מבוסס".
