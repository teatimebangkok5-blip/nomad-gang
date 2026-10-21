(function(){
const TAU=Math.PI*2,S=Math.sin,C=Math.cos,abs=Math.abs,max=Math.max,min=Math.min,PI=Math.PI;
const cl=(v,a=0,b=1)=>max(a,min(b,v));
const r2=n=>Math.round(n*100)/100;
const INK='#2A1236';
const T=o=>{const ox=o.ox??64,oy=o.oy??64;return `translate(${r2((o.x||0)+ox)} ${r2((o.y||0)+oy)}) rotate(${r2(o.r||0)}) scale(${r2(o.sx??o.s??1)} ${r2(o.sy??o.s??1)}) translate(${-ox} ${-oy})`;};
const g=(o,inner)=>`<g transform="${T(o)}">${inner}</g>`;
const bump=(t,c,w)=>{const d=((t-c)%1+1.5)%1-.5;return cl(1-abs(d)/w);};
const blinkAt=(t,c=.85)=>bump(t,c,.05);
const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
const back=x=>1+2.70158*Math.pow(x-1,3)+1.70158*Math.pow(x-1,2);
const wave=(t,k=1)=>(1-C(t*TAU*k))/2;

function defs(u){
  const st=s=>s.map(([o,c,a])=>`<stop offset="${o}" stop-color="${c}"${a!=null?` stop-opacity="${a}"`:''}/>`).join('');
  const R=(id,s,cx='38%',cy='30%',r='78%')=>`<radialGradient id="${u}${id}" cx="${cx}" cy="${cy}" r="${r}">${st(s)}</radialGradient>`;
  const L=(id,s)=>`<linearGradient id="${u}${id}" x1="0" y1="0" x2="0" y2="1">${st(s)}</linearGradient>`;
  return `<defs>${R('f',[[0,'#FFF6B8'],[.3,'#FFD24D'],[.72,'#FF9A3C'],[1,'#F2585A']])}${R('c',[[0,'#FFC7A6'],[.35,'#FF8763'],[.75,'#F5486B'],[1,'#B9246A']])}${R('v',[[0,'#D9C7FF'],[.35,'#9B6BFF'],[.75,'#6A3BF0'],[1,'#3A1A9A']])}${R('p',[[0,'#FFC2DD'],[.4,'#FF5B9C'],[1,'#C8165C']])}${R('w',[[0,'#FFFFFF'],[.6,'#F4EEFF'],[1,'#C9BBE8']])}${R('b',[[0,'#C8F1FF'],[.45,'#58B8FF'],[1,'#3B55D9']])}${R('gr',[[0,'#D4F79A'],[.5,'#7BD65A'],[1,'#3C9E4A']])}${R('am',[[0,'#FFF0A0'],[.4,'#FFC233'],[1,'#E0780F']])}${R('br',[[0,'#D9A070'],[.5,'#9A5A32'],[1,'#5E3018']])}${R('gd',[[0,'#FFF4C0'],[.5,'#FFD060'],[1,'#D99A20']])}${R('t',[[0,'#E6FBFF'],[.5,'#7FD3FF'],[1,'#3A8BFF']])}${R('mt',[[0,'#FBE7CF'],[.5,'#E0B088'],[1,'#A86E46']])}${R('rw',[[0,'#FF9AAE'],[.45,'#E0335A'],[1,'#7A0E30']])}${R('sh',[[.7,'#7A1840',0],[1,'#7A1840',.38]],'50%','50%','50%')}${R('shv',[[.68,'#14063F',0],[1,'#14063F',.45]],'50%','50%','50%')}${L('gl',[[0,'#FFFFFF',.95],[1,'#FFFFFF',0]])}${L('fl',[[0,'#FF3D6E'],[.5,'#FF7A2E'],[1,'#FFC23A']])}${L('fi',[[0,'#FFE06A'],[1,'#FFFBE0']])}${L('ag',[[0,'#E0203A',.8],[.62,'#E0203A',0]])}</defs>`;
}

const gloss=(u,cx,cy,rx,ry,o=.85,rot=0)=>`<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="url(#${u}gl)" opacity="${o}"${rot?` transform="rotate(${rot} ${r2(cx)} ${r2(cy)})"`:''}/>`;
const ball=(u,cx,cy,r,gid='f',sh='sh')=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}${gid})"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}${sh})"/>${gloss(u,cx-r*.12,cy-r*.54,r*.58,r*.3)}`;
const face=u=>ball(u,64,64,54)+`<ellipse cx="64" cy="109" rx="24" ry="4.5" fill="#FFE59A" opacity=".4"/>`;
const eye=(x,y,s=1,bl=0)=>{
  if(bl>.6) return `<path d="M${r2(x-6*s)} ${y} Q${x} ${r2(y+4*s)} ${r2(x+6*s)} ${y}" stroke="${INK}" stroke-width="${r2(4*s)}" stroke-linecap="round" fill="none"/>`;
  const k=1-bl;
  return `<ellipse cx="${x}" cy="${y}" rx="${r2(6*s)}" ry="${r2(8*s*k)}" fill="${INK}"/><circle cx="${r2(x+2*s)}" cy="${r2(y-3*s*k)}" r="${r2(2.4*s)}" fill="#fff"/><circle cx="${r2(x-2*s)}" cy="${r2(y+3*s*k)}" r="${r2(1*s)}" fill="#fff" opacity=".7"/>`;
};
const arcEye=(x,y,s=1)=>`<path d="M${r2(x-8*s)} ${r2(y+3*s)} Q${x} ${r2(y-7*s)} ${r2(x+8*s)} ${r2(y+3*s)}" stroke="${INK}" stroke-width="${r2(5*s)}" stroke-linecap="round" fill="none"/>`;
const blush=(x,y,s=1)=>`<ellipse cx="${x}" cy="${y}" rx="${r2(8*s)}" ry="${r2(4.5*s)}" fill="#FF4F8A" opacity=".42"/>`;
const line=(x,y,w,d,sw=5)=>`<path d="M${r2(x-w)} ${r2(y)} Q${r2(x)} ${r2(y+d)} ${r2(x+w)} ${r2(y)}" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
const mouth=(x,y,w,d)=>`<path d="M${r2(x-w)} ${y} Q${x} ${r2(y+d*2)} ${r2(x+w)} ${y} Q${x} ${r2(y+d*.5)} ${r2(x-w)} ${y}Z" fill="#4A1030"/><ellipse cx="${x}" cy="${r2(y+d*.8)}" rx="${r2(w*.42)}" ry="${r2(d*.2)}" fill="#FF6F91"/>`;
const spark=(x,y,s,c='#FFF6C0',o=1)=>s<=.05?'':`<path transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})" d="M0 -1 Q.18 -.18 1 0 Q.18 .18 0 1 Q-.18 .18 -1 0 Q-.18 -.18 0 -1Z" fill="${c}" opacity="${r2(cl(o))}"/>`;
const HEART='M0 .95 C-.55 .55 -1.05 .15 -1.05 -.35 C-1.05 -.78 -.72 -1.02 -.42 -1.02 C-.2 -1.02 -.06 -.9 0 -.72 C.06 -.9 .2 -1.02 .42 -1.02 C.72 -1.02 1.05 -.78 1.05 -.35 C1.05 .15 .55 .55 0 .95Z';
const heart=(u,x,y,s,o=1)=>s<=.1?'':`<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})" opacity="${r2(cl(o))}"><path d="${HEART}" fill="url(#${u}p)"/><path d="${HEART}" fill="url(#${u}sh)"/><ellipse cx="-.48" cy="-.55" rx=".3" ry=".17" fill="#fff" opacity=".8" transform="rotate(-35 -.48 -.55)"/></g>`;
const drop=(u,x,y,s,o=1)=>`<path transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})" d="M0 -1.2 C.55 -.4 .8 0 .8 .35 C.8 .8 .42 1.1 0 1.1 C-.42 1.1 -.8 .8 -.8 .35 C-.8 0 -.55 -.4 0 -1.2Z" fill="url(#${u}t)" opacity="${r2(cl(o))}"/>`;
const steam=(x,y,t,k,h=20)=>{const p=(t+k)%1;return `<path d="M${x} ${r2(y-p*h)} q-6 -6 0 -12 t0 -12" stroke="#D2C4F0" stroke-width="4" stroke-linecap="round" fill="none" opacity="${r2(S(p*PI)*.7)}"/>`;};
const mirror=s=>`<g transform="matrix(-1 0 0 1 128 0)">${s}</g>`;

const PIN='M0 40 C-11 27 -31 12 -31 -12 A31 31 0 1 1 31 -12 C31 12 11 27 0 40Z';
function pinny(u,o={}){
  const {x=64,y=64,s=1,r=0,col='c',eyes='dot',bl=0,mo='smile',armL=null,armR=null,wink=false}=o;
  const dark=col==='c'?'#F04A6C':'#6A3BF0',light=col==='c'?'#FF9070':'#A780FF';
  const arm=(sd,ang)=>{if(ang==null)return'';const a=ang*PI/180,sx=sd*24,sy=4,ex=sx+sd*C(a)*19,ey=sy-S(a)*19;return `<path d="M${sx} ${sy} L${r2(ex)} ${r2(ey)}" stroke="${dark}" stroke-width="8" stroke-linecap="round"/><circle cx="${r2(ex)}" cy="${r2(ey)}" r="5.5" fill="${light}"/>`;};
  let fc=eyes==='happy'?arcEye(-11,-12,.72)+arcEye(11,-12,.72):eye(-11,-12,.7,bl)+(wink?arcEye(11,-12,.7):eye(11,-12,.7,bl));
  fc+=blush(-19,-1,.7)+blush(19,-1,.7)+(mo==='open'?mouth(0,-3,8,6):line(0,-3,6,6,3.5));
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(r)}) scale(${r2(s)})">${arm(-1,armL)}${arm(1,armR)}<path d="${PIN}" fill="url(#${u}${col})"/><path d="${PIN}" fill="url(#${u}${col==='c'?'sh':'shv'})"/>${gloss(u,-9,-31,17,9)}${fc}</g>`;
}

const E=[];
const add=(id,name,cat,dur,still,draw)=>E.push({id,name,cat,dur,still,draw});

/* ---------- Faces ---------- */
add('happy','Happy','faces',1.4,.25,(u,t)=>{const b=abs(S(t*TAU)),sq=cl(1-b/.25),bl=blinkAt(t,.8);
  return g({y:-b*7,sx:1+sq*.05,sy:1-sq*.05,oy:118},face(u)+eye(46,52,1,bl)+eye(82,52,1,bl)+blush(33,72)+blush(95,72)+mouth(64,70,22,14));});
