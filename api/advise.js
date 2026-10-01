// Decision-confidence card: review trust + price timing + decide-by. Rule-based; upgrades to Claude if ANTHROPIC_API_KEY is set.
const POS=/good|great|nice|perfect|love|soft|worth|true to size|as shown|comfortable|premium|durable/gi;
const NEG=/bad|poor|cheap|thin|faded|shrunk|torn|fake|not as shown|different|loose|tight|small|large|late|damaged|worst|waste/gi;
const ASPECT={Fit:/fit|size|tight|loose|small|large|length/i,Quality:/quality|fabric|material|stitch|thin|soft|cheap|durable/i,'Looks vs photos':/photo|picture|image|colour|color|as shown|different/i};
function reviews(txt){
  const L=(txt||'').split('\n').map(s=>s.trim()).filter(Boolean); if(!L.length) return null;
  let pos=0,neg=0; const asp={};
  L.forEach(l=>{const p=(l.match(POS)||[]).length,n=(l.match(NEG)||[]).length;pos+=p;neg+=n;
    for(const k in ASPECT){ if(ASPECT[k].test(l)){asp[k]=asp[k]||{p:0,n:0}; if(n>p)asp[k].n++; else asp[k].p++;}}});
  return {count:L.length,pos,neg,asp};
}
function rules(b){
  const out=[]; let score=50; const days=Number(b.days||0);
  const cur=Number(b.price||0), low=Number(b.lowest||0), high=Number(b.highest||0);
  const rv=reviews(b.reviews);
  if(rv){
    const share=rv.pos+rv.neg? rv.pos/(rv.pos+rv.neg):0.5;
    score+=Math.round((share-0.5)*40);
    const bits=Object.entries(rv.asp).map(([k,v])=>`${k}: ${v.p} positive, ${v.n} negative`).join('; ');
    out.push({tag:'Review trust',text:`Across ${rv.count} pasted reviews, ${Math.round(share*100)}% of opinion words are positive.${bits?' '+bits+'.':''} ${share<0.5?'Mostly negative: read the 1-3 star reviews that include photos before deciding.':'Mostly positive: check that reviewers with your body type or use mention the same.'}`});
  } else out.push({tag:'Review trust',text:'Paste 5-10 reviews (especially 3-star ones with photos) and I will summarise fit, quality and photo-mismatch signals.'});
  if(cur&&low){
    const gap=(cur-low)/low;
    if(gap<=0.05){score+=15;out.push({tag:'Price timing',text:`Today's price (Rs ${cur}) is within 5% of the lowest you have seen (Rs ${low}). Waiting is unlikely to save much.`});}
    else {score-=5;out.push({tag:'Price timing',text:`Today's price is ${Math.round(gap*100)}% above the lowest you have seen (Rs ${low}). If you can wait, set a target near Rs ${Math.round(low*1.05)} and a date to stop waiting.`});}
  } else out.push({tag:'Price timing',text:'Add today\'s price and the lowest price you have seen, and I will tell you whether waiting is worth it.'});
  if(b.reason==='size') out.push({tag:'Fit',text:'Compare the garment measurements (cm) with a piece you already own and like; within 2 cm, take the same size.'});
  if(b.reason==='budget') out.push({tag:'Budget',text:'Decide the most you will spend and the date by which you need it. If the price is above that, remove the item to keep the list honest.'});
  if(b.reason==='compare') out.push({tag:'Compare',text:'Open the 2 closest alternatives and compare price, rating and return window side by side before you decide.'});
  if(b.reason==='occasion') out.push({tag:'Occasion',text:'Delivery plus the return window needs 7-10 days. Count back from the event date.'});
  if(days>21){score-=10;out.push({tag:'Decide-by',text:`Saved ${days} days ago. Pick one: buy this week, or remove it.`});} else out.push({tag:'Decide-by',text:'Set a decide-by date within 14 days so it does not become a bookmark.'});
  score=Math.max(5,Math.min(95,score));
  return {score,verdict:score>=65?'Looks safe to buy':score>=45?'One more check needed':'Hold off or remove',items:out,mode:'rules'};
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const b=req.body||{}; const base=rules(b); const key=process.env.ANTHROPIC_API_KEY;
  if(!key) return res.status(200).json(base);
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:600,messages:[{role:'user',content:`Help a shopper decide on a wishlisted fashion item. Never suggest discounts or money offers. Item: ${b.item}. Saved ${b.days} days ago. Blocker: ${b.reason}. Price now ${b.price}, lowest seen ${b.lowest}. Reviews:\n${b.reviews||'none'}\nReply strict JSON {"verdict":"...","items":[{"tag":"Review trust|Price timing|Fit|Decide-by","text":"one or two sentences"}]}`}]})});
    const j=await r.json(); const t=j.content?.[0]?.text||''; const p=JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));
    return res.status(200).json({...base,verdict:p.verdict||base.verdict,items:p.items||base.items,mode:'ai'});
  }catch(e){return res.status(200).json(base);}
}
