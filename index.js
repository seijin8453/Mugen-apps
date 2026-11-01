// MUGEN Discord Bot — discord.js v14
// Replit Secrets: DISCORD_TOKEN = ton nouveau token (ne le publie jamais).
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, Events,
  REST, Routes, SlashCommandBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = "1563636106547691600";
const OWNER_ID = "1467952940215042079";
const LOGS = {
  reports:"1564267347034906674", topMessages:"1563871001404514394",
  topVoice:"1563871062700200018", topInvites:"1564267264180486247",
  blacklist:"1564271146663280721", whitelist:"1564002403412611142",
  boost:"1564347352632918160", ban:"1564002986521272320",
  warn:"1564002904086417530", unmute:"1564002716957806695",
  kick:"1564002639845392534", mute:"1564002558979215440"
};
const R = { GOD:"GOD OF MUGEN", GESTION:"GESTION", ADMIN:"ADMIN", STAFF:"STAFF", APPRENTI:"APPRENTI STAFF", MOD:"MODERATION" };
const PREFIXES = ["=","+","-"];
const RANKS = [{n:10,r:"Recrue"},{n:20,r:"Membre"},{n:30,r:"VIP"},{n:40,r:"Elite"},{n:50,r:"Légende"}];
const FILE = path.join(__dirname,"data.json");
const DEFAULT = {warnings:{},blacklist:[],whitelist:[],invites:{},pending:{},ever:{},messages:{},voice:{},boosts:{}};
let db = structuredClone(DEFAULT), dirty=false;
try { if(fs.existsSync(FILE)) db={...DEFAULT,...JSON.parse(fs.readFileSync(FILE,"utf8"))}; else fs.writeFileSync(FILE,JSON.stringify(DEFAULT,null,2)); } catch(e){console.error("DB:",e);}
function save(force=false){if(!dirty&&!force)return;try{fs.writeFileSync(FILE+".tmp",JSON.stringify(db,null,2));fs.renameSync(FILE+".tmp",FILE);dirty=false;}catch(e){console.error(e);}}
function touch(){dirty=true;}
setInterval(()=>save(),15000);

const client = new Client({intents:[
  GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildModeration
],partials:[Partials.Channel,Partials.Message,Partials.GuildMember,Partials.User]});
const cmds=new Map(), inviteCache=new Map(), voiceSessions=new Map();

const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const idOf=s=>String(s||"").match(/\d{17,20}/)?.[0]||null;
const em=(title,desc,color=0x5865F2)=>new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc||"—").setTimestamp();
async function log(g,id,e){const c=g?.channels.cache.get(id)||await g?.channels.fetch(id).catch(()=>null);if(c?.isTextBased())await c.send({embeds:[e]}).catch(()=>{});}
async function member(g,s){const id=idOf(s);return id?(g.members.cache.get(id)||await g.members.fetch(id).catch(()=>null)):null;}
async function fail(m,s){return m.reply({embeds:[em("❌ Erreur",s,0xED4245)]}).catch(()=>{});}
async function ok(m,s){return m.reply({embeds:[em("✅ Terminé",s,0x57F287)]}).catch(()=>{});}
function role(m,n){return !!m&&m.roles.cache.some(x=>norm(x.name)===norm(n));}
const owner=m=>m?.id===OWNER_ID;
const god=m=>owner(m)||role(m,R.GOD);
const gestion=m=>god(m)||role(m,R.GESTION);
const admin=m=>gestion(m)||role(m,R.ADMIN);
const mod=m=>admin(m)||role(m,R.MOD);
const listAdmin=m=>owner(m); // BL/WL owner-only
function higher(a,t){return !!a&&!!t&&a.id!==t.id&&(owner(a)||a.roles.highest.comparePositionTo(t.roles.highest)>0);}
function checkTarget(a,t){if(!t)return"Utilisateur introuvable.";if(a.id===t.id)return"Tu ne peux pas te cibler.";if(t.id===OWNER_ID)return"Action impossible sur le propriétaire.";if(!higher(a,t))return"Son rôle est égal ou supérieur au tien.";return null;}
function botHigher(g,t){return !!g.members.me&&g.members.me.roles.highest.comparePositionTo(t.roles.highest)>0;}
function reg(names,prefix,run){for(const n of (Array.isArray(names)?names:[names]))cmds.set(norm(n),{prefix,run});}
function parse(m){const p=PREFIXES.find(x=>m.content.startsWith(x));if(!p)return null;const a=m.content.slice(p.length).trim().split(/\s+/);return{p,n:norm(a.shift()),a};}
function stats(obj,id){obj[id] ||= {total:0,weekly:0};return obj[id];}
function inviteInfo(id){db.invites[id] ||= {total:0,bonus:0,fake:0,left:0};return db.invites[id];}
function inviteCount(id){const x=inviteInfo(id);return Math.max(0,x.total+x.bonus-x.fake-x.left);}
async function refreshInvites(g){try{const all=await g.invites.fetch(),map=new Map();for(const i of all.values())map.set(i.code,i.uses||0);inviteCache.set(g.id,map);return map;}catch(e){console.error("Invite fetch:",e);return new Map();}}
async function rankInvite(m){const n=inviteCount(m.id);for(const x of RANKS){const r=m.guild.roles.cache.find(y=>norm(y.name)===norm(x.r));if(r){if(n>=x.n)await m.roles.add(r).catch(()=>{});else await m.roles.remove(r).catch(()=>{});}}}
async function joinTrack(m){const old=inviteCache.get(m.guild.id)||new Map(),fresh=await refreshInvites(m.guild);let code=null;for(const [c,u]of fresh)if(u>(old.get(c)||0)){code=c;break;}let inviter=null;if(code){const all=await m.guild.invites.fetch().catch(()=>null);inviter=all?.get(code)?.inviter?.id||null;}db.pending[m.id]={inviter,at:Date.now()};touch();if(Date.now()-m.user.createdTimestamp<7*86400000)await log(m.guild,LOGS.reports,em("⚠️ Compte récent",`${m} a un compte de moins de 7 jours.`,0xFEE75C));await log(m.guild,LOGS.topInvites,em("📨 Nouvelle arrivée",`Membre : ${m}\nInviteur : ${inviter?`<@${inviter}>`:"Inconnu"}\nValidation après 24h.`));}
async function validateInvites(){const g=client.guilds.cache.get(GUILD_ID);if(!g)return;for(const [uid,p]of Object.entries(db.pending)){if(Date.now()-p.at<86400000)continue;const m=await g.members.fetch(uid).catch(()=>null);if(!m){delete db.pending[uid];touch();continue;}if(!db.ever[uid]&&p.inviter&&p.inviter!==uid){inviteInfo(p.inviter).total++;db.ever[uid]=true;const im=await g.members.fetch(p.inviter).catch(()=>null);if(im)await rankInvite(im);await log(g,LOGS.topInvites,em("✅ Invitation validée",`<@${uid}> invité par <@${p.inviter}>. Total : ${inviteCount(p.inviter)}`,0x57F287));}delete db.pending[uid];touch();}}

function voiceEligible(m){const v=m?.voice;return !!v?.channelId&&!m.user.bot&&!v.selfMute&&!v.serverMute&&!v.selfDeaf&&!v.serverDeaf&&!v.suppress;}
function voiceStart(m){if(voiceEligible(m)&&!voiceSessions.has(m.id))voiceSessions.set(m.id,{at:Date.now(),channel:m.voice.channelId});}
function voiceStop(uid){const s=voiceSessions.get(uid);if(!s)return;const secs=Math.floor((Date.now()-s.at)/1000);if(secs>0){const x=stats(db.voice,uid);x.total+=secs;x.weekly+=secs;touch();}voiceSessions.delete(uid);}
function voiceUpdate(m){if(!voiceEligible(m)){voiceStop(m.id);return;}const s=voiceSessions.get(m.id);if(s&&s.channel!==m.voice.channelId)voiceStop(m.id);voiceStart(m);}
function fmt(s){const min=Math.floor(s/60),h=Math.floor(min/60),d=Math.floor(h/24);return d?`${d}j ${h%24}h`:h?`${h}h ${min%60}min`:`${min}min`;}
async function top(g,type){let a=type==="voice"?Object.entries(db.voice).map(([u,s])=>[u,s.total||0]):type==="invites"?Object.keys(db.invites).map(u=>[u,inviteCount(u)]):Object.entries(db.messages).map(([u,s])=>[u,s.total||0]);a.sort((x,y)=>y[1]-x[1]);const out=[];for(const [i,[uid,val]]of a.slice(0,10).entries()){const m=await g.members.fetch(uid).catch(()=>null);out.push(`**${i+1}.** ${m?.user.username||uid} — **${type==="voice"?fmt(val):val}**`);}return out.join("\n")||"Pas encore de données.";}

reg("help","=",async m=>ok(m,["**Modération** `=ban @membre raison` · `=kick @membre` · `=mute @membre 10m` · `=unmute @membre` · `=warn @membre raison` · `=warns @membre` · `=clear 10`","**Stats** `=top messages|voice|invites` · `=invites @membre`","**Rôles** `+addrole @membre @rôle` · `-delrole @membre @rôle` · `=roles` · `-perms`","**BL/WL** propriétaire uniquement : `=bl ID` · `=unbl ID` · `=wl ID` · `=unwl ID`"].join("\n\n")));
reg("ping","=",async m=>ok(m,`Pong : ${client.ws.ping} ms`));
reg("ban","=",async(m,a)=>{if(!admin(m.member))return fail(m,"Permission insuffisante.");const t=await member(m.guild,a[0]),e=checkTarget(m.member,t);if(e)return fail(m,e);if(!botHigher(m.guild,t))return fail(m,"Mon rôle est trop bas.");const reason=a.slice(1).join(" ")||"Aucune raison";const done=await t.ban({reason}).then(()=>true).catch(()=>false);if(!done)return fail(m,"Bannissement impossible.");await log(m.guild,LOGS.ban,em("🔨 Membre banni",`${t.user.tag}\nPar : ${m.author.tag}\nRaison : ${reason}`,0xED4245));return ok(m,`${t.user.tag} banni.`);});
reg("kick","=",async(m,a)=>{if(!mod(m.member))return fail(m,"Permission insuffisante.");const t=await member(m.guild,a[0]),e=checkTarget(m.member,t);if(e)return fail(m,e);if(!botHigher(m.guild,t))return fail(m,"Mon rôle est trop bas.");const reason=a.slice(1).join(" ")||"Aucune raison";const done=await t.kick(reason).then(()=>true).catch(()=>false);if(!done)return fail(m,"Expulsion impossible.");await log(m.guild,LOGS.kick,em("👢 Membre expulsé",`${t.user.tag}\nPar : ${m.author.tag}\nRaison : ${reason}`,0xED4245));return ok(m,`${t.user.tag} expulsé.`);});
reg("mute","=",async(m,a)=>{if(!mod(m.member))return fail(m,"Permission insuffisante.");const t=await member(m.guild,a[0]),e=checkTarget(m.member,t);if(e)return fail(m,e);if(!botHigher(m.guild,t))return fail(m,"Mon rôle est trop bas.");const z=(a[1]||"10m").match(/^(\d+)(s|m|h|d)$/i);if(!z)return fail(m,"Durée : 10m, 2h, 1d.");const scale={s:1000,m:60000,h:3600000,d:86400000},ms=+z[1]*scale[z[2].toLowerCase()];if(ms>28*86400000)return fail(m,"Maximum 28 jours.");const reason=a.slice(2).join(" ")||"Aucune raison";const done=await t.timeout(ms,reason).then(()=>true).catch(()=>false);if(!done)return fail(m,"Mute impossible.");await log(m.guild,LOGS.mute,em("🔇 Membre mute",`${t.user.tag}\nDurée : ${a[1]||"10m"}\nRaison : ${reason}`,0xED4245));return ok(m,`${t.user.tag} mute.`);});
reg("unmute","=",async(m,a)=>{if(!mod(m.member))return fail(m,"Permission insuffisante.");const t=await member(m.guild,a[0]),e=checkTarget(m.member,t);if(e)return fail(m,e);const done=await t.timeout(null).then(()=>true).catch(()=>false);if(!done)return fail(m,"Impossible de retirer le mute.");await log(m.guild,LOGS.unmute,em("🔊 Mute retiré",`${t.user.tag}\nPar : ${m.author.tag}`,0x57F287));return ok(m,`Mute retiré à ${t.user.tag}.`);});
reg("warn","=",async(m,a)=>{if(!mod(m.member))return fail(m,"Permission insuffisante.");const t=await member(m.guild,a[0]);if(!t)return fail(m,"Utilisateur introuvable.");const reason=a.slice(1).join(" ")||"Aucune raison";db.warnings[t.id] ||= [];db.warnings[t.id].push({reason,by:m.author.id,at:Date.now()});touch();await log(m.guild,LOGS.warn,em("⚠️ Avertissement",`${t.user.tag}\nPar : ${m.author.tag}\nRaison : ${reason}`,0xFEE75C));return ok(m,`${t.user.tag} averti.`);});
reg("warns","=",async(m,a)=>{const t=await member(m.guild,a[0]||m.author.id);if(!t)return fail(m,"Utilisateur introuvable.");const w=db.warnings[t.id]||[];return m.reply({embeds:[em(`⚠️ Warns de ${t.user.tag}`,w.map((x,i)=>`**${i+1}.** ${x.reason} — <@${x.by}>`).join("\n")||"Aucun avertissement.",0xFEE75C)]});});
reg(["clear","purge"],"=",async(m,a)=>{if(!mod(m.member))return fail(m,"Permission insuffisante.");const n=Number(a[0]);if(!Number.isInteger(n)||n<1||n>100)return fail(m,"Choisis un nombre entre 1 et 100.");const d=await m.channel.bulkDelete(n,true).catch(()=>null);if(!d)return fail(m,"Suppression impossible (messages anciens ou permissions).");const msg=await m.channel.send(`🧹 ${d.size} messages supprimés.`);setTimeout(()=>msg.delete().catch(()=>{}),5000);});
reg("bl","=",async(m,a)=>{if(!listAdmin(m.member))return fail(m,"Propriétaire uniquement.");const id=idOf(a[0]);if(!id)return fail(m,"ID invalide.");if(!db.blacklist.includes(id))db.blacklist.push(id);touch();await log(m.guild,LOGS.blacklist,em("⛔ Blacklist",`<@${id}> ajouté par ${m.author.tag}`,0xED4245));return ok(m,`<@${id}> ajouté à la blacklist.`);});
reg("unbl","=",async(m,a)=>{if(!listAdmin(m.member))return fail(m,"Propriétaire uniquement.");const id=idOf(a[0]);if(!id)return fail(m,"ID invalide.");db.blacklist=db.blacklist.filter(x=>x!==id);touch();return ok(m,`<@${id}> retiré de la blacklist.`);});
reg("wl","=",async(m,a)=>{if(!listAdmin(m.member))return fail(m,"Propriétaire uniquement.");const id=idOf(a[0]);if(!id)return fail(m,"ID invalide.");if(!db.whitelist.includes(id))db.whitelist.push(id);touch();await log(m.guild,LOGS.whitelist,em("✅ Whitelist",`<@${id}> ajouté par ${m.author.tag}`,0x57F287));return ok(m,`<@${id}> ajouté à la whitelist.`);});
reg("unwl","=",async(m,a)=>{if(!listAdmin(m.member))return fail(m,"Propriétaire uniquement.");const id=idOf(a[0]);if(!id)return fail(m,"ID invalide.");db.whitelist=db.whitelist.filter(x=>x!==id);touch();return ok(m,`<@${id}> retiré de la whitelist.`);});
reg("addrole","+",async(m,a)=>{if(!gestion(m.member))return fail(m,"GESTION requis.");const t=await member(m.guild,a[0]);if(!t)return fail(m,"Membre introuvable.");const rid=idOf(a[1]),r=rid?m.guild.roles.cache.get(rid):m.guild.roles.cache.find(x=>norm(x.name)===norm(a.slice(1).join(" ")));if(!r)return fail(m,"Rôle introuvable.");if(!owner(m.member)&&r.position>=m.member.roles.highest.position)return fail(m,"Tu ne peux pas gérer ce rôle.");if(r.position>=m.guild.members.me.roles.highest.position)return fail(m,"Mon rôle est trop bas.");if(!await t.roles.add(r).then(()=>true).catch(()=>false))return fail(m,"Ajout impossible.");return ok(m,`${r.name} ajouté à ${t.user.tag}.`);});
reg("delrole","-",async(m,a)=>{if(!gestion(m.member))return fail(m,"GESTION requis.");const t=await member(m.guild,a[0]);if(!t)return fail(m,"Membre introuvable.");const rid=idOf(a[1]),r=rid?m.guild.roles.cache.get(rid):m.guild.roles.cache.find(x=>norm(x.name)===norm(a.slice(1).join(" ")));if(!r)return fail(m,"Rôle introuvable.");if(!owner(m.member)&&r.position>=m.member.roles.highest.position)return fail(m,"Tu ne peux pas gérer ce rôle.");if(r.position>=m.guild.members.me.roles.highest.position)return fail(m,"Mon rôle est trop bas.");if(!await t.roles.remove(r).then(()=>true).catch(()=>false))return fail(m,"Retrait impossible.");return ok(m,`${r.name} retiré à ${t.user.tag}.`);});
reg("roles","=",async m=>m.reply({embeds:[em("📋 Rôles",m.guild.roles.cache.sort((a,b)=>b.position-a.position).map(r=>`${r.name} — ${r.position}`).slice(0,40).join("\n"))]}));
reg("perms","-",async m=>{const x=m.member;return m.reply({embeds:[em(`🔐 Permissions de ${x.user.tag}`,`GOD : ${god(x)}\nGESTION : ${gestion(x)}\nADMIN : ${admin(x)}\nSTAFF : ${staff(x)}\nModération : ${mod(x)}\nGestion BL/WL : ${listAdmin(x)}`)]});});
reg(["top","lb","leaderboard"],"=",async(m,a)=>{const t=norm(a[0]||"messages");if(!["messages","voice","invites"].includes(t))return fail(m,"Choisis messages, voice ou invites.");return m.reply({embeds:[em(`🏆 Classement ${t}`,await top(m.guild,t))]});});
reg("invites","=",async(m,a)=>{const t=await member(m.guild,a[0]||m.author.id);if(!t)return fail(m,"Membre introuvable.");const x=inviteInfo(t.id);return m.reply({embeds:[em(`📨 Invitations de ${t.user.tag}`,`Valides : ${inviteCount(t.id)}\nTotal : ${x.total}\nBonus : ${x.bonus}\nFake : ${x.fake}\nDéparts : ${x.left}`)]});});

// Events
client.once(Events.ClientReady,async c=>{console.log(`Connecté : ${c.user.tag}`);const g=client.guilds.cache.get(GUILD_ID);if(g){await refreshInvites(g);const ms=await g.members.fetch().catch(()=>null);if(ms)for(const m of ms.values())if(m.voice.channelId)voiceUpdate(m);}setInterval(validateInvites,3600000);});
client.on(Events.GuildMemberAdd,async m=>{if(m.guild.id!==GUILD_ID)return;await joinTrack(m);if(db.blacklist.includes(m.id))await log(m.guild,LOGS.blacklist,em("⚠️ Blacklist détectée",`${m} a rejoint. Ceci journalise seulement l'événement; aucune expulsion automatique.` ,0xED4245));});
client.on(Events.GuildMemberRemove,m=>{if(m.guild.id===GUILD_ID){delete db.pending[m.id];touch();}});
client.on(Events.GuildMemberUpdate,async(a,b)=>{if(b.guild.id!==GUILD_ID)return;const was=!!a.premiumSinceTimestamp,now=!!b.premiumSinceTimestamp;db.boosts[b.id]={active:now,since:b.premiumSinceTimestamp||null};touch();if(was!==now)await log(b.guild,LOGS.boost,em(now?"💎 Boost reçu":"💔 Boost terminé",b.user.tag,now?0xF47FFF:0x747F8D));});
client.on(Events.InviteCreate,i=>{if(i.guild?.id===GUILD_ID)refreshInvites(i.guild);});
client.on(Events.InviteDelete,i=>{if(i.guild?.id===GUILD_ID)refreshInvites(i.guild);});
client.on(Events.MessageCreate,async m=>{if(!m.guild||m.guild.id!==GUILD_ID||m.author.bot)return;const s=stats(db.messages,m.author.id);s.total++;s.weekly++;touch();const p=parse(m);if(!p)return;const c=cmds.get(p.n);if(!c||(c.prefix&&c.prefix!==p.p))return;try{await c.run(m,p.a);}catch(e){console.error("Command error:",e);await fail(m,"Erreur de commande.");}});
client.on(Events.VoiceStateUpdate,(a,b)=>{if(b.guild.id!==GUILD_ID)return;const m=b.member||a.member;if(m)voiceUpdate(m);});