add('lol','LOL','faces',1.2,.2,(u,t)=>{const r=S(t*TAU*2)*9,y=-abs(S(t*TAU*2))*3;let tr='';
  for(const sd of [-1,1])for(const k of [0,.5]){const p=(t*2+k)%1;tr+=drop(u,64+sd*(34+p*24),54-p*10+p*p*36,5.5,1-p*p);}
  return g({r,y},face(u)+`<path d="M36 42 L53 50 L36 58" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M92 42 L75 50 L92 58" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M34 66 H94 Q94 100 64 104 Q34 100 34 66Z" fill="#4A1030"/><path d="M36 66 H92 Q91 73 86 74 H42 Q37 73 36 66Z" fill="#fff"/><ellipse cx="64" cy="94" rx="14" ry="6" fill="#FF6F91"/>`+blush(30,72)+blush(98,72)+tr);});
add('love','Love','faces',1.3,.25,(u,t)=>{const p=Math.pow(max(0,S(t*TAU*2)),2),s=12*(1+p*.18);let fl='';
  for(const k of [0,.5]){const q=(t+k)%1;fl+=heart(u,(k?20:108)+S(q*TAU)*3,36-q*28,5+q*2,S(q*PI));}
  return face(u)+heart(u,45,54,s)+heart(u,83,54,s)+blush(32,75)+blush(96,75)+mouth(64,72,18,12)+fl;});
add('sad','Sad','faces',1.8,.3,(u,t)=>{const y=S(t*TAU)*1.5,p=t;
  const ty=p<.35?66:66+Math.pow((p-.35)/.65,2)*44,ts=p<.35?1.5+p/.35*4:5.5,to=p>.85?(1-p)/.15:1;
  return g({y},face(u)+`<circle cx="64" cy="64" r="54" fill="#6A7CFF" opacity=".14"/><path d="M32 44 L52 36" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M96 44 L76 36" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`+eye(46,58,.95,blinkAt(t,.6))+eye(82,58,.95,blinkAt(t,.6))+line(64,90,13,-9)+blush(32,76,.9)+blush(96,76,.9))+drop(u,42,ty,ts,to);});
add('wow','Wow','faces',1.4,.25,(u,t)=>{const j=max(0,S(t*TAU)),m=1+S(t*TAU*2)*.1,by=34-j*5,bl=blinkAt(t,.9);
  return g({y:-j*6},face(u)+`<path d="M35 ${r2(by+4)} Q44 ${r2(by-4)} 55 ${r2(by+2)}" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/><path d="M93 ${r2(by+4)} Q84 ${r2(by-4)} 73 ${r2(by+2)}" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`+eye(46,56,1.15,bl)+eye(82,56,1.15,bl)+`<ellipse cx="64" cy="88" rx="${r2(9*m)}" ry="${r2(12*m)}" fill="#4A1030"/><ellipse cx="64" cy="${r2(88+7*m)}" rx="${r2(5*m)}" ry="${r2(3*m)}" fill="#FF6F91"/>`+blush(32,76)+blush(96,76))+spark(16,22,8*j)+spark(112,26,6*j)+spark(108,6,4*j);});
add('angry','Angry','faces',1.2,.3,(u,t)=>{const x=S(t*TAU*6)*2.4,hot=wave(t,2);let st='';
  for(const sd of [-1,1]){const p=(t*2+(sd>0?.5:0))%1;st+=`<circle cx="${r2(64+sd*(36+p*16))}" cy="${r2(22-p*16)}" r="${r2(4+p*6)}" fill="#fff" opacity="${r2((1-p)*.85)}"/>`;}
  return g({x},face(u)+`<circle cx="64" cy="64" r="54" fill="url(#${u}ag)" opacity="${r2(.55+.45*hot)}"/>`+gloss(u,57,35,30,15,.55)+`<path d="M32 40 L54 50" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M96 40 L74 50" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`+eye(46,61,.9)+eye(82,61,.9)+line(64,92,14,-9,6))+st;});
add('wink','Wink','faces',1.6,.5,(u,t)=>{const w=bump(t,.5,.25);
  const re=w>.45?`<path d="M74 56 Q82 47 90 56" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`:eye(82,54,1,w/.45*.6);
  return face(u)+eye(46,54,1)+re+blush(32,73)+blush(96,73)+mouth(64,71,18,12)+spark(108,30,3+w*8);});
add('yum','Yum','faces',1.4,.3,(u,t)=>{const tx=S(t*TAU)*9;
  return face(u)+arcEye(46,54)+arcEye(82,54)+blush(31,72)+blush(97,72)+`<path d="M${r2(54+tx)} 81 Q${r2(54+tx)} 98 ${r2(64+tx)} 98 Q${r2(74+tx)} 98 ${r2(74+tx)} 81Z" fill="#FF6F91"/><path d="M${r2(64+tx)} 84 V92" stroke="#E04870" stroke-width="2.5" stroke-linecap="round"/>`+line(64,77,23,10);});

/* ---------- Reactions ---------- */
add('thumbs','Thumbs up','reactions',1.3,.5,(u,t)=>{const p=wave(t);let fing='';
  for(let i=0;i<4;i++)fing+=`<rect x="58" y="${57+i*13}" width="${40-(i===3?6:0)}" height="15" rx="7.5" fill="url(#${u}f)" stroke="#E07A3A" stroke-opacity=".45" stroke-width="1.5"/>`;
  return g({r:-12*p,y:-5*p,ox:60,oy:104},`<rect x="12" y="62" width="24" height="48" rx="9" fill="url(#${u}v)"/>${gloss(u,22,70,6,10,.6)}<rect x="30" y="52" width="58" height="60" rx="22" fill="url(#${u}f)"/><rect x="30" y="52" width="58" height="60" rx="22" fill="url(#${u}sh)"/><path d="M40 60 C36 42 44 22 54 13 C62 6 74 10 72 23 C70 34 64 44 68 58Z" fill="url(#${u}f)"/>${gloss(u,56,20,7,10,.8,30)}${fing}${gloss(u,46,66,10,6,.5)}`)+spark(104,24,8*p)+spark(24,30,5*p)+spark(112,52,4*p);});
add('clap','Clap','reactions',1,.25,(u,t)=>{const c=(1+C(t*TAU*2))/2,gap=c*14,hit=cl(1-c/.25);
  const m=`<path d="M72 26 C72 18 92 18 92 26 V86 H72Z" fill="url(#${u}f)"/><rect x="66" y="22" width="32" height="72" rx="16" fill="url(#${u}f)"/><rect x="66" y="22" width="32" height="72" rx="16" fill="url(#${u}sh)"/><ellipse cx="100" cy="66" rx="9" ry="17" fill="url(#${u}f)" transform="rotate(-24 100 66)"/><path d="M76 30 V50 M86 30 V50" stroke="#E07A3A" stroke-opacity=".45" stroke-width="2.5" stroke-linecap="round"/>${gloss(u,78,32,8,10,.75)}<rect x="64" y="90" width="36" height="22" rx="8" fill="url(#${u}v)"/>`;
  return g({x:gap,r:14+c*10,ox:64,oy:104},m)+g({x:-gap,r:-(14+c*10),ox:64,oy:104},mirror(m))+`<g opacity="${r2(hit)}" stroke="#FFC94A" stroke-width="4.5" stroke-linecap="round"><path d="M64 12 V2"/><path d="M50 16 L42 8"/><path d="M78 16 L86 8"/></g>`;});
add('fire','Fire','reactions',1.2,.25,(u,t)=>{const w=S(t*TAU*2)*4,w2=C(t*TAU*3)*3,sy=1+S(t*TAU*3)*.04,bl=blinkAt(t,.7);
  const o=`M64 118 C34 118 20 98 22 78 C24 62 34 54 38 44 C42 54 46 60 52 60 C48 44 52 26 ${r2(66+w)} 8 C${r2(68+w)} 26 80 34 88 46 C92 40 92 34 ${r2(90+w2)} 28 C104 42 110 62 106 82 C102 104 88 118 64 118Z`;
  const i=`M64 116 C46 116 38 104 40 92 C42 82 48 78 52 70 C54 78 58 80 62 80 C60 70 64 58 ${r2(72+w2)} 50 C76 62 86 70 88 86 C90 104 80 116 64 116Z`;
  let em='';for(const k of [0,.33,.66]){const p=(t+k)%1;em+=`<circle cx="${r2(40+k*60+S(p*TAU)*4)}" cy="${r2(40-p*36)}" r="${r2(2.5*(1-p)+1)}" fill="#FFC23A" opacity="${r2(1-p)}"/>`;}
  return g({sy,oy:118},`<path d="${o}" fill="url(#${u}fl)"/><path d="${o}" fill="url(#${u}sh)" opacity=".7"/>${gloss(u,42,72,7,15,.6,25)}<path d="${i}" fill="url(#${u}fi)"/>`+eye(55,95,.62,bl)+eye(73,95,.62,bl)+line(64,102,5,4,3)+blush(48,103,.55)+blush(80,103,.55))+em;});
add('hundred','100','reactions',1.6,.6,(u,t)=>{const p=Math.pow(wave(t),2),s=1+p*.08;
  const off=t<.4?100*(1-ease(t/.4)):t<.82?0:-100*ease((t-.82)/.18);
  const D=`<path d="M20 40 L31 32 V80"/><ellipse cx="58" cy="56" rx="13" ry="24"/><ellipse cx="94" cy="56" rx="13" ry="24"/>`;
  return g({s,r:-8},`<g stroke="#FF3B5C" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none">${D}</g><g stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".5" transform="translate(-2.5 -2.5)">${D}</g><g stroke="#FF3B5C" stroke-width="9" stroke-linecap="round" fill="none" stroke-dasharray="100" stroke-dashoffset="${r2(off)}"><path pathLength="100" d="M16 96 Q64 88 112 96"/><path pathLength="100" d="M28 111 Q64 105 100 111"/></g>`);});
add('ok','OK','reactions',1.4,.25,(u,t)=>{const b=abs(S(t*TAU)),r=S(t*TAU)*5;
  const B='M30 20 H98 C114 20 122 32 122 48 V56 C122 72 112 84 96 84 H92 L96 104 L74 84 H30 C16 84 6 72 6 56 V48 C6 32 16 20 30 20Z';
  return g({y:-b*5,r},`<path d="${B}" fill="url(#${u}v)"/><path d="${B}" fill="url(#${u}shv)"/>${gloss(u,52,30,36,8,.75)}<g stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"><ellipse cx="42" cy="52" rx="13" ry="16"/><path d="M74 34 V70"/><path d="M95 34 L76 53 L96 70"/></g>`)+spark(16,14,7*b)+spark(118,100,5*b);});
