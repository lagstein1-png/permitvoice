// Converts us-atlas states-10m (TopoJSON) to a compact on-device lookup file.
const fs = require('fs');
const [,, topoPath, tcPath, outPath] = process.argv;
const topojson = require(tcPath);
const topo = JSON.parse(fs.readFileSync(topoPath, 'utf8'));
const fc = topojson.feature(topo, topo.objects.states);
const FIPS = {'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'};
const r = v => Math.round(v * 100) / 100;
const out = {};
for (const f of fc.features) {
  const code = FIPS[f.id]; if (!code) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // keep outer rings only, flattened to [lon,lat,lon,lat,...]
  out[code] = polys.map(p => p[0].flatMap(([x, y]) => [r(x), r(y)])).filter(a => a.length >= 6);
}
const missing = Object.values(FIPS).filter(c => !out[c]);
if (missing.length) { console.error('missing', missing); process.exit(1); }
fs.writeFileSync(outPath, '// US state outlines for on-device lookup. Source: us-atlas 3.0.1 (US Census Bureau cartographic boundaries), ISC.\nwindow.PV_STATE_SHAPES=' + JSON.stringify(out) + ';\n');
console.log('states', Object.keys(out).length, 'bytes', fs.statSync(outPath).size);
