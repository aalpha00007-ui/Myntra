// Vercel serverless function. Works without an API key (rule-based), upgrades to Claude when ANTHROPIC_API_KEY is set.
function rules(b){
  const out=[]; const days=Number(b.days||0);
  const fit=b.knownSize==='yes';
  if(!fit) out.push({tag:'Fit',text:`Not sure of your size? Compare the garment's chest/waist/length (cm) with one piece you already own and like. If it is within 2 cm, pick the same size.`});
  else out.push({tag:'Fit',text:'You know your size in this brand: the fit risk is low. Check the "fit" lines in reviews for "runs small/large".'});
  if(b.reason==='occasion') out.push({tag:'Occasion',text:days>14?'The occasion may be close: delivery plus a return window needs about 7-10 days. Decide this week.':'You have time, but set a decide-by date so the item does not sit for a month.'});
  if(b.reason==='style') out.push({tag:'Styling',text:'Name 2 outfits you can make with things you already own. If you cannot, the item is probably bookmarking, not buying.'});
  if(b.reason==='price') out.push({tag:'Price',text:'Check the same item in 2 other apps today, then decide. Waiting without a target price rarely pays off.'});
  if(b.reason==='reviews') out.push({tag:'Reviews',text:'Read only 3-star and photo reviews: they carry the real fit and fabric information.'});
  out.push({tag:'Next step',text:days>21?'This has been saved for over 3 weeks. Decide now: buy, or remove it to keep your list clean.':'Pick one: buy now with free returns, or set a decide-by date.'});
  const score=Math.max(10,Math.min(95,60+(fit?15:-10)+(days>21?-15:5)+(b.reason==='occasion'?10:0)));
  return {score,verdict:score>=65?'Likely to buy: go for it':score>=45?'Needs one more check':'Probably bookmarking',items:out,mode:'rules'};
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const b=req.body||{}; const base=rules(b);
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return res.status(200).json(base);
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:500,messages:[{role:'user',content:`You help a fashion shopper decide on a wishlisted item. No discounts or money offers allowed. Item: ${b.item}. Saved ${b.days} days ago. Main reason saved: ${b.reason}. Knows size: ${b.knownSize}. Notes: ${b.notes||'none'}. Reply with strict JSON {"verdict":"...","items":[{"tag":"Fit|Styling|Occasion|Price|Next step","text":"one sentence"}]} with 3-4 items.`}]})});
    const j=await r.json(); const t=j.content?.[0]?.text||''; const parsed=JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));
    return res.status(200).json({...base,verdict:parsed.verdict||base.verdict,items:parsed.items||base.items,mode:'ai'});
  }catch(e){return res.status(200).json(base);}
}