add('heart','Heart','reactions',1.1,.25,(u,t)=>{const p=Math.pow(max(0,S(t*TAU*2)),3),s=44*(1+p*.14);
  return heart(u,64,68,s)+spark(14,24,1+7*p)+spark(114,20,1+6*p)+spark(116,104,1+4*p);});

/* ---------- Food & drink ---------- */
add('noodles','Noodles','food',1.6,.5,(u,t)=>{const h=wave(t)*8,bl=blinkAt(t,.8);
  const bw='M14 66 H114 C114 96 92 116 64 116 C36 116 14 96 14 66Z';
  return steam(40,52,t,0)+steam(56,48,t,.5)+`<path d="M66 ${r2(46-h)} L116 ${r2(8-h)}" stroke="#C9783A" stroke-width="5" stroke-linecap="round"/><path d="${bw}" fill="url(#${u}v)"/><path d="${bw}" fill="url(#${u}shv)"/><ellipse cx="64" cy="66" rx="50" ry="11" fill="url(#${u}am)"/><path d="M24 66 q6 -5 12 0 t12 0 t12 0 M30 70 q6 -4 12 0 t12 0" stroke="#FFF0B8" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="88" cy="64" rx="10" ry="6" fill="#fff"/><circle cx="88" cy="64" r="4" fill="#FFB020"/><circle cx="34" cy="62" r="2.5" fill="#7BD65A"/><circle cx="74" cy="70" r="2.5" fill="#7BD65A"/><g stroke="#FFE7A0" stroke-width="3" fill="none" stroke-linecap="round"><path d="M60 66 C56 ${r2(58-h/2)} 66 ${r2(54-h)} 68 ${r2(48-h)}"/><path d="M66 66 C62 ${r2(58-h/2)} 72 ${r2(54-h)} 72 ${r2(46-h)}"/><path d="M72 66 C68 ${r2(58-h/2)} 78 ${r2(54-h)} 76 ${r2(43-h)}"/></g><path d="M74 ${r2(52-h)} L120 ${r2(18-h)}" stroke="#E0964A" stroke-width="5" stroke-linecap="round"/>${gloss(u,30,88,6,12,.5,-20)}`+eye(50,90,.7,bl)+eye(78,90,.7,bl)+line(64,97,6,5,3.5)+blush(40,99,.7)+blush(88,99,.7);});
add('beer','Beer','food',1.6,.25,(u,t)=>{const r=S(t*TAU)*5,bl=blinkAt(t,.7);let fo='',bb='';
  [[32,38,10],[46,31,12],[62,29,13],[77,33,11],[86,40,8]].forEach(([x,y,rr],i)=>fo+=`<circle cx="${x}" cy="${y}" r="${r2(rr+S(t*TAU+i)*1.2)}" fill="url(#${u}w)"/>`);
  for(let i=0;i<5;i++){const p=(t+i/5)%1;bb+=`<circle cx="${36+i*9}" cy="${r2(104-p*56)}" r="2" fill="#fff" opacity="${r2(.7*(1-p))}"/>`;}
  return g({r,ox:56,oy:110},`<path d="M84 54 H94 C104 54 108 62 108 72 C108 84 102 90 94 90 H84" stroke="#FFD98A" stroke-width="9" fill="none"/><rect x="26" y="36" width="58" height="76" rx="14" fill="url(#${u}am)"/><rect x="26" y="36" width="58" height="76" rx="14" fill="url(#${u}sh)" opacity=".7"/>${bb}<rect x="32" y="48" width="7" height="54" rx="3.5" fill="#fff" opacity=".45"/>${fo}<ellipse cx="34" cy="${r2(46+wave(t)*4)}" rx="5" ry="${r2(6+wave(t)*4)}" fill="#F4EEFF"/>`+eye(47,74,.75,bl)+eye(67,74,.75,bl)+line(57,82,6,5,3.5)+blush(40,84,.65)+blush(74,84,.65));});
add('coffee','Coffee','food',1.8,.3,(u,t)=>{const bl=blinkAt(t,.75);
  const cup='M26 52 H98 L92 94 C90 106 82 110 72 110 H52 C42 110 34 106 32 94Z';
  return steam(50,42,t,0,22)+steam(64,40,t,.33,22)+steam(78,42,t,.66,22)+`<ellipse cx="62" cy="110" rx="48" ry="9" fill="url(#${u}v)"/><path d="M95 62 C114 60 114 86 92 88" stroke="#E9E1FA" stroke-width="8" fill="none" stroke-linecap="round"/><path d="${cup}" fill="url(#${u}w)"/><path d="M28 62 H96 L95 72 H29Z" fill="url(#${u}c)"/><ellipse cx="62" cy="52" rx="36" ry="8" fill="url(#${u}br)"/><path transform="translate(62 52) scale(6 3)" d="${HEART}" fill="#FFF4E6"/>${gloss(u,38,84,5,12,.6)}`+eye(51,86,.75,bl)+eye(73,86,.75,bl)+line(62,94,6,5,3.5)+blush(41,96,.65)+blush(83,96,.65);});
add('pizza','Pizza','food',1.5,.25,(u,t)=>{const r=S(t*TAU)*6,d=wave(t),bl=blinkAt(t,.85);
  const sl='M20 32 Q64 12 108 32 L68 114 Q64 120 60 114Z';
  const pep=(x,y,rr)=>`<circle cx="${x}" cy="${y}" r="${rr}" fill="url(#${u}c)"/><circle cx="${x-2}" cy="${y-2}" r="${rr*.3}" fill="#fff" opacity=".45"/>`;
  return g({r,oy:114},`<path d="${sl}" fill="url(#${u}f)"/><path d="${sl}" fill="url(#${u}sh)" opacity=".7"/><ellipse cx="44" cy="${r2(84+d*6)}" rx="4.5" ry="${r2(6+d*6)}" fill="#FFB43A"/><path d="M20 32 Q64 12 108 32" stroke="#D98A3E" stroke-width="14" stroke-linecap="round" fill="none"/><path d="M26 29 Q64 13 102 29" stroke="#F5BE78" stroke-width="4" stroke-linecap="round" fill="none"/>${pep(42,44,8)}${pep(86,44,8)}${pep(66,96,6)}`+eye(56,60,.72,bl)+eye(74,60,.72,bl)+line(65,68,6,5,3.5)+blush(48,72,.6)+blush(82,72,.6));});
add('cocktail','Cocktail','food',1.6,.25,(u,t)=>{const r=S(t*TAU)*5,cb=S(t*TAU*2)*3,bl=blinkAt(t,.6);
  return g({r,oy:106},`<path d="M88 10 L72 62" stroke="#9B6BFF" stroke-width="5" stroke-linecap="round"/><rect x="60" y="72" width="8" height="32" rx="3" fill="#E9E1FA"/><ellipse cx="64" cy="106" rx="26" ry="7" fill="url(#${u}w)"/><path d="M14 26 H114 L64 80Z" fill="#fff" opacity=".25" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linejoin="round"/><path d="M24 34 H104 L64 76Z" fill="url(#${u}c)"/><ellipse cx="64" cy="34" rx="40" ry="4" fill="#FFB3A0"/><path d="M32 38 L56 64" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/><g transform="translate(102 26) rotate(${r2(t*90)})"><circle r="14" fill="url(#${u}am)" stroke="#FFE07A" stroke-width="3"/><path d="M-10 0 H10 M0 -10 V10 M-7 -7 L7 7 M7 -7 L-7 7" stroke="#fff" stroke-width="2" opacity=".7"/></g><path d="M52 ${r2(14+cb)} Q56 ${r2(2+cb)} 64 ${r2(0+cb)}" stroke="#5A8A3A" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="50" cy="${r2(22+cb)}" r="8" fill="#FF3B5C"/><circle cx="47" cy="${r2(19+cb)}" r="2.5" fill="#fff" opacity=".7"/>`+eye(56,47,.62,bl)+eye(72,47,.62,bl)+line(64,53,5,4,3));});
add('dumpling','Dumpling','food',1.3,.3,(u,t)=>{const b=abs(S(t*TAU)),sq=cl(1-b/.3),bl=blinkAt(t,.8);
  const bd='M12 90 C12 60 36 38 64 38 C92 38 116 60 116 90 C116 102 100 104 64 104 C28 104 12 102 12 90Z';
  return steam(46,34,t,0,16)+steam(82,34,t,.5,16)+`<ellipse cx="64" cy="106" rx="54" ry="10" fill="url(#${u}v)"/>`+g({y:-b*8,sx:1+sq*.08,sy:1-sq*.08,oy:104},`<path d="${bd}" fill="url(#${u}w)"/><path d="${bd}" fill="url(#${u}sh)" opacity=".45"/><g stroke="#D3C3EE" stroke-width="3" fill="none" stroke-linecap="round"><path d="M48 42 Q64 30 80 42"/><path d="M44 46 q3 6 0 11"/><path d="M56 41 q3 6 0 11"/><path d="M72 41 q-3 6 0 11"/><path d="M84 46 q-3 6 0 11"/></g>${gloss(u,40,56,12,7,.8,-20)}`+eye(50,74,.8,bl)+eye(78,74,.8,bl)+mouth(64,81,8,6)+blush(38,84,.8)+blush(90,84,.8));});

/* ---------- Travel ---------- */
const cloud=(x,y,s,o)=>`<g transform="translate(${r2(x)} ${y}) scale(${s})" opacity="${o}"><g fill="#E4DAF7"><circle cx="-12" cy="3" r="10"/><circle cx="2" cy="-3" r="13"/><circle cx="16" cy="4" r="9"/><rect x="-22" y="3" width="46" height="10" rx="5"/></g><g fill="#fff"><circle cx="-12" cy="1" r="9"/><circle cx="2" cy="-5" r="12"/><circle cx="16" cy="2" r="8"/></g></g>`;
add('plane','Plane','travel',2,.25,(u,t)=>{const y=S(t*TAU)*4,r=-S(t*TAU)*4;
  return cloud(((1-t)%1)*180-30,100,1,.85)+cloud(((1.5-t)%1)*180-30,26,.7,.6)+`<path d="M4 ${r2(62+y)} H30" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 8" stroke-dashoffset="${r2(t*32)}" opacity=".6"/>`+g({y,r},`<path d="M28 60 L20 32 C19 28 23 26 26 28 L46 56Z" fill="url(#${u}c)"/><path d="M32 64 L18 74 L44 68Z" fill="url(#${u}v)"/><path d="M22 60 C22 50 40 48 60 48 H92 C110 48 120 56 120 62 C120 70 110 74 92 74 H40 C28 74 22 68 22 60Z" fill="url(#${u}w)"/><path d="M28 68 H112" stroke="#FF6A6A" stroke-width="3" stroke-linecap="round" opacity=".8"/>${gloss(u,70,52,34,4,.9)}<circle cx="56" cy="59" r="4" fill="url(#${u}v)"/><circle cx="68" cy="59" r="4" fill="url(#${u}v)"/><circle cx="80" cy="59" r="4" fill="url(#${u}v)"/><path d="M100 52 C108 52 114 55 117 60 H100Z" fill="#6A3BF0"/><path d="M56 66 L78 66 L58 100 C56 103 51 103 50 99Z" fill="url(#${u}v)"/>${gloss(u,62,74,4,8,.6,30)}`);});
