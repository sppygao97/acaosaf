// Ação SAF - servidor sem dependências (Node >= 18). Dados em data/db.json
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PUB=path.join(__dirname,'public'),DB=path.join(__dirname,'data','db.json');
const ADMIN_CPF='06366084335',PORT=process.env.PORT||3000;
const FX=['Sub-17','Sub-20','Profissional'],GEN=['Feminino','Masculino'];
const CATS=GEN.flatMap(g=>['Profissional','Sub-20','Sub-17'].map(f=>`${f} ${g}`));
// Armazenamento: Upstash/Vercel KV (REST) se configurado; senão arquivo (local) ou /tmp (Vercel, temporário)
const KVU=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,KVT=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const FILE=process.env.VERCEL?'/tmp/acao-saf-db.json':DB;
const kv=async cmd=>{const r=await fetch(KVU,{method:'POST',headers:{Authorization:'Bearer '+KVT},body:JSON.stringify(cmd)});const j=await r.json();if(j.error)throw new Error(j.error);return j.result};
const seed=()=>({users:[{id:'admin',nome:'Administrador',cpf:ADMIN_CPF,perfil:'admin',genero:'Feminino',nascimento:'1990-01-01',categorias:[],promocoes:[]}],jogos:[],cronograma:[],tatica:{}});
let db;
const load=async()=>{if(KVU){const v=await kv(['GET','acao-saf']);return v?JSON.parse(v):seed()}
 try{return JSON.parse(fs.readFileSync(FILE))}catch{return seed()}};
const save=async d=>{if(KVU)return kv(['SET','acao-saf',JSON.stringify(d)]);fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify(d,null,1))};
// Sessão sem estado: token assinado (defina SESSION_SECRET em produção)
const SECRET=process.env.SESSION_SECRET||'troque-este-segredo';
const hm=v=>crypto.createHmac('sha256',SECRET).update(v).digest('hex');
const sign=id=>id+'.'+hm(id),verify=t=>{const[i,h]=String(t||'').split('.');return h&&h===hm(i)?i:null};
const dig=s=>String(s||'').replace(/\D/g,''),uid=()=>crypto.randomUUID().slice(0,8);
const idade=n=>{const b=new Date(n),t=new Date();let a=t.getFullYear()-b.getFullYear();if(t<new Date(t.getFullYear(),b.getMonth(),b.getDate()))a--;return a};
const faixa=a=>a<=17?'Sub-17':a<=20?'Sub-20':'Profissional'; // 14-17, 18-20, 21+
const err=(m,c=400)=>{const e=new Error(m);e.code=c;throw e};
const clean=u=>{const{cpf,...r}=u,a=idade(u.nascimento);return{...r,idade:a,categoria:u.perfil==='jogadora'?`${faixa(a)} ${u.genero}`:null}};
const split=c=>{const i=c.lastIndexOf(' ');return[c.slice(0,i),c.slice(i+1)]};
const catsOf=u=>u.perfil==='comissao'?u.categorias:(u.perfil==='presidente'||u.perfil==='admin')?CATS:[];
const ativa=(u,cat)=>{const[f,g]=split(cat);return u.perfil==='jogadora'&&u.genero===g&&(faixa(idade(u.nascimento))===f||(u.promocoes||[]).includes(cat))};
const proximo=cat=>db.jogos.filter(j=>j.categoria===cat&&new Date(j.data)>=Date.now()-36e5).sort((a,b)=>a.data.localeCompare(b.data))[0];

