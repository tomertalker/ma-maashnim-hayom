// A photo never leaves the phone as the camera saved it. It is redrawn on a
// canvas and re-encoded as JPEG, which drops every EXIF field including GPS.
async function toBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
function draw(src, maxSide) {
  const w0 = src.width, h0 = src.height, k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  return c;
}
const toBlob = (c, q) => new Promise(r => c.toBlob(r, "image/jpeg", q));
const b64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(",")[1]);
  fr.onerror = reject; fr.readAsDataURL(blob);
});
async function under(c, limit, q) {
  let blob = await toBlob(c, q);
  while (blob && blob.size > limit && q > .4) { q -= .1; blob = await toBlob(c, q); }
  return blob;
}

// -> {full, thumb, w, h, preview}   (base64 strings; preview is an object URL)
export async function preparePhoto(file) {
  const bmp = await toBitmap(file);
  let full = draw(bmp, 1280), blob = await under(full, 420000, .82);
  if (!blob || blob.size > 420000) { full = draw(bmp, 900); blob = await under(full, 420000, .7); }
  const tblob = await under(draw(bmp, 420), 42000, .72);
  if (bmp.close) bmp.close();
  if (!blob || !tblob) throw new Error("image");
  return { full: await b64(blob), thumb: await b64(tblob), w: full.width, h: full.height, preview: URL.createObjectURL(tblob) };
}