add('backpack','Backpack','travel',1.3,.3,(u,t)=>{const b=abs(S(t*TAU)),sq=cl(1-b/.25),bl=blinkAt(t,.75);
  return g({y:-b*8,sx:1+sq*.06,sy:1-sq*.06,oy:118},`<path d="M50 28 C50 12 78 12 78 28" stroke="#B9246A" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="18" y="50" width="12" height="50" rx="6" fill="#B9246A"/><rect x="98" y="50" width="12" height="50" rx="6" fill="#B9246A"/><rect x="26" y="22" width="76" height="94" rx="28" fill="url(#${u}c)"/><rect x="26" y="22" width="76" height="94" rx="28" fill="url(#${u}sh)"/>${gloss(u,52,34,22,8)}<path d="M30 62 Q64 70 98 62" stroke="#B9246A" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/><rect x="58" y="58" width="12" height="13" rx="3" fill="url(#${u}gd)"/><rect x="38" y="76" width="52" height="32" rx="15" fill="url(#${u}v)"/>${gloss(u,56,80,16,4,.7)}`+eye(54,91,.62,bl)+eye(74,91,.62,bl)+line(64,98,5,4,3));});
add('mappin','Location','travel',1.6,.6,(u,t)=>{const p=t;let y=0;
  if(p<.25){const q=p/.25;y=-56*(1-q*q);}else if(p<.4){y=-10*S((p-.25)/.15*PI);}
  const sq=max(bump(p,.25,.05),bump(p,.4,.04)*.6),o=p>.86?1-(p-.86)/.14:1;
  const q=cl((p-.25)/.75);
  return `<ellipse cx="64" cy="112" rx="${r2(16*(1+y/120))}" ry="4" fill="#2A1236" opacity="${r2(.25*o)}"/>`+(p>.25?`<ellipse cx="64" cy="112" rx="${r2(10+q*46)}" ry="${r2(3+q*10)}" stroke="#9B6BFF" stroke-width="${r2(4*(1-q)+.5)}" fill="none" opacity="${r2(1-q)}"/>`:'')+`<g opacity="${r2(o)}">`+g({y,sx:1+sq*.1,sy:1-sq*.12,oy:112},`<g transform="translate(64 60) scale(1.2)"><path d="${PIN}" fill="url(#${u}v)"/><path d="${PIN}" fill="url(#${u}shv)"/>${gloss(u,-9,-31,17,9)}<circle cx="0" cy="-12" r="12" fill="#fff"/><circle cx="0" cy="-12" r="5.5" fill="url(#${u}c)"/></g>`)+'</g>';});
add('passport','Passport','travel',1.8,.6,(u,t)=>{const r=-8+S(t*TAU)*3,p=t;
  const ss=p<.35?0:p<.45?1.6-.6*ease((p-.35)/.1):1,so=p>.86?(1-p)/.14:1;
  return g({r},`<rect x="28" y="14" width="72" height="100" rx="12" fill="url(#${u}v)"/><rect x="28" y="14" width="72" height="100" rx="12" fill="url(#${u}shv)"/><rect x="28" y="14" width="10" height="100" rx="5" fill="#2A1080" opacity=".45"/>${gloss(u,60,24,26,6,.6)}<g stroke="#FFD060" stroke-width="3.5" fill="none"><circle cx="68" cy="52" r="18"/><ellipse cx="68" cy="52" rx="8" ry="18"/><path d="M50 52 H86"/></g><rect x="50" y="82" width="36" height="5" rx="2.5" fill="#FFD060"/><rect x="56" y="93" width="24" height="4" rx="2" fill="#FFD060" opacity=".6"/>`+(ss>0?`<g transform="translate(88 92) rotate(-15) scale(${r2(ss)})" opacity="${r2(so)}"><circle r="17" fill="#FF4A5E" fill-opacity=".18" stroke="#FF4A5E" stroke-width="4"/><path d="M-8 0 L-2 6 L9 -6" stroke="#FF4A5E" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`:''));});
add('suitcase','Suitcase','travel',1.2,.3,(u,t)=>{const r=S(t*TAU*2)*3,y=-abs(S(t*TAU*2))*3,wr=t*720;
  const wh=x=>`<g transform="translate(${x} 112) rotate(${r2(wr)})"><circle r="7" fill="#2A1236"/><path d="M-5 0 H5" stroke="#9B8AB8" stroke-width="2"/></g>`;
  return g({r,y,oy:116},`<path d="M52 30 V12 H76 V30" stroke="#C9BBE8" stroke-width="6" stroke-linejoin="round" fill="none"/>${wh(40)}${wh(88)}<rect x="24" y="28" width="80" height="82" rx="20" fill="url(#${u}c)"/><rect x="24" y="28" width="80" height="82" rx="20" fill="url(#${u}sh)"/><path d="M44 34 V104 M84 34 V104" stroke="#B9246A" stroke-width="4" opacity=".3" stroke-linecap="round"/>${gloss(u,52,38,22,6,.8)}<circle cx="62" cy="58" r="11" fill="url(#${u}v)"/><path d="M57 58 L61 62 L68 54" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`+heart(u,72,88,9)+spark(52,82,6,'#FFE07A'));});
add('globe','Globe','travel',2.4,0,(u,t)=>{const off=-t*100,bl=blinkAt(t,.5);
  const land=`<path d="M20 40 C30 28 50 30 54 42 C58 54 44 58 40 70 C36 80 24 76 22 64 C20 56 14 50 20 40Z"/><path d="M66 74 C76 68 92 72 94 84 C96 96 84 104 74 100 C66 96 60 82 66 74Z"/><path d="M74 22 C84 18 98 24 96 34 C94 42 82 42 78 36 C74 32 70 26 74 22Z"/>`;
  return `<defs><clipPath id="${u}gc"><circle cx="64" cy="64" r="52"/></clipPath></defs><circle cx="64" cy="64" r="52" fill="url(#${u}b)"/><g clip-path="url(#${u}gc)"><g fill="url(#${u}gr)" transform="translate(${r2(off)} 0)">${land}<g transform="translate(100 0)">${land}</g></g></g><circle cx="64" cy="64" r="52" fill="url(#${u}shv)"/><ellipse cx="64" cy="64" rx="52" ry="18" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none"/>${gloss(u,56,32,30,15)}`+eye(50,66,.85,bl)+eye(78,66,.85,bl)+line(64,77,7,6,4)+blush(38,78,.8)+blush(90,78,.8);});

/* ---------- Meetup ---------- */
add('cheers','Cheers','meetup',1.4,.5,(u,t)=>{const c=wave(t),ang=-7+c*13,hit=bump(t,.5,.12);
  const mug=`<path d="M22 56 H14 C6 56 4 64 4 72 C4 82 8 88 16 88 H22" stroke="#FFD98A" stroke-width="7" fill="none"/><rect x="22" y="46" width="36" height="60" rx="10" fill="url(#${u}am)"/><rect x="22" y="46" width="36" height="60" rx="10" fill="url(#${u}sh)" opacity=".6"/><rect x="27" y="56" width="5" height="40" rx="2.5" fill="#fff" opacity=".45"/><circle cx="28" cy="46" r="8" fill="url(#${u}w)"/><circle cx="40" cy="42" r="10" fill="url(#${u}w)"/><circle cx="52" cy="46" r="8" fill="url(#${u}w)"/>`;
  let sp='';for(let i=0;i<5;i++){const a=-PI/2+(i-2)*.5,d=6+hit*18;sp+=`<circle cx="${r2(64+C(a)*d)}" cy="${r2(34+S(a)*d)}" r="2.5" fill="#FFC233" opacity="${r2(hit)}"/>`;}
  return g({r:ang,ox:40,oy:106},mug)+mirror(g({r:ang,ox:40,oy:106},mug))+sp+spark(64,18,10*hit)+spark(34,14,5*hit)+spark(94,14,5*hit);});
add('table','Table for 2','meetup',1.6,.3,(u,t)=>{const a=abs(S(t*TAU)),b=abs(S(t*TAU+PI/2)),fl=S(t*TAU*4)*1.5;
  return pinny(u,{x:38,y:56-a*6,s:.6,col:'c',bl:blinkAt(t,.3)})+pinny(u,{x:90,y:56-b*6,s:.6,col:'v',eyes:'happy'})+`<rect x="58" y="96" width="12" height="20" rx="3" fill="#B07A20"/><ellipse cx="64" cy="116" rx="20" ry="4" fill="#B07A20"/><ellipse cx="64" cy="92" rx="58" ry="14" fill="url(#${u}gd)"/>${gloss(u,52,86,34,4,.7)}<ellipse cx="36" cy="90" rx="13" ry="4" fill="#fff"/><ellipse cx="92" cy="90" rx="13" ry="4" fill="#fff"/><circle cx="64" cy="74" r="12" fill="#FFC23A" opacity=".25"/><rect x="61" y="76" width="6" height="12" rx="2" fill="#fff"/><path d="M64 ${r2(64+fl)} C68 70 67 74 64 76 C61 74 60 70 64 ${r2(64+fl)}Z" fill="url(#${u}fl)"/>`;});
add('seeyou','See you','meetup',1.2,.25,(u,t)=>{const aR=55+S(t*TAU*2)*28,r=-S(t*TAU*2)*4,w=wave(t,2);
  return pinny(u,{x:58,y:62,s:1.05,r,armR:aR,armL:-60,bl:blinkAt(t,.7),mo:'open'})+`<g stroke="#9B6BFF" stroke-width="4" stroke-linecap="round" fill="none" opacity="${r2(.4+.6*w)}"><path d="M106 22 q8 6 6 16"/><path d="M114 14 q12 10 8 26"/></g>`;});
add('omw','On my way','meetup',.8,.25,(u,t)=>{const hop=abs(S(t*TAU)),sw=S(t*TAU)*30;let sl='';
  for(let i=0;i<3;i++){const p=(t*2+i/3)%1;sl+=`<path d="M${r2(30-p*24)} ${42+i*16} H${r2(14-p*24)}" stroke="#9B6BFF" stroke-width="4" stroke-linecap="round" opacity="${r2(1-p)}"/>`;}
  const dp=(t*2)%1;
  return sl+`<ellipse cx="68" cy="113" rx="${r2(18*(1-hop*.35))}" ry="3.5" fill="#2A1236" opacity=".2"/><circle cx="${r2(42-dp*16)}" cy="${r2(110-dp*6)}" r="${r2(3+dp*5)}" fill="#E9E1FA" opacity="${r2(1-dp)}"/>`+pinny(u,{x:70,y:62-hop*8,r:14,armL:-10+sw,armR:-10-sw,mo:'open'});});
