async function run() {
  const apiKey = process.env.SHORT_IO_API_KEY || "";
  const r1 = await fetch("https://api.short.io/api/links?domain_id=1623722&limit=1", { headers: { authorization: apiKey, accept: 'application/json' } });
  const data = await r1.json();
  
  const linkId = data.links[0].idString;
  const numId = data.links[0].id;
  
  const r5 = await fetch(`https://api.short.io/links/${linkId}`, { headers: { authorization: apiKey, accept: 'application/json' } });
  console.log("Link Details:", await r5.text());
}
run();
