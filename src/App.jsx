import { useState, useEffect, useCallback } from "react";

const EXPENSE_CATEGORIES = [
  { id: "venue",     label: "Venue / Salón",          icon: "🏛️", color: "#e11d48" },
  { id: "artistic",  label: "Artístico / Artistas",   icon: "🎤", color: "#7c3aed" },
  { id: "catering",  label: "Catering / Gastronomía", icon: "🍽️", color: "#ea580c" },
  { id: "marketing", label: "Marketing / Publicidad", icon: "📢", color: "#0284c7" },
  { id: "staff",     label: "Personal / Staff",       icon: "👥", color: "#059669" },
  { id: "equipment", label: "Sonido / Luces",         icon: "🎛️", color: "#d97706" },
  { id: "logistics", label: "Logística / Transporte", icon: "🚚", color: "#64748b" },
  { id: "other",     label: "Otros",                  icon: "📦", color: "#94a3b8" },
];

const INCOME_CATEGORIES = [
  { id: "tickets",  label: "Entradas / Tickets",    icon: "🎟️" },
  { id: "sponsors", label: "Auspicios / Sponsors",  icon: "🤝" },
  { id: "bar",      label: "Bar / Gastronomía",     icon: "🍸" },
  { id: "services", label: "Servicios Adicionales", icon: "📸" },
  { id: "other",    label: "Otros Ingresos",        icon: "💰" },
];

const fmt = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const generateId = () => Math.random().toString(36).substr(2, 9);
const CONFIG_KEY = "eventctrl_config_v2";

async function getAccessToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
  const sigInput = `${b64url({alg:"RS256",typ:"JWT"})}.${b64url({iss:cfg.clientEmail,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",exp:now+3600,iat:now})}`;
  const pemBody = cfg.privateKey.replace(/-----BEGIN PRIVATE KEY-----/g,"").replace(/-----END PRIVATE KEY-----/g,"").replace(/\s/g,"");
  const keyData = Uint8Array.from(atob(pemBody),(c)=>c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8",keyData.buffer,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",cryptoKey,new TextEncoder().encode(sigInput));
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
  const res = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${sigInput}.${b64sig}`});
  const d = await res.json();
  if (!d.access_token) throw new Error(d.error_description||"Token inválido");
  return d.access_token;
}

async function sheetsGet(cfg,token){
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/Sheet1!A1`,{headers:{Authorization:`Bearer ${token}`}});
  const d=await r.json();
  const raw=d?.values?.[0]?.[0];
  return raw?JSON.parse(raw):{events:[]};
}