add('checkin','Checked in','meetup',1.6,.5,(u,t)=>{const p=t,j=max(0,S(t*TAU*2)),bs=p<.2?back(p/.2):1,bo=p>.88?(1-p)/.12:1,dr=100*(1-cl((p-.15)/.2));
  const cols=['#FFD24D','#FF5B9C','#9B6BFF','#7BD65A'];let cf='';
  for(let i=0;i<6;i++){const q=(t+i/6)%1;cf+=`<rect x="-3" y="-1.5" width="6" height="3" rx="1" fill="${cols[i%4]}" opacity="${r2(1-q)}" transform="translate(${16+i*18} ${r2(8+q*56)}) rotate(${r2(q*360+i*40)})"/>`;}
  return cf+pinny(u,{x:52,y:68-j*6,eyes:'happy',mo:'open',armL:45+j*20,armR:45+j*20})+`<g transform="translate(98 32) scale(${r2(bs)})" opacity="${r2(bo)}"><circle r="19" fill="url(#${u}v)"/><circle r="19" fill="url(#${u}shv)"/>${gloss(u,-3,-10,11,5)}<path pathLength="100" d="M-8 0 L-2 6 L9 -6" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-dasharray="100" stroke-dashoffset="${r2(dr)}"/></g>`;});
add('friends','New friends','meetup',1.6,.5,(u,t)=>{const l=wave(t);
  return pinny(u,{x:42+l*4,y:70,s:.8,col:'c',r:8*l,armR:5+l*15,bl:blinkAt(t,.2)})+pinny(u,{x:86-l*4,y:70,s:.8,col:'v',r:-8*l,armL:5+l*15,eyes:'happy'})+heart(u,64,24-l*8,6+l*6,cl(l*1.6));});

/* ---------- Greetings ---------- */
const greet=(id,word,col,ink,pose,ttl)=>add(id,ttl,'greetings',1.6,.3,(u,t)=>{const r=S(t*TAU)*3,s=1+max(0,S(t*TAU*2))*.04,w=wave(t,2);
  const B='M33 12 H95 C110 12 122 24 122 39 C122 54 110 66 95 66 H96 L100 80 L82 66 H33 C18 66 6 54 6 39 C6 24 18 12 33 12Z';
  const len=min(98,word.length*15),ff=`font-family="Figtree, 'Arial Rounded MT Bold', 'Arial Black', Arial, sans-serif" font-weight="800" font-size="${word.length>8?21:25}" text-anchor="middle" textLength="${len}" lengthAdjust="spacingAndGlyphs"`;
  const po=pose==='bow'?{r:-wave(t)*20,armL:-50,armR:-50,eyes:'happy'}:pose==='wink'?{armR:55+S(t*TAU*2)*28,wink:true,mo:'open'}:pose==='happy'?{armL:55+S(t*TAU*2)*28,eyes:'happy',mo:'open'}:{armR:55+S(t*TAU*2)*28,mo:'open',bl:blinkAt(t,.6)};
  return g({r,s,oy:66},`<path d="${B}" fill="url(#${u}${col})"/><path d="${B}" fill="url(#${u}${col==='v'?'shv':'sh'})"/>${gloss(u,52,21,38,6,.7)}<text x="64" y="49" ${ff} fill="#000" opacity=".18">${word}</text><text x="64" y="47" ${ff} fill="${ink}">${word}</text>`)+pinny(u,Object.assign({x:96,y:100,s:.5,col:col==='v'?'c':'v'},po))+spark(18,84,2+w*5);});
greet('sawasdee','Sawasdee','c','#fff','bow','Sawasdee');
greet('hola','Hola!','v','#fff','wave','Hola');
greet('ciao','Ciao!','p','#fff','wink','Ciao');
greet('bonjour','Bonjour','am',INK,'happy','Bonjour');

