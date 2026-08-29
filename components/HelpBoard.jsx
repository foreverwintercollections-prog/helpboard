import React, { useState, useEffect, useRef } from "react";
import { Check, Lock, Send, Plus, X, Clock, MapPin, Gift, Copy, ChevronRight, Star, Mail } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const TIERS = [
  { id: 0, name: "Newcomer", color: "#9AA1AE", req: "Email confirmed", short: "NEW" },
  { id: 1, name: "ID Verified", color: "#C99A3B", req: "Government ID checked", short: "ID" },
  { id: 2, name: "Trusted Pro", color: "#2F8F6E", req: "Address + guarantor confirmed", short: "PRO" },
];

const CATEGORY_META = {
  Errand: { emoji: "🏃", tag: "#F1E7D4", tagText: "#8A6A22" },
  Info: { emoji: "💬", tag: "#DCE9E3", tagText: "#256B4F" },
  Delivery: { emoji: "📦", tag: "#E7DEF2", tagText: "#5B3E96" },
  Rideshare: { emoji: "🚗", tag: "#DDE7F2", tagText: "#2A5C93" },
  "Price check": { emoji: "🏷️", tag: "#F2E0DC", tagText: "#A3452C" },
};

function minutesLeft(expiresAt) {
  const diff = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
  return Math.max(diff, 0);
}
function minutesAgo(createdAt) {
  return Math.max(Math.round((Date.now() - new Date(createdAt).getTime()) / 60000), 0);
}
function timeLeftColor(mins) {
  if (mins <= 10) return "#C1512F";
  if (mins <= 25) return "#C99A3B";
  return "#2F8F6E";
}

function TierStamp({ tier, size = "sm" }) {
  const t = TIERS[tier] || TIERS[0];
  const dims = size === "sm" ? 22 : 40;
  return (
    <span className="stamp" title={`${t.name} — ${t.req}`} style={{ width: dims, height: dims, borderColor: t.color, color: t.color, fontSize: size === "sm" ? 8 : 12 }}>
      {t.short}
    </span>
  );
}