async function sheetsPut(cfg,token,appData){
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cfg.sheetId}/values/Sheet1!A1?valueInputOption=RAW`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({range:"Sheet1!A1",majorDimension:"ROWS",values:[[JSON.stringify(appData)]]})});
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#09090f;--s1:#131320;--s2:#1a1a2a;--bd:#252535;--ac:#6ee7b7;--ac2:#f472b6;--tx:#f1f5f9;--mu:#64748b;--gr:#34d399;--re:#f87171;--ye:#fbbf24}
body{background:var(--bg);color:var(--tx);font-family:'DM Mono',monospace;font-size:14px}
.app{min-height:100vh;background-image:radial-gradient(ellipse at 15% 0%,rgba(110,231,183,.07) 0%,transparent 55%),radial-gradient(ellipse at 85% 100%,rgba(244,114,182,.05) 0%,transparent 55%)}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:13px 22px;border-bottom:1px solid var(--bd);background:rgba(13,13,22,.88);backdrop-filter:blur(16px);position:sticky;top:0;z-index:200}
.logo{font-family:'Syne',sans-serif;font-weight:800;font-size:17px;letter-spacing:-.5px}
.logo em{color:var(--ac);font-style:normal}
.hdr-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pill{font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid}
.pill-ok{border-color:rgba(52,211,153,.35);color:var(--gr);background:rgba(52,211,153,.07)}
.pill-err{border-color:rgba(248,113,113,.35);color:var(--re);background:rgba(248,113,113,.07)}
.pill-load{border-color:rgba(251,191,36,.35);color:var(--ye);background:rgba(251,191,36,.07)}
.pill-off{border-color:var(--bd);color:var(--mu)}
.btn{border:none;cursor:pointer;font-family:'DM Mono',monospace;border-radius:8px;transition:all .18s;font-size:13px;padding:8px 16px}
.btn-p{background:var(--ac);color:#060610;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;padding:11px 22px}
.btn-p:hover{background:#a7f3d0;transform:translateY(-1px)}
.btn-p:disabled{opacity:.35;cursor:not-allowed;transform:none}
.btn-s{background:none;color:var(--mu);border:1px solid var(--bd)}
.btn-s:hover{border-color:var(--mu);color:var(--tx)}
.btn-nav{background:none;border:1px solid var(--bd);color:var(--mu);padding:5px 13px;font-size:12px;border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;transition:all .18s}
.btn-nav:hover{border-color:var(--ac);color:var(--ac);background:rgba(110,231,183,.07)}
.btn-add{background:rgba(110,231,183,.09);color:var(--ac);border:1px dashed rgba(110,231,183,.35);padding:8px 16px;font-family:'DM Mono',monospace;border-radius:8px;cursor:pointer;font-size:12px;transition:all .18s}
.btn-add:hover{background:rgba(110,231,183,.15);border-color:var(--ac)}
.btn-x{background:none;border:none;color:var(--mu);cursor:pointer;padding:3px 7px;border-radius:4px;font-size:15px;transition:all .18s}
.btn-x:hover{color:var(--re);background:rgba(248,113,113,.1)}
.btn-gear{background:none;border:1px solid var(--bd);color:var(--mu);padding:5px 11px;font-size:14px;border-radius:6px;cursor:pointer;transition:all .18s}
.btn-gear:hover{border-color:var(--mu);color:var(--tx)}
.main{padding:22px;max-width:1080px;margin:0 auto}
.ptitle{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(20px,4vw,36px);letter-spacing:-1px;margin-bottom:5px}
.psub{color:var(--mu);font-size:12px;margin-bottom:26px}
.sg{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:26px}
@media(max-width:560px){.sg{grid-template-columns:1fr}}
.sc{background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:18px;position:relative;overflow:hidden;transition:transform .2s,border-color .2s}
.sc:hover{transform:translateY(-2px);border-color:rgba(110,231,183,.25)}
.sc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
.sc.inc::before{background:linear-gradient(90deg,var(--ac),transparent)}
.sc.exp::before{background:linear-gradient(90deg,var(--ac2),transparent)}
.sc.mar::before{background:linear-gradient(90deg,#818cf8,transparent)}
.slbl{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:1px;margin-bottom:7px}
.sval{font-family:'Syne',sans-serif;font-weight:700;font-size:21px}
.pos{color:var(--gr)}.neg{color:var(--re)}
.eg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.ec{background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:18px;cursor:pointer;transition:all .2s}
.ec:hover{border-color:var(--ac);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.35)}
.en{font-family:'Syne',sans-serif;font-weight:700;font-size:15px;margin-bottom:3px}
.ed{font-size:11px;color:var(--mu);margin-bottom:13px}
.en2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px}
.ei{background:var(--s2);border-radius:7px;padding:9px}
.el{font-size:9px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px}
.ev2{font-family:'Syne',sans-serif;font-weight:600;font-size:13px;margin-top:2px}
.mb{height:4px;background:var(--bd);border-radius:2px;overflow:hidden;margin-bottom:11px}
.mf{height:100%;border-radius:2px;transition:width .5s}
.ef{display:flex;justify-content:space-between;align-items:center}
.badge{font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500}
.bp{background:rgba(52,211,153,.13);color:var(--gr)}
.bl2{background:rgba(248,113,113,.13);color:var(--re)}
.bn{background:rgba(100,116,139,.13);color:var(--mu)}
.no-ev{grid-column:1/-1;text-align:center;padding:55px 20px;color:var(--mu)}
.no-ev .big{font-size:46px;margin-bottom:10px}
.fc{background:var(--s1);border:1px solid var(--bd);border-radius:16px;padding:30px;max-width:490px;margin:0 auto}
.ftit{font-family:'Syne',sans-serif;font-weight:700;font-size:19px;margin-bottom:18px}
.f{margin-bottom:15px}
.f label{display:block;font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.f input,.f select,.f textarea{width:100%;background:var(--s2);border:1px solid var(--bd);color:var(--tx);padding:9px 13px;border-radius:8px;font-family:'DM Mono',monospace;font-size:13px;outline:none;transition:border-color .2s}
.f textarea{resize:vertical;min-height:85px;font-size:12px;line-height:1.6}
.f input:focus,.f select:focus,.f textarea:focus{border-color:var(--ac)}
.fhint{font-size:11px;color:var(--mu);margin-top:4px;line-height:1.5}
.fhint code{color:var(--ac)}
.sn{background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.22);border-radius:9px;padding:13px;font-size:12px;color:var(--ye);margin-bottom:18px;line-height:1.6}
.sc-ok{background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.22);border-radius:9px;padding:13px;font-size:13px;margin-bottom:18px}
.eh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;flex-wrap:wrap;gap:10px}
.tc{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:680px){.tc{grid-template-columns:1fr}}
.panel{background:var(--s1);border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.ph{padding:12px 15px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
.ptl{font-family:'Syne',sans-serif;font-weight:700;font-size:13px}
.ptt{font-family:'Syne',sans-serif;font-weight:700;font-size:14px}
.il{padding:5px}
.ir{display:flex;justify-content:space-between;align-items:center;padding:8px 9px;border-radius:7px;transition:background .13s}
.ir:hover{background:var(--s2)}
.ii{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.iico{font-size:14px;flex-shrink:0}
.inm{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idsc{font-size:11px;color:var(--mu)}
.iamt{font-family:'Syne',sans-serif;font-weight:600;font-size:12px;flex-shrink:0;margin:0 5px}
.es{padding:26px;text-align:center;color:var(--mu);font-size:12px}
.af{margin:0 5px 5px;background:var(--s2);border:1px solid var(--bd);border-radius:9px;padding:13px}
.ar{display:flex;gap:7px;flex-wrap:wrap}
.ar .f{margin-bottom:0;flex:1;min-width:105px}
.sum{background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:17px;margin-bottom:16px}
.sr{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--bd)}
.sr:last-child{border-bottom:none;font-family:'Syne',sans-serif;font-weight:700;font-size:16px;padding-top:11px}
.slb{font-size:12px;color:var(--mu)}
.br-tit{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 10px}
.cr{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.clb{font-size:11px;min-width:145px;display:flex;align-items:center;gap:5px}
.cbg{flex:1;height:5px;background:var(--bd);border-radius:3px;overflow:hidden}
.cfi{height:100%;border-radius:3px}
.cam{font-size:11px;min-width:80px;text-align:right;font-family:'Syne',sans-serif}
@keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:fi .28s ease forwards}
@keyframes sp{to{transform:rotate(360deg)}}
.sp{display:inline-block;width:13px;height:13px;border:2px solid rgba(110,231,183,.25);border-top-color:var(--ac);border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle}
`;

