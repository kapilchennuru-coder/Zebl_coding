// Painted placeholder. Replace with a licensed photo when one is chosen.
export function paintScene(){
  var W=1400,H=1700,a=document.createElement('canvas');a.width=W;a.height=H;
  var c=a.getContext('2d'),s=7;
  function rnd(){s=(s*16807)%2147483647;return (s-1)/2147483646}
  function lin(x0,y0,x1,y1,st){var g=c.createLinearGradient(x0,y0,x1,y1);st.forEach(function(p){g.addColorStop(p[0],p[1])});return g}
  function rad(x,y,r,st){var g=c.createRadialGradient(x,y,0,x,y,r);st.forEach(function(p){g.addColorStop(p[0],p[1])});return g}
  function rr(x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
  function fillR(x,y,w,h,r,f){rr(x,y,w,h,r);c.fillStyle=f;c.fill()}
  c.fillStyle=lin(0,0,W,H,[[0,'#4A2A4F'],[.5,'#2A1733'],[1,'#140A1A']]);c.fillRect(0,0,W,H);
  c.fillStyle=lin(0,60,0,760,[[0,'#FBE3C4'],[.55,'#E6A67A'],[1,'#9A5468']]);c.fillRect(60,50,480,720);
  for(var y=50;y<770;y+=28){c.fillStyle='rgba(40,16,40,.4)';c.fillRect(60,y,480,11)}
  c.strokeStyle='#21102A';c.lineWidth=16;c.strokeRect(60,50,480,720);
  c.fillStyle=rad(300,380,720,[[0,'rgba(250,205,170,.3)'],[1,'rgba(250,205,170,0)']]);c.fillRect(0,0,W,H);
  var cols=['#6B3A58','#7D4A5E','#8E1D56','#4A2A4F','#7A6A4F','#5A2C4A','#B59AA2'];
  for(var r=0;r<4;r++){var sy=90+r*170;c.fillStyle='#1C0F24';c.fillRect(960,sy+142,440,16);
    for(var x=975;x<1390;){var w=22+rnd()*20,h=96+rnd()*36;fillR(x,sy+142-h,w,h,3,cols[Math.floor(rnd()*cols.length)]);c.fillStyle='rgba(235,245,250,.5)';c.fillRect(x+6,sy+142-h+16,w-12,10);x+=w+3}}
  c.fillStyle=rad(1240,170,560,[[0,'rgba(255,214,160,.42)'],[1,'rgba(255,214,160,0)']]);c.fillRect(0,0,W,H);
  c.beginPath();c.moveTo(0,1140);c.lineTo(W,1100);c.lineTo(W,H);c.lineTo(0,H);c.closePath();c.fillStyle=lin(0,1100,0,H,[[0,'#5A3A4C'],[.4,'#35212F'],[1,'#1A0F20']]);c.fill();
  fillR(505,800,110,250,8,'#211526');fillR(400,1040,330,36,14,'#2A1B30');
  c.save();c.translate(-90,560);c.transform(1,.11,0,1,0,0);fillR(0,-150,270,340,12,'#120A18');c.fillStyle=lin(0,-140,0,180,[[0,'#F6DFC8'],[1,'#D9A98C']]);c.fillRect(12,-138,246,316);
  for(var l=0;l<13;l++){c.fillStyle='rgba(60,30,60,.5)';c.fillRect(34,-112+l*22,190-(l%3)*32,8)}c.restore();
  fillR(205,300,715,510,16,'#120A18');
  c.fillStyle=lin(0,312,0,800,[[0,'#FFF8F2'],[1,'#F3DCCB']]);c.fillRect(220,315,685,480);
  c.fillStyle='#3B1F4A';c.fillRect(220,315,685,48);c.fillStyle='#E39A2B';c.fillRect(238,332,100,14);
  for(var i=0;i<16;i++){c.fillStyle='rgba(70,40,70,.62)';c.fillRect(244,386+i*24,[280,250,300,210,270][i%5],9)}
  c.fillStyle='rgba(214,69,127,.5)';c.fillRect(244,456,190,14);c.fillRect(244,624,140,14);
  c.fillStyle='rgba(59,31,74,.2)';c.fillRect(572,378,2,404);
  for(var q=0;q<7;q++){var yy=392+q*56;fillR(594,yy,290,44,8,q===1?'rgba(142,29,86,.92)':'#FFFFFF');c.fillStyle=q===1?'#FFEFF5':'#8E1D56';c.fillRect(606,yy+11,62,11);c.fillStyle=q===1?'rgba(255,255,255,.75)':'rgba(70,40,70,.55)';c.fillRect(606,yy+28,205-(q%3)*30,6);c.fillStyle=q===1?'#fff':'rgba(142,29,86,.5)';c.fillRect(835,yy+13,36,16)}
  c.globalCompositeOperation='lighter';c.fillStyle=rad(560,560,840,[[0,'rgba(245,190,160,.4)'],[.5,'rgba(245,190,160,.1)'],[1,'rgba(245,190,160,0)']]);c.fillRect(0,0,W,H);c.globalCompositeOperation='source-over';
  c.save();c.translate(320,1210);c.transform(1,-.03,-.34,1,0,0);fillR(0,0,450,128,10,'#2A1B30');for(var kr=0;kr<4;kr++)for(var kc=0;kc<14;kc++){fillR(10+kc*31,10+kr*28,26,22,4,'#E6D6D8')}c.restore();
  for(var p=0;p<5;p++){c.save();c.translate(10+p*5,1370-p*11);c.transform(1,-.05+p*.012,-.28,1,0,0);fillR(0,0,300,240,4,p===4?'#FBF4EE':'#DCCBC8');if(p===4){for(var t=0;t<11;t++){c.fillStyle='rgba(70,40,70,.5)';c.fillRect(26,26+t*18,[230,190,244,170][t%4],7)}}c.restore()}
  c.save();c.translate(430,1470);c.transform(1,.02,-.24,1,0,0);fillR(0,0,350,220,6,'#5A1B40');fillR(10,8,162,204,3,'#F8F0EA');fillR(178,8,162,204,3,'#EEE0D8');for(var b=0;b<9;b++){c.fillStyle='rgba(70,40,70,.5)';c.fillRect(24,26+b*20,130,6);c.fillRect(192,26+b*20,130-(b%2)*24,6)}[['#E39A2B',20],['#D9A441',60],['#E0716C',100]].forEach(function(o){fillR(340,o[1],22,30,3,o[0])});c.restore();
  c.fillStyle='#F5ECE6';rr(800,1090,88,104,10);c.fill();c.fillStyle='#39261C';c.beginPath();c.ellipse(844,1092,44,12,0,0,7);c.fill();
  fillR(835,895,500,600,70,'#1A0F20');
  c.beginPath();c.moveTo(750,1700);c.bezierCurveTo(770,1240,830,1060,985,1000);c.bezierCurveTo(1090,965,1250,1000,1320,1160);c.bezierCurveTo(1370,1290,1385,1500,1390,1700);c.closePath();c.fillStyle=lin(760,1000,1380,1500,[[0,'#A33A6E'],[.45,'#6E1F4E'],[1,'#3E1430']]);c.fill();
  c.beginPath();c.moveTo(880,1060);c.bezierCurveTo(790,1140,650,1230,590,1290);c.lineTo(650,1370);c.bezierCurveTo(760,1320,890,1250,990,1170);c.closePath();c.fillStyle=lin(600,1300,980,1080,[[0,'#C2558A'],[1,'#6E1F4E']]);c.fill();
  c.fillStyle='#C99F85';c.beginPath();c.ellipse(610,1320,48,32,-.5,0,7);c.fill();
  c.fillStyle='#B98F76';c.beginPath();c.moveTo(965,860);c.lineTo(1085,860);c.lineTo(1100,1010);c.lineTo(950,1010);c.closePath();c.fill();
  c.save();c.translate(1000,740);c.rotate(-.1);c.beginPath();c.ellipse(0,0,122,148,0,0,7);c.fillStyle=lin(-122,0,122,0,[[0,'#F1CDB4'],[.5,'#C99F85'],[1,'#8D6A56']]);c.fill();
  c.beginPath();c.moveTo(-82,-108);c.bezierCurveTo(-30,-185,120,-178,142,-58);c.bezierCurveTo(160,50,132,145,62,178);c.bezierCurveTo(70,70,30,-30,-82,-108);c.closePath();c.fillStyle=lin(-60,-160,140,140,[[0,'#3D2C25'],[1,'#17110F']]);c.fill();
  c.beginPath();c.ellipse(104,-122,58,54,0,0,7);c.fillStyle='#231915';c.fill();
  c.strokeStyle='rgba(20,28,40,.8)';c.lineWidth=7;c.beginPath();c.ellipse(-74,-20,32,24,0,0,7);c.stroke();c.beginPath();c.moveTo(-42,-22);c.lineTo(60,-30);c.stroke();c.restore();
  c.globalCompositeOperation='lighter';c.strokeStyle='rgba(255,205,175,.5)';c.lineWidth=11;c.beginPath();c.moveTo(752,1690);c.bezierCurveTo(772,1240,832,1060,985,1002);c.stroke();c.globalCompositeOperation='source-over';
  for(var d=0;d<16;d++){var bx=rnd()*W,by=rnd()*640,br=20+rnd()*52;c.fillStyle=rad(bx,by,br,[[0,'rgba(250,215,185,.15)'],[.82,'rgba(250,215,185,.08)'],[1,'rgba(250,215,185,0)']]);c.fillRect(bx-br,by-br,br*2,br*2)}
  c.fillStyle=rad(W/2,H*.42,1150,[[.45,'rgba(15,5,18,0)'],[1,'rgba(15,5,18,.72)']]);c.fillRect(0,0,W,H);

  var b2=document.createElement('canvas');b2.width=W;b2.height=H;var o=b2.getContext('2d');
  var canBlur=('filter' in o);
  if(canBlur){o.filter='blur(9px)'}
  o.drawImage(a,0,0);o.filter='none';
  var im=o.getImageData(0,0,W,H),D=im.data;
  for(var n=0;n<D.length;n+=4){var v=(Math.random()-.5)*11;D[n]+=v;D[n+1]+=v;D[n+2]+=v}
  o.putImageData(im,0,0);
    document.documentElement.style.setProperty('--scene','url('+b2.toDataURL('image/jpeg',.8)+')');
}