/* ---------- Auth screen (magic-link email, no passwords) ---------- */
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink() {
    setError("");
    const redirectTo = typeof window !== "undefined" ? window.location.origin + window.location.search : undefined;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="screen center">
      <div className="onboard-card">
        <div className="eyebrow">HELPBOARD</div>
        <h1 className="display">Somebody nearby<br />already knows this.</h1>
        <p className="sub">Enter your email — we'll send a sign-in link. No password to remember.</p>
        {sent ? (
          <div className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Mail size={16} /> Check {email} for your sign-in link.
          </div>
        ) : (
          <div className="stack">
            <input className="input" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <div className="hint" style={{ color: "#C1512F" }}>{error}</div>}
            <button className="btn-primary" disabled={!email.includes("@")} onClick={sendLink}>
              Send sign-in link <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Profile creation (first login only) ---------- */
function Onboarding({ userId, onDone }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState(0);
  const [step, setStep] = useState("name");
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    const params = new URLSearchParams(window.location.search);
    const refId = params.get("ref");

    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: userId, name: name.trim(), tier, referred_by: refId || null })
      .select()
      .single();

    if (!error && refId && refId !== userId) {
      await supabase.from("profiles").update({ credits: 500 }).eq("id", userId);
      const { data: referrer } = await supabase.from("profiles").select("credits").eq("id", refId).single();
      if (referrer) await supabase.from("profiles").update({ credits: (referrer.credits || 0) + 500 }).eq("id", refId);
    }
    setSaving(false);
    onDone(data || { id: userId, name: name.trim(), tier, credits: refId ? 500 : 0 });
  }

  return (
    <div className="screen center">
      <div className="onboard-card">
        <div className="eyebrow">ONE LAST STEP</div>
        <h1 className="display">Set up your profile</h1>
        {step === "name" && (
          <div className="stack">
            <input className="input" placeholder="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn-primary" disabled={!name.trim()} onClick={() => setStep("verify")}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        )}
        {step === "verify" && (
          <div className="stack">
            <div className="mini-label">Choose your starting trust tier</div>
            {TIERS.map((t) => (
              <button key={t.id} className={"tier-row" + (tier === t.id ? " tier-row-active" : "")} style={{ "--tc": t.color }} onClick={() => setTier(t.id)}>
                <TierStamp tier={t.id} />
                <div className="tier-row-text">
                  <div className="tier-row-name">{t.name}</div>
                  <div className="tier-row-req">{t.req}</div>
                </div>
                {tier === t.id && <Check size={16} color={t.color} />}
              </button>
            ))}
            <p className="hint">You (the admin) upgrade someone's tier manually from the Supabase table editor once you've checked their ID — no code needed.</p>
            <button className="btn-primary" disabled={saving} onClick={finish}>
              {saving ? "Setting up…" : "Enter HelpBoard"} <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PostModal({ profile, onClose, onSubmit }) {
  const [category, setCategory] = useState("Errand");
  const [text, setText] = useState("");
  const [reward, setReward] = useState("");
  const [minTier, setMinTier] = useState(0);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("requests").insert({
      user_id: profile.id, name: profile.name, tier: profile.tier,
      category, text: text.trim(), reward: reward.trim() || "Free", min_tier: minTier, expires_at: expiresAt,
    });
    setSaving(false);
    if (!error) onSubmit();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">Post a request</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mini-label">Category</div>
        <div className="chip-row">
          {Object.keys(CATEGORY_META).map((c) => (
            <button key={c} className={"chip" + (category === c ? " chip-active" : "")} onClick={() => setCategory(c)}>
              {CATEGORY_META[c].emoji} {c}
            </button>
          ))}
        </div>
        <div className="mini-label">Anybody...</div>
        <textarea className="textarea" rows={3} placeholder="…know a mechanic open now near Yaba? …free to grab my package from the estate gate?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="two-col">
          <div>
            <div className="mini-label">Reward (optional)</div>
            <input className="input" placeholder="e.g. ₦1,500 or Free" value={reward} onChange={(e) => setReward(e.target.value)} />
          </div>
          <div>
            <div className="mini-label">Who can respond</div>
            <select className="input" value={minTier} onChange={(e) => setMinTier(Number(e.target.value))}>
              <option value={0}>Anyone</option>
              <option value={1}>ID Verified+</option>
              <option value={2}>Trusted Pro only</option>
            </select>
          </div>
        </div>
        <button className="btn-primary full" disabled={!text.trim() || saving} onClick={submit}>
          {saving ? "Posting…" : "Post — live for 60 min"}
        </button>
      </div>
    </div>
  );
}

function ChatPanel({ conversation, profile, otherName, otherTier, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    supabase.from("messages").select("*").eq("conversation_id", conversation.id).order("created_at", { ascending: true })
      .then(({ data }) => { if (isMounted && data) setMessages(data); });

    const channel = supabase
      .channel(`messages-${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => setMessages((m) => [...m, payload.new]))
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [conversation.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    await supabase.from("messages").insert({ conversation_id: conversation.id, sender_id: profile.id, text });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet chat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="chat-head-who">
            <TierStamp tier={otherTier} />
            <div>
              <div className="chat-name">{otherName}</div>
              <div className="chat-sub">Matched · private chat</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="chat-body">
          {messages.map((m) => (
            <div key={m.id} className={"bubble " + (m.sender_id === profile.id ? "bubble-me" : "bubble-them")}>{m.text}</div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="chat-input-row">
          <input className="input" placeholder="Type a message…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="icon-btn icon-btn-solid" onClick={send}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function InviteToast({ profile, onClose }) {
  const [copied, setCopied] = useState(false);
  function copyLink() {
    const link = `${window.location.origin}?ref=${profile.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="toast">
      <div className="toast-icon"><Gift size={18} color="#2F8F6E" /></div>
      <div className="toast-body">
        <div className="toast-title">Know someone who needs this today?</div>
        <div className="toast-sub">Invite a friend — you both get ₦500 in HelpBoard credit once they join.</div>
        <button className="btn-secondary" onClick={copyLink}><Copy size={14} /> {copied ? "Link copied" : "Copy invite link"}</button>
      </div>
      <button className="icon-btn" onClick={onClose}><X size={16} /></button>
    </div>
  );
}

function RequestCard({ req, myTier, onRespond }) {
  const meta = CATEGORY_META[req.category] || CATEGORY_META.Errand;
  const locked = req.min_tier > myTier;
  const left = minutesLeft(req.expires_at);
  return (
    <div className="card">
      <div className="card-top">
        <span className="cat-tag" style={{ background: meta.tag, color: meta.tagText }}>{meta.emoji} {req.category}</span>
        <span className="time-left" style={{ color: timeLeftColor(left) }}><Clock size={12} /> {left}m left</span>
      </div>
      <p className="card-text">{req.text}</p>
      <div className="card-meta">
        <TierStamp tier={req.tier} />
        <span className="meta-name">{req.name}</span>
        <span className="dot">·</span>
        <span className="meta-item"><MapPin size={11} /> nearby</span>
        <span className="dot">·</span>
        <span className="meta-item">{minutesAgo(req.created_at)}m ago</span>
      </div>
      <div className="card-bottom">
        <div className="reward">{req.reward}</div>
        <div className="right-side">
          <span className="respondents">{req.respondents > 0 ? `${req.respondents} already in` : "Be the first"}</span>
          {locked ? (
            <button className="btn-locked" title={`Requires ${TIERS[req.min_tier].name}`}><Lock size={13} /> {TIERS[req.min_tier].name} only</button>
          ) : (
            <button className="btn-in" onClick={() => onRespond(req)}>I'm in</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HelpBoard() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [showPost, setShowPost] = useState(false);
  const [activeConversation, setActiveConversation] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [postCount, setPostCount] = useState(0);

  // auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // load / create profile
  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => {
      if (data) setProfile(data);
    });
  }, [session]);

  // live feed
  useEffect(() => {
    if (!profile) return;
    supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => setRequests(data || []));

    const channel = supabase
      .channel("requests-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, (payload) => {
        if (payload.eventType === "INSERT") setRequests((r) => [payload.new, ...r]);
        if (payload.eventType === "UPDATE") setRequests((r) => r.map((x) => (x.id === payload.new.id ? payload.new : x)));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile]);

  async function handleRespond(req) {
    const { data: existing } = await supabase.from("conversations").select("*").eq("request_id", req.id).eq("responder_id", profile.id).maybeSingle();
    let convo = existing;
    if (!convo) {
      const { data } = await supabase.from("conversations").insert({ request_id: req.id, poster_id: req.user_id, responder_id: profile.id }).select().single();
      convo = data;
      setPostCount((c) => c + 1);
      if (postCount >= 0) setTimeout(() => setShowInvite(true), 1200);
    }
    setActiveConversation({ ...convo, otherName: req.name, otherTier: req.tier });
  }

  function handlePosted() {
    setShowPost(false);
    setPostCount((c) => c + 1);
    setTimeout(() => setShowInvite(true), 900);
  }

  if (session === undefined) return <div className="app-root"><GlobalStyle /></div>;
  if (!session) return <div className="app-root"><GlobalStyle /><AuthScreen /></div>;
  if (!profile) return <div className="app-root"><GlobalStyle /><Onboarding userId={session.user.id} onDone={setProfile} /></div>;

  return (
    <div className="app-root">
      <GlobalStyle />
      <header className="header">
        <div className="header-top">
          <div className="brand">HelpBoard</div>
          <div className="header-right">
            <div className="credit-pill"><Star size={12} color="#C99A3B" /> ₦{profile.credits || 0}</div>
            <div className="me-pill"><TierStamp tier={profile.tier} /> {profile.name}</div>
          </div>
        </div>
        <div className="ticker"><span className="pulse" /> live feed · {requests.length} open requests</div>
      </header>

      <div className="feed">
        {requests.length === 0 && <p className="hint" style={{ padding: 20, textAlign: "center" }}>No requests yet — be the first to post one.</p>}
        {requests.map((r) => <RequestCard key={r.id} req={r} myTier={profile.tier} onRespond={handleRespond} />)}
      </div>

      <button className="fab" onClick={() => setShowPost(true)}><Plus size={20} /> Post a request</button>

      {showPost && <PostModal profile={profile} onClose={() => setShowPost(false)} onSubmit={handlePosted} />}
      {activeConversation && (
        <ChatPanel conversation={activeConversation} profile={profile} otherName={activeConversation.otherName} otherTier={activeConversation.otherTier} onClose={() => setActiveConversation(null)} />
      )}
      {showInvite && <InviteToast profile={profile} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
      .app-root { --ink:#12182B; --paper:#FBF9F4; --card:#FFFFFF; --gold:#C99A3B; --green:#2F8F6E; --brick:#C1512F; --ink-soft:#5B6472; --border:#E7E2D6;
        font-family:'Inter',sans-serif; background:var(--paper); color:var(--ink); min-height:100vh; position:relative; }
      .display { font-family:'Fraunces',serif; font-weight:600; }
      .screen.center { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; background:var(--ink); }
      .onboard-card { background:var(--paper); border-radius:18px; padding:32px 28px; max-width:420px; width:100%; box-shadow:0 30px 60px rgba(0,0,0,0.35); }
      .eyebrow { font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.14em; color:var(--gold); margin-bottom:10px; }
      .onboard-card h1 { font-size:28px; line-height:1.15; margin:0 0 12px; }
      .sub { color:var(--ink-soft); font-size:14px; line-height:1.5; margin-bottom:22px; }
      .stack { display:flex; flex-direction:column; gap:10px; }
      .mini-label { font-size:11px; font-weight:600; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.06em; margin:14px 0 6px; }
      .hint { font-size:12px; color:var(--ink-soft); margin:4px 0; line-height:1.4; }
      .input, .textarea, select.input { width:100%; border:1px solid var(--border); background:var(--card); border-radius:10px; padding:11px 13px; font-family:'Inter',sans-serif; font-size:14px; color:var(--ink); outline:none; box-sizing:border-box; }
      .input:focus, .textarea:focus { border-color:var(--gold); }
      .textarea { resize:none; }
      .btn-primary { display:flex; align-items:center; justify-content:center; gap:6px; background:var(--ink); color:#fff; border:none; border-radius:10px; padding:12px 16px; font-size:14px; font-weight:600; cursor:pointer; }
      .btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
      .btn-primary.full { width:100%; margin-top:16px; }
      .btn-secondary { display:flex; align-items:center; gap:6px; background:var(--green); color:#fff; border:none; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:600; cursor:pointer; margin-top:8px; }
      .tier-row { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:10px 12px; border:1.5px solid var(--border); border-radius:12px; background:var(--card); cursor:pointer; }
      .tier-row-active { border-color:var(--tc); }
      .tier-row-name { font-weight:600; font-size:13px; }
      .tier-row-req { font-size:11.5px; color:var(--ink-soft); }
      .tier-row-text { flex:1; }
      .stamp { display:inline-flex; align-items:center; justify-content:center; border:2px solid; border-radius:50%; font-family:'IBM Plex Mono',monospace; font-weight:700; flex-shrink:0; background:#fff; }
      .header { background:var(--ink); color:#fff; padding:16px 18px 12px; position:sticky; top:0; z-index:5; }
      .header-top { display:flex; align-items:center; justify-content:space-between; }
      .brand { font-family:'Fraunces',serif; font-weight:600; font-size:20px; }
      .header-right { display:flex; align-items:center; gap:8px; }
      .credit-pill, .me-pill { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.08); border-radius:20px; padding:5px 10px; font-size:12px; }
      .ticker { display:flex; align-items:center; gap:7px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:#BFC6D4; margin-top:10px; }
      .pulse { width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 0 rgba(47,143,110,0.6); animation:pulse 1.8s infinite; }
      @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(47,143,110,0.5);} 70%{box-shadow:0 0 0 8px rgba(47,143,110,0);} 100%{box-shadow:0 0 0 0 rgba(47,143,110,0);} }
      .feed { max-width:560px; margin:0 auto; padding:16px 14px 100px; display:flex; flex-direction:column; gap:12px; }
      .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px 16px; }
      .card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .cat-tag { font-size:11.5px; font-weight:600; padding:4px 9px; border-radius:20px; }
      .time-left { display:flex; align-items:center; gap:4px; font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; }
      .card-text { font-size:14.5px; line-height:1.5; margin:0 0 10px; }
      .card-meta { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); margin-bottom:12px; }
      .meta-item { display:flex; align-items:center; gap:3px; }
      .meta-name { font-weight:600; color:var(--ink); }
      .dot { opacity:0.5; }
      .card-bottom { display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px dashed var(--border); }
      .reward { font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:13.5px; color:var(--gold); }
      .right-side { display:flex; align-items:center; gap:10px; }
      .respondents { font-size:11px; color:var(--ink-soft); }
      .btn-in { background:var(--ink); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; }
      .btn-locked { display:flex; align-items:center; gap:5px; background:#F0EEE8; color:var(--ink-soft); border:1px solid var(--border); border-radius:8px; padding:8px 12px; font-size:12px; cursor:not-allowed; }
      .fab { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:7px; background:var(--brick); color:#fff; border:none; border-radius:30px; padding:13px 22px; font-size:14px; font-weight:700; box-shadow:0 12px 24px rgba(193,81,47,0.35); cursor:pointer; z-index:6; }
      .overlay { position:fixed; inset:0; background:rgba(18,24,43,0.55); display:flex; align-items:flex-end; justify-content:center; z-index:20; }
      .sheet { background:var(--paper); width:100%; max-width:520px; border-radius:20px 20px 0 0; padding:20px 20px 26px; max-height:88vh; overflow-y:auto; }
      .sheet-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
      .sheet-title { font-family:'Fraunces',serif; font-size:19px; margin:0; }
      .icon-btn { background:none; border:none; cursor:pointer; color:var(--ink-soft); padding:6px; border-radius:8px; display:flex; }
      .icon-btn-solid { background:var(--ink); color:#fff; }
      .chip-row { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:6px; }
      .chip { border:1px solid var(--border); background:var(--card); border-radius:20px; padding:6px 12px; font-size:12.5px; cursor:pointer; }
      .chip-active { border-color:var(--ink); background:var(--ink); color:#fff; }
      .two-col { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
      .chat-sheet { display:flex; flex-direction:column; height:70vh; }
      .chat-head-who { display:flex; align-items:center; gap:10px; }
      .chat-name { font-weight:700; font-size:14px; }
      .chat-sub { font-size:11.5px; color:var(--ink-soft); }
      .chat-body { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:10px 2px; }
      .bubble { max-width:78%; padding:9px 13px; border-radius:14px; font-size:13.5px; line-height:1.4; }
      .bubble-them { background:var(--card); border:1px solid var(--border); align-self:flex-start; border-bottom-left-radius:4px; }
      .bubble-me { background:var(--ink); color:#fff; align-self:flex-end; border-bottom-right-radius:4px; }
      .chat-input-row { display:flex; gap:8px; margin-top:10px; }
      .toast { position:fixed; bottom:96px; left:14px; right:14px; max-width:480px; margin:0 auto; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px; display:flex; gap:10px; align-items:flex-start; box-shadow:0 16px 32px rgba(18,24,43,0.18); z-index:25; }
      .toast-icon { background:#E4F1EB; border-radius:10px; padding:8px; }
      .toast-body { flex:1; }
      .toast-title { font-weight:700; font-size:13.5px; margin-bottom:3px; }
      .toast-sub { font-size:12px; color:var(--ink-soft); line-height:1.4; }
      @media (max-width:480px){ .two-col{grid-template-columns:1fr;} }
    `}</style>
  );
}