export default function App() {
  const [cfg, setCfg]   = useState(() => { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch { return null; } });
  const [data, setData] = useState({ events: [] });
  const [sync, setSync] = useState({ status: "idle", msg: "" });
  const [view, setView] = useState("dash");
  const [activeId, setActiveId] = useState(null);
  const [evForm, setEvForm]     = useState({ name: "", date: "", budget: "" });
  const [cfgForm, setCfgForm]   = useState({ clientEmail: "", privateKey: "", sheetId: "" });
  const [newItem, setNewItem]   = useState({ category: "", description: "", amount: "" });
  const [addType, setAddType]   = useState(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { if (cfg) doLoad(cfg); }, []);

  const doLoad = async (c) => {
    setSync({ status: "loading", msg: "Sincronizando..." });
    try {
      const token = await getAccessToken(c);
      const d = await sheetsGet(c, token);
      setData(d);
      setSync({ status: "ok", msg: "Sincronizado ✓" });
    } catch (e) { setSync({ status: "error", msg: e.message }); }
  };

  const persist = async (nd) => {
    setData(nd);
    if (!cfg) return;
    setSync({ status: "loading", msg: "Guardando..." });
    try {
      const token = await getAccessToken(cfg);
      await sheetsPut(cfg, token, nd);
      setSync({ status: "ok", msg: "Guardado ✓" });
    } catch { setSync({ status: "error", msg: "Error al guardar" }); }
  };

  const saveConfig = async () => {
    if (!cfgForm.clientEmail || !cfgForm.privateKey || !cfgForm.sheetId) return;
    setSaving(true);
    const c = { clientEmail: cfgForm.clientEmail.trim(), privateKey: cfgForm.privateKey.trim(), sheetId: cfgForm.sheetId.trim() };
    try {
      const token = await getAccessToken(c);
      const d = await sheetsGet(c, token);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
      setCfg(c); setData(d);
      setSync({ status: "ok", msg: "Conectado ✓" });
      setView("dash");
    } catch (e) { alert("No se pudo conectar:\n\n" + e.message); }
    setSaving(false);
  };

  const disconnect = () => {
    if (!confirm("¿Desconectar Google Sheets?")) return;
    localStorage.removeItem(CONFIG_KEY);
    setCfg(null); setData({ events: [] });
    setSync({ status: "idle", msg: "" });
  };

  const createEvent = () => {
    if (!evForm.name.trim()) return;
    const ev = { id: generateId(), name: evForm.name.trim(), date: evForm.date, budget: parseFloat(evForm.budget)||0, createdAt: new Date().toISOString(), items: [] };
    persist({ ...data, events: [...data.events, ev] });
    setEvForm({ name: "", date: "", budget: "" });
    setView("dash");
  };

  const deleteEvent = (id) => {
    if (!confirm("¿Eliminar este evento?")) return;
    persist({ ...data, events: data.events.filter((e) => e.id !== id) });
    if (activeId === id) { setActiveId(null); setView("dash"); }
  };

  const addItem = (type) => {
    if (!newItem.category || !newItem.amount) return;
    const item = { id: generateId(), type, category: newItem.category, description: newItem.description, amount: parseFloat(newItem.amount)||0, date: new Date().toISOString() };
    persist({ ...data, events: data.events.map((e) => e.id === activeId ? { ...e, items: [...e.items, item] } : e) });
    setNewItem({ category: "", description: "", amount: "" });
    setAddType(null);
  };

  const delItem = (evId, itemId) => {
    persist({ ...data, events: data.events.map((e) => e.id === evId ? { ...e, items: e.items.filter((i) => i.id !== itemId) } : e) });
  };

  const totals = (ev) => {
    const inc = ev.items.filter((i) => i.type==="income").reduce((s,i)=>s+i.amount,0);
    const exp = ev.items.filter((i) => i.type==="expense").reduce((s,i)=>s+i.amount,0);
    return { inc, exp, margin: inc-exp, pct: inc>0?((inc-exp)/inc)*100:0 };
  };

  const global = data.events.reduce((a,e)=>{ const t=totals(e); return {inc:a.inc+t.inc,exp:a.exp+t.exp,margin:a.margin+t.margin}; },{inc:0,exp:0,margin:0});
  const activeEv = data.events.find((e) => e.id === activeId);

  // pill
  const pillClass = {idle:"pill pill-off",loading:"pill pill-load",ok:"pill pill-ok",error:"pill pill-err"}[sync.status];
  const pillTxt = {
    idle: "Sin conectar",
    loading: <><span className="sp"/> {sync.msg}</>,
    ok: `☁ ${sync.msg}`,
    error: `⚠ ${sync.msg}`
  }[sync.status];

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  const Settings = () => (
    <div className="fi">
      <div className="fc">
        <div className="ftit">⚙️ Conectar Google Sheets</div>
        <div className="sn">🔒 Tus credenciales se guardan <strong>solo en tu navegador</strong>. Nunca pasan por ningún servidor externo, van directo a Google.</div>
        {cfg ? (
          <>
            <div className="sc-ok">
              <div style={{color:"var(--gr)",fontWeight:600,marginBottom:4}}>✓ Conectado</div>
              <div style={{color:"var(--mu)",fontSize:12}}>{cfg.clientEmail}</div>
              <div style={{color:"var(--mu)",fontSize:11}}>Planilla: {cfg.sheetId}</div>
            </div>
            <button className="btn btn-s" style={{width:"100%",marginBottom:8}} onClick={()=>doLoad(cfg)}>🔄 Forzar sincronización</button>
            <button className="btn btn-s" style={{width:"100%",color:"var(--re)",borderColor:"rgba(248,113,113,.35)"}} onClick={disconnect}>Desconectar</button>
          </>
        ) : (
          <>
            <div className="f"><label>Client Email</label><input placeholder="eventos-app@proyecto.iam.gserviceaccount.com" value={cfgForm.clientEmail} onChange={(e)=>setCfgForm({...cfgForm,clientEmail:e.target.value})}/></div>
            <div className="f">
              <label>Private Key</label>
              <textarea placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"} value={cfgForm.privateKey} onChange={(e)=>setCfgForm({...cfgForm,privateKey:e.target.value})}/>
              <div className="fhint">Pegá la clave completa incluyendo los encabezados BEGIN y END.</div>
            </div>
            <div className="f">
              <label>ID de la Planilla</label>
              <input placeholder="1uP2jT4N478D78Ph..." value={cfgForm.sheetId} onChange={(e)=>setCfgForm({...cfgForm,sheetId:e.target.value})}/>
              <div className="fhint">Parte de la URL entre <code>/d/</code> y <code>/edit</code></div>
            </div>
            <button className="btn btn-p" style={{width:"100%"}} onClick={saveConfig} disabled={saving}>
              {saving?<><span className="sp"/> Conectando...</>:"Conectar y verificar"}
            </button>
          </>
        )}
        <button className="btn btn-s" style={{width:"100%",marginTop:10}} onClick={()=>setView("dash")}>← Volver</button>
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  const Dashboard = () => (
    <div className="fi">
      <div className="ptitle">Control de <span style={{color:"var(--ac)"}}>Eventos</span></div>
      <div className="psub">{data.events.length} evento{data.events.length!==1?"s":""} registrado{data.events.length!==1?"s":""}</div>
      <div className="sg">
        <div className="sc inc"><div className="slbl">Total Ingresos</div><div className="sval pos">{fmt(global.inc)}</div></div>
        <div className="sc exp"><div className="slbl">Total Gastos</div><div className="sval" style={{color:"var(--ac2)"}}>{fmt(global.exp)}</div></div>
        <div className="sc mar"><div className="slbl">Margen Total</div><div className={`sval ${global.margin>=0?"pos":"neg"}`}>{fmt(global.margin)}</div></div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontFamily:"Syne",fontWeight:700,fontSize:14}}>Eventos</div>
        <button className="btn-add" onClick={()=>setView("new")}>+ Nuevo Evento</button>
      </div>
      <div className="eg">
        {data.events.length===0 && <div className="no-ev"><div className="big">🎪</div><p>Sin eventos aún.<br/>Creá el primero para empezar.</p></div>}
        {data.events.map((ev)=>{
          const t=totals(ev);
          const fp=ev.budget>0?Math.min(100,(t.inc/ev.budget)*100):0;
          return (
            <div key={ev.id} className="ec" onClick={()=>{setActiveId(ev.id);setAddType(null);setView("event")}}>
              <div className="en">{ev.name}</div>
              <div className="ed">{ev.date?new Date(ev.date+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"}):"Sin fecha"}</div>
              <div className="en2">
                <div className="ei"><div className="el">Ingresos</div><div className="ev2" style={{color:"var(--gr)"}}>{fmt(t.inc)}</div></div>
                <div className="ei"><div className="el">Gastos</div><div className="ev2" style={{color:"var(--ac2)"}}>{fmt(t.exp)}</div></div>
              </div>
              {ev.budget>0&&<div className="mb"><div className="mf" style={{width:`${fp}%`,background:t.margin>=0?"var(--gr)":"var(--re)"}}/></div>}
              <div className="ef">
                <span className={`badge ${t.margin>0?"bp":t.margin<0?"bl2":"bn"}`}>
                  {t.margin>0?`▲ ${fmt(t.margin)}`:t.margin<0?`▼ ${fmt(Math.abs(t.margin))}`:"Sin movimientos"}
                </span>
                <button className="btn-x" onClick={(e)=>{e.stopPropagation();deleteEvent(ev.id)}}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── NEW EVENT ─────────────────────────────────────────────────────────────
  const NewEvent = () => (
    <div className="fi">
      <div className="fc">
        <div className="ftit">Nuevo Evento</div>
        <div className="f"><label>Nombre *</label><input placeholder="ej: Gala Empresarial 2025" value={evForm.name} onChange={(e)=>setEvForm({...evForm,name:e.target.value})}/></div>
        <div className="f"><label>Fecha</label><input type="date" value={evForm.date} onChange={(e)=>setEvForm({...evForm,date:e.target.value})}/></div>
        <div className="f"><label>Presupuesto Objetivo ($)</label><input type="number" placeholder="ej: 500000" value={evForm.budget} onChange={(e)=>setEvForm({...evForm,budget:e.target.value})}/></div>
        <button className="btn btn-p" style={{width:"100%"}} onClick={createEvent}>Crear Evento</button>
        <button className="btn btn-s" style={{width:"100%",marginTop:10}} onClick={()=>setView("dash")}>Cancelar</button>
      </div>
    </div>
  );

  // ── EVENT DETAIL ──────────────────────────────────────────────────────────
  const EventDetail = () => {
    if (!activeEv) return null;
    const t=totals(activeEv);
    const incItems=activeEv.items.filter((i)=>i.type==="income");
    const expItems=activeEv.items.filter((i)=>i.type==="expense");
    const expByCat=EXPENSE_CATEGORIES.map((c)=>({...c,total:expItems.filter((i)=>i.category===c.id).reduce((s,i)=>s+i.amount,0)})).filter((c)=>c.total>0);
    const maxCat=Math.max(...expByCat.map((c)=>c.total),1);

    const Panel=({type,items,cats,color,title})=>(
      <div className="panel">
        <div className="ph">
          <div className="ptl" style={{color}}>{type==="income"?"📈":"📉"} {title}</div>
          <div className="ptt" style={{color}}>{fmt(items.reduce((s,i)=>s+i.amount,0))}</div>
        </div>
        <div className="il">
          {items.length===0&&<div className="es">Sin registros aún</div>}
          {items.map((item)=>{
            const cat=cats.find((c)=>c.id===item.category);
            return (
              <div className="ir" key={item.id}>
                <div className="ii">
                  <span className="iico">{cat?.icon||"💡"}</span>
                  <div><div className="inm">{cat?.label||item.category}</div>{item.description&&<div className="idsc">{item.description}</div>}</div>
                </div>
                <div className="iamt" style={{color}}>{fmt(item.amount)}</div>
                <button className="btn-x" onClick={()=>delItem(activeEv.id,item.id)}>×</button>
              </div>
            );
          })}
          <div style={{padding:"5px"}}>
            {addType===type?(
              <div className="af">
                <div className="ar">
                  <div className="f"><label>Categoría</label>
                    <select value={newItem.category} onChange={(e)=>setNewItem({...newItem,category:e.target.value})}>
                      <option value="">Seleccionar...</option>
                      {cats.map((c)=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div className="f"><label>Monto ($)</label>
                    <input type="number" placeholder="0" value={newItem.amount} onChange={(e)=>setNewItem({...newItem,amount:e.target.value})}/>
                  </div>
                </div>
                <div className="f" style={{marginTop:7}}><label>Descripción (opcional)</label>
                  <input placeholder="Detalle..." value={newItem.description} onChange={(e)=>setNewItem({...newItem,description:e.target.value})}/>
                </div>
                <div style={{display:"flex",gap:7,marginTop:8}}>
                  <button className="btn btn-p" style={{flex:1,padding:"9px"}} onClick={()=>addItem(type)}>Agregar</button>
                  <button className="btn btn-s" onClick={()=>setAddType(null)}>Cancelar</button>
                </div>
              </div>
            ):(
              <button className="btn-add" style={{width:"100%"}} onClick={()=>{setNewItem({category:"",description:"",amount:""});setAddType(type);}}>
                + Agregar {type==="income"?"Ingreso":"Gasto"}
              </button>
            )}
          </div>
        </div>
      </div>
    );

    return (
      <div className="fi">
        <div className="eh">
          <div>
            <div className="ptitle">{activeEv.name}</div>
            <div className="psub">
              {activeEv.date?new Date(activeEv.date+"T12:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}):"Sin fecha"}
              {activeEv.budget>0&&` · Presupuesto: ${fmt(activeEv.budget)}`}
            </div>
          </div>
          <button className="btn btn-s" onClick={()=>setView("dash")}>← Volver</button>
        </div>
        <div className="sum">
          <div className="sr"><span className="slb">Total Ingresos</span><span style={{color:"var(--gr)",fontFamily:"Syne",fontWeight:600}}>{fmt(t.inc)}</span></div>
          <div className="sr"><span className="slb">Total Gastos</span><span style={{color:"var(--ac2)",fontFamily:"Syne",fontWeight:600}}>{fmt(t.exp)}</span></div>
          <div className="sr">
            <span>Margen Neto</span>
            <span style={{fontFamily:"Syne",fontWeight:700,fontSize:17,color:t.margin>=0?"var(--gr)":"var(--re)"}}>
              {t.margin>=0?"▲ ":"▼ "}{fmt(Math.abs(t.margin))}
              {t.inc>0&&<span style={{fontSize:12,fontWeight:400,marginLeft:8}}>({t.pct.toFixed(1)}%)</span>}
            </span>
          </div>
          {expByCat.length>0&&(
            <>
              <div className="br-tit">Distribución de Gastos</div>
              {expByCat.map((c)=>(
                <div className="cr" key={c.id}>
                  <div className="clb"><span>{c.icon}</span><span>{c.label}</span></div>
                  <div className="cbg"><div className="cfi" style={{width:`${(c.total/maxCat)*100}%`,background:c.color}}/></div>
                  <div className="cam">{fmt(c.total)}</div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="tc">
          <Panel type="income"  items={incItems} cats={INCOME_CATEGORIES}  color="var(--gr)"  title="Ingresos"/>
          <Panel type="expense" items={expItems} cats={EXPENSE_CATEGORIES} color="var(--ac2)" title="Gastos"/>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <style>{CSS}</style>
      <div className="hdr">
        <div className="logo">EVENT<em>CTRL</em></div>
        <div className="hdr-r">
          <span className={pillClass}>{pillTxt}</span>
          <button className="btn-nav" onClick={()=>setView("dash")}>Dashboard</button>
          <button className="btn-nav" onClick={()=>setView("new")}>+ Evento</button>
          <button className="btn-gear" onClick={()=>setView("settings")} title="Configuración">⚙️</button>
        </div>
      </div>
      <div className="main">
        {view==="dash"    &&<Dashboard/>}
        {view==="new"     &&<NewEvent/>}
        {view==="event"   &&<EventDetail/>}
        {view==="settings"&&<Settings/>}
      </div>
    </div>
  );
}