/* ---------- Set 2 ---------- */
const star=(u,x,y,s,rot=0,gid='p',so='#C8165C')=>{if(s<=.05)return'';let d='';for(let i=0;i<10;i++){const a=-PI/2+i*PI/5+rot*PI/180,rr=i%2?.48:1;d+=(i?'L':'M')+r2(C(a)*rr)+' '+r2(S(a)*rr);}return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})"><path d="${d}Z" fill="url(#${u}${gid})" stroke="${so}" stroke-width="${r2(2/s)}" stroke-linejoin="round"/><ellipse cx="-.25" cy="-.35" rx=".22" ry=".12" fill="#fff" opacity=".8"/></g>`;};
const zz=(x,y,s,o)=>`<path transform="translate(${r2(x)} ${r2(y)}) scale(${r2(s)})" d="M-1 -1 H1 L-1 1 H1" stroke="#9B6BFF" stroke-width="${r2(3.5/s)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${r2(cl(o))}"/>`;

add('cool','Cool','faces',1.8,.3,(u,t)=>{const r=S(t*TAU)*4,y=-abs(S(t*TAU*2))*2,sx=((t*1.4)%1.4)*100-24;
  const lens='M22 46 H58 C58 63 51 70 40 70 C29 70 22 63 22 46Z M70 46 H106 C106 63 99 70 88 70 C77 70 70 63 70 46Z';
  return g({r,y,oy:110},face(u)+`<defs><clipPath id="${u}cl"><path d="${lens}"/></clipPath></defs><path d="M16 47 H112" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="${lens}" fill="${INK}"/><g clip-path="url(#${u}cl)"><path d="M${r2(sx)} 40 h12 l-18 36 h-12Z" fill="#fff" opacity=".6"/><path d="M${r2(sx+18)} 40 h5 l-18 36 h-5Z" fill="#fff" opacity=".4"/></g><path d="M54 88 Q70 97 84 84" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>`+blush(30,80,.85)+blush(98,80,.85));});
add('sleepy','Sleepy','faces',2.4,.4,(u,t)=>{const b=wave(t);let z='';
  for(const k of [0,.33,.66]){const p=(t+k)%1;z+=zz(94+p*18,44-p*34,4+p*4,S(p*PI));}
  return g({sx:1+b*.03,sy:1-b*.03,oy:118},face(u)+line(46,58,9,5,4.5)+line(82,58,9,5,4.5)+blush(32,74)+blush(96,74)+`<ellipse cx="62" cy="90" rx="${r2(5+b*2)}" ry="${r2(4+b*3)}" fill="#4A1030"/><circle cx="${r2(76+b*4)}" cy="${r2(84-b*2)}" r="${r2(2+b*9)}" fill="url(#${u}t)" opacity=".75"/><circle cx="${r2(73+b*2)}" cy="${r2(81-b*4)}" r="${r2(.5+b*2.4)}" fill="#fff" opacity=".9"/>`)+z;});
add('party','Party','faces',1.4,.3,(u,t)=>{const h=wave(t),r=S(t*TAU)*5,L=6+h*36;const cols=['#FFD24D','#FF5B9C','#9B6BFF','#7BD65A'];let cf='';
  for(let i=0;i<7;i++){const q=(t+i/7)%1;cf+=`<rect x="-3" y="-1.5" width="6" height="3" rx="1" fill="${cols[i%4]}" opacity="${r2(1-q*q)}" transform="translate(${r2(10+i*17+S(q*TAU+i)*4)} ${r2(6+q*50)}) rotate(${r2(q*360+i*50)})"/>`;}
  return cf+g({r,oy:118},g({s:.86,y:8},face(u)+arcEye(46,54)+arcEye(82,54)+blush(32,74)+blush(96,74)+`<path d="M64 88 H${r2(64+L*1.16)}" stroke="url(#${u}c)" stroke-width="9" stroke-linecap="round"/><path d="M64 88 H${r2(64+L*1.16)}" stroke="#fff" stroke-width="2" stroke-dasharray="4 6" stroke-linecap="round" opacity=".7"/><circle cx="${r2(64+L*1.16)}" cy="88" r="${r2(3+(1-h)*4)}" fill="url(#${u}v)"/><ellipse cx="64" cy="88" rx="7" ry="6" fill="#4A1030"/>`)+`<g transform="rotate(-14 64 34)"><path d="M46 36 L64 4 L82 36Z" fill="url(#${u}v)"/><path d="M46 36 L64 4 L82 36Z" fill="url(#${u}shv)"/><path d="M52 26 L76 26 M58 15 L70 15" stroke="#FFD24D" stroke-width="4" stroke-linecap="round"/><ellipse cx="64" cy="36" rx="19" ry="4" fill="url(#${u}c)"/><circle cx="64" cy="6" r="6" fill="url(#${u}c)"/></g>`);});
add('shy','Shy','faces',1.6,.3,(u,t)=>{const p=wave(t),fx=S(t*TAU*2)*3,bl=blinkAt(t,.75);
  return face(u)+`<ellipse cx="34" cy="76" rx="14" ry="8" fill="#FF4F8A" opacity="${r2(.3+p*.3)}"/><ellipse cx="94" cy="76" rx="14" ry="8" fill="#FF4F8A" opacity="${r2(.3+p*.3)}"/><path d="M36 44 Q44 40 52 44" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M76 44 Q84 40 92 44" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`+eye(42,60,.85,bl)+eye(78,60,.85,bl)+`<path d="M54 88 q5 -4 10 0 t10 0" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`+ball(u,r2(54+fx),106,9,'c')+ball(u,r2(74-fx),106,9,'c');});
add('thinking','Thinking','faces',2,.6,(u,t)=>{const r=S(t*TAU)*3,d1=cl(t*5-1),d2=cl(t*5-2),d3=cl(t*5-3),fo=t>.85?(1-t)/.15:1;
  return g({r,oy:110},face(u)+`<path d="M34 40 Q44 32 54 38" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/><path d="M76 42 L94 44" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`+eye(48,56,.95,blinkAt(t,.45))+eye(84,58,.95,blinkAt(t,.45))+`<path d="M56 90 L76 85" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`+blush(30,76,.8)+`<rect x="70" y="82" width="10" height="26" rx="5" fill="url(#${u}c)" transform="rotate(-20 75 95)"/>`+ball(u,66,108,13,'c'))+`<g opacity="${r2(fo)}"><circle cx="102" cy="34" r="${r2(3.5*d1)}" fill="url(#${u}v)"/><circle cx="110" cy="22" r="${r2(5*d2)}" fill="url(#${u}v)"/><circle cx="116" cy="9" r="${r2(7*d3)}" fill="url(#${u}v)"/></g>`;});
add('starstruck','Star-struck','faces',1.4,.3,(u,t)=>{const p=Math.pow(max(0,S(t*TAU*2)),2),s=14*(1+p*.15),rot=t*72;
  return face(u)+star(u,45,54,s,rot)+star(u,83,54,s,-rot)+blush(30,76)+blush(98,76)+mouth(64,74,20,13)+spark(14,22,3+6*p,'#FFC233')+spark(114,18,3+5*(1-p),'#FFC233')+spark(112,104,2+4*p,'#FFC233');});
add('oops','Oops','faces',1.6,.3,(u,t)=>{const x=S(t*TAU*4)*1.2,p=t,dy=p*p*18,dof=p>.8?(1-p)/.2:p<.1?p/.1:1;
  return g({x},face(u)+`<path d="M34 42 L52 46" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M94 42 L76 46" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`+arcEye(46,58,.9)+arcEye(82,58,.9)+blush(30,74,.8)+blush(98,74,.8)+`<path d="M36 76 H92 Q90 100 64 100 Q38 100 36 76Z" fill="#4A1030"/><path d="M38 76 H90 Q89 85 84 86 H44 Q39 85 38 76Z" fill="#fff"/>`)+drop(u,98,24+dy,8,dof);});
add('kiss','Kiss','faces',1.6,.3,(u,t)=>{const p=t,q=cl((p-.2)/.8),hs=p<.2?0:5+ease(cl((p-.2)/.6))*9,hx=78+q*26,hy=82-q*58,ho=p>.85?(1-p)/.15:1,pk=1+bump(p,.15,.15)*.15;
  return face(u)+eye(46,54,1,blinkAt(t,.6))+arcEye(82,56)+blush(32,74)+blush(96,74)+`<g transform="translate(64 86) scale(${r2(pk)}) translate(-64 -86)"><path d="M62 78 c8 0 9 6 3 8 c6 2 5 9 -3 9" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`+heart(u,hx,hy,hs,ho);});

add('wavehand','Wave','reactions',1.2,.25,(u,t)=>{const r=S(t*TAU)*18;let fg='';
  [[34,30,36],[50,22,42],[66,24,40],[82,32,34]].forEach(([x,y,h])=>{fg+=`<rect x="${x-7}" y="${y}" width="15" height="${h+20}" rx="7.5" fill="url(#${u}f)" stroke="#E07A3A" stroke-opacity=".45" stroke-width="1.5"/>${gloss(u,x-1,y+8,3.5,6,.7)}`;});
  return `<g stroke="#9B6BFF" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="${r2(.3+wave(t,2)*.7)}"><path d="M14 30 q-8 10 -4 22"/><path d="M114 30 q8 10 4 22"/></g>`+g({r,ox:58,oy:112},fg+`<path d="M26 60 H90 V84 C90 102 78 112 58 112 C38 112 26 102 26 84Z" fill="url(#${u}f)"/><path d="M26 60 H90 V84 C90 102 78 112 58 112 C38 112 26 102 26 84Z" fill="url(#${u}sh)" opacity=".6"/><rect x="84" y="62" width="15" height="38" rx="7.5" fill="url(#${u}f)" stroke="#E07A3A" stroke-opacity=".45" stroke-width="1.5" transform="rotate(38 91 96)"/>${gloss(u,46,72,12,6,.5)}`);});
add('sparkles','Sparkles','reactions',1.5,.2,(u,t)=>{const a=wave(t),b=wave(t+.33),c=wave(t+.66);
  return spark(54,70,30+a*10,`url(#${u}gd)`)+spark(98,32,14+b*8,`url(#${u}p)`)+spark(100,98,10+c*6,`url(#${u}v)`)+spark(24,30,4+c*5,'#FFC233');});
add('yay','Yay','reactions',1.4,.35,(u,t)=>{const p=t,pop=bump(p,0,.08);const cols=['#FFD24D','#FF5B9C','#9B6BFF','#7BD65A','#58B8FF'];let cf='';
  for(let i=0;i<10;i++){const a=-PI/4+(i-4.5)*.17,sp=50+(i%3)*14,q=ease(cl(p/.7)),x=61+C(a)*sp*q,y=70+S(a)*sp*q+p*p*30,o=p>.7?(1-p)/.3:1;
    cf+=i%2?`<circle cx="${r2(x)}" cy="${r2(y)}" r="3.5" fill="${cols[i%5]}" opacity="${r2(o)}"/>`:`<rect x="-4" y="-2" width="8" height="4" rx="1.5" fill="${cols[i%5]}" opacity="${r2(o)}" transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(p*400+i*40)})"/>`;}
  return cf+g({s:1+pop*.08,ox:30,oy:104},`<path d="M14 118 L42 52 L80 88Z" fill="url(#${u}v)"/><path d="M14 118 L42 52 L80 88Z" fill="url(#${u}shv)"/><path d="M25 92 L40 106 M34 72 L60 97" stroke="#FFD24D" stroke-width="4" stroke-linecap="round"/><ellipse cx="61" cy="70" rx="26" ry="8" fill="url(#${u}c)" transform="rotate(43 61 70)"/>`);});
add('check','Done','reactions',1.4,.6,(u,t)=>{const p=t,s=p<.15?back(p/.15):p>.9?1-ease((p-.9)/.1):1,dr=100*(1-ease(cl((p-.12)/.25))),so=p>.35&&p<.8?bump(p,.45,.1):0;
  return (s<=.02?'':g({s},ball(u,64,64,48,'gr','sh')+`<path pathLength="100" d="M42 66 L57 80 L88 48" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-dasharray="100" stroke-dashoffset="${r2(dr)}"/>`))+spark(110,20,9*so,'#FFC233');});
add('question','Hmm?','reactions',1.6,.25,(u,t)=>{const r=S(t*TAU)*12,b=abs(S(t*TAU*2));
  const Q='M42 44 C42 22 86 20 86 44 C86 60 64 60 64 78';
  return g({r,oy:100},`<path d="${Q}" stroke="#B9246A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(0 3)"/><path d="${Q}" stroke="url(#${u}c)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M47 34 C52 24 66 22 74 26" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".6"/>`)+`<ellipse cx="64" cy="${r2(104-b*8)}" rx="10" ry="${r2(10-(1-b)*1.5)}" fill="url(#${u}c)"/><circle cx="61" cy="${r2(100-b*8)}" r="3" fill="#fff" opacity=".6"/>`;});
add('eyes','Eyes','reactions',2,.25,(u,t)=>{const lx=9*Math.tanh(4*S(t*TAU))/Math.tanh(4),k=1-blinkAt(t,.5)*.9;
  const eb=x=>`<ellipse cx="${x}" cy="64" rx="24" ry="${r2(32*k)}" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="2"/>`+(k>.3?`<circle cx="${r2(x+lx)}" cy="68" r="${r2(12*min(1,k*1.2))}" fill="${INK}"/><circle cx="${r2(x+lx+4)}" cy="63" r="4" fill="#fff"/>`+gloss(u,x-6,42,9,5,.9):'');
  return eb(38)+eb(90);});

add('sushi','Sushi','food',1.4,.3,(u,t)=>{const b=abs(S(t*TAU)),sq=cl(1-b/.3),bl=blinkAt(t,.8);
  const fish='M12 62 C12 42 40 36 64 38 C92 40 118 46 116 62 C114 72 96 72 64 70 C34 70 12 72 12 62Z';
  return `<ellipse cx="64" cy="114" rx="${r2(44-b*8)}" ry="5" fill="#2A1236" opacity=".18"/>`+g({y:-b*10,sx:1+sq*.07,sy:1-sq*.07,oy:110},`<rect x="18" y="58" width="92" height="50" rx="24" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="2"/><path d="${fish}" fill="url(#${u}c)"/><path d="M30 52 C40 46 46 46 52 52 M58 48 C68 42 76 42 82 48 M88 50 C96 46 102 48 106 54" stroke="#FFD6C6" stroke-width="4" stroke-linecap="round" fill="none" opacity=".85"/>${gloss(u,52,44,26,5,.6)}`+eye(48,84,.72,bl)+eye(80,84,.72,bl)+line(64,92,6,5,3.5)+blush(36,94,.7)+blush(92,94,.7));});
add('taco','Taco','food',1.5,.3,(u,t)=>{const r=S(t*TAU)*5,bl=blinkAt(t,.7);let fl='';
  for(let i=0;i<9;i++){const a=PI+(i+.5)*PI/9,x=64+C(a)*58,y=96+S(a)*58;fl+=i%3===1?`<circle cx="${r2(x)}" cy="${r2(y)}" r="7" fill="#FF3B5C"/>`:`<circle cx="${r2(x)}" cy="${r2(y)}" r="${9+(i%2)}" fill="url(#${u}gr)"/>`;}
  const sh='M10 96 A54 54 0 0 1 118 96Z';
  return g({r,oy:98},fl+`<path d="${sh}" fill="url(#${u}am)"/><path d="${sh}" fill="url(#${u}sh)" opacity=".7"/>${gloss(u,46,54,18,7,.6,-25)}<circle cx="32" cy="80" r="2.5" fill="#C9781A"/><circle cx="98" cy="74" r="2.5" fill="#C9781A"/><circle cx="88" cy="88" r="2" fill="#C9781A"/>`+eye(52,72,.75,bl)+eye(76,72,.75,bl)+line(64,81,6,5,3.5)+blush(42,84,.7)+blush(86,84,.7));});
add('icecream','Ice cream','food',1.8,.3,(u,t)=>{const r=S(t*TAU)*5,dl=wave(t),bl=blinkAt(t,.8);
  return g({r,oy:122},`<path d="M40 70 L64 124 L88 70Z" fill="url(#${u}am)"/><path d="M46 78 L72 110 M58 74 L80 96 M82 78 L56 110 M70 74 L48 96" stroke="#C9781A" stroke-width="2.5" opacity=".6"/><circle cx="64" cy="34" r="20" fill="url(#${u}w)" stroke="#E6DAF5" stroke-width="2"/>${gloss(u,58,22,9,5)}<path d="M72 6 Q74 2 80 1" stroke="#5A8A3A" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="72" cy="12" r="7" fill="#FF3B5C"/><circle cx="70" cy="10" r="2" fill="#fff" opacity=".7"/><circle cx="64" cy="62" r="27" fill="url(#${u}p)"/><circle cx="64" cy="62" r="27" fill="url(#${u}sh)" opacity=".5"/><path d="M37 70 Q43 80 49 72 Q55 80 61 72 Q67 80 73 72 Q79 80 85 72 Q90 78 91 68Z" fill="url(#${u}p)"/><path d="M48 76 v${r2(4+dl*12)}" stroke="#FF5B9C" stroke-width="6" stroke-linecap="round"/>${gloss(u,54,46,12,6)}`+eye(54,62,.7,bl)+eye(74,62,.7,bl)+line(64,70,5,4,3)+blush(46,70,.6)+blush(82,70,.6));});
add('boba','Boba','food',1.6,.3,(u,t)=>{const bl=blinkAt(t,.7),sy=S(t*TAU)*3;let pe='';
  [[46,108],[58,111],[72,109],[84,104],[50,98],[64,100],[78,96]].forEach(([x,y],i)=>{const o=S(t*TAU+i*1.3)*2.5;pe+=`<circle cx="${x}" cy="${r2(y+o)}" r="5.5" fill="#3A1A1A"/><circle cx="${x-2}" cy="${r2(y-2+o)}" r="1.6" fill="#fff" opacity=".5"/>`;});
  const cup='M30 40 H98 L90 112 C89 118 84 120 78 120 H50 C44 120 39 118 38 112Z';
  return `<path d="M76 ${r2(4+sy)} L70 ${r2(46+sy)}" stroke="url(#${u}c)" stroke-width="9" stroke-linecap="round"/><path d="${cup}" fill="url(#${u}mt)"/><path d="${cup}" fill="url(#${u}sh)" opacity=".5"/>${pe}<path d="M24 40 C24 22 104 22 104 40Z" fill="url(#${u}v)"/><rect x="22" y="36" width="84" height="9" rx="4.5" fill="url(#${u}v)"/>${gloss(u,52,28,22,4,.6)}<rect x="36" y="50" width="6" height="46" rx="3" fill="#fff" opacity=".35"/>`+eye(54,66,.72,bl)+eye(76,66,.72,bl)+line(65,74,5,4,3)+blush(46,76,.6)+blush(84,76,.6);});
add('burger','Burger','food',1.4,.3,(u,t)=>{const bl=blinkAt(t,.8),L=k=>r2(-abs(S((t-k)*TAU))*6);const top='M16 72 C16 36 40 22 64 22 C88 22 112 36 112 72Z';
  return `<g transform="translate(0 ${L(.15)})"><rect x="18" y="92" width="92" height="20" rx="10" fill="url(#${u}am)"/></g><g transform="translate(0 ${L(.1)})"><rect x="14" y="78" width="100" height="18" rx="9" fill="url(#${u}br)"/><path d="M18 76 L110 76 L100 90 L90 78 L80 90 L70 78 L60 90 L50 78 L40 90 L30 78Z" fill="url(#${u}gd)"/></g><g transform="translate(0 ${L(.05)})"><path d="M14 74 q8 -8 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 v4 H14Z" fill="url(#${u}gr)"/></g><g transform="translate(0 ${L(0)})"><path d="${top}" fill="url(#${u}am)"/><path d="${top}" fill="url(#${u}sh)" opacity=".6"/>${gloss(u,52,32,24,6,.7)}<ellipse cx="44" cy="36" rx="3" ry="1.6" fill="#FFF4D0"/><ellipse cx="80" cy="32" rx="3" ry="1.6" fill="#FFF4D0"/><ellipse cx="64" cy="28" rx="3" ry="1.6" fill="#FFF4D0"/>`+eye(50,54,.75,bl)+eye(78,54,.75,bl)+line(64,62,6,5,3.5)+blush(38,62,.7)+blush(90,62,.7)+`</g>`;});
add('wine','Wine','food',1.8,.3,(u,t)=>{const a=S(t*TAU)*10,bl=blinkAt(t,.6);
  const bowl='M34 14 H94 C97 48 86 72 64 72 C42 72 31 48 34 14Z';
  return `<defs><clipPath id="${u}wc"><path d="${bowl}"/></clipPath></defs><rect x="60" y="70" width="8" height="38" rx="3" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="1.5"/><ellipse cx="64" cy="110" rx="26" ry="7" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="2"/><path d="${bowl}" fill="#fff" opacity=".22"/><g clip-path="url(#${u}wc)"><rect x="10" y="38" width="108" height="60" fill="url(#${u}rw)" transform="rotate(${r2(a)} 64 40)"/></g><path d="${bowl}" fill="none" stroke="#C9BBE8" stroke-width="3"/><path d="M42 22 C40 36 44 50 52 60" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".7"/>`+eye(55,54,.6,bl)+eye(73,54,.6,bl)+line(64,61,5,4,3)+blush(48,62,.55)+blush(80,62,.55);});

add('camera','Camera','travel',1.6,.25,(u,t)=>{const fl=bump(t,.5,.08),b=abs(S(t*TAU)),sh=bump(t,.48,.04);let rays='';
  for(let i=0;i<8;i++){const a=i*PI/4;rays+=`<path d="M${r2(96+C(a)*12)} ${r2(48+S(a)*12)} L${r2(96+C(a)*(14+fl*12))} ${r2(48+S(a)*(14+fl*12))}"/>`;}
  return g({y:-b*3},`<rect x="40" y="24" width="30" height="16" rx="6" fill="url(#${u}v)"/><rect x="14" y="34" width="100" height="74" rx="22" fill="url(#${u}c)"/><rect x="14" y="34" width="100" height="74" rx="22" fill="url(#${u}sh)"/>${gloss(u,46,42,22,5,.8)}<circle cx="60" cy="72" r="26" fill="#2A1236"/><circle cx="60" cy="72" r="20" fill="url(#${u}v)"/><circle cx="60" cy="72" r="${r2(10*(1-sh*.7))}" fill="#14063F"/><circle cx="53" cy="65" r="5" fill="#fff" opacity=".8"/><rect x="88" y="44" width="16" height="9" rx="4" fill="url(#${u}w)"/>`)+`<circle cx="96" cy="48" r="${r2(fl*10)}" fill="#FFF6C0"/><g stroke="#FFC233" stroke-width="3.5" stroke-linecap="round" opacity="${r2(fl)}">${rays}</g>`;});
add('sun','Sunny','travel',2,.3,(u,t)=>{const rot=t*45,bl=blinkAt(t,.7),p=wave(t,2);let rays='';
  for(let i=0;i<8;i++)rays+=`<path d="M64 5 L72 21 H56Z" fill="url(#${u}c)" stroke="#FF7A5A" stroke-width="4" stroke-linejoin="round" transform="rotate(${i*45} 64 64)"/>`;
  return `<g transform="rotate(${r2(rot)} 64 64)">${rays}</g>`+g({s:1+p*.03},ball(u,64,64,38)+eye(52,58,.8,bl)+eye(76,58,.8,bl)+mouth(64,72,12,8)+blush(42,74,.75)+blush(86,74,.75));});
add('tuktuk','Tuk-tuk','travel',1,.25,(u,t)=>{const y=-abs(S(t*TAU*2))*3,wr=t*720;let sl='';
  for(let i=0;i<3;i++){const p=(t*2+i/3)%1;sl+=`<path d="M${r2(16-p*16)} ${50+i*14} H${r2(4-p*16)}" stroke="#9B6BFF" stroke-width="4" stroke-linecap="round" opacity="${r2(1-p)}"/>`;}
  const wh=x=>`<g transform="translate(${x} 102) rotate(${r2(wr)})"><circle r="12" fill="#2A1236"/><circle r="5" fill="#C9BBE8"/><path d="M-9 0 H9 M0 -9 V9" stroke="#C9BBE8" stroke-width="2"/></g>`;
  const top='M28 26 H96 C104 26 108 32 108 40 V46 H24 V32 C24 28 26 26 28 26Z',bd='M20 74 H112 C116 74 118 78 118 82 V88 C118 94 114 98 108 98 H26 C22 98 20 94 20 90Z';
  return sl+wh(38)+wh(100)+g({y},`<path d="${top}" fill="url(#${u}v)"/><path d="${top}" fill="url(#${u}shv)"/>${gloss(u,60,30,30,3,.7)}<rect x="26" y="44" width="6" height="32" fill="#6A3BF0"/><rect x="100" y="44" width="6" height="32" fill="#6A3BF0"/><rect x="32" y="46" width="68" height="30" fill="#FFE9D6"/>`+pinny(u,{x:58,y:72,s:.44,col:'v',eyes:'happy',mo:'open'})+`<path d="${bd}" fill="url(#${u}c)"/><path d="${bd}" fill="url(#${u}sh)"/>${gloss(u,64,78,40,3,.6)}<circle cx="112" cy="84" r="4" fill="#FFF6C0"/>`);});
add('ticket','Ticket','travel',1.8,.3,(u,t)=>{const r=-10+S(t*TAU)*4,o=t<.35?0:t<.55?ease((t-.35)/.2):t<.85?1:1-ease((t-.85)/.15);
  const main='M24 38 H86 V90 H24 Q14 90 14 80 V72 A8 8 0 0 0 14 56 V48 Q14 38 24 38Z',stub='M86 38 H104 Q114 38 114 48 V56 A8 8 0 0 0 114 72 V80 Q114 90 104 90 H86Z';
  return g({r},`<path d="${main}" fill="url(#${u}c)"/><path d="${main}" fill="url(#${u}sh)"/>${gloss(u,48,44,26,4,.7)}`+star(u,50,64,15,0,'gd','#C97A10')+`<g transform="translate(${r2(o*10)} ${r2(o*4)}) rotate(${r2(o*16)} 86 90)"><path d="${stub}" fill="url(#${u}v)"/><path d="${stub}" fill="url(#${u}shv)"/><path d="M96 50 V78 M104 50 V78" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"/></g><path d="M86 40 V88" stroke="#fff" stroke-width="3" stroke-dasharray="4 5" opacity="${r2(.8*(1-o))}"/>`);});
add('palm','Beach','travel',2,.3,(u,t)=>{const sw=S(t*TAU)*6,wv=t*32;let lv='';
  [[-150,40],[-110,44],[-60,42],[-20,38],[-180,30]].forEach(([a,l],i)=>{const ang=(a+sw*(1+i*.2))*PI/180,ex=C(ang)*l,ey=S(ang)*l;lv+=`<path d="M0 0 Q${r2(ex*.5)} ${r2(ey*.5-14)} ${r2(ex)} ${r2(ey)} Q${r2(ex*.5)} ${r2(ey*.5-2)} 0 0Z" fill="url(#${u}gr)"/>`;});
  const tr=`M44 98 Q${r2(46+sw*.4)} 70 ${r2(62+sw)} 36`;
  return `<defs><clipPath id="${u}pc"><rect x="4" y="100" width="120" height="22" rx="11"/></clipPath></defs><circle cx="102" cy="26" r="14" fill="url(#${u}f)"/><path d="${tr}" stroke="#9A5A32" stroke-width="9" stroke-linecap="round" fill="none"/><path d="${tr}" stroke="#D9A070" stroke-width="3" stroke-dasharray="3 7" stroke-linecap="round" fill="none"/><g transform="translate(${r2(62+sw)} 36)">${lv}<circle cx="-4" cy="6" r="5" fill="url(#${u}br)"/><circle cx="5" cy="7" r="5" fill="url(#${u}br)"/></g><path d="M10 104 C24 84 76 82 98 104Z" fill="url(#${u}gd)"/><rect x="4" y="100" width="120" height="22" rx="11" fill="url(#${u}b)"/><g clip-path="url(#${u}pc)"><path d="M${r2(-32+wv)} 108 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".8"/></g>`;});
add('compass','Compass','travel',2,.6,(u,t)=>{const a=40*S(t*TAU*3)*Math.pow(1-t,2);
  return ball(u,64,64,50,'gd')+`<circle cx="64" cy="64" r="38" fill="url(#${u}w)"/><g stroke="#C9BBE8" stroke-width="3" stroke-linecap="round"><path d="M64 30 V36 M64 92 V98 M30 64 H36 M92 64 H98"/></g><g transform="rotate(${r2(a+20)} 64 64)"><path d="M64 30 L73 64 H55Z" fill="url(#${u}c)"/><path d="M64 98 L73 64 H55Z" fill="url(#${u}v)"/></g><circle cx="64" cy="64" r="6" fill="url(#${u}gd)" stroke="#fff" stroke-width="2"/>`+gloss(u,56,36,22,9,.5);});

add('dance','Dance','meetup',1,.25,(u,t)=>{const s=S(t*TAU),hop=abs(S(t*TAU));let nt='';
  for(const k of [0,.5]){const p=(t+k)%1;nt+=`<g transform="translate(${r2((k?104:20)+S(p*TAU)*4)} ${r2(48-p*28)})" opacity="${r2(S(p*PI))}"><path d="M0 0 V-16 L10 -19 V-4" stroke="#9B6BFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><ellipse cx="-3" cy="0" rx="4.5" ry="3.5" fill="#9B6BFF"/><ellipse cx="7" cy="-3" rx="4.5" ry="3.5" fill="#9B6BFF"/></g>`;}
  return nt+`<ellipse cx="64" cy="114" rx="${r2(16*(1-hop*.3))}" ry="3.5" fill="#2A1236" opacity=".2"/>`+pinny(u,{x:64,y:68-hop*6,r:s*14,armL:50+s*40,armR:50-s*40,eyes:'happy',mo:'open'});});
add('highfive','High five','meetup',1.2,.5,(u,t)=>{const p=wave(t),hit=cl(1-abs(t-.5)/.1),a=100-p*36,hp=p>.8?'happy':'dot';let sp='';
  for(let i=0;i<6;i++){const an=i*PI/3,d=8+hit*12;sp+=`<path d="M${r2(64+C(an)*d)} ${r2(70+S(an)*d)} L${r2(64+C(an)*(d+6))} ${r2(70+S(an)*(d+6))}"/>`;}
  return pinny(u,{x:42,y:76,s:.62,col:'c',r:p*8,armR:a,armL:-40,eyes:hp})+pinny(u,{x:86,y:76,s:.62,col:'v',r:-p*8,armL:a,armR:-40,eyes:hp})+`<g stroke="#FFC233" stroke-width="3.5" stroke-linecap="round" opacity="${r2(hit)}">${sp}</g>`+spark(64,46,9*hit,'#FFC233');});
add('selfie','Selfie','meetup',1.6,.6,(u,t)=>{const fl=bump(t,.6,.06),b=wave(t);
  return pinny(u,{x:96,y:80,s:.54,col:'v',r:-10-b*4,eyes:'happy',mo:'open'})+pinny(u,{x:44,y:78,s:.7,col:'c',r:6,armR:58,wink:true,mo:'open'})+`<g transform="rotate(-10 71 68)"><rect x="62" y="36" width="19" height="32" rx="5" fill="#2A1236"/><rect x="65" y="40" width="13" height="24" rx="3" fill="url(#${u}v)"/><circle cx="71.5" cy="42" r="${r2(1.5+fl*8)}" fill="#FFF6C0" opacity="${r2(.4+fl*.6)}"/></g>`+spark(92,20,10*fl,'#FFC233');});
add('splitbill','Split bill','meetup',1.6,.3,(u,t)=>{const gp=wave(t)*8,cb=abs(S(t*TAU*2));
  const half=sd=>{const x0=sd<0?26:64,x1=sd<0?64:102;let z='';for(let i=0;i<=5;i++)z+=` L${r2(x1-(x1-x0)*i/5)} ${i%2?110:104}`;return `<path d="M${x0} 34 H${x1} V104${z}Z" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="2" stroke-linejoin="round"/>`;};
  const lines=x0=>`<rect x="${x0+8}" y="46" width="22" height="5" rx="2.5" fill="#C9BBE8"/><rect x="${x0+8}" y="58" width="16" height="5" rx="2.5" fill="#C9BBE8"/><rect x="${x0+8}" y="70" width="24" height="5" rx="2.5" fill="#C9BBE8"/><rect x="${x0+8}" y="86" width="20" height="7" rx="3.5" fill="url(#${u}c)"/>`;
  return `<g transform="translate(${r2(-gp)} 0) rotate(${r2(-gp*.6)} 64 108)">${half(-1)}${lines(26)}</g><g transform="translate(${r2(gp)} 0) rotate(${r2(gp*.6)} 64 108)">${half(1)}${lines(64)}</g><g transform="translate(64 ${r2(22-cb*8)})"><circle r="12" fill="url(#${u}gd)" stroke="#D99A20" stroke-width="2.5"/><circle r="7" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/></g>`;});
add('calendar','Save the date','meetup',1.6,.4,(u,t)=>{const b=abs(S(t*TAU)),sq=cl(1-b/.25),p=Math.pow(max(0,S(t*TAU*2)),2);let dots='';
  for(let r=0;r<3;r++)for(let c=0;c<4;c++){if(r===1&&c===2)continue;dots+=`<circle cx="${34+c*20}" cy="${66+r*16}" r="4" fill="#C9BBE8"/>`;}
  return g({y:-b*6,sx:1+sq*.05,sy:1-sq*.05,oy:116},`<rect x="16" y="22" width="96" height="92" rx="20" fill="url(#${u}w)" stroke="#C9BBE8" stroke-width="2"/><path d="M16 50 V42 C16 30 24 22 36 22 H92 C104 22 112 30 112 42 V50Z" fill="url(#${u}v)"/>${gloss(u,52,28,30,4,.6)}<rect x="38" y="12" width="8" height="20" rx="4" fill="#2A1236"/><rect x="82" y="12" width="8" height="20" rx="4" fill="#2A1236"/>${dots}`+heart(u,74,82,11*(1+p*.2)));});
add('group','Squad','meetup',1.4,.3,(u,t)=>{const h=k=>abs(S((t+k)*TAU));
  return pinny(u,{x:28,y:78-h(0)*6,s:.48,col:'v',r:-6,eyes:'happy'})+pinny(u,{x:100,y:78-h(.33)*6,s:.48,col:'v',r:6,bl:blinkAt(t,.4)})+pinny(u,{x:64,y:72-h(.66)*8,s:.6,col:'c',armL:60,armR:60,mo:'open',eyes:'happy'});});

greet('konnichiwa','Konnichiwa','p','#fff','bow','Konnichiwa');
greet('annyeong','Annyeong','v','#fff','wave','Annyeong');
greet('namaste','Namaste','am',INK,'bow','Namaste');
greet('xinchao','Xin chào','b',INK,'happy','Xin chào');

const MAP={};E.forEach(e=>MAP[e.id]=e);
let uc=0;
function svg(id,t,u,size){const e=MAP[id];if(!e)return'';u=u||('x'+(++uc)+'_');return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"${size?` width="${size}" height="${size}"`:' width="100%" height="100%"'} style="display:block;overflow:visible">${defs(u)}${e.draw(u,((t%1)+1)%1)}</svg>`;}

const API={list:E.map(({id,name,cat,dur,still})=>({id,name,cat,dur,still})),svg,map:MAP,speed:1,paused:false};
if(typeof window!=='undefined')window.TMEmoji=API;

if(typeof customElements!=='undefined'&&typeof HTMLElement!=='undefined'&&!customElements.get('tm-emoji')){
  const live=[];let raf=0,last=0,rr=0;
  const loop=now=>{raf=requestAnimationFrame(loop);if(now-last<45)return;last=now;if(API.paused||!live.length)return;
    const t0=performance.now(),n=live.length;let k=0;
    for(;k<n&&performance.now()-t0<7;k++){const el=live[(rr+k)%n];if(el._vis&&!el._still)el._frame(now);}
    rr=(rr+k)%n;};
  class El extends HTMLElement{
    static get observedAttributes(){return['name','size','still'];}
    connectedCallback(){this._root=this.shadowRoot||this.attachShadow({mode:'open'});if(!this._u)this._u='e'+(++uc)+'_';this._vis=false;this._size();
      if(!live.includes(this))live.push(this);if(!raf)raf=requestAnimationFrame(loop);
      if('IntersectionObserver' in window){this._io=new IntersectionObserver(es=>{this._vis=es[es.length-1].isIntersecting;});this._io.observe(this);}else this._vis=true;
      this._build();}
    disconnectedCallback(){const j=live.indexOf(this);if(j>=0)live.splice(j,1);this._io&&this._io.disconnect();}
    attributeChangedCallback(){if(this.isConnected&&this._root){this._size();this._build();}}
    _size(){const s=parseFloat(this.getAttribute('size'))||64;Object.assign(this.style,{display:'inline-block',width:s+'px',height:s+'px',verticalAlign:'middle',lineHeight:'0',flex:'none'});}
    _build(){const id=this.getAttribute('name'),e=MAP[id];this._e=e;if(!e){this._root.innerHTML='';this._g=null;return;}
      this._still=this.hasAttribute('still');
      const sz=parseFloat(this.getAttribute('size'))||64;this._root.innerHTML='<style>:host{display:inline-block;vertical-align:middle;line-height:0;flex:none;width:'+sz+'px;height:'+sz+'px}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="'+sz+'" height="'+sz+'" style="display:block;overflow:visible">'+defs(this._u)+'<g></g></svg>';
      this._g=this._root.querySelector('svg').lastChild;
      this._frame(performance.now(),true);}
    _frame(now,first){const e=this._e;if(!e||!this._g)return;const t=(this._still||API.paused)?e.still:((now/1000)*API.speed/e.dur)%1;this._g.innerHTML=e.draw(this._u,((t%1)+1)%1);}
  }
  customElements.define('tm-emoji',El);
}
})();
