import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./lib/supabase";

// Safe upsert that works with ALL Supabase versions
const safeUpsert = async (table: string, rows: any[], conflictCol: string) => {
  for (const row of rows) {
    const { data } = await supabase.from(table).select(conflictCol).eq(conflictCol, row[conflictCol]);
    if (data && data.length > 0) {
      await supabase.from(table).update(row).eq(conflictCol, row[conflictCol]);
    } else {
      await supabase.from(table).insert(row);
    }
  }
};

const NU_RED = "#C8102E";
const FORMATS = ["Post","Story","Reel"];
const CONTENT_TYPES = ["Event Promo","Student Spotlight","Student Org Spotlight","Ambassadors","Deadline Reminder","Program Info","Faculty Feature","Conference","Publication","Other"];
const STATUSES = ["Planned","Scheduled","Posted"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STATUS_CLR = { Planned:"#94a3b8", Scheduled:"#f59e0b", Posted:"#22c55e" };
const TYPE_CLRS = ["#C8102E","#f59e0b","#10b981","#3b82f6","#ec4899","#8b5cf6","#14b8a6","#f97316","#06b6d4","#84cc16"];
const DEFAULT_YEARS = ["2025-2026","2026-2027","2027-2028"];
const DEFAULT_CAPTION_INSTRUCTIONS = `SOPPS Instagram Caption Style Guidelines

TONE: Professional, polished, and genuinely enthusiastic. Confident and proud, with a clear sense of excitement and momentum. Celebratory when appropriate, but adaptable to informational or reflective posts. The school should feel actively excited about its people and achievements.

PERSPECTIVE: Write from an official Northeastern University School of Pharmacy and Pharmaceutical Sciences (SOPPS) institutional voice. Reflect faculty leadership, academic excellence, and a high-energy, high-achieving community. Use collective language: "We are proud to…", "Our students/faculty continue to…", "At Northeastern University School of Pharmacy and Pharmaceutical Sciences…". The reader should feel that exciting, meaningful things are constantly happening here.

STRUCTURE: Avoid rigid templates but prioritize engaging, energetic openings. The first line should capture attention, convey importance or excitement, and clearly introduce the subject. Strong openers: "Congratulations to…", "We're excited to recognize…", "Celebrating…", "Proud to highlight…". Build the rest with context + significance, impact or contribution, and institutional pride.

WRITING STYLE: Clear, concise, and intentionally energetic. Use strong verbs and active phrasing (e.g., "leading," "advancing," "driving impact"). Vary sentence length for natural rhythm. Avoid sounding robotic or overly reserved.

EMOJIS & EXCLAMATION MARKS: Use 1–2 emojis per caption, placed at the end of a sentence or the caption. Use clean, celebratory options (🎉 👏 🎓). Most captions should include 1 exclamation mark; high-energy or celebratory posts can include up to 2. Never stack (no "!!!").

LANGUAGE: Emphasize impact, leadership, innovation, excellence, collaboration, achievement. Use vivid but professional phrasing — instead of "recognized for their work," prefer "recognized for their impactful contributions."

INSTITUTIONAL FRAMING: Tie achievements back to the strength of the program, the success of its people, and the broader impact in pharmacy and healthcare. Reinforce a sense that high-level, meaningful work is constantly happening here.

REQUIRED: Every caption must end with #nubouve.

AVOID: Flat or overly neutral tone, excessive hype, slang or overly casual phrasing, overuse of emojis or punctuation.`;

const uid = () => Math.random().toString(36).slice(2,10);
const blankPost = yr => ({ id:uid(), title:"", date:"", dateType:"none", format:"Post", contentType:"Event Promo", creator:"", status:"Planned", eventInfo:"", contacts:"", notes:"", caption:"", academicYear:yr, priority:false, deadline:"", attachments:[], engagement:{likes:"",reach:"",comments:""} });
const blankPub = () => ({ id:uid(), faculty:"", faculty2:"", faculty3:"", journal:"", articleLink:"", publishedMonth:"", articleTitle:"", done:false, createdAt:Date.now() });
const S = { border:"1px solid #e2e8f0", borderRadius:"6px", padding:"6px 10px", fontSize:"13px", width:"100%", boxSizing:"border-box", fontFamily:"inherit", outline:"none" };
const fmtTime = ts => { const d=new Date(ts); return d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+" at "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); };
const isMonthOnly = d => d && /^\d{4}-\d{2}$/.test(d);
const isExact = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d);
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate = d => {
  if (!d) return "—";
  if (isMonthOnly(d)) { const [y,m]=d.split("-"); return `${MONTHS_SHORT[parseInt(m)-1]} ${y}`; }
  const [,m,day]=d.split("-"); return `${parseInt(m)}/${parseInt(day)}`;
};
const dateGroupKey = d => (!d ? "unscheduled" : isMonthOnly(d) ? d : d.slice(0,7));
const fmtKey = k => k==="unscheduled" ? "Unscheduled" : `${MONTHS_LONG[parseInt(k.split("-")[1])-1]} ${k.split("-")[0]}`;
const fmtSize = bytes => {
  if (bytes >= 1024*1024) return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [posts, setPosts] = useState([]);
  const [pubs, setPubs] = useState([]);
  const [pubModal, setPubModal] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [settings, setSettings] = useState({ instructions:DEFAULT_CAPTION_INSTRUCTIONS, year:"2026-2027" });
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [username, setUsername] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [calDate, setCalDate] = useState(() => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1); });
  const [filter, setFilter] = useState({ status:"All", format:"All", month:"All" });
  const [collapsedMonths, setCollapsedMonths] = useState({});
  const [collapsedPubMonths, setCollapsedPubMonths] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [dayModal, setDayModal] = useState(null);
  const historyRef = useRef([]);
  const histIdxRef = useRef(-1);
  const [histState, setHistState] = useState({ canUndo:false, canRedo:false });
  const postsRef = useRef([]);

  // ── Initial load from Supabase ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("posts").select("id,data");
        if (data && data.length > 0) {
          const p = data.map(r => r.data);
          setPosts(p); postsRef.current=p; historyRef.current=[p]; histIdxRef.current=0;
        }
      } catch(e) {}

      try {
        const { data } = await supabase.from("publications").select("id,data");
        if (data) setPubs(data.map(r => r.data));
      } catch(e) {}

      try {
        const { data } = await supabase.from("app_settings").select("key,value").in("key",["settings","years"]);
        if (data) {
          const sr = data.find(r => r.key === "settings");
          const yr = data.find(r => r.key === "years");
          if (sr) {
            const s = sr.value;
            setSettings({ year: s.year||"2026-2027", instructions: s.instructions && s.instructions.trim().length > 0 ? s.instructions : DEFAULT_CAPTION_INSTRUCTIONS });
          }
          if (yr) setYears(yr.value);
          else setYears(DEFAULT_YEARS);
        } else { setYears(DEFAULT_YEARS); }
      } catch(e) { setYears(DEFAULT_YEARS); }

      try {
        const { data } = await supabase.from("activity_log").select("id,data").order("created_at",{ascending:false}).limit(100);
        if (data) setActivityLog(data.map(r => r.data));
      } catch(e) {}

      const name = localStorage.getItem("sopps_username");
      if (name) setUsername(name);
      else setShowNamePrompt(true);

      setLoading(false);
    })();
  }, []);

  // ── Auto-advance Scheduled → Posted ──────────────────────────
  useEffect(() => {
    if (!loading) {
      const advance = () => {
        const t=todayStr(), c=postsRef.current; let ch=false;
        const u=c.map(p=>{ if(p.status==="Scheduled"&&isExact(p.date)&&p.date<=t){ch=true;return{...p,status:"Posted",lastUpdatedBy:"Auto",lastUpdatedAt:Date.now()};} return p; });
        if(ch){
          setPosts(u); postsRef.current=u;
          safeUpsert("posts", u.map(x=>({id:x.id,data:x})), "id").catch(()=>{});
        }
      };
      advance();
      const iv=setInterval(advance,60000);
      return ()=>clearInterval(iv);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && years.length>0 && !years.includes(settings.year)) {
      saveSettings({...settings, year:years[0]});
    }
  }, [loading, years]);

  // ── Realtime subscriptions ────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const channel = supabase
      .channel("realtime-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, async () => {
        const { data } = await supabase.from("posts").select("id,data");
        if (data) { const p = data.map((r: any) => r.data); setPosts(p); postsRef.current = p; }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "publications" }, async () => {
        const { data } = await supabase.from("publications").select("id,data");
        if (data) setPubs(data.map((r: any) => r.data));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_log" }, async () => {
        const { data } = await supabase.from("activity_log").select("id,data").order("created_at", { ascending: false }).limit(100);
        if (data) setActivityLog(data.map((r: any) => r.data));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, async () => {
        const { data } = await supabase.from("app_settings").select("key,value").in("key", ["settings", "years"]);
        if (data) {
          const sr = data.find((r: any) => r.key === "settings");
          const yr = data.find((r: any) => r.key === "years");
          if (sr) setSettings(sr.value);
          if (yr) setYears(yr.value);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loading]);

  // ── commitPosts: saves to history + Supabase ─────────────────
  const commitPosts = useCallback(async p => {
    const prev = postsRef.current;
    const trimmed=historyRef.current.slice(0,histIdxRef.current+1);
    trimmed.push(p); if(trimmed.length>30)trimmed.shift();
    historyRef.current=trimmed; histIdxRef.current=trimmed.length-1;
    setHistState({canUndo:histIdxRef.current>0,canRedo:false});
    setPosts(p); postsRef.current=p;
    try {
      if (p.length > 0) await safeUpsert("posts", p.map(x=>({id:x.id,data:x})), "id");
      const prevIds = new Set(prev.map(x=>x.id));
      const newIds = new Set(p.map(x=>x.id));
      const toDelete = [...prevIds].filter(id=>!newIds.has(id));
      if (toDelete.length) await supabase.from("posts").delete().in("id",toDelete);
    } catch(e) {}
  }, []);

  // ── Undo / Redo ───────────────────────────────────────────────
  const undo = async () => {
    if(histIdxRef.current<=0)return;
    const prev=postsRef.current;
    histIdxRef.current-=1;
    const p=historyRef.current[histIdxRef.current];
    setHistState({canUndo:histIdxRef.current>0,canRedo:true});
    setPosts(p); postsRef.current=p;
    try {
      if (p.length > 0) await safeUpsert("posts", p.map(x=>({id:x.id,data:x})), "id");
      const prevIds = new Set(prev.map(x=>x.id));
      const newIds = new Set(p.map(x=>x.id));
      const toDelete = [...prevIds].filter(id=>!newIds.has(id));
      if (toDelete.length) await supabase.from("posts").delete().in("id",toDelete);
    } catch(e) {}
  };

  const redo = async () => {
    if(histIdxRef.current>=historyRef.current.length-1)return;
    const prev=postsRef.current;
    histIdxRef.current+=1;
    const p=historyRef.current[histIdxRef.current];
    setHistState({canUndo:true,canRedo:histIdxRef.current<historyRef.current.length-1});
    setPosts(p); postsRef.current=p;
    try {
      if (p.length > 0) await safeUpsert("posts", p.map(x=>({id:x.id,data:x})), "id");
      const prevIds = new Set(prev.map(x=>x.id));
      const newIds = new Set(p.map(x=>x.id));
      const toDelete = [...prevIds].filter(id=>!newIds.has(id));
      if (toDelete.length) await supabase.from("posts").delete().in("id",toDelete);
    } catch(e) {}
  };

  // ── Settings / Years / Username ───────────────────────────────
  const saveSettings = async s => {
    setSettings(s);
    try { await safeUpsert("app_settings", [{key:"settings",value:s}], "key"); } catch(e) {}
  };

  const saveUsername = async name => {
    setUsername(name); setShowNamePrompt(false);
    localStorage.setItem("sopps_username", name);
  };

  const saveYears = async updated => {
    setYears(updated);
    try { await safeUpsert("app_settings", [{key:"years",value:updated}], "key"); } catch(e) {}
  };

  // ── Publications ──────────────────────────────────────────────
  const savePubs = async p => {
    const prev = pubs;
    setPubs(p);
    try {
      if (p.length > 0) await safeUpsert("publications", p.map(x=>({id:x.id,data:x})), "id");
      const prevIds = new Set(prev.map(x=>x.id));
      const newIds = new Set(p.map(x=>x.id));
      const toDelete = [...prevIds].filter(id=>!newIds.has(id));
      if (toDelete.length) await supabase.from("publications").delete().in("id",toDelete);
    } catch(e) {}
  };

  const upsertPub = p => { const isNew=!pubs.find(x=>x.id===p.id); savePubs(isNew?[...pubs,p]:pubs.map(x=>x.id===p.id?p:x)); setPubModal(null); };
  const deletePub = id => { savePubs(pubs.filter(x=>x.id!==id)); setPubModal(null); };
  const togglePubDone = id => savePubs(pubs.map(x=>x.id===id?{...x,done:!x.done}:x));
  const orphanedPosts = posts.filter(p=>!years.includes(p.academicYear));

  // ── Activity log ──────────────────────────────────────────────
  const logActivity = async (action, postTitle) => {
    const entry={id:uid(),user:username||"Someone",action,postTitle,timestamp:Date.now()};
    const updated=[entry,...activityLog].slice(0,100);
    setActivityLog(updated);
    try { await supabase.from("activity_log").insert({id:entry.id,data:entry}); } catch(e) {}
  };

  const yearPosts = posts.filter(p=>p.academicYear===settings.year);
  const filtered = yearPosts.filter(p => {
    if(filter.status!=="All"&&p.status!==filter.status)return false;
    if(filter.format!=="All"&&p.format!==filter.format)return false;
    if(filter.month!=="All"&&dateGroupKey(p.date)!==filter.month)return false;
    return true;
  });

  const upsert = async p => {
    setModal(null);
    if(!p.title.trim())return;
    const isNew=!posts.find(x=>x.id===p.id);
    const prev=posts.find(x=>x.id===p.id);
    const stamped={...p,lastUpdatedBy:username||"Unknown",lastUpdatedAt:Date.now()};
    const newPosts=isNew?[...posts,stamped]:posts.map(x=>x.id===p.id?stamped:x);
    await commitPosts(newPosts);
    if(isNew)await logActivity("created",p.title);
    else if(prev?.status!==p.status)await logActivity("moved to "+p.status,p.title);
    else await logActivity("edited",p.title);
  };

  const deletePost = async id => {
    setModal(null);
    const p=posts.find(x=>x.id===id);
    await commitPosts(posts.filter(x=>x.id!==id));
    await logActivity("deleted",p?.title||"Untitled");
  };

  const updateStatus = async (id,status) => {
    const p=posts.find(x=>x.id===id);
    const updated=posts.map(x=>x.id===id?{...x,status,lastUpdatedBy:username||"Unknown",lastUpdatedAt:Date.now()}:x);
    await commitPosts(updated);
    await logActivity("moved to "+status,p?.title||"Untitled");
  };

  const bulkDelete = async ids => {
    await commitPosts(posts.filter(p=>!ids.includes(p.id)));
    await logActivity("bulk deleted "+ids.length+" posts","");
  };

  const deleteAttachments = async id => {
    const p=posts.find(x=>x.id===id);
    const updated=posts.map(x=>x.id===id?{...x,attachments:[]}:x);
    await commitPosts(updated);
    await logActivity("cleared attachments from",p?.title||"a post");
  };

  // ── AI Caption (Gemini) ───────────────────────────────────────
  const genCaption = async (post, feedback) => {
    setAiLoading(true);
    try {
      const prompt = feedback
        ? `You previously wrote this caption:\n\n${post.caption}\n\nFeedback: "${feedback}"\n\nRewrite incorporating this feedback. Write one caption only, no labels.`
        : `You are a social media manager for SOPPS at Northeastern University.\n${settings.instructions?`Style guidelines:\n${settings.instructions}\n`:""}\nGenerate a single social media caption for the following post. Write one caption only — no labels like INSTAGRAM: or FACEBOOK:.\nTitle: ${post.title}\nFormat: ${post.format}\nType: ${post.contentType}\nDate: ${post.date}\nEvent Info: ${post.eventInfo}\nContacts: ${post.contacts}\nContext: ${post.notes}`;

      const key = import.meta.env.VITE_GROQ_API_KEY;
      if (!key) return "Add VITE_GROQ_API_KEY to your .env file to enable AI captions.";

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {"Content-Type":"application/json","Authorization":`Bearer ${key}`},
        body: JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"user",content:prompt}],max_tokens:1000})
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "Error generating caption.";
    } catch(e) { return "Error generating caption."; }
    finally { setAiLoading(false); }
  };

  const exportCSV = postsToExport => {
    const headers=["Title","Date","Status","Format","Content Type","Creator","Contacts","Event Info","Additional Info","Caption","Priority","Deadline","Likes","Reach","Comments","Academic Year","Last Updated By","Attachments"];
    const rows=postsToExport.map(p=>[p.title,p.date,p.status,p.format,p.contentType,p.creator,p.contacts,p.eventInfo,p.notes,(p.caption||"").replace(/\n/g," "),p.priority?"Yes":"No",p.deadline||"",p.engagement?.likes||"",p.engagement?.reach||"",p.engagement?.comments||"",p.academicYear,p.lastUpdatedBy||"",(p.attachments||[]).map(a=>a.name).join("; ")].map(v=>`"${String(v||"").replace(/"/g,'""')}"`));
    const csv=[headers.map(h=>`"${h}"`).join(","),...rows.map(r=>r.join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`SOPPS_Posts_${settings.year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const newForMonth = gk => { const p=blankPost(settings.year); if(gk!=="unscheduled"){p.dateType="month";p.date=gk;} setModal(p); };

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"system-ui",color:"#64748b"}}>Loading…</div>;

  const navItems=[["dashboard","Home"],["list","Content List"],["calendar","Calendar"],["publications","Publications"],["analytics","Analytics"],["activity","Activity"],["settings","Settings"],["help","Help"]];

  return (
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",minHeight:"100vh",background:"#f8f8f8",color:"#1e293b"}}>
      {showNamePrompt&&<NameModal onSave={saveUsername}/>}
      <div style={{background:"white",borderBottom:"3px solid #C8102E",boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
        <div style={{background:NU_RED,padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"48px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{width:"28px",height:"28px",background:"white",borderRadius:"3px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:NU_RED,fontWeight:900,fontSize:"18px",fontFamily:"Georgia,serif",lineHeight:1}}>N</span>
            </div>
            <div style={{lineHeight:1.2}}>
              <div style={{color:"white",fontWeight:700,fontSize:"13px",letterSpacing:"0.02em"}}>Northeastern University</div>
              <div style={{color:"rgba(255,255,255,0.8)",fontWeight:400,fontSize:"10px",letterSpacing:"0.05em",textTransform:"uppercase"}}>School of Pharmacy & Pharmaceutical Sciences</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <select value={settings.year} onChange={e=>saveSettings({...settings,year:e.target.value})} style={{background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",borderRadius:"4px",padding:"4px 8px",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>
              {years.map(y=><option key={y} value={y} style={{color:"#1e293b",background:"white"}}>{y}</option>)}
            </select>
            <div style={{display:"flex",gap:"2px",background:"rgba(0,0,0,0.15)",borderRadius:"5px",padding:"2px"}}>
              <button onClick={undo} disabled={!histState.canUndo} title="Undo" style={{background:"transparent",color:histState.canUndo?"white":"rgba(255,255,255,0.35)",border:"none",borderRadius:"3px",padding:"3px 8px",cursor:histState.canUndo?"pointer":"default",fontSize:"13px"}}>↩</button>
              <button onClick={redo} disabled={!histState.canRedo} title="Redo" style={{background:"transparent",color:histState.canRedo?"white":"rgba(255,255,255,0.35)",border:"none",borderRadius:"3px",padding:"3px 8px",cursor:histState.canRedo?"pointer":"default",fontSize:"13px"}}>↪</button>
            </div>
            {username&&<div onClick={()=>setShowNamePrompt(true)} style={{background:"rgba(255,255,255,0.2)",color:"white",borderRadius:"20px",padding:"4px 12px",fontSize:"12px",cursor:"pointer",border:"1px solid rgba(255,255,255,0.3)",fontWeight:500}}>{username}</div>}
          </div>
        </div>
        <div style={{padding:"0 24px",display:"flex",background:"white"}}>
          {navItems.map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} style={{background:"transparent",color:view===v?NU_RED:"#64748b",border:"none",borderBottom:view===v?`2px solid ${NU_RED}`:"2px solid transparent",padding:"12px 16px",cursor:"pointer",fontSize:"13px",fontWeight:view===v?600:400,transition:"all 0.15s",whiteSpace:"nowrap",marginBottom:"-1px"}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"24px",maxWidth:"1100px",margin:"0 auto"}}>
        {view==="dashboard"&&<Dashboard posts={yearPosts} onEdit={setModal} onNew={()=>setModal(blankPost(settings.year))} onNavigate={setView}/>}
        {view==="list"&&<ListView posts={filtered} allYearPosts={yearPosts} filter={filter} setFilter={setFilter} collapsedMonths={collapsedMonths} setCollapsedMonths={setCollapsedMonths} onNew={()=>setModal(blankPost(settings.year))} onNewForMonth={newForMonth} onEdit={setModal} onStatusChange={updateStatus} onExport={()=>exportCSV(filtered)}/>}
        {view==="calendar"&&<CalView posts={yearPosts} calDate={calDate} setCalDate={setCalDate} onEdit={setModal} onDayClick={d=>setDayModal({date:d})}/>}
        {view==="publications"&&<PublicationsView pubs={pubs} onNew={()=>setPubModal(blankPub())} onEdit={setPubModal} onToggleDone={togglePubDone} collapsed={collapsedPubMonths} setCollapsed={setCollapsedPubMonths}/>}
        {view==="analytics"&&<Analytics posts={yearPosts}/>}
        {view==="activity"&&<ActivityView log={activityLog}/>}
        {view==="help"&&<HelpView/>}
        {view==="settings"&&<SettingsView key={settings.instructions.slice(0,20)} settings={settings} onSave={saveSettings} years={years} onSaveYears={saveYears} currentYear={settings.year} onSetYear={yr=>saveSettings({...settings,year:yr})} orphanedPosts={orphanedPosts} onRescueOrphans={yr=>commitPosts(posts.map(p=>!years.includes(p.academicYear)?{...p,academicYear:yr}:p))} allPosts={posts} onBulkDelete={bulkDelete} onDeleteAttachments={deleteAttachments}/>}
      </div>

      {modal&&<PostModal post={modal} onChange={setModal} onSave={upsert} onDelete={deletePost} onDiscard={()=>setModal(null)} onGenCaption={genCaption} aiLoading={aiLoading}/>}
      {pubModal&&<PubModal pub={pubModal} onChange={setPubModal} onSave={upsertPub} onDelete={deletePub} onDiscard={()=>setPubModal(null)}/>}
      {dayModal&&<DayPickerModal date={dayModal.date} posts={yearPosts} onAssign={p=>{upsert({...p,date:dayModal.date,dateType:"exact"});setDayModal(null);}} onNew={()=>{setModal({...blankPost(settings.year),date:dayModal.date,dateType:"exact"});setDayModal(null);}} onClose={()=>setDayModal(null)}/>}
    </div>
  );
}

function NameModal({ onSave }) {
  const [name,setName]=useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:"20px"}}>
      <div style={{background:"white",borderRadius:"12px",padding:"32px",width:"100%",maxWidth:"380px",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",textAlign:"center"}}>
        <div style={{width:"48px",height:"48px",background:NU_RED,borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
          <span style={{color:"white",fontWeight:900,fontSize:"26px",fontFamily:"Georgia,serif",lineHeight:1}}>N</span>
        </div>
        <h2 style={{margin:"0 0 6px",fontSize:"18px",color:"#1e293b",fontWeight:700}}>Welcome to SOPPS Planner</h2>
        <p style={{fontSize:"13px",color:"#64748b",marginBottom:"20px",lineHeight:1.6,marginTop:"4px"}}>Enter your name so teammates can see who made changes.</p>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&name.trim()&&onSave(name.trim())} placeholder="Your name" autoFocus style={{...S,marginBottom:"14px",textAlign:"center",fontSize:"14px"}}/>
        <button onClick={()=>name.trim()&&onSave(name.trim())} disabled={!name.trim()} style={{background:NU_RED,color:"white",border:"none",borderRadius:"8px",padding:"10px 28px",cursor:"pointer",fontSize:"14px",fontWeight:600,width:"100%",opacity:name.trim()?1:0.5}}>Get Started</button>
      </div>
    </div>
  );
}

function Dashboard({ posts, onEdit, onNew, onNavigate }) {
  const today=new Date(); today.setHours(0,0,0,0);
  const tStr=todayStr();
  const in7=new Date(today); in7.setDate(today.getDate()+7);
  const in7Str=`${in7.getFullYear()}-${String(in7.getMonth()+1).padStart(2,"0")}-${String(in7.getDate()).padStart(2,"0")}`;
  const thisWeek=posts.filter(p=>isExact(p.date)&&p.date>=tStr&&p.date<=in7Str&&p.status!=="Posted").sort((a,b)=>a.date<b.date?-1:1);
  const priorities=posts.filter(p=>p.priority&&p.status!=="Posted"&&p.deadline).sort((a,b)=>a.deadline<b.deadline?-1:1);
  const overdue=posts.filter(p=>p.status==="Planned"&&isExact(p.date)&&p.date<tStr);
  const recentlyPosted=posts.filter(p=>p.status==="Posted").sort((a,b)=>b.lastUpdatedAt-a.lastUpdatedAt).slice(0,3);
  const days=Array.from({length:7},(_,i)=>{ const d=new Date(today); d.setDate(today.getDate()+i); return d; });
  const byDate={};
  posts.forEach(p=>{ if(isExact(p.date)){if(!byDate[p.date])byDate[p.date]=[];byDate[p.date].push(p);} });
  const statCards=[{label:"Total Posts",val:posts.length,color:NU_RED},{label:"Posted",val:posts.filter(p=>p.status==="Posted").length,color:"#22c55e"},{label:"Scheduled",val:posts.filter(p=>p.status==="Scheduled").length,color:"#f59e0b"},{label:"Planned",val:posts.filter(p=>p.status==="Planned").length,color:"#94a3b8"},{label:"Priority",val:posts.filter(p=>p.priority&&p.status!=="Posted").length,color:"#ef4444"}];
  const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const Card=({children,style={}})=><div style={{background:"white",borderRadius:"10px",padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9",...style}}>{children}</div>;
  const ST=({children})=><div style={{fontWeight:700,fontSize:"12px",color:"#1e293b",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:"12px"}}>{children}</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"12px"}}>
        {statCards.map(c=><div key={c.label} style={{background:"white",borderRadius:"10px",padding:"16px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9",borderLeft:`4px solid ${c.color}`}}><div style={{fontSize:"30px",fontWeight:700,color:c.color,lineHeight:1}}>{c.val}</div><div style={{fontSize:"12px",color:"#64748b",fontWeight:500,marginTop:"4px",textTransform:"uppercase",letterSpacing:"0.04em"}}>{c.label}</div></div>)}
      </div>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
          <ST>Next 7 Days</ST>
          <button onClick={()=>onNavigate("calendar")} style={{background:"none",border:"none",color:NU_RED,fontSize:"12px",cursor:"pointer",fontWeight:500}}>View Calendar →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:"8px"}}>
          {days.map((d,i)=>{
            const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
            const dp=byDate[ds]||[];
            const isToday=i===0;
            return (
              <div key={ds} style={{background:isToday?"#fff5f5":"#fafafa",borderRadius:"8px",padding:"8px 6px",minHeight:"80px",border:isToday?`1px solid ${NU_RED}30`:"1px solid #f1f5f9",overflow:"hidden",minWidth:0}}>
                <div style={{fontSize:"10px",color:"#94a3b8",fontWeight:600,textAlign:"center",textTransform:"uppercase"}}>{dayNames[d.getDay()]}</div>
                <div style={{fontSize:"15px",fontWeight:700,color:isToday?NU_RED:"#475569",textAlign:"center",marginBottom:"4px"}}>{d.getDate()}</div>
                {dp.map(p=><div key={p.id} onClick={()=>onEdit(p)} style={{background:p.priority?"#ef4444":STATUS_CLR[p.status],color:"white",borderRadius:"3px",padding:"2px 4px",fontSize:"9px",marginBottom:"2px",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={p.title}>{p.title}</div>)}
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
        <Card>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
            <ST>Up Next</ST>
            <button onClick={onNew} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"4px 10px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>+ New</button>
          </div>
          {thisWeek.length===0&&<div style={{color:"#94a3b8",fontSize:"13px",padding:"10px 0"}}>Nothing scheduled for the next 7 days.</div>}
          {thisWeek.map(p=>(
            <div key={p.id} onClick={()=>onEdit(p)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"7px",cursor:"pointer",marginBottom:"4px"}} onMouseEnter={e=>e.currentTarget.style.background="#f8f8f8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:"8px",height:"8px",borderRadius:"50%",background:STATUS_CLR[p.status],flexShrink:0}}></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>{fmtDate(p.date)} · {p.format}</div></div>
              <span style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"20px",padding:"1px 7px",fontSize:"10px",flexShrink:0}}>{p.status}</span>
            </div>
          ))}
          {overdue.length>0&&<div style={{marginTop:"10px",padding:"8px 10px",background:"#fef2f2",borderRadius:"7px",border:"1px solid #fee2e2"}}>
            <div style={{fontSize:"11px",fontWeight:600,color:"#ef4444",marginBottom:"4px"}}>⚠ {overdue.length} overdue</div>
            {overdue.slice(0,3).map(p=><div key={p.id} onClick={()=>onEdit(p)} style={{fontSize:"12px",color:"#b91c1c",cursor:"pointer",padding:"1px 0"}}>{p.title} — {fmtDate(p.date)}</div>)}
          </div>}
        </Card>
        <Card>
          <ST>Priority Deadlines</ST>
          {priorities.length===0&&<div style={{color:"#94a3b8",fontSize:"13px",padding:"10px 0"}}>No active priority posts.</div>}
          {priorities.map(p=>{
            const daysLeft=p.deadline?Math.ceil((new Date(p.deadline)-new Date())/86400000):null;
            const urgent=daysLeft!==null&&daysLeft<=3;
            return <div key={p.id} onClick={()=>onEdit(p)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"7px",cursor:"pointer",marginBottom:"4px",background:urgent?"#fef2f2":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background=urgent?"#fee2e2":"#f8f8f8"} onMouseLeave={e=>e.currentTarget.style.background=urgent?"#fef2f2":"transparent"}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:"11px",color:urgent?"#ef4444":"#94a3b8",fontWeight:urgent?600:400}}>Post by {fmtDate(p.deadline)}{daysLeft!==null?` (${daysLeft<=0?"overdue":daysLeft===1?"tomorrow":`${daysLeft} days`})`:""}</div></div>
              <span style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"20px",padding:"1px 7px",fontSize:"10px",flexShrink:0}}>{p.status}</span>
            </div>;
          })}
        </Card>
        <Card>
          <ST>Recently Posted</ST>
          {recentlyPosted.length===0&&<div style={{color:"#94a3b8",fontSize:"13px",padding:"10px 0"}}>Nothing posted yet.</div>}
          {recentlyPosted.map(p=>(
            <div key={p.id} onClick={()=>onEdit(p)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"7px",cursor:"pointer",marginBottom:"4px"}} onMouseEnter={e=>e.currentTarget.style.background="#f8f8f8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>{fmtDate(p.date)} · {p.format}</div></div>
              {(p.engagement?.likes||p.engagement?.reach)&&<div style={{fontSize:"11px",color:"#64748b",textAlign:"right",flexShrink:0}}>{p.engagement.likes&&<div>♥ {p.engagement.likes}</div>}{p.engagement.reach&&<div>◎ {p.engagement.reach}</div>}</div>}
            </div>
          ))}
        </Card>
        <Card>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
            <ST>Needs a Date</ST>
            <button onClick={()=>onNavigate("list")} style={{background:"none",border:"none",color:NU_RED,fontSize:"12px",cursor:"pointer",fontWeight:500}}>View All →</button>
          </div>
          {(()=>{ const nd=posts.filter(p=>isMonthOnly(p.date)&&p.status!=="Posted"); if(nd.length===0)return <div style={{color:"#94a3b8",fontSize:"13px",padding:"10px 0"}}>All posts have exact dates.</div>; return nd.slice(0,5).map(p=><div key={p.id} onClick={()=>onEdit(p)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px",borderRadius:"7px",cursor:"pointer",marginBottom:"4px"}} onMouseEnter={e=>e.currentTarget.style.background="#f8f8f8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>Month only: {fmtDate(p.date)}</div></div><span style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"20px",padding:"1px 7px",fontSize:"10px",flexShrink:0}}>{p.status}</span></div>); })()}
        </Card>
      </div>
    </div>
  );
}

function PostModal({ post, onChange, onSave, onDelete, onDiscard, onGenCaption, aiLoading }) {
  const f=(k,v)=>onChange({...post,[k]:v});
  const ef=(k,v)=>onChange({...post,engagement:{...post.engagement,[k]:v}});
  const [feedback,setFeedback]=useState("");
  const [copied,setCopied]=useState(false);
  const setDateType=type=>{
    if(type==="none"){onChange({...post,dateType:"none",date:""});return;}
    if(type==="month"){const yr=new Date().getFullYear(),mo=String(new Date().getMonth()+1).padStart(2,"0");const base=isExact(post.date)?post.date.slice(0,7):isMonthOnly(post.date)?post.date:`${yr}-${mo}`;onChange({...post,dateType:"month",date:base});return;}
    const base=(isExact(post.date)||isMonthOnly(post.date))?post.date.slice(0,7)+"-01":"";
    onChange({...post,dateType:"exact",date:base==="--01"?"":base});
  };
  const handleGen=async()=>{const cap=await onGenCaption(post,"");onChange({...post,caption:cap});setFeedback("");};
  const handleRegen=async()=>{if(!feedback.trim())return;const cap=await onGenCaption(post,feedback);onChange({...post,caption:cap});setFeedback("");};
  const copyCaption=()=>{if(!post.caption)return;navigator.clipboard.writeText(post.caption).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const TB=({active,onClick,children})=><button onClick={onClick} style={{background:active?NU_RED:"#f1f5f9",color:active?"white":"#475569",border:"none",borderRadius:"20px",padding:"4px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>{children}</button>;
  const handleFileUpload=e=>{
    const files=Array.from(e.target.files);
    const readers=files.map(file=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:file.name,type:file.type,size:file.size,data:r.result});r.readAsDataURL(file);}));
    Promise.all(readers).then(nf=>f("attachments",[...(post.attachments||[]),...nf]));
    e.target.value="";
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}}>
      <div style={{background:"white",borderRadius:"12px",width:"100%",maxWidth:"600px",maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"12px 12px 0 0",background:"#fafafa",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",minWidth:0,flex:1,marginRight:"12px"}}>
            <span style={{fontWeight:700,fontSize:"15px",color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{post.title||"New Post"}</span>
            {post.priority&&<span style={{background:"#fef2f2",color:"#ef4444",borderRadius:"20px",padding:"1px 8px",fontSize:"11px",fontWeight:600}}>Priority</span>}
          </div>
          <div style={{display:"flex",gap:"6px",flexShrink:0}}>
            <button onClick={()=>onDelete(post.id)} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:"7px",padding:"7px 13px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Delete</button>
            <button onClick={onDiscard} style={{background:"#e2e8f0",color:"#475569",border:"none",borderRadius:"7px",padding:"7px 13px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Discard</button>
            <button onClick={()=>onSave(post)} style={{background:NU_RED,color:"white",border:"none",borderRadius:"7px",padding:"7px 18px",cursor:"pointer",fontSize:"13px",fontWeight:700}}>Save</button>
          </div>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:"13px",overflowY:"auto",flex:1}}>
          <Row label="Title"><input value={post.title} onChange={e=>f("title",e.target.value)} style={S} placeholder="Post title or topic"/></Row>
          <Row label="Date">
            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              <div style={{display:"flex",gap:"6px"}}>{[["none","No date"],["month","Month only"],["exact","Exact date"]].map(([t,l])=><TB key={t} active={post.dateType===t} onClick={()=>setDateType(t)}>{l}</TB>)}</div>
              {post.dateType==="month"&&<div style={{display:"flex",gap:"8px"}}><select value={post.date?post.date.split("-")[1]||"01":"01"} onChange={e=>{const yr=post.date?post.date.split("-")[0]:new Date().getFullYear();f("date",`${yr}-${e.target.value}`);}} style={{...S,flex:1}}>{MONTHS_LONG.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}</select><select value={post.date?post.date.split("-")[0]:new Date().getFullYear()} onChange={e=>{const mo=post.date?post.date.split("-")[1]||"01":"01";f("date",`${e.target.value}-${mo}`);}} style={{...S,flex:1}}>{[2025,2026,2027,2028,2029,2030].map(y=><option key={y}>{y}</option>)}</select></div>}
              {post.dateType==="exact"&&<input type="date" value={post.date} onChange={e=>f("date",e.target.value)} style={S}/>}
            </div>
          </Row>
          <Row label="Priority">
            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",paddingTop:"4px"}}><input type="checkbox" checked={post.priority||false} onChange={e=>f("priority",e.target.checked)}/><span style={{fontSize:"13px",color:"#475569"}}>Mark as priority</span>{post.priority&&<span style={{background:"#fef2f2",color:"#ef4444",borderRadius:"4px",padding:"1px 6px",fontSize:"11px",fontWeight:600}}>High Priority</span>}</label>
              {post.priority&&<div style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontSize:"12px",color:"#64748b",whiteSpace:"nowrap"}}>Must post by:</span><input type="date" value={post.deadline||""} onChange={e=>f("deadline",e.target.value)} style={{...S,flex:1}}/></div>}
            </div>
          </Row>
          <Row label="Format"><div style={{display:"flex",gap:"6px",paddingTop:"2px"}}>{FORMATS.map(fm=><TB key={fm} active={post.format===fm} onClick={()=>f("format",fm)}>{fm}</TB>)}</div></Row>
          <Row label="Type"><select value={post.contentType} onChange={e=>f("contentType",e.target.value)} style={S}>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></Row>
          <Row label="Creator"><input value={post.creator} onChange={e=>f("creator",e.target.value)} style={S} placeholder="Who's creating this?"/></Row>
          <Row label="Status"><div style={{display:"flex",gap:"6px",flexWrap:"wrap",paddingTop:"2px"}}>{STATUSES.map(s=><button key={s} onClick={()=>f("status",s)} style={{background:post.status===s?STATUS_CLR[s]:"#f1f5f9",color:post.status===s?"white":"#475569",border:"none",borderRadius:"20px",padding:"4px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>{s}</button>)}</div></Row>
          <Row label="Event Info"><textarea value={post.eventInfo||""} onChange={e=>f("eventInfo",e.target.value)} rows={2} style={{...S,resize:"vertical"}} placeholder="Event details, date/time, location…"/></Row>
          <Row label="Contacts"><input value={post.contacts||""} onChange={e=>f("contacts",e.target.value)} style={S} placeholder="Names or emails of relevant contacts…"/></Row>
          <Row label="Additional Info"><textarea value={post.notes} onChange={e=>f("notes",e.target.value)} rows={2} style={{...S,resize:"vertical"}} placeholder="Links, extra context, notes…"/></Row>
          <div style={{borderTop:"1px solid #f1f5f9",paddingTop:"14px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
              <span style={{fontWeight:600,fontSize:"13px",color:"#1e293b"}}>Attachments</span>
              <label style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:"6px",padding:"5px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>+ Attach File<input type="file" accept="image/*,.pdf" multiple style={{display:"none"}} onChange={handleFileUpload}/></label>
            </div>
            <div style={{fontSize:"11px",color:"#94a3b8",marginBottom:"8px"}}>Images and PDFs. Files are stored with each post.</div>
            {(post.attachments||[]).length===0
              ? <div style={{fontSize:"12px",color:"#94a3b8",fontStyle:"italic",padding:"4px 0"}}>No attachments yet.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>{(post.attachments||[]).map((att,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",background:"#f8f8f8",borderRadius:"7px",border:"1px solid #e2e8f0"}}>
                  <div style={{width:"32px",height:"32px",borderRadius:"6px",background:att.type==="application/pdf"?"#fef2f2":"#eff6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"14px"}}>{att.type==="application/pdf"?"📄":"🖼"}</span></div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:"12px",fontWeight:500,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.name}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>{fmtSize(att.size)}</div></div>
                  {att.data&&<a href={att.data} target="_blank" rel="noreferrer" style={{fontSize:"11px",color:NU_RED,textDecoration:"none",fontWeight:500,flexShrink:0}}>View</a>}
                  {att.data&&<a href={att.data} download={att.name} style={{fontSize:"11px",color:"#64748b",textDecoration:"none",fontWeight:500,flexShrink:0}}>↓</a>}
                  <button onClick={()=>f("attachments",(post.attachments||[]).filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"18px",lineHeight:1,flexShrink:0}}>×</button>
                </div>
              ))}</div>
            }
          </div>
          <div style={{borderTop:"1px solid #f1f5f9",paddingTop:"14px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
              <span style={{fontWeight:600,fontSize:"13px",color:"#1e293b"}}>Caption</span>
              <div style={{display:"flex",gap:"6px"}}>
                {post.caption&&<button onClick={copyCaption} style={{background:copied?"#22c55e":"#f1f5f9",color:copied?"white":"#475569",border:"none",borderRadius:"6px",padding:"5px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>{copied?"Copied!":"Copy"}</button>}
                <button onClick={handleGen} disabled={aiLoading} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"5px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500,opacity:aiLoading?0.6:1}}>{aiLoading?"Generating…":"Generate with AI"}</button>
              </div>
            </div>
            <textarea value={post.caption||""} onChange={e=>f("caption",e.target.value)} rows={5} style={{...S,resize:"vertical"}} placeholder="AI-generated captions will appear here, separated by platform."/>
            {post.caption&&<div style={{marginTop:"10px",background:"#f8f8f8",borderRadius:"8px",padding:"12px",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:"12px",fontWeight:600,color:"#475569",marginBottom:"6px"}}>Feedback to improve caption</div>
              <div style={{display:"flex",gap:"8px"}}>
                <input value={feedback} onChange={e=>setFeedback(e.target.value)} onKeyDown={e=>e.key==="Enter"&&feedback.trim()&&!aiLoading&&handleRegen()} placeholder="e.g. Make it shorter, more formal…" style={{...S,flex:1,fontSize:"12px"}}/>
                <button onClick={handleRegen} disabled={!feedback.trim()||aiLoading} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"6px 12px",cursor:feedback.trim()&&!aiLoading?"pointer":"default",fontSize:"12px",fontWeight:500,opacity:feedback.trim()&&!aiLoading?1:0.5,whiteSpace:"nowrap"}}>{aiLoading?"…":"Regenerate"}</button>
              </div>
            </div>}
          </div>
          {post.status==="Posted"&&<div style={{borderTop:"1px solid #f1f5f9",paddingTop:"14px"}}>
            <div style={{fontWeight:600,fontSize:"13px",color:"#1e293b",marginBottom:"10px"}}>Engagement Metrics</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
              {["likes","reach","comments"].map(k=><div key={k}><label style={{fontSize:"11px",color:"#64748b",textTransform:"capitalize",display:"block",marginBottom:"4px"}}>{k}</label><input type="number" value={post.engagement?.[k]||""} onChange={e=>ef(k,e.target.value)} style={S} placeholder="0" min="0"/></div>)}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function Analytics({ posts }) {
  const [monthFilter,setMonthFilter]=useState({contentType:"All",format:"All"});
  const [topN,setTopN]=useState("likes");
  const monthPosts=posts.filter(p=>{if(monthFilter.contentType!=="All"&&p.contentType!==monthFilter.contentType)return false;if(monthFilter.format!=="All"&&p.format!==monthFilter.format)return false;return true;});
  const monthData={};monthPosts.forEach(p=>{if(p.date){const k=isExact(p.date)?p.date.slice(0,7):p.date;monthData[k]=(monthData[k]||0)+1;}});
  const monthChart=Object.entries(monthData).sort().map(([k,v])=>({month:`${MONTHS_SHORT[parseInt(k.split("-")[1])-1]} '${k.slice(2,4)}`,count:v}));
  const typePerf={};posts.forEach(p=>{if(!typePerf[p.contentType])typePerf[p.contentType]={total:0,count:0,posted:0};typePerf[p.contentType].total+=1;if(p.status==="Posted"){typePerf[p.contentType].posted+=1;typePerf[p.contentType].count+=(Number(p.engagement?.likes)||0)+(Number(p.engagement?.reach)||0);}});
  const typeChart=Object.entries(typePerf).map(([name,v])=>({name,total:v.total,posted:v.posted,avgEng:v.posted>0?Math.round(v.count/v.posted):0})).sort((a,b)=>b.avgEng-a.avgEng);
  const fmtPerf={};posts.forEach(p=>{if(!p.format)return;if(!fmtPerf[p.format])fmtPerf[p.format]={total:0,likes:0,reach:0,posted:0};fmtPerf[p.format].total+=1;if(p.status==="Posted"){fmtPerf[p.format].posted+=1;fmtPerf[p.format].likes+=Number(p.engagement?.likes)||0;fmtPerf[p.format].reach+=Number(p.engagement?.reach)||0;}});
  const fmtChart=Object.entries(fmtPerf).map(([name,v])=>({name,total:v.total,posted:v.posted,avgLikes:v.posted>0?Math.round(v.likes/v.posted):0,avgReach:v.posted>0?Math.round(v.reach/v.posted):0})).sort((a,b)=>b.avgLikes-a.avgLikes);
  const posted=posts.filter(p=>p.status==="Posted"&&(p.engagement?.likes||p.engagement?.reach||p.engagement?.comments));
  const topPosts=[...posted].sort((a,b)=>(Number(b.engagement?.[topN])||0)-(Number(a.engagement?.[topN])||0)).slice(0,5);
  const avg=key=>posted.length?Math.round(posted.reduce((s,p)=>s+(Number(p.engagement?.[key])||0),0)/posted.length):0;
  const sel={...S,width:"auto",fontSize:"11px",padding:"3px 7px"};
  const Card=({children})=><div style={{background:"white",borderRadius:"10px",padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9"}}>{children}</div>;
  const CT=({children,right})=><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}><div style={{fontWeight:700,fontSize:"12px",color:"#1e293b",textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</div>{right&&<div>{right}</div>}</div>;
  const SC=({label,val,sub})=><div style={{background:"white",borderRadius:"10px",padding:"16px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9",borderTop:`3px solid ${NU_RED}`}}><div style={{fontSize:"30px",fontWeight:700,color:NU_RED,lineHeight:1}}>{val}</div><div style={{fontSize:"12px",fontWeight:600,color:"#475569",marginTop:"4px",textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>{sub&&<div style={{fontSize:"11px",color:"#94a3b8",marginTop:"2px"}}>{sub}</div>}</div>;
  const Empty=()=><div style={{color:"#94a3b8",fontSize:"13px",padding:"20px 0",textAlign:"center"}}>No data yet.</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"12px"}}>
        <SC label="Total Posts" val={posts.length}/><SC label="Posted" val={posts.filter(p=>p.status==="Posted").length}/>
        <SC label="Scheduled" val={posts.filter(p=>p.status==="Scheduled").length}/><SC label="Priority" val={posts.filter(p=>p.priority).length} sub="flagged"/>
        <SC label="Avg Likes" val={avg("likes")} sub="posted only"/><SC label="Avg Reach" val={avg("reach")} sub="posted only"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
        <Card><CT right={<div style={{display:"flex",gap:"5px"}}><select value={monthFilter.contentType} onChange={e=>setMonthFilter(f=>({...f,contentType:e.target.value}))} style={sel}><option value="All">All Types</option>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</select><select value={monthFilter.format} onChange={e=>setMonthFilter(f=>({...f,format:e.target.value}))} style={sel}><option value="All">All Formats</option>{FORMATS.map(f=><option key={f}>{f}</option>)}</select></div>}>Posts Per Month</CT>{monthChart.length===0?<Empty/>:<ResponsiveContainer width="100%" height={180}><BarChart data={monthChart}><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill={NU_RED} radius={[3,3,0,0]}/></BarChart></ResponsiveContainer>}</Card>
        <Card><CT right={<select value={topN} onChange={e=>setTopN(e.target.value)} style={sel}><option value="likes">By Likes</option><option value="reach">By Reach</option><option value="comments">By Comments</option></select>}>Top Performing Posts</CT>{topPosts.length===0?<div style={{color:"#94a3b8",fontSize:"13px",padding:"20px 0",textAlign:"center"}}>No engagement data yet.</div>:topPosts.map((p,i)=>(<div key={p.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"7px 0",borderBottom:i<topPosts.length-1?"1px solid #f8f8f8":"none"}}><div style={{width:"20px",height:"20px",borderRadius:"50%",background:i===0?NU_RED:"#f1f5f9",color:i===0?"white":"#64748b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,flexShrink:0}}>{i+1}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:"13px",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>{p.contentType} · {p.format} · {fmtDate(p.date)}</div></div><div style={{fontSize:"12px",fontWeight:700,color:NU_RED,flexShrink:0}}>{Number(p.engagement?.[topN])||0} <span style={{fontWeight:400,color:"#94a3b8"}}>{topN}</span></div></div>))}</Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
        <Card><CT>Content Type Performance</CT><div style={{fontSize:"10px",color:"#94a3b8",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.04em"}}>Avg combined likes + reach per posted item</div>{typeChart.length===0?<Empty/>:typeChart.map((t,i)=>(<div key={t.name} style={{marginBottom:"10px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",marginBottom:"3px"}}><span style={{fontWeight:500,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"65%"}}>{t.name}</span><span style={{color:"#64748b",flexShrink:0}}>{t.posted} posted · <span style={{fontWeight:600,color:NU_RED}}>{t.avgEng} avg</span></span></div><div style={{height:"6px",background:"#f1f5f9",borderRadius:"4px",overflow:"hidden"}}><div style={{height:"100%",background:TYPE_CLRS[i%TYPE_CLRS.length],borderRadius:"4px",width:`${typeChart[0].avgEng>0?Math.round((t.avgEng/typeChart[0].avgEng)*100):0}%`}}></div></div></div>))}</Card>
        <Card><CT>Format Performance</CT><div style={{fontSize:"10px",color:"#94a3b8",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.04em"}}>Average likes and reach by format type</div>{fmtChart.length===0?<Empty/>:fmtChart.map((f,i)=>(<div key={f.name} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<fmtChart.length-1?"1px solid #f8f8f8":"none"}}><div style={{width:"36px",height:"36px",borderRadius:"8px",background:TYPE_CLRS[i%TYPE_CLRS.length]+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"12px",fontWeight:700,color:TYPE_CLRS[i%TYPE_CLRS.length]}}>{f.name[0]}</span></div><div style={{flex:1}}><div style={{fontSize:"13px",fontWeight:600,color:"#1e293b"}}>{f.name}</div><div style={{fontSize:"11px",color:"#94a3b8"}}>{f.total} total · {f.posted} posted</div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:"12px",fontWeight:600,color:NU_RED}}>♥ {f.avgLikes}</div><div style={{fontSize:"11px",color:"#64748b"}}>◎ {f.avgReach}</div></div></div>))}</Card>
      </div>
    </div>
  );
}

function PublicationsView({ pubs, onNew, onEdit, onToggleDone, collapsed, setCollapsed }) {
  const sorted=[...pubs].sort((a,b)=>(a.publishedMonth||"9999")<(b.publishedMonth||"9999")?-1:1);
  const groups={};sorted.forEach(p=>{ const k=p.publishedMonth||"unscheduled"; if(!groups[k])groups[k]=[]; groups[k].push(p); });
  const groupKeys=Object.keys(groups).sort((a,b)=>a<b?-1:1);
  if(groups["unscheduled"]){groupKeys.splice(groupKeys.indexOf("unscheduled"),1);groupKeys.push("unscheduled");}
  const fmtMonth=k=>{ if(k==="unscheduled")return"No Month"; const[y,m]=k.split("-"); return`${MONTHS_LONG[parseInt(m)-1]} ${y}`; };
  const toggle=k=>setCollapsed(c=>({...c,[k]:!c[k]}));
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
        <div><h2 style={{margin:0,fontSize:"20px",color:"#1e293b",fontWeight:700}}>Publications</h2><div style={{fontSize:"13px",color:"#64748b",marginTop:"3px"}}>{pubs.length} total · {pubs.filter(p=>p.done).length} posted to social media</div></div>
        <button onClick={onNew} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"8px 18px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>+ Add Publication</button>
      </div>
      {pubs.length===0&&<div style={{background:"white",borderRadius:"10px",padding:"50px",textAlign:"center",color:"#94a3b8",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>No publications yet.</div>}
      {groupKeys.map(gk=>{
        const isCollapsed=!!collapsed[gk];
        const doneCount=groups[gk].filter(p=>p.done).length;
        return (
          <div key={gk} style={{marginBottom:"18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
              <div onClick={()=>toggle(gk)} style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none",flex:1,minWidth:0}}>
                <span style={{fontSize:"11px",color:"#94a3b8",display:"inline-block",transform:isCollapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform 0.15s",flexShrink:0}}>▼</span>
                <span style={{fontWeight:700,fontSize:"15px",color:NU_RED,whiteSpace:"nowrap"}}>{fmtMonth(gk)}</span>
                <span style={{fontSize:"11px",color:"#94a3b8",background:"#f1f5f9",borderRadius:"20px",padding:"2px 8px"}}>{groups[gk].length} pub{groups[gk].length!==1?"s":""}</span>
                {doneCount>0&&<span style={{fontSize:"11px",color:"#16a34a",background:"#f0fdf4",borderRadius:"20px",padding:"2px 8px"}}>✓ {doneCount} posted</span>}
                <div style={{flex:1,height:"1px",background:"#e2e8f0"}}></div>
              </div>
            </div>
            {!isCollapsed&&<div style={{background:"white",borderRadius:"10px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",overflow:"hidden",border:"1px solid #f1f5f9"}}>
              <div style={{display:"grid",gridTemplateColumns:"32px 1fr 1fr 2fr 130px 80px 70px",background:"#fafafa",borderBottom:"1px solid #e2e8f0",padding:"8px 14px",fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                <div></div><div>Faculty</div><div>Journal</div><div>Article Title</div><div>Published</div><div>Link</div><div></div>
              </div>
              {groups[gk].map((p,i)=>(
                <div key={p.id} style={{display:"grid",gridTemplateColumns:"32px 1fr 1fr 2fr 130px 80px 70px",padding:"10px 14px",borderBottom:i<groups[gk].length-1?"1px solid #f8f8f8":"none",alignItems:"center",background:p.done?"#f0fdf4":"white"}}>
                  <div><div onClick={()=>onToggleDone(p.id)} style={{width:"18px",height:"18px",borderRadius:"50%",border:`2px solid ${p.done?"#22c55e":"#cbd5e1"}`,background:p.done?"#22c55e":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{p.done&&<span style={{color:"white",fontSize:"11px",lineHeight:1}}>✓</span>}</div></div>
                  <div style={{fontSize:"13px",fontWeight:600,color:p.done?"#64748b":"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:"8px"}}>{[p.faculty,p.faculty2,p.faculty3].filter(Boolean).join(", ")||"—"}</div>
                  <div style={{fontSize:"12px",color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:"8px"}}>{p.journal||"—"}</div>
                  <div style={{fontSize:"12px",color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:"8px"}} title={p.articleTitle}>{p.articleTitle&&p.articleTitle.includes("<")?<span dangerouslySetInnerHTML={{__html:p.articleTitle}}/>:p.articleTitle||"—"}</div>
                  <div style={{fontSize:"12px",color:"#64748b",whiteSpace:"nowrap"}}>{p.publishedMonth?`${MONTHS_SHORT[parseInt(p.publishedMonth.split("-")[1])-1]} ${p.publishedMonth.split("-")[0]}`:"—"}</div>
                  <div style={{fontSize:"12px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:"8px"}}>{p.articleLink?<a href={p.articleLink} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:NU_RED,textDecoration:"none",fontWeight:500}}>View →</a>:"—"}</div>
                  <div style={{textAlign:"right"}}><button onClick={()=>onEdit(p)} style={{background:"#f1f5f9",border:"none",borderRadius:"5px",padding:"4px 9px",cursor:"pointer",fontSize:"11px",color:"#475569"}}>Edit</button></div>
                </div>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function PubModal({ pub, onChange, onSave, onDelete, onDiscard }) {
  const f=(k,v)=>onChange({...pub,[k]:v});
  const isNew=!pub.faculty&&!pub.articleTitle;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}}>
      <div style={{background:"white",borderRadius:"12px",width:"100%",maxWidth:"540px",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fafafa",borderRadius:"12px 12px 0 0"}}>
          <span style={{fontWeight:700,fontSize:"15px",color:"#1e293b"}}>{isNew?"New Publication":pub.articleTitle||"Edit Publication"}</span>
          <div style={{display:"flex",gap:"6px"}}>
            {!isNew&&<button onClick={()=>onDelete(pub.id)} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:"7px",padding:"7px 13px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Delete</button>}
            <button onClick={onDiscard} style={{background:"#e2e8f0",color:"#475569",border:"none",borderRadius:"7px",padding:"7px 13px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Discard</button>
            <button onClick={()=>onSave(pub)} style={{background:NU_RED,color:"white",border:"none",borderRadius:"7px",padding:"7px 18px",cursor:"pointer",fontSize:"13px",fontWeight:700}}>Save</button>
          </div>
        </div>
        <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:"13px"}}>
          <Row label="Faculty 1"><input value={pub.faculty} onChange={e=>f("faculty",e.target.value)} style={S} placeholder="First and last name"/></Row>
          <Row label="Faculty 2"><input value={pub.faculty2||""} onChange={e=>f("faculty2",e.target.value)} style={S} placeholder="First and last name (optional)"/></Row>
          <Row label="Faculty 3"><input value={pub.faculty3||""} onChange={e=>f("faculty3",e.target.value)} style={S} placeholder="First and last name (optional)"/></Row>
          <Row label="Journal"><input value={pub.journal} onChange={e=>f("journal",e.target.value)} style={S} placeholder="Journal name"/></Row>
          <Row label="Article Title">
            <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
              <div style={{display:"flex",gap:"4px"}}>
                <button type="button" onMouseDown={e=>{
                  e.preventDefault();
                  const ta=document.getElementById("articleTitleTA") as HTMLTextAreaElement;
                  if(!ta)return;
                  const start=ta.selectionStart,end=ta.selectionEnd;
                  const sel=ta.value.slice(start,end);
                  const newVal=ta.value.slice(0,start)+(sel?`<sup>${sel}</sup>`:"<sup></sup>")+ta.value.slice(end);
                  f("articleTitle",newVal);
                  setTimeout(()=>{ta.focus();ta.setSelectionRange(start+5,sel?start+5+sel.length:start+5);},0);
                }} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:"4px",padding:"2px 8px",cursor:"pointer",fontSize:"12px",fontWeight:600,color:"#475569"}}>X<sup style={{fontSize:"8px"}}>2</sup> Sup</button>
                <button type="button" onMouseDown={e=>{
                  e.preventDefault();
                  const ta=document.getElementById("articleTitleTA") as HTMLTextAreaElement;
                  if(!ta)return;
                  const start=ta.selectionStart,end=ta.selectionEnd;
                  const sel=ta.value.slice(start,end);
                  const newVal=ta.value.slice(0,start)+(sel?`<sub>${sel}</sub>`:"<sub></sub>")+ta.value.slice(end);
                  f("articleTitle",newVal);
                  setTimeout(()=>{ta.focus();ta.setSelectionRange(start+5,sel?start+5+sel.length:start+5);},0);
                }} style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:"4px",padding:"2px 8px",cursor:"pointer",fontSize:"12px",fontWeight:600,color:"#475569"}}>X<sub style={{fontSize:"8px"}}>2</sub> Sub</button>
                <span style={{fontSize:"11px",color:"#94a3b8",alignSelf:"center",marginLeft:"4px"}}>Select text then click to wrap</span>
              </div>
              <textarea id="articleTitleTA" value={pub.articleTitle} onChange={e=>f("articleTitle",e.target.value)} rows={2} style={{...S,resize:"vertical"}} placeholder="Full article title"/>
              {pub.articleTitle&&pub.articleTitle.includes("<")&&(
                <div style={{fontSize:"12px",color:"#64748b",padding:"4px 8px",background:"#f8fafc",borderRadius:"4px",border:"1px solid #e2e8f0"}}>
                  Preview: <span dangerouslySetInnerHTML={{__html:pub.articleTitle}}/>
                </div>
              )}
            </div>
          </Row>
          <Row label="Article Link"><input value={pub.articleLink} onChange={e=>f("articleLink",e.target.value)} style={S} placeholder="https://…"/></Row>
          <Row label="Published">
            <div style={{display:"flex",gap:"8px"}}>
              <select value={pub.publishedMonth?pub.publishedMonth.split("-")[1]||"01":"01"} onChange={e=>{const yr=pub.publishedMonth?pub.publishedMonth.split("-")[0]:new Date().getFullYear();f("publishedMonth",`${yr}-${e.target.value}`);}} style={{...S,flex:1}}>{MONTHS_LONG.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}</select>
              <select value={pub.publishedMonth?pub.publishedMonth.split("-")[0]:new Date().getFullYear()} onChange={e=>{const mo=pub.publishedMonth?pub.publishedMonth.split("-")[1]||"01":"01";f("publishedMonth",`${e.target.value}-${mo}`);}} style={{...S,flex:1}}>{[2022,2023,2024,2025,2026,2027,2028].map(y=><option key={y}>{y}</option>)}</select>
            </div>
          </Row>
          <Row label="Posted?">
            <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",paddingTop:"4px"}}>
              <input type="checkbox" checked={pub.done||false} onChange={e=>f("done",e.target.checked)}/>
              <span style={{fontSize:"13px",color:"#475569"}}>Mark as posted to social media</span>
              {pub.done&&<span style={{background:"#f0fdf4",color:"#16a34a",borderRadius:"4px",padding:"1px 6px",fontSize:"11px",fontWeight:600}}>Posted</span>}
            </label>
          </Row>
        </div>
      </div>
    </div>
  );
}

function ListView({ posts, allYearPosts, filter, setFilter, collapsedMonths, setCollapsedMonths, onNew, onNewForMonth, onEdit, onStatusChange, onExport }) {
  const sorted=[...posts].sort((a,b)=>(a.date||"9999")<(b.date||"9999")?-1:1);
  const groups={};sorted.forEach(p=>{ const k=dateGroupKey(p.date); if(!groups[k])groups[k]=[]; groups[k].push(p); });
  const groupKeys=Object.keys(groups).sort((a,b)=>a<b?-1:1);
  if(groups["unscheduled"]){groupKeys.splice(groupKeys.indexOf("unscheduled"),1);groupKeys.push("unscheduled");}
  const allGroupKeys=[...new Set(allYearPosts.map(p=>dateGroupKey(p.date)))].sort();
  const nextStatus=s=>{const i=STATUSES.indexOf(s);return i<STATUSES.length-1?STATUSES[i+1]:null;};
  const toggleCollapse=k=>setCollapsedMonths(c=>({...c,[k]:!isCollapsed(k)}));
  const currentYM=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const isCollapsed=(k:string)=>collapsedMonths[k]!==undefined?!!collapsedMonths[k]:k!=="unscheduled"&&k<currentYM;
  return (
    <div>
      <div style={{display:"flex",gap:"8px",marginBottom:"16px",alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={onNew} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"8px 16px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>+ New Post</button>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>{["All",...STATUSES].map(s=><button key={s} onClick={()=>setFilter(f=>({...f,status:s}))} style={{background:filter.status===s?(STATUS_CLR[s]||NU_RED):"#e2e8f0",color:filter.status===s?"white":"#475569",border:"none",borderRadius:"20px",padding:"4px 12px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>{s}</button>)}</div>
        <select value={filter.format} onChange={e=>setFilter(f=>({...f,format:e.target.value}))} style={{...S,width:"auto"}}><option value="All">All Formats</option>{FORMATS.map(f=><option key={f}>{f}</option>)}</select>
        <select value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))} style={{...S,width:"auto"}}><option value="All">All Months</option>{allGroupKeys.map(k=><option key={k} value={k}>{fmtKey(k)}</option>)}</select>
        <button onClick={onExport} style={{marginLeft:"auto",background:"white",border:"1px solid #e2e8f0",color:"#475569",borderRadius:"6px",padding:"7px 14px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>↓ Export CSV</button>
      </div>
      {sorted.length===0&&<div style={{background:"white",borderRadius:"10px",padding:"50px",textAlign:"center",color:"#94a3b8",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>No posts match your filters.</div>}
      {groupKeys.map(gk=>{
        const collapsed=isCollapsed(gk);
        return (
          <div key={gk} style={{marginBottom:"18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
              <div onClick={()=>toggleCollapse(gk)} style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer",userSelect:"none",flex:1,minWidth:0}}>
                <span style={{fontSize:"11px",color:"#94a3b8",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform 0.15s",flexShrink:0}}>▼</span>
                <span style={{fontWeight:700,fontSize:"15px",color:NU_RED,whiteSpace:"nowrap"}}>{fmtKey(gk)}</span>
                <span style={{fontSize:"11px",color:"#94a3b8",background:"#f1f5f9",borderRadius:"20px",padding:"2px 8px",whiteSpace:"nowrap"}}>{groups[gk].length} post{groups[gk].length!==1?"s":""}</span>
                <div style={{flex:1,height:"1px",background:"#e2e8f0"}}></div>
              </div>
              <button onClick={()=>onNewForMonth(gk)} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"5px 13px",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>+ Add</button>
            </div>
            {!collapsed&&<div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              {groups[gk].map(p=>{
                const ns=nextStatus(p.status);
                const deadlineSoon=p.priority&&p.deadline&&((new Date(p.deadline)-new Date())/(1000*60*60*24))<7;
                return (
                  <div key={p.id} style={{background:"white",borderRadius:"10px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)",padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:"12px",border:"1px solid #f1f5f9",borderLeft:`3px solid ${p.priority?"#ef4444":STATUS_CLR[p.status]}`}}>
                    <div title={ns?`Mark as ${ns}`:"Already Posted"} onClick={()=>ns&&onStatusChange(p.id,ns)} style={{width:"20px",height:"20px",borderRadius:"50%",border:`2px solid ${STATUS_CLR[p.status]}`,background:p.status==="Posted"?STATUS_CLR["Posted"]:"white",cursor:ns?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:"2px"}}>{p.status==="Posted"&&<span style={{color:"white",fontSize:"12px"}}>✓</span>}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap",marginBottom:"5px"}}>
                        <span style={{fontWeight:600,fontSize:"14px",color:"#1e293b"}}>{p.title||"Untitled"}</span>
                        {p.priority&&<span style={{background:"#fef2f2",color:"#ef4444",borderRadius:"20px",padding:"1px 8px",fontSize:"10px",fontWeight:600}}>Priority</span>}
                        <span style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"20px",padding:"1px 9px",fontSize:"10px",fontWeight:600}}>{p.status}</span>
                        {p.format&&<span style={{background:"#f1f5f9",color:"#475569",borderRadius:"4px",padding:"1px 7px",fontSize:"10px"}}>{p.format}</span>}
                        {isMonthOnly(p.date)&&<span style={{background:"#f0f9ff",color:"#0369a1",borderRadius:"4px",padding:"1px 7px",fontSize:"10px"}}>Month only</span>}
                        {(p.attachments||[]).length>0&&<span style={{background:"#f0fdf4",color:"#16a34a",borderRadius:"4px",padding:"1px 7px",fontSize:"10px"}}>📎 {p.attachments.length}</span>}
                      </div>
                      <div style={{display:"flex",gap:"14px",flexWrap:"wrap",fontSize:"12px",color:"#64748b"}}>
                        <span>{fmtDate(p.date)}</span><span>{p.contentType}</span>
                        {p.creator&&<span>{p.creator}</span>}{p.contacts&&<span>{p.contacts}</span>}
                        {p.priority&&p.deadline&&<span style={{color:deadlineSoon?"#ef4444":"#f59e0b",fontWeight:600}}>Post by {fmtDate(p.deadline)}{deadlineSoon?" — soon!":""}</span>}
                      </div>
                      {p.eventInfo&&<div style={{fontSize:"12px",color:"#475569",marginTop:"5px",background:"#f8f8f8",borderRadius:"5px",padding:"5px 8px",lineHeight:1.5}}>{p.eventInfo}</div>}
                      {p.notes&&<div style={{fontSize:"11px",color:"#94a3b8",marginTop:"4px",fontStyle:"italic"}}>{p.notes.length>100?p.notes.slice(0,100)+"…":p.notes}</div>}
                      {p.status==="Posted"&&(p.engagement?.likes||p.engagement?.reach)&&<div style={{display:"flex",gap:"10px",marginTop:"5px",fontSize:"11px",color:"#64748b"}}>{p.engagement.likes&&<span>♥ {p.engagement.likes}</span>}{p.engagement.reach&&<span>◎ {p.engagement.reach}</span>}{p.engagement.comments&&<span>◷ {p.engagement.comments}</span>}</div>}
                      <div style={{display:"flex",gap:"3px",marginTop:"8px",alignItems:"center"}}>
                        {STATUSES.map((s,i)=>{ const idx=STATUSES.indexOf(p.status); return <div key={s} title={`Move to ${s}`} onClick={()=>onStatusChange(p.id,s)} style={{flex:1,height:"3px",borderRadius:"4px",background:i<=idx?STATUS_CLR[s]:"#e2e8f0",cursor:"pointer"}}></div>; })}
                        <span style={{fontSize:"9px",color:"#94a3b8",marginLeft:"5px",whiteSpace:"nowrap",textTransform:"uppercase",letterSpacing:"0.03em"}}>{p.status}</span>
                      </div>
                      {p.lastUpdatedBy&&<div style={{fontSize:"10px",color:"#cbd5e1",marginTop:"4px"}}>Edited by {p.lastUpdatedBy} · {fmtTime(p.lastUpdatedAt)}</div>}
                    </div>
                    <button onClick={()=>onEdit(p)} style={{background:"#f8f8f8",border:"1px solid #e2e8f0",borderRadius:"6px",padding:"5px 10px",cursor:"pointer",fontSize:"12px",color:"#475569",flexShrink:0}}>Edit</button>
                  </div>
                );
              })}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function CalView({ posts, calDate, setCalDate, onEdit, onDayClick }) {
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const y=calDate.getFullYear(),m=calDate.getMonth();
  const firstDay=new Date(y,m,1).getDay(),daysInMonth=new Date(y,m+1,0).getDate();
  const today=new Date();
  const ym=`${y}-${String(m+1).padStart(2,"0")}`;
  const byDate={};posts.forEach(p=>{ if(p.date&&isExact(p.date)){if(!byDate[p.date])byDate[p.date]=[];byDate[p.date].push(p);} });
  const monthOnly=posts.filter(p=>isMonthOnly(p.date)&&p.date===ym);
  const cells=[]; for(let i=0;i<firstDay;i++)cells.push(null); for(let d=1;d<=daysInMonth;d++)cells.push(d);
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:"16px",marginBottom:"16px"}}>
        <button onClick={()=>setCalDate(new Date(y,m-1,1))} style={{background:"white",border:"1px solid #e2e8f0",borderRadius:"6px",padding:"6px 14px",cursor:"pointer",fontSize:"16px",color:"#475569"}}>‹</button>
        <span style={{fontWeight:700,fontSize:"17px",minWidth:"160px",textAlign:"center",color:"#1e293b"}}>{MONTHS_LONG[m]} {y}</span>
        <button onClick={()=>setCalDate(new Date(y,m+1,1))} style={{background:"white",border:"1px solid #e2e8f0",borderRadius:"6px",padding:"6px 14px",cursor:"pointer",fontSize:"16px",color:"#475569"}}>›</button>
        <button onClick={()=>setCalDate(new Date())} style={{background:"#f1f5f9",border:"none",borderRadius:"6px",padding:"6px 14px",cursor:"pointer",fontSize:"12px",color:"#475569",marginLeft:"auto",fontWeight:500}}>Today</button>
      </div>
      {monthOnly.length>0&&<div style={{background:"#fff5f5",border:`1px solid ${NU_RED}30`,borderRadius:"8px",padding:"10px 14px",marginBottom:"10px"}}>
        <div style={{fontSize:"11px",fontWeight:600,color:NU_RED,marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.04em"}}>Month-wide posts — no exact date assigned yet</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>{monthOnly.map(p=><div key={p.id} onClick={()=>onEdit(p)} style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer"}}>{p.title}</div>)}</div>
      </div>}
      <div style={{background:"white",borderRadius:"10px",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#fafafa",borderBottom:"1px solid #e2e8f0"}}>
          {DAYS.map(d=><div key={d} style={{padding:"10px 8px",textAlign:"center",fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))"}}>
          {cells.map((day,i)=>{
            const ds=day?`${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;
            const dp=ds?(byDate[ds]||[]):[];
            const isToday=day&&today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===day;
            return (
              <div key={i} style={{minHeight:"80px",padding:"6px",borderRight:"1px solid #f8f8f8",borderBottom:"1px solid #f8f8f8",background:day?"white":"#fafafa",cursor:day?"pointer":"default",overflow:"hidden",minWidth:0}} onClick={()=>day&&onDayClick(ds)}>
                {day&&<div style={{width:"26px",height:"26px",borderRadius:"50%",background:isToday?NU_RED:"transparent",color:isToday?"white":"#475569",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:isToday?700:400,marginBottom:"4px"}}>{day}</div>}
                {dp.map(p=><div key={p.id} onClick={e=>{e.stopPropagation();onEdit(p);}} style={{background:p.priority?"#ef4444":STATUS_CLR[p.status],color:"white",borderRadius:"3px",padding:"1px 5px",fontSize:"10px",marginBottom:"2px",cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={p.title}>{p.title}</div>)}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:"12px",marginTop:"12px",flexWrap:"wrap",alignItems:"center"}}>
        {STATUSES.map(s=><div key={s} style={{display:"flex",alignItems:"center",gap:"5px",fontSize:"12px",color:"#475569"}}><div style={{width:"10px",height:"10px",borderRadius:"2px",background:STATUS_CLR[s]}}></div>{s}</div>)}
        <span style={{fontSize:"11px",color:"#94a3b8",marginLeft:"auto"}}>Click a day to assign or add a post</span>
      </div>
    </div>
  );
}

function DayPickerModal({ date, posts, onAssign, onNew, onClose }) {
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [typeFilter,setTypeFilter]=useState("All");
  const currentMonth=date.slice(0,7);
  const [collapsed,setCollapsed]=useState({});
  const eligible=posts.filter(p=>p.status!=="Posted");
  const filtered=eligible.filter(p=>{
    if(statusFilter!=="All"&&p.status!==statusFilter)return false;
    if(typeFilter!=="All"&&p.contentType!==typeFilter)return false;
    if(search&&!p.title.toLowerCase().includes(search.toLowerCase())&&!p.contentType.toLowerCase().includes(search.toLowerCase())&&!(p.creator||"").toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const groups={};filtered.forEach(p=>{ const k=dateGroupKey(p.date); if(!groups[k])groups[k]=[]; groups[k].push(p); });
  const groupKeys=Object.keys(groups).sort((a,b)=>{ if(a==="unscheduled")return 1; if(b==="unscheduled")return -1; if(a===currentMonth)return -1; if(b===currentMonth)return 1; return a<b?-1:1; });
  const isCollapsed=k=>k===currentMonth?false:(collapsed[k]===undefined?true:collapsed[k]);
  const toggle=k=>setCollapsed(c=>({...c,[k]:!isCollapsed(k)}));
  const fmt=d=>{const[y,m,day]=d.split("-");return`${m}/${day}/${y}`;};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"20px"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:"12px",width:"100%",maxWidth:"640px",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"18px 24px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontWeight:700,fontSize:"16px",color:"#1e293b"}}>Assign Post to {fmt(date)}</div><div style={{fontSize:"12px",color:"#94a3b8",marginTop:"3px"}}>Pick an existing post or create a new one</div></div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:"24px",color:"#94a3b8",lineHeight:1}}>×</button>
        </div>
        <div style={{padding:"14px 24px",borderBottom:"1px solid #f1f5f9",display:"flex",flexDirection:"column",gap:"10px"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title, type, or creator…" autoFocus style={{...S,fontSize:"14px",padding:"8px 12px"}}/>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"12px",color:"#64748b",fontWeight:500}}>Filter:</span>
            <div style={{display:"flex",gap:"5px"}}>{["All","Planned","Scheduled"].map(s=><button key={s} onClick={()=>setStatusFilter(s)} style={{background:statusFilter===s?(STATUS_CLR[s]||NU_RED):"#f1f5f9",color:statusFilter===s?"white":"#475569",border:"none",borderRadius:"20px",padding:"3px 11px",cursor:"pointer",fontSize:"12px",fontWeight:500}}>{s}</button>)}</div>
            <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{...S,width:"auto",fontSize:"12px",padding:"4px 8px"}}><option value="All">All Types</option>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          <div style={{fontSize:"11px",color:"#94a3b8"}}>{filtered.length} post{filtered.length!==1?"s":""} shown · Posted posts hidden</div>
        </div>
        <div style={{overflowY:"auto",flex:1,padding:"10px 16px"}}>
          {filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:"#94a3b8",fontSize:"13px"}}>No posts match your filters.</div>}
          {groupKeys.map(gk=>{
            const col=isCollapsed(gk);
            return (
              <div key={gk} style={{marginBottom:"10px"}}>
                <div onClick={()=>toggle(gk)} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 4px",cursor:"pointer",userSelect:"none",borderRadius:"6px"}} onMouseEnter={e=>e.currentTarget.style.background="#f8f8f8"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{color:"#94a3b8",fontSize:"11px",display:"inline-block",transition:"transform 0.15s",transform:col?"rotate(-90deg)":"rotate(0deg)"}}>▼</span>
                  <span style={{fontWeight:700,fontSize:"13px",color:gk===currentMonth?NU_RED:"#475569"}}>{fmtKey(gk)}</span>
                  {gk===currentMonth&&<span style={{background:"#fff5f5",color:NU_RED,borderRadius:"20px",padding:"1px 8px",fontSize:"10px",fontWeight:600}}>This month</span>}
                  <span style={{fontSize:"11px",color:"#94a3b8",background:"#f1f5f9",borderRadius:"20px",padding:"1px 7px"}}>{groups[gk].length}</span>
                  <div style={{flex:1,height:"1px",background:"#f1f5f9"}}></div>
                </div>
                {!col&&groups[gk].map(p=>(
                  <div key={p.id} onClick={()=>onAssign(p)} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px",borderRadius:"8px",cursor:"pointer",marginBottom:"3px",border:"1px solid transparent"}} onMouseEnter={e=>{e.currentTarget.style.background="#f8f8f8";e.currentTarget.style.borderColor="#e2e8f0";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                    <div style={{width:"9px",height:"9px",borderRadius:"50%",background:p.priority?"#ef4444":STATUS_CLR[p.status],flexShrink:0}}></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:"13px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#1e293b"}}>{p.title||"Untitled"}</div>
                      <div style={{fontSize:"11px",color:"#64748b",marginTop:"2px",display:"flex",gap:"10px"}}><span>{p.contentType}</span>{p.creator&&<span>{p.creator}</span>}<span>{p.date?fmtDate(p.date):"No date yet"}</span></div>
                    </div>
                    <span style={{background:STATUS_CLR[p.status],color:"white",borderRadius:"20px",padding:"2px 9px",fontSize:"11px",flexShrink:0,fontWeight:500}}>{p.status}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{padding:"14px 24px",borderTop:"1px solid #f1f5f9"}}>
          <button onClick={onNew} style={{width:"100%",background:NU_RED,color:"white",border:"none",borderRadius:"8px",padding:"11px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>+ Create New Post for {fmt(date)}</button>
        </div>
      </div>
    </div>
  );
}

function ActivityView({ log }) {
  const CLR=a=>a.includes("created")?"#22c55e":a.includes("deleted")||a.includes("bulk")||a.includes("cleared")?"#f87171":a.includes("moved")?NU_RED:"#f59e0b";
  const ICN=a=>a.includes("created")?"＋":a.includes("deleted")||a.includes("bulk")||a.includes("cleared")?"×":a.includes("moved to Posted")?"✓":a.includes("moved")?"→":"✎";
  return (
    <div style={{maxWidth:"620px"}}>
      <h2 style={{margin:"0 0 16px",fontSize:"20px",color:"#1e293b",fontWeight:700}}>Activity Log</h2>
      {log.length===0&&<div style={{background:"white",borderRadius:"10px",padding:"40px",textAlign:"center",color:"#94a3b8",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>No activity yet.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
        {log.map(entry=>(
          <div key={entry.id} style={{background:"white",borderRadius:"10px",padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:"12px",border:"1px solid #f1f5f9",borderLeft:`3px solid ${CLR(entry.action)}`}}>
            <div style={{width:"26px",height:"26px",borderRadius:"50%",background:CLR(entry.action)+"20",color:CLR(entry.action),display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",fontWeight:700,flexShrink:0}}>{ICN(entry.action)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"13px",color:"#1e293b"}}><span style={{fontWeight:600}}>{entry.user}</span><span style={{color:"#64748b"}}> {entry.action} </span>{entry.postTitle&&<span style={{fontWeight:500,fontStyle:"italic"}}>"{entry.postTitle}"</span>}</div>
              <div style={{fontSize:"11px",color:"#94a3b8",marginTop:"2px"}}>{fmtTime(entry.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ settings, onSave, years, onSaveYears, currentYear, onSetYear, orphanedPosts, onRescueOrphans, allPosts, onBulkDelete, onDeleteAttachments }) {
  const instrRef = useRef(settings.instructions);
  const [flash,setFlash]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [customYear,setCustomYear]=useState("");
  const [yearError,setYearError]=useState("");
  const [lastRemoved,setLastRemoved]=useState(null);
  const [bulkYear,setBulkYear]=useState(currentYear);
  const [bulkStatus,setBulkStatus]=useState("All");
  const [confirmBulk,setConfirmBulk]=useState(false);
  const [showStorage,setShowStorage]=useState(false);

  const save=()=>{onSave({...settings,instructions:instrRef.current});setFlash(true);setTimeout(()=>setFlash(false),2000);};
  const addCustomYear=()=>{setYearError("");const val=customYear.trim();if(!/^\d{4}-\d{4}$/.test(val)){setYearError("Format must be YYYY-YYYY");return;}const[s,e]=val.split("-").map(Number);if(e!==s+1){setYearError("End year must be start year + 1");return;}if(years.includes(val)){setYearError("That year already exists");return;}onSaveYears([...years,val].sort());setCustomYear("");};
  const addNextYear=()=>{const last=years[years.length-1];const[,e]=last.split("-");const next=`${e}-${parseInt(e)+1}`;if(!years.includes(next))onSaveYears([...years,next]);};
  const deleteYear=yr=>{const updated=years.filter(y=>y!==yr);onSaveYears(updated);if(currentYear===yr)onSetYear(updated[0]);setConfirmDelete(null);setLastRemoved(yr);};
  const undoRemove=()=>{if(!lastRemoved)return;onSaveYears([...years,lastRemoved].sort());setLastRemoved(null);};
  const nextYr=()=>{const last=years[years.length-1];const[,e]=last.split("-");return`${e}-${parseInt(e)+1}`;};
  const bulkCandidates=allPosts.filter(p=>{if(bulkYear!=="All"&&p.academicYear!==bulkYear)return false;if(bulkStatus!=="All"&&p.status!==bulkStatus)return false;return true;});
  const postsWithFiles=allPosts.map(p=>({...p,totalSize:(p.attachments||[]).reduce((s,a)=>s+(a.size||0),0),fileCount:(p.attachments||[]).length})).filter(p=>p.fileCount>0).sort((a,b)=>b.totalSize-a.totalSize);
  const totalStorageBytes=postsWithFiles.reduce((s,p)=>s+p.totalSize,0);
  const SCard=({children})=><div style={{background:"white",borderRadius:"10px",padding:"24px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9"}}>{children}</div>;
  const STitle=({children})=><h3 style={{marginTop:0,marginBottom:"6px",fontSize:"15px",color:"#1e293b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{children}</h3>;

  return (
    <div style={{maxWidth:"620px",display:"flex",flexDirection:"column",gap:"16px"}}>
      {orphanedPosts.length>0&&(
        <div style={{background:"white",borderRadius:"10px",padding:"20px 24px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`1px solid ${NU_RED}40`,borderLeft:`4px solid ${NU_RED}`}}>
          <STitle>Orphaned Posts Found</STitle>
          <p style={{fontSize:"13px",color:"#64748b",marginBottom:"12px",lineHeight:1.6,marginTop:"6px"}}>{orphanedPosts.length} post{orphanedPosts.length!==1?"s":""} were saved without a valid academic year and are hidden. Reassign them to recover them.</p>
          <div style={{display:"flex",flexDirection:"column",gap:"4px",marginBottom:"14px"}}>{orphanedPosts.map(p=><div key={p.id} style={{fontSize:"12px",color:"#475569",padding:"4px 8px",background:"#f8f8f8",borderRadius:"5px",display:"flex",gap:"8px"}}><span style={{fontWeight:600}}>{p.title||"Untitled"}</span><span style={{color:"#94a3b8"}}>·</span><span style={{color:"#94a3b8"}}>saved as: "{p.academicYear||"(empty)"}"</span></div>)}</div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <span style={{fontSize:"12px",color:"#64748b",fontWeight:500}}>Move to:</span>
            <select defaultValue={currentYear} id="rescue-year-select" style={{...S,width:"auto",fontSize:"12px"}}>{years.map(y=><option key={y}>{y}</option>)}</select>
            <button onClick={()=>{const sel=document.getElementById("rescue-year-select");onRescueOrphans(sel.value);}} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"6px 14px",cursor:"pointer",fontSize:"12px",fontWeight:600}}>Recover Posts</button>
          </div>
        </div>
      )}

      <SCard>
        <STitle>Academic Years</STitle>
        <p style={{fontSize:"13px",color:"#64748b",marginBottom:"16px",lineHeight:1.6,marginTop:"6px"}}>Manage which academic years are available in the planner.</p>
        {lastRemoved&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:"8px",background:"#fefce8",border:"1px solid #fde68a",marginBottom:"12px"}}><span style={{fontSize:"13px",color:"#92400e"}}>Removed <strong>{lastRemoved}</strong></span><button onClick={undoRemove} style={{background:"#f59e0b",color:"white",border:"none",borderRadius:"6px",padding:"4px 12px",cursor:"pointer",fontSize:"12px",fontWeight:600}}>↩ Undo</button></div>}
        <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"16px"}}>
          {years.map(yr=>(
            <div key={yr} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:"8px",background:yr===currentYear?"#fff5f5":"#f8f8f8",border:`1px solid ${yr===currentYear?NU_RED+"40":"#e2e8f0"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}><span style={{fontWeight:600,fontSize:"14px",color:"#1e293b"}}>{yr}</span>{yr===currentYear&&<span style={{background:NU_RED,color:"white",borderRadius:"20px",padding:"1px 8px",fontSize:"11px",fontWeight:600}}>Active</span>}</div>
              <div style={{display:"flex",gap:"6px"}}>
                {yr!==currentYear&&<button onClick={()=>onSetYear(yr)} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:"6px",padding:"4px 10px",cursor:"pointer",fontSize:"12px"}}>Set Active</button>}
                {confirmDelete===yr
                  ?<div style={{display:"flex",gap:"5px",alignItems:"center"}}><span style={{fontSize:"12px",color:"#ef4444",fontWeight:500}}>Remove {yr}?</span><button onClick={()=>deleteYear(yr)} style={{background:"#ef4444",color:"white",border:"none",borderRadius:"6px",padding:"4px 10px",cursor:"pointer",fontSize:"12px",fontWeight:600}}>Yes</button><button onClick={()=>setConfirmDelete(null)} style={{background:"#e2e8f0",color:"#475569",border:"none",borderRadius:"6px",padding:"4px 10px",cursor:"pointer",fontSize:"12px"}}>Cancel</button></div>
                  :<button onClick={()=>setConfirmDelete(yr)} disabled={years.length<=1} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:"6px",padding:"4px 10px",cursor:years.length<=1?"default":"pointer",fontSize:"12px",opacity:years.length<=1?0.4:1}}>Remove</button>
                }
              </div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f1f5f9",paddingTop:"14px",display:"flex",flexDirection:"column",gap:"10px"}}>
          <button onClick={addNextYear} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"8px 16px",cursor:"pointer",fontSize:"13px",fontWeight:600,alignSelf:"flex-start"}}>+ Add {nextYr()}</button>
          <div style={{display:"flex",gap:"8px",alignItems:"flex-start"}}>
            <div style={{flex:1}}><input value={customYear} onChange={e=>{setCustomYear(e.target.value);setYearError("");}} placeholder="Or enter a specific year, e.g. 2030-2031" style={S} onKeyDown={e=>e.key==="Enter"&&addCustomYear()}/>{yearError&&<div style={{fontSize:"11px",color:"#ef4444",marginTop:"4px"}}>{yearError}</div>}</div>
            <button onClick={addCustomYear} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:"6px",padding:"8px 14px",cursor:"pointer",fontSize:"13px",fontWeight:500,whiteSpace:"nowrap"}}>Add</button>
          </div>
        </div>
      </SCard>

      <SCard>
        <STitle>Manage & Delete Posts</STitle>
        <p style={{fontSize:"13px",color:"#64748b",marginBottom:"16px",lineHeight:1.6,marginTop:"6px"}}>Permanently delete posts in bulk or clear attachments to free up storage. Cannot be undone.</p>
        <button onClick={()=>setShowStorage(s=>!s)} style={{background:"#f8f8f8",border:"1px solid #e2e8f0",borderRadius:"6px",padding:"10px 14px",cursor:"pointer",fontSize:"12px",fontWeight:500,color:"#475569",display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:"12px",boxSizing:"border-box"}}>
          <span>Storage Breakdown — {fmtSize(totalStorageBytes)} used across {postsWithFiles.length} post{postsWithFiles.length!==1?"s":""}</span>
          <span style={{fontSize:"11px"}}>{showStorage?"▲ Hide":"▼ Show"}</span>
        </button>
        {showStorage&&(
          <div style={{marginBottom:"16px",border:"1px solid #e2e8f0",borderRadius:"8px",overflow:"hidden"}}>
            {postsWithFiles.length===0
              ?<div style={{padding:"20px",textAlign:"center",color:"#94a3b8",fontSize:"13px"}}>No attachments uploaded yet.</div>
              :<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px 80px 90px",background:"#fafafa",borderBottom:"1px solid #e2e8f0",padding:"8px 12px",fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em",gap:"8px"}}>
                  <div>Post</div><div style={{textAlign:"center"}}>Files</div><div style={{textAlign:"right"}}>Size</div><div></div>
                </div>
                {postsWithFiles.map((p,i)=>{
                  const pct=totalStorageBytes>0?Math.round((p.totalSize/totalStorageBytes)*100):0;
                  return (
                    <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 80px 90px",padding:"10px 12px",borderBottom:i<postsWithFiles.length-1?"1px solid #f8f8f8":"none",alignItems:"center",background:i===0?"#fffbf5":"white",gap:"8px"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:"13px",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i===0&&<span style={{color:"#f59e0b",marginRight:"4px"}}>▲</span>}{p.title||"Untitled"}</div>
                        <div style={{marginTop:"4px",height:"4px",background:"#f1f5f9",borderRadius:"4px",overflow:"hidden"}}><div style={{height:"100%",background:i===0?NU_RED:"#94a3b8",borderRadius:"4px",width:`${pct}%`}}></div></div>
                        <div style={{fontSize:"10px",color:"#94a3b8",marginTop:"2px"}}>{p.academicYear} · {pct}% of total</div>
                      </div>
                      <div style={{fontSize:"12px",color:"#64748b",textAlign:"center"}}>{p.fileCount}</div>
                      <div style={{fontSize:"12px",fontWeight:600,color:i===0?NU_RED:"#475569",textAlign:"right",whiteSpace:"nowrap"}}>{fmtSize(p.totalSize)}</div>
                      <div style={{textAlign:"right"}}><button onClick={()=>onDeleteAttachments(p.id)} style={{background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:"5px",padding:"3px 8px",cursor:"pointer",fontSize:"11px",fontWeight:500,whiteSpace:"nowrap"}}>Clear Files</button></div>
                    </div>
                  );
                })}
                <div style={{padding:"8px 12px",background:"#fafafa",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:600,color:"#1e293b"}}><span>Total</span><span>{fmtSize(totalStorageBytes)}</span></div>
              </>
            }
          </div>
        )}
        <div style={{borderTop:"1px solid #f1f5f9",paddingTop:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:"10px"}}>Bulk Delete Posts</div>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"12px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:"4px",flex:1,minWidth:"140px"}}><label style={{fontSize:"11px",fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em"}}>Academic Year</label><select value={bulkYear} onChange={e=>{setBulkYear(e.target.value);setConfirmBulk(false);}} style={S}><option value="All">All Years</option>{years.map(y=><option key={y}>{y}</option>)}</select></div>
            <div style={{display:"flex",flexDirection:"column",gap:"4px",flex:1,minWidth:"140px"}}><label style={{fontSize:"11px",fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em"}}>Status</label><select value={bulkStatus} onChange={e=>{setBulkStatus(e.target.value);setConfirmBulk(false);}} style={S}><option value="All">All Statuses</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={{padding:"10px 14px",background:"#f8f8f8",borderRadius:"8px",marginBottom:"12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:"13px",color:"#475569"}}><strong>{bulkCandidates.length}</strong> post{bulkCandidates.length!==1?"s":""} match these filters</span>{bulkCandidates.length>0&&<span style={{fontSize:"11px",color:"#94a3b8"}}>Includes all attachments</span>}</div>
          {bulkCandidates.length===0
            ?<div style={{fontSize:"13px",color:"#94a3b8",fontStyle:"italic"}}>No posts match the selected filters.</div>
            :confirmBulk
              ?<div style={{background:"#fef2f2",border:"1px solid #fee2e2",borderRadius:"8px",padding:"14px"}}><div style={{fontSize:"13px",fontWeight:600,color:"#ef4444",marginBottom:"8px"}}>⚠ Permanently delete {bulkCandidates.length} post{bulkCandidates.length!==1?"s":""} and all their attachments?</div><div style={{display:"flex",gap:"8px"}}><button onClick={()=>{onBulkDelete(bulkCandidates.map(p=>p.id));setConfirmBulk(false);}} style={{background:"#ef4444",color:"white",border:"none",borderRadius:"6px",padding:"7px 16px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Yes, Delete {bulkCandidates.length} Posts</button><button onClick={()=>setConfirmBulk(false)} style={{background:"#e2e8f0",color:"#475569",border:"none",borderRadius:"6px",padding:"7px 14px",cursor:"pointer",fontSize:"13px"}}>Cancel</button></div></div>
              :<button onClick={()=>setConfirmBulk(true)} style={{background:"#fee2e2",color:"#ef4444",border:"1px solid #fecaca",borderRadius:"6px",padding:"8px 16px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Delete {bulkCandidates.length} Post{bulkCandidates.length!==1?"s":""}</button>
          }
        </div>
      </SCard>

      <SCard>
        <STitle>AI Caption Instructions</STitle>
        <p style={{fontSize:"13px",color:"#64748b",marginBottom:"14px",lineHeight:1.6,marginTop:"6px"}}>These guidelines are passed to the AI every time a caption is generated. Edit to refine SOPPS brand voice over time.</p>
        <textarea defaultValue={settings.instructions} onChange={e=>{instrRef.current=e.target.value;}} rows={14} style={{...S,resize:"vertical",lineHeight:1.6,fontSize:"12px"}}/>
        <div style={{display:"flex",alignItems:"center",gap:"12px",marginTop:"14px"}}>
          <button onClick={save} style={{background:NU_RED,color:"white",border:"none",borderRadius:"6px",padding:"8px 20px",cursor:"pointer",fontSize:"13px",fontWeight:600}}>Save Instructions</button>
          {flash&&<span style={{color:"#22c55e",fontSize:"13px",fontWeight:500}}>Saved</span>}
        </div>
      </SCard>
    </div>
  );
}

function HelpView() {
  const [open, setOpen] = useState(null);
  const toggle = k => setOpen(o => o===k ? null : k);
  const Section = ({id, title, icon, children}) => (
    <div style={{background:"white",borderRadius:"10px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9",overflow:"hidden",marginBottom:"10px"}}>
      <div onClick={()=>toggle(id)} style={{display:"flex",alignItems:"center",gap:"12px",padding:"16px 20px",cursor:"pointer",userSelect:"none"}}
        onMouseEnter={e=>e.currentTarget.style.background="#fafafa"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
        <div style={{width:"36px",height:"36px",borderRadius:"8px",background:NU_RED+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:"18px"}}>{icon}</div>
        <div style={{flex:1,fontWeight:600,fontSize:"14px",color:"#1e293b"}}>{title}</div>
        <span style={{fontSize:"12px",color:"#94a3b8",transform:open===id?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}}>▼</span>
      </div>
      {open===id&&<div style={{padding:"0 20px 20px",borderTop:"1px solid #f1f5f9",paddingTop:"16px"}}>{children}</div>}
    </div>
  );
  const Step = ({n, children}) => (
    <div style={{display:"flex",gap:"12px",marginBottom:"10px",alignItems:"flex-start"}}>
      <div style={{width:"22px",height:"22px",borderRadius:"50%",background:NU_RED,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:700,flexShrink:0,marginTop:"1px"}}>{n}</div>
      <div style={{fontSize:"13px",color:"#475569",lineHeight:1.6}}>{children}</div>
    </div>
  );
  const Tip = ({children}) => (
    <div style={{background:"#fff5f5",border:`1px solid ${NU_RED}30`,borderRadius:"7px",padding:"10px 12px",marginTop:"8px",fontSize:"12px",color:"#7f1d1d",lineHeight:1.6}}>
      💡 {children}
    </div>
  );
  const Badge = ({color, children}) => <span style={{background:color+"20",color:color,borderRadius:"20px",padding:"1px 8px",fontSize:"11px",fontWeight:600,marginRight:"4px"}}>{children}</span>;

  return (
    <div style={{maxWidth:"700px"}}>
      <div style={{marginBottom:"24px"}}>
        <h2 style={{margin:"0 0 6px",fontSize:"20px",color:"#1e293b",fontWeight:700}}>Help & Guide</h2>
        <p style={{margin:0,fontSize:"13px",color:"#64748b",lineHeight:1.6}}>Everything you need to know about using the SOPPS Content Planner. Click any section to expand.</p>
      </div>

      <Section id="overview" title="Overview & Workflow" icon="🗺">
        <p style={{fontSize:"13px",color:"#475569",lineHeight:1.7,marginTop:0}}>The SOPPS Content Planner is a shared tool for planning, drafting, scheduling, and tracking social media posts and faculty publications. All data is shared in real time — anything one person adds or edits is immediately visible to everyone.</p>
        <div style={{marginTop:"12px",marginBottom:"4px",fontWeight:600,fontSize:"13px",color:"#1e293b"}}>Typical post workflow:</div>
        <Step n="1">Someone adds a new post in the <strong>Content List</strong> — filling in the title, content type, and any known details. Set the status to <Badge color="#94a3b8">Planned</Badge></Step>
        <Step n="2">Once a date is confirmed, update the post to an exact date and move it to <Badge color="#f59e0b">Scheduled</Badge></Step>
        <Step n="3">On the post date, the status automatically flips to <Badge color="#22c55e">Posted</Badge> — or you can mark it manually.</Step>
        <Step n="4">Log engagement metrics (likes, reach, comments) on the posted content so Analytics can track performance over time.</Step>
        <Tip>Posts saved with only a month (no exact date) show up in a yellow banner on the Calendar — these are waiting for a specific date to be assigned.</Tip>
      </Section>

      <Section id="posts" title="Adding & Editing Posts" icon="📋">
        <div style={{fontWeight:600,fontSize:"13px",color:"#1e293b",marginBottom:"10px"}}>Ways to add a post:</div>
        <Step n="1"><strong>+ New Post</strong> button at the top of the Content List — opens a blank form.</Step>
        <Step n="2"><strong>+ Add</strong> button next to any month heading — pre-fills the month so you don't have to set it manually.</Step>
        <Step n="3"><strong>Calendar</strong> — click any day to assign an existing post to that date, or create a new one.</Step>
        <div style={{fontWeight:600,fontSize:"13px",color:"#1e293b",margin:"14px 0 10px"}}>Key fields explained:</div>
        <div style={{fontSize:"13px",color:"#475569",lineHeight:1.8}}>
          <div><strong>Date</strong> — choose No Date, Month Only (when you know the month but not the exact day), or Exact Date.</div>
          <div><strong>Priority</strong> — flags a post as high priority with a red marker, and lets you set a "must post by" deadline.</div>
          <div><strong>Format</strong> — Post, Story, or Reel. Tracked in Analytics.</div>
          <div><strong>Attachments</strong> — attach reference images or PDFs your boss wants you to use. Stored with the post.</div>
          <div><strong>Caption</strong> — write manually or click <strong>Generate with AI</strong>. After generating, use the feedback box to refine it.</div>
        </div>
        <Tip>Use the progress bar at the bottom of each post card to quickly move between statuses without opening the post.</Tip>
      </Section>

      <Section id="calendar" title="Using the Calendar" icon="📅">
        <Step n="1">Navigate months with the ‹ › arrows. Today's date is highlighted in red.</Step>
        <Step n="2">Posts with exact dates appear as colored chips on their day. Click a chip to edit the post.</Step>
        <Step n="3">Click any empty day to open the assignment panel — search and filter your existing posts to assign one to that date, or create a new post directly.</Step>
        <Step n="4">Posts with only a month (no exact date) appear in the yellow banner above the calendar grid. Click them to open and assign a date.</Step>
        <Tip>The assignment panel groups posts by month and opens the current month by default, making it easy to find posts already planned for that period.</Tip>
      </Section>

      <Section id="publications" title="Publications" icon="📰">
        <p style={{fontSize:"13px",color:"#475569",lineHeight:1.7,marginTop:0}}>The Publications tab is separate from the content calendar — it's for tracking faculty research publications and whether they've been posted to social media.</p>
        <Step n="1">Click <strong>+ Add Publication</strong> and fill in the faculty name, journal, article title, link, and publication month.</Step>
        <Step n="2">Once you've posted about the publication on social media, click the circle checkbox on the left to mark it as posted. The row turns green.</Step>
        <Step n="3">Publications are grouped by month with collapsible headers — click a month header to expand or collapse it.</Step>
        <Tip>The article link shows as a "View →" button in the table. Click it to open the publication directly.</Tip>
      </Section>

      <Section id="captions" title="AI Caption Generation" icon="✨">
        <p style={{fontSize:"13px",color:"#475569",lineHeight:1.7,marginTop:0}}>The AI caption generator uses SOPPS brand guidelines (set in Settings) to write Instagram and Facebook captions automatically.</p>
        <Step n="1">Open any post and fill in as much detail as possible — title, content type, event info, contacts, and additional notes all feed into the caption.</Step>
        <Step n="2">Click <strong>Generate with AI</strong>. The AI will write one caption for Instagram (with hashtags) and one for Facebook.</Step>
        <Step n="3">Review the captions. If you want changes, type feedback in the box below ("make it shorter", "more formal", "add the date") and click <strong>Regenerate</strong>.</Step>
        <Step n="4">Once happy, click <strong>Copy</strong> to copy the caption to your clipboard for posting.</Step>
        <Tip>The more context you fill in (event info, contacts, additional notes), the better the AI captions will be. Vague posts produce generic captions.</Tip>
      </Section>

      <Section id="analytics" title="Analytics" icon="📊">
        <p style={{fontSize:"13px",color:"#475569",lineHeight:1.7,marginTop:0}}>Analytics data only appears once you have posted content with engagement metrics logged.</p>
        <div style={{fontSize:"13px",color:"#475569",lineHeight:1.8}}>
          <div style={{marginBottom:"6px"}}><strong>Posts Per Month</strong> — filter by content type and format to see posting patterns.</div>
          <div style={{marginBottom:"6px"}}><strong>Top Performing Posts</strong> — sort by likes, reach, or comments to see what content resonates.</div>
          <div style={{marginBottom:"6px"}}><strong>Content Type Performance</strong> — average engagement per content type, ranked best to worst.</div>
          <div><strong>Format Performance</strong> — average likes and reach broken down by Post, Story, and Reel.</div>
        </div>
        <Tip>Log engagement on your Posted content to unlock Analytics insights. Open a posted post, scroll to Engagement Metrics, and enter likes, reach, and comments.</Tip>
      </Section>

      <Section id="settings" title="Settings & Administration" icon="⚙️">
        <div style={{fontSize:"13px",color:"#475569",lineHeight:1.8}}>
          <div style={{marginBottom:"8px"}}><strong>AI Caption Instructions</strong> — the SOPPS brand voice guidelines are pre-loaded. Edit these anytime to refine tone, add new hashtag rules, or update guidelines.</div>
          <div style={{marginBottom:"8px"}}><strong>Academic Years</strong> — add or remove academic years. The active year filters what shows in the Content List and Calendar. Use the + button to add the next year, or type a custom year.</div>
          <div style={{marginBottom:"8px"}}><strong>Storage & Bulk Delete</strong> — use the Storage Breakdown to see which posts have large attachments and clear them. Use Bulk Delete to permanently remove old posts by year or status.</div>
          <div><strong>Orphaned Posts</strong> — if posts ever appear in the Activity Log but not the list, check Settings for an "Orphaned Posts Found" banner and use it to recover them.</div>
        </div>
        <Tip>Your name (shown in the top bar) can be changed by clicking it. Each person's name is stored on their own device, so everyone sets their own.</Tip>
      </Section>

      <Section id="sharing" title="Sharing & Collaboration" icon="👥">
        <p style={{fontSize:"13px",color:"#475569",lineHeight:1.7,marginTop:0}}>This tool is designed for a small team. All posts, publications, and activity are shared in real time through the published link.</p>
        <div style={{fontSize:"13px",color:"#475569",lineHeight:1.8}}>
          <div style={{marginBottom:"8px"}}><strong>Sharing</strong> — share the published link with your team. Anyone who opens it sees and edits the same data.</div>
          <div style={{marginBottom:"8px"}}><strong>Activity Log</strong> — every action (create, edit, status change, delete) is logged with the person's name and timestamp. Use this to see what changed and who changed it.</div>
          <div style={{marginBottom:"8px"}}><strong>Undo / Redo</strong> — use the ↩ ↪ buttons in the top bar to undo or redo recent changes. Stores up to 30 actions.</div>
          <div><strong>Export</strong> — use the ↓ Export CSV button in the Content List to download all visible posts as a spreadsheet for reporting.</div>
        </div>
        <Tip>If two people edit the same post at the same time, the last save wins. For a small team this is rarely an issue, but good to be aware of.</Tip>
      </Section>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"100px 1fr",gap:"10px",alignItems:"start"}}>
      <label style={{fontSize:"12px",fontWeight:600,color:"#64748b",paddingTop:"7px",textTransform:"uppercase",letterSpacing:"0.03em"}}>{label}</label>
      {children}
    </div>
  );
}