async function route(m,p,b,q,req){
 if(p==='/api/login'){const u=db.users.find(x=>x.cpf===dig(b.cpf));if(!u)err('CPF não cadastrado',401);return{token:sign(u.id)}}
 const real=db.users.find(x=>x.id===verify(req.headers['x-token']));if(!real)err('Sessão inválida',401);
 let eff=real;const va=dig(req.headers['x-view-as']);
 if(va&&real.perfil==='admin')eff=db.users.find(x=>x.cpf===va)||err('CPF não encontrado',404);
 const adm=eff.perfil==='admin',can=cat=>adm||(eff.perfil==='comissao'&&eff.categorias.includes(cat)),see=cat=>can(cat)||eff.perfil==='presidente';
 const need=ok=>ok||err('Sem permissão',403),id=p.split('/')[3];
 if(p==='/api/me')return{real:{nome:real.nome,perfil:real.perfil},eff:clean(eff),cats:catsOf(eff),CATS};
 if(p==='/api/stats'){need(adm||eff.perfil==='presidente');const j=db.users.filter(u=>u.perfil==='jogadora'),cats={};
  CATS.forEach(c=>cats[c]=j.filter(u=>`${faixa(idade(u.nascimento))} ${u.genero}`===c).length);
  return{jogadoras:j.length,Feminino:j.filter(u=>u.genero==='Feminino').length,Masculino:j.filter(u=>u.genero==='Masculino').length,comissao:db.users.filter(u=>u.perfil==='comissao').length,cats}}
 if(p==='/api/users'){need(adm);
  if(m==='GET')return db.users.map(u=>({...clean(u),cpf:u.cpf}));
  if(m==='POST'){const cpf=dig(b.cpf);if(cpf.length!==11)err('CPF inválido');if(db.users.some(u=>u.cpf===cpf))err('CPF já cadastrado');
   if(!b.nome||!['jogadora','comissao','presidente','admin'].includes(b.perfil)||!GEN.includes(b.genero))err('Preencha nome, perfil e gênero (modalidade)');
   if(b.perfil==='jogadora'&&!b.nascimento)err('Informe a data de nascimento');
   const u={id:uid(),nome:b.nome,cpf,perfil:b.perfil,genero:b.genero,nascimento:b.nascimento||'1980-01-01',posicao:b.posicao||'',categorias:(b.categorias||[]).filter(c=>CATS.includes(c)),promocoes:[]};
   if(b.perfil==='comissao'&&!u.categorias.length)err('Selecione ao menos uma categoria');db.users.push(u);await save(db);return{ok:1}}}
 if(p.startsWith('/api/users/')&&m==='DELETE'){need(adm);if(id==='admin')err('Não é possível remover o administrador');db.users=db.users.filter(u=>u.id!==id);await save(db);return{ok:1}}
 if(p==='/api/jogos'){
  if(m==='GET')return db.jogos.slice().sort((a,b)=>a.data.localeCompare(b.data)).map(j=>eff.perfil==='jogadora'?{...j,relacionadas:undefined,relacionada:j.relacionadas.includes(eff.id)}:j);
  need(adm);if(!CATS.includes(b.categoria)||!b.data||!b.adversario)err('Dados do jogo incompletos');db.jogos.push({id:uid(),categoria:b.categoria,adversario:b.adversario,data:b.data,local:b.local||'',relacionadas:[]});await save(db);return{ok:1}}
 if(p.startsWith('/api/jogos/')&&m==='DELETE'){need(adm);db.jogos=db.jogos.filter(j=>j.id!==id);await save(db);return{ok:1}}
 if(p==='/api/cronograma'){
  if(m==='GET'){if(eff.perfil!=='jogadora')return db.cronograma;const cs=[`${faixa(idade(eff.nascimento))} ${eff.genero}`,...eff.promocoes||[]];return db.cronograma.filter(x=>x.categoria==='Todas'||cs.includes(x.categoria))}
  need(adm);if(!b.data||!b.atividade)err('Dados incompletos');db.cronograma.push({id:uid(),categoria:b.categoria||'Todas',data:b.data,atividade:b.atividade});await save(db);return{ok:1}}
 if(p.startsWith('/api/cronograma/')&&m==='DELETE'){need(adm);db.cronograma=db.cronograma.filter(x=>x.id!==id);await save(db);return{ok:1}}
 if(p==='/api/elenco'){const cat=q.get('cat');need(CATS.includes(cat)&&see(cat));const[f,g]=split(cat),j=proximo(cat);
  const js=db.users.filter(u=>u.perfil==='jogadora'&&u.genero===g);
  return{jogo:j||null,tatica:db.tatica[cat]||{},
   ativas:js.filter(u=>ativa(u,cat)).map(u=>({...clean(u),promovida:faixa(idade(u.nascimento))!==f})),
   inferiores:js.filter(u=>FX.indexOf(faixa(idade(u.nascimento)))<FX.indexOf(f)&&!(u.promocoes||[]).includes(cat)).map(clean)}}
 if(p==='/api/promover'){need(can(b.cat));const[f,g]=split(b.cat),u=db.users.find(x=>x.id===b.id);
  if(!u||u.perfil!=='jogadora'||u.genero!==g||FX.indexOf(faixa(idade(u.nascimento)))>=FX.indexOf(f))err('Jogadora não elegível para promoção');
  u.promocoes=(u.promocoes||[]).filter(c=>c!==b.cat);if(b.on)u.promocoes.push(b.cat);
  if(!b.on)db.jogos.filter(j=>j.categoria===b.cat).forEach(j=>j.relacionadas=j.relacionadas.filter(i=>i!==u.id));await save(db);return{ok:1}}
 if(p==='/api/relacionar'){const j=db.jogos.find(x=>x.id===b.jogoId);need(j&&can(j.categoria));const u=db.users.find(x=>x.id===b.id);
  if(!u||!ativa(u,j.categoria))err('Jogadora não está ativa nesta categoria');
  j.relacionadas=j.relacionadas.filter(i=>i!==b.id);if(b.on)j.relacionadas.push(b.id);await save(db);return{ok:1}}
 if(p==='/api/tatica'){need(can(b.cat));db.tatica[b.cat]=b.pos||{};await save(db);return{ok:1}}
 err('Rota não encontrada',404)}

const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css'};
async function handler(req,res){const url=new URL(req.url,'http://x'),p=url.pathname;
 if(!p.startsWith('/api/')){const f=path.join(PUB,path.normalize(p==='/'?'/index.html':p));
  if(!f.startsWith(PUB)||!fs.existsSync(f)){res.writeHead(404);return res.end('404')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(res)}
 let b={};try{if(req.body!==undefined)b=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
  else{const c=[];for await(const x of req)c.push(x);b=JSON.parse(Buffer.concat(c)||'{}')}}catch{}
 try{db=await load();const o=await route(req.method,p,b,url.searchParams,req);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(o))}
 catch(e){res.writeHead(e.code||500,{'Content-Type':'application/json'});res.end(JSON.stringify({erro:e.message}))}}
module.exports=handler;
if(require.main===module)http.createServer(handler).listen(PORT,()=>console.log('Ação SAF em http://localhost:'+PORT));