// Slash commands
const slash=[
  new SlashCommandBuilder().setName("ping").setDescription("Latence du bot"),
  new SlashCommandBuilder().setName("serveur").setDescription("Infos du serveur"),
  new SlashCommandBuilder().setName("profil").setDescription("Ton profil")
];
async function publishSlash(){const rest=new REST({version:"10"}).setToken(TOKEN);await rest.put(Routes.applicationGuildCommands(client.user.id,GUILD_ID),{body:slash.map(x=>x.toJSON())});}
client.on(Events.InteractionCreate,async i=>{if(!i.isChatInputCommand())return;try{if(i.commandName==="ping")return i.reply({content:`Pong : ${client.ws.ping} ms`,ephemeral:true});if(i.commandName==="serveur")return i.reply({embeds:[em(i.guild.name,`Membres : ${i.guild.memberCount}\nSalons : ${i.guild.channels.cache.size}\nRôles : ${i.guild.roles.cache.size}`)],ephemeral:true});if(i.commandName==="profil")return i.reply({embeds:[em(i.user.tag,`ID : ${i.user.id}\nCompte créé : <t:${Math.floor(i.user.createdTimestamp/1000)}:D>`)],ephemeral:true});}catch(e){console.error(e);const p={content:"Erreur.",ephemeral:true};if(i.replied||i.deferred)await i.followUp(p).catch(()=>{});else await i.reply(p).catch(()=>{});}});
client.once(Events.ClientReady,()=>publishSlash().catch(e=>console.error("Slash registration:",e)));

// Weekly reset: Sunday 19:00 UTC
let resetKey="";
setInterval(()=>{const d=new Date();if(d.getUTCDay()!==0||d.getUTCHours()!==19)return;const k=`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;if(k===resetKey)return;resetKey=k;for(const s of Object.values(db.messages))s.weekly=0;for(const s of Object.values(db.voice))s.weekly=0;touch();},60000);

if(!TOKEN)console.error("DISCORD_TOKEN manquant : ajoute-le dans Replit Secrets.");
else client.login(TOKEN).catch(e=>console.error("Connexion Discord impossible:",e));
process.on("SIGINT",()=>{save(true);client.destroy();process.exit(0);});
process.on("SIGTERM",()=>{save(true);client.destroy();process.exit(0);});
