(() => {
      const canvas = document.getElementById('game');
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
    
      // === NEW: global scale (10% shrink) & longer interstitial timing ===
      const GLOBAL_SCALE = 0.9;          // 10% smaller
      const INTERSTITIAL_MS = 2600;      // level enter screen linger after boss defeat (non-final)
    
      // Apply 10% shrink to an optional wrapper (#gameRoot) or fallback to body
      applyGlobalScale(GLOBAL_SCALE);
      function applyGlobalScale(s){
        const root = document.getElementById('gameRoot') || document.body;
        // Primary (Chromium): zoom is crisp and affects layout
        root.style.zoom = String(s);
    
        // Fallback (Safari/Firefox): transform; affects visuals only, so anchor it neatly
        root.style.transformOrigin = 'top center';
        root.style.transform = `scale(${s})`;
    
        // Helpful for pixel art; may or may not be desired at non-integer scales
        root.style.imageRendering = 'pixelated';
      }
    
      const hudLevel = document.getElementById('hudLevel');
      const capacityFill = document.getElementById('capacityFill');
      const bossBar = document.getElementById('bossBar');
      const bossFill = document.getElementById('bossFill');
      const bossLabel = document.getElementById('bossLabel');
      const hudScore = document.getElementById('hudScore');
      const hudHigh = document.getElementById('hudHigh');
      const hudBoss = document.getElementById('hudBoss');
      const heartsEl = document.getElementById('hearts');
      const tickerText = document.querySelector('.tickerText');
    
      const elStart = document.getElementById('start');
      const elCleared = document.getElementById('cleared');
      const elGameOver = document.getElementById('gameover');
      const elBossIntro = document.getElementById('bossIntro');
      const bossIntroTitle = document.getElementById('bossIntroTitle');
      const bossIntroName = document.getElementById('bossIntroName');
    
      const btnStart = document.getElementById('btnStart');
      const btnNext  = document.getElementById('btnNext');
      const btnAgain = document.getElementById('btnAgain');
    
      btnStart.onclick = () => startNewRun();
      btnNext.onclick  = () => nextLevel();
      btnAgain.onclick = () => startNewRun();
    
      let keys = {};
      let state = 'menu'; // 'menu' | 'play' | 'interstitial' | 'gameover' | 'bossIntro' | 'victory'
      const playerBase = { w:40, h:12, speed:5, maxHP:3 };
      let player, bullets, enemyBullets, boss, score, level, inbox;
      let swarm;
      let lastTime = 0;
      let highScore = 0;
      let princeFX = null;
      let pendingBossSpec = null;
      let bossIntroTimeout = null;
      let currentEntry = null;
      let currentEntryId = null;
      let currentBossDef = null;
      let currentSubject = '';
      let subjectCycle = 0;
      let powerUps = [];
    
      const CAMPAIGN = [
        { id:1, title:"Clickbait Cloud",  tone:"funny / tutorial", palette:["#aefaff","#b8ffd8"], subjects:["Singles In Your Area.exe","Guaranteed Weight Loss (No Effort Required)","5% Off Something Stupid"], boss:"influencer" },
        { id:2, title:"Phishing Swarm",  tone:"office anxiety",   palette:["#ffc14a","#ff5a2b"], subjects:["Urgent Invoice Attached!","Re: Re: Re: Final Notice","Free Vacation Voucher (Limited Time!)"], boss:"phishmaster" },
        { id:3, title:"Crypto Carnage",   tone:"neon greed",       palette:["#00ff99","#ff00aa"], subjects:["Crypto Goes 1000x Tonight!!!","Exclusive NFT Opportunity"], boss:"coinlord" },
        { id:4, title:"Royal Scam",       tone:"theatrical corruption", palette:["#ffd24a","#b21b1b"], subjects:["Prince Requests Your Aid (Re: Inheritance Transfer)"], boss:"prince" }
      ];
    
      const BOSSES = {
        influencer: { id:'influencer', displayName:'INFLUENCER.EXE', tagline:'Smash that subscribe button or perish.', attack:'heartFan', color:'#ff6ad5', accent:'#ffffff', size:{w:120,h:80}, speed:1.06, approachY:108, approachSpeed:0.06 },
        phishmaster:{ id:'phishmaster',displayName:'PHISHMASTER 3000', tagline:'Your credentials are my currency.', attack:'aimedShot', color:'#ff8a33', accent:'#ffe7c2', size:{w:140,h:90}, speed:0.96, approachY:112, approachSpeed:0.052 },
        coinlord:   { id:'coinlord',   displayName:'COINLORD .v3', tagline:'In volatility we trust.', attack:'coinRain', color:'#00ff99', accent:'#ff00aa', size:{w:170,h:90}, speed:1.08, approachY:118, approachSpeed:0.048 },
        prince:     { id:'prince',     displayName:'NIGERIAN PRINCE AI v7.3', tagline:'One last favor, my trusted friend...', attack:'royalSeal', color:'#ffd24a', accent:'#b21b1b', size:{w:96,h:96}, speed:0.94, approachY:110, approachSpeed:0.05 }
      };
    
      // near your other timing constants
const BOSS_INTRO_MS = 3500;   // << make it as long as you want
const btnIntroOk = document.getElementById('btnIntroOk');

function spawnBossAfterIntro(spec){
  elBossIntro.style.display = 'none';
  state = 'play';
  spawnBoss(spec);
  pendingBossSpec = null;
  bossIntroTimeout = null;
  requestAnimationFrame(loop);
}

if (btnIntroOk){
  btnIntroOk.onclick = () => {
    if (pendingBossSpec){
      if (bossIntroTimeout) { clearTimeout(bossIntroTimeout); bossIntroTimeout = null; }
      spawnBossAfterIntro(pendingBossSpec);
    } else {
      elBossIntro.style.display = 'none';
      state = 'play';
    }
  };
}

      /* ========= Boss Sprite Registry ========= */
/* Reuses drawSpriteCharMap(ctx, sprite, pal, x, y, scale) */
const BOSS_SPRITES = {
    influencer: {
      scale: 4,
      pal: {
        ".": null,
        "k": "#0b0f12",
        "g": "#14ff7a",
        "p": "#ff6ad5",
        "w": "#ffffff",
        "y": "#ffd24a",
        "m": "#9aa3ad"
      },
      frames: {
        idle: [
          [
            "........gggggggg........",
            "......gggggggggggg......",
            "....gggggggggggggggg....",
            "...ggggggkkkkkkgggggg...",
            "..ggggkpppppppppppkggg..",
            ".ggggkppwwppppwwppkggg.",
            ".gggkppppppppppppppkgg.",
            ".ggkppppppwwwwppppppkgg",
            ".ggkppppppppppppppppkgg",
            ".ggkppppppppppppppppkgg",
            ".gggkppppkwwwwkppppkgg.",
            ".ggggkpppppwwpppppkggg.",
            "..ggggkppppppppppkgggg..",
            "...gggggkyyyyyyykgggg...",
            "....gggggkyyykygggg.....",
            ".....gggggm..kgggg......"
          ],
          [
            "........gggggggg........",
            "......gggggggggggg......",
            "....gggggggggggggggg....",
            "...ggggggkkkkkkgggggg...",
            "..ggggkpppppppppppkggg..",
            ".ggggkppwwppppwwppkggg.",
            ".gggkppppppppppppppkgg.",
            ".ggkppppppwwwwppppppkgg",
            ".ggkppppppppppppppppkgg",
            ".ggkppppppppppppppppkgg",
            ".gggkppppkwwwwkppppkgg.",
            ".ggggkppppppppppppkggg.",
            "..ggggkppppppppppkgggg..",
            "...gggggkyyyyyyykgggg...",
            "....gggggkyyykygggg.....",
            ".....ggggg.km.kggg......"
          ]
        ],
        hurt: [
          [
            "........gggggggg........",
            "......gggkkkkkkggg......",
            "....ggkppppppppppkgg....",
            "...ggkppppkkkkppppkgg...",
            "..ggkppppkppppkppppkgg..",
            ".ggkpppppkwwwwkppppkgg.",
            ".ggkpppppppppppppppkgg.",
            ".ggkppppppwwwwpppppkgg.",
            ".ggkpppppppppppppppkgg.",
            ".ggkppppppkpppkppppkgg.",
            ".ggkpppppppppppppppkgg.",
            "..gggkppppppppppppkggg..",
            "...gggkppyyyyyyppkggg...",
            "....ggggyyyyyyyygggg....",
            ".....ggggm......ggg.....",
            "......gggggggggggg......"
          ]
        ]
      }
    },
  
    phishmaster: {
      scale: 3,
      pal: {
        ".": null,
        "e": "#fff2dd",
        "o": "#ff8a33",
        "s": "#0b0f12",
        "h": "#a7b5c7",
        "b": "#71c9ff",
        "r": "#ff5a2b",
        "m": "#a7b5c7"   // added so 'm' pixels render
      },
      frames: {
        idle: [
          [
            "...........h............",
            "...........h............",
            "....oooooooooooooooo....",
            "...oeeeeeeeeeeeeeeeeo...",
            "..oeeeooooooooooooeeeo..",
            ".oeeeoeeseeeeeeeeseeeo.",
            ".oeeeeeeeeeeeeeeeeeeeo.",
            ".oeeeeeeeeeeeeeeeeeeeo.",
            ".oeeeeooooeeeeeooooeeo.",
            ".oeeeoeeseeeeeeeeseeeo.",
            "..oeeeooooooooooooeeeo..",
            "...oeeeeeeeeeeeeeeeeo...",
            "....oooooooooooooooo....",
            ".........hb.............",
            "........................",
            "........................"
          ],
          [
            "...........h............",
            "...........h............",
            "....oooooooooooooooo....",
            "...oeeeeeeeeeeeeeeeeo...",
            "..oeeeooooooooooooeeeo..",
            ".oeeeoeeseeeeeeeeseeeo.",
            ".oeeeeeeeeeeeeeeeeeeeo.",
            ".oeeeeeeeeeeeeeeeeeeeo.",
            ".oeeeeooooeeeeeooooeeo.",
            ".oeeeoeeseeeeeeeeseeeo.",
            "..oeeeooooooooooooeeeo..",
            "...oeeeeeeeeeeeeeeeeo...",
            "....oooooooooooooooo....",
            "..........bh............",
            "........................",
            "........................"
          ]
        ],
        hurt: [
          [
            "...........h............",
            "...........h............",
            "....oooooooooooooooo....",
            "...oeeeerrrrreeeeeero...",
            "..oeeeooeooooooeooeeeo..",
            ".oeeeoeesseeeseesseeo..",
            ".oeeeessssssessssseeeo.",
            ".oeeeeeesseeeessseeeeo.",
            ".oeeeeooeooooooeooeeeo.",
            ".oeeeoeesseeeseesseeo..",
            "..oeeeooooooooooooeeeo..",
            "...oeeeessssssssseeeo...",
            "....oooooooosooooooo....",
            ".........s..m..s........",
            "........................",
            "........................"
          ]
        ]
      }
    },
  
    coinlord: {
      scale: 3,
      pal: {
        ".": null,
        "y": "#ffd24a",
        "d": "#caa23b",
        "s": "#0b0f12",
        "g": "#00ff99",
        "w": "#ffffff"
      },
      frames: {
        idle: [
          [
            "..........dddddd..........",
            "........ddyyyyydd........",
            "......ddyyyyyyyyydd......",
            ".....dyyyyyyyyyyyyyd.....",
            "....dyyyyyyyyyyyyyyyd....",
            "...dyyyyyyyyyyyyyyyyyd...",
            "...dyyyysyyyyyysyyyyyd...",
            "...dyyysyyyyyyyyysyyyyd..",
            "....dyyyysgsyysgsyyyd....",
            ".....dyyyyysggsyyyyd.....",
            "......ddyyysggsyydd......",
            "........ddyyssyydd.......",
            "..........ddwwdd.........",
            "............ww...........",
            "..........................",
            ".........................."
          ],
          [
            "..........dddddd..........",
            "........ddyyyyydd........",
            "......ddyyyyyyyyydd......",
            ".....dyyyyyyyyyyyyyd.....",
            "....dyyyyyyyyyyyyyyyd....",
            "...dyyyyyyyyyyyyyyyyyd...",
            "...dyyyysyyyyyysyyyyyd...",
            "...dyyysyyyyssyyysyyyyd..",
            "....dyyyyssssssssyyyd....",
            ".....dyyyyysggsyyyyd.....",
            "......ddyyysggsyydd......",
            "........ddyyssyydd.......",
            "...........dwwdd.........",
            ".............ww..........",
            "..........................",
            ".........................."
          ]
        ],
        hurt: [
          [
            "..........dddddd..........",
            "........ddyyyyydd........",
            "......ddyyyydyyydd.......",
            ".....dyyyyyysyysyyd......",
            "....dyyyyyyysyyysyyd.....",
            "...dyyyyyysyyyyysyyyd....",
            "...dyyyysyysdysyyyyyd....",
            "...dyyysyysdsssyyysyd....",
            "....dyyyysgsssgsyyyd.....",
            ".....dyyyyyssgsyyyyd.....",
            "......ddyyyssgsyydd......",
            "........ddyyssyydd.......",
            "..........ddssdd.........",
            "...........s..s..........",
            "..........................",
            ".........................."
          ]
        ]
      }
    },
  
    // Prince keeps dedicated renderer
    prince: {}
  };
     
      const PRINCE_PAL32 = {
        ".": null,"k":"#0b0f12","b":"#0e1720","C":"#ffd24a","c":"#e6b93f","J":"#ff3a3a","j":"#ff9f9f","S":"#f5cc66","s":"#e1b652","o":"#b88f33","e":"#f2f7ff","n":"#11151a","g":"#18a261","G":"#0f6f41","r":"#ffdf6b","R":"#caa23b","w":"#ffffff","W":"#e6eef6","E":"#4b5663","d":"#d32b2b","D":"#b31f1f"
      };
    
      const PRINCE32_IDLE_A = [
        "..kk..CCCCCCCC..kk..............",
        ".kkCJJCCCCCCCCJJCkk.............",
        ".kCCCCCCCCCCCCCCCCk.............",
        "..kCCCcCCCCCCCCcCCk.............",
        "...kkk..kkkkkk..kkk.............",
        "...k..sSSSSSSSSs..k.............",
        "..k.sSSssssssssSSs.k............",
        "..k.sSse..nn..eSsS.k............",
        "..k.sSSssssssssSSs.k............",
        "..k..sSSSSSSSSSSs..k............",
        "...k..sooooooooS..k.............",
        "...k...sooooooS...k.............",
        "...kk...soooos...kk.............",
        "....kk...ssss...kk..............",
        ".....kRk......kRk...............",
        "...kkggggggggggggkk.............",
        "..kgGGgggggggggggGGgk...........",
        ".kgGgGRrrrrrrrrRGgGgk...........",
        ".kgGgGRrwwEwwrRGgGgk............",
        ".kgGgGRrWwEwWrRGgGgk............",
        ".kgGgGRrrrrrrrrRGgGgk............",
        ".kgGGggGGgggggggGGgk.............",
        "..kggggggggggGGggggk............",
        "...kkGggggggGGgggkk.............",
        "....kGGGGGGGGGGGGGk.............",
        ".....kGGGGGGGGGGGk..............",
        "......kGGGGGGGGGk...............",
        ".......kkkkkkkkk................",
        "........k.....k.................",
        "........k.....k.................",
        ".........kkkkk..................",
        "................................"
      ];
    
      const PRINCE32_IDLE_B = [
        "..kk..CCCCCCCC..kk..............",
        ".kkCjJCCCCCCCCJjCkk.............",
        ".kCCCCCCCCCCCCCCCCk.............",
        "..kCCCcCCCCCCCCcCCk.............",
        "...kkk..kkkkkk..kkk.............",
        "...k..sSSSSSSSSs..k.............",
        "..k.sSSssssssssSSs.k............",
        "..k.sSse..nn..eSsS.k............",
        "..k.sSSssssssssSSs.k............",
        "..k..sSSSSSSSSSSs..k............",
        "...k..sooooooooS..k.............",
        "...k...sooooooS...k.............",
        "...kk...soooos...kk.............",
        "....kk...ssss...kk..............",
        ".....kRk......kRk...............",
        "...kkggggGGggggggkk.............",
        "..kgGGgggggggggggGGgk...........",
        ".kgGgGRrrrrrrrrRGgGk............",
        ".kgGgGRrWwEwWrRGgGk.............",
        ".kgGgGRrwwEwwrRGgGk.............",
        ".kgGgGRrrrrrrrrRGgGk.............",
        ".kgGGgggggggggggGGgk.............",
        "..kggggggggggggggggk............",
        "...kkGggggggGGgggkk.............",
        "....kGGGGGGGGGGGGGk.............",
        ".....kGGGGGGGGGGGk..............",
        "......kGGGGGGGGGk...............",
        ".......kkkkkkkkk................",
        "........k.....k.................",
        "........k.....k.................",
        ".........kkkkk..................",
        "................................"
      ];
    
      const PRINCE32_HURT = [
        "..kk..CCCCCCCC..kk..............",
        ".kkCJJCCCCCCCCJJCkk.............",
        ".kCCCCCCCCCCCCCCCCk.............",
        "..kCCCcCCCCCCCCcCCk.............",
        "...kkk..kbbbbk..kkk.............",
        "...k..sSSSSSSSSs..k.............",
        "..k.SSSSSssssSSSS.k............",
        "..k.sSse..nn..eSsS.k............",
        "..k.SSSSSssssSSSS.k............",
        "..k..sSSSSSSSSSSs..k............",
        "...k..sooooooooS..k.............",
        "...k...sooooooS...k.............",
        "...kk...soooos...kk.............",
        "....kk...ssss...kk..............",
        ".....kRk......kRk...............",
        "...kkggggggggggggkk.............",
        "..kgGGgggggggggggGGgk...........",
        ".kgGgGRrRRRRRRrRGgGgk...........",
        ".kgGgGRrWwEwWrRGgGgk............",
        ".kgGgGRrwwEwwrRGgGgk............",
        ".kgGgGRrRRRRRRrRGgGgk............",
        ".kgGGgggggggggggGGgk.............",
        "..kggGGgggggggggGGgk............",
        "...kkGggggggGGgggkk.............",
        "....kGGGGGGGGGGGGGk.............",
        ".....kGGGGGGGGGGGk..............",
        "......kGGGGGGGGGk...............",
        ".......kkkkkkkkk................",
        "........k.....k.................",
        "........k.....k.................",
        ".........kkkkk..................",
        "................................"
      ];
    
      const SEAL_PAL = { ".": null, "#": "#1b1f24","w":"#ffffff","W":"#e6eef6","g":"#ffd24a","G":"#e0b83e","r":"#d32b2b","R":"#b31f1f" };
      const SEAL_A = ["..RRRR..",".RrrrrR.","RrRGGrrR","RrG##GrR","RrG##GrR","RrRGGrrR",".RrrrrR.","..RRRR.."];
      const SEAL_B = ["..RRRR..",".RrrrrR.","RrRGGrrR","RrG#wGrR","RrG#wGrR","RrRGGrrR",".RrrrrR.","..RRRR.."];
    
      function drawSpriteCharMap(ctx, sprite, pal, x, y, scale = 3){
        const px = scale|0;
        for (let r = 0; r < sprite.length; r++){
          const row = sprite[r];
          for (let c = 0; c < row.length; c++){
            const color = pal[row[c]];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect((x|0) + c*px, (y|0) + r*px, px, px);
          }
        }
      }
      function getPrinceFrame32(animTimeMs, hurtTimerMs = 0){
        if (hurtTimerMs > 0) return PRINCE32_HURT;
        return (Math.floor(animTimeMs / 160) % 2 === 0) ? PRINCE32_IDLE_A : PRINCE32_IDLE_B;
      }
      function renderPrinceBoss32(ctx, boss, animTimeMs, hurtTimerMs = 0, scale = 3){
        const frame = getPrinceFrame32(animTimeMs, hurtTimerMs);
        if (!Array.isArray(frame) || frame.length === 0 || !frame[0]) return;
        const sprW = frame[0].length * scale;
        const sprH = frame.length * scale;
        const sx = Math.round(boss.x + (boss.w - sprW)/2);
        const sy = Math.round(boss.y + (boss.h - sprH)/2);
        drawSpriteCharMap(ctx, frame, PRINCE_PAL32, sx, sy, scale);
      }
    
      function createRoyalSeal(x, y, vx, vy){ return { x, y, vx, vy, w: 8, h: 8, t: 0, kind: 'royalSeal' }; }
      function drawRoyalSeal(ctx, seal, scale = 2){
        const frame = (Math.floor(seal.t / 120) % 2 === 0) ? SEAL_A : SEAL_B;
        const px = scale|0;
        for (let r=0;r<frame.length;r++){
          const row = frame[r];
          for (let c=0;c<row.length;c++){
            const ch = row[c];
            const color = SEAL_PAL[ch];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect((seal.x|0) + c*px, (seal.y|0) + r*px, px, px);
          }
        }
      }
    
      function spawnPrinceDeathBurst(cx, cy, scale = 3){
        const rng = Math.random;
        const shards = [];
        const confetti = [];
        const pushPix = (arr, color, dx, dy, life, size=2) =>
          arr.push({ x: cx, y: cy, vx: dx, vy: dy, a: 1, life, size, color });
        for (let i=0;i<16;i++){
          const ang = (i/16)*Math.PI*2 + (rng()*0.4-0.2);
          const spd = 1.8 + rng()*2.2;
          pushPix(shards, (i%2? '#ffd24a':'#e6b93f'), Math.cos(ang)*spd, Math.sin(ang)*spd, 450 + rng()*300, 2*scale/3);
        }
        for (let i=0;i<6;i++){
          const ang = rng()*Math.PI*2;
          const spd = 2 + rng()*2.8;
          pushPix(shards, (i%2? '#ff3a3a':'#ff9f9f'), Math.cos(ang)*spd, Math.sin(ang)*spd, 400 + rng()*300, 2*scale/3);
        }
        for (let i=0;i<14;i++){
          const ang = rng()*Math.PI*2;
          const spd = 1.2 + rng()*2.0;
          const color = ["#ffffff","#e6eef6","#ffd24a","#caa23b"][i%4];
          pushPix(confetti, color, Math.cos(ang)*spd, Math.sin(ang)*spd, 520 + rng()*320, scale);
        }
        return { shards, confetti, alive: true, t: 0 };
      }
      function updateDeathBurst(fx, dt){
        if (!fx || !fx.alive) return;
        fx.t += dt;
        const grav = 0.003 * dt;
        const damp = 0.998;
        let aliveCount = 0;
        for (const arr of [fx.shards, fx.confetti]){
          for (const p of arr){
            p.vy += grav;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= damp;
            p.vy *= 0.999;
            p.life -= dt;
            p.a = Math.max(0, Math.min(1, p.life / 600));
            if (p.life > 0) aliveCount++;
          }
        }
        if (aliveCount === 0) fx.alive = false;
      }
      function drawDeathBurst(ctx, fx){
        if (!fx || !fx.alive) return;
        for (const p of fx.shards){
          if (p.life <= 0) continue;
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x|0, p.y|0, p.size|0, p.size|0);
        }
        for (const p of fx.confetti){
          if (p.life <= 0) continue;
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x|0, p.y|0, p.size|0, p.size|0);
        }
        ctx.globalAlpha = 1;
      }
      function getBossSpriteFrame(type, animTimeMs, hurtTimerMs = 0){
        const pack = BOSS_SPRITES[type];
        if (!pack || !pack.frames) return null;
        if (hurtTimerMs > 0 && pack.frames.hurt && pack.frames.hurt.length){
          return pack.frames.hurt[0];
        }
        const idle = pack.frames.idle || [];
        if (!idle.length) return null;
        const idx = Math.floor(animTimeMs / 180) % idle.length;
        return idle[idx];
      }
    
      function renderCharBoss(ctx, boss, animTimeMs){
        const pack = BOSS_SPRITES[boss.type];
        if (!pack) return false;
    
        const frame = getBossSpriteFrame(boss.type, animTimeMs, boss.hurt || 0);
        if (!frame) return false;
    
        const px = (pack.scale | 0) || 3;
        const sprW = (frame[0]?.length || 0) * px;
        const sprH = frame.length * px;
        const sx = Math.round(boss.x + (boss.w - sprW) / 2);
        const sy = Math.round(boss.y + (boss.h - sprH) / 2);
    
        if ((boss.hurt || 0) > 0){
          ctx.save();
          ctx.globalAlpha = 0.85;
          const whitePal = Object.fromEntries(
            Object.keys(pack.pal).map(k => [k, pack.pal[k] ? '#ffffff' : null])
          );
          drawSpriteCharMap(ctx, frame, whitePal, sx, sy, px);
          ctx.restore();
        }
    
        drawSpriteCharMap(ctx, frame, pack.pal, sx, sy, px);
        return true;
      }
      (function initTouchControls(){
        const root = document.getElementById('touchControls');
        if (!root) return;
      
        // If the device has no touch, keep hidden (CSS also hides it)
        const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
        if (!isTouch) return;
      
        const active = new Map(); // pointerId -> key it controls
      
        function setKey(key, down){
          // Reuse your keyboard mapping
          keys[key] = !!down;
      
          // Optional: tiny haptic tick on press (mobile only)
          if (down && 'vibrate' in navigator) {
            try { navigator.vibrate(10); } catch(_) {}
          }
        }
      
        function onDown(e){
          if (!(e.target instanceof HTMLElement)) return;
          const key = e.target.dataset.key;
          if (!key) return;
          e.preventDefault();
          e.stopPropagation();
          active.set(e.pointerId ?? 'mouse', key);
          setKey(key, true);
          e.target.setPointerCapture?.(e.pointerId);
        }
      
        function onUp(e){
          const id = e.pointerId ?? 'mouse';
          const key = active.get(id);
          if (key) setKey(key, false);
          active.delete(id);
        }
      
        root.addEventListener('pointerdown', onDown, {passive:false});
        root.addEventListener('pointerup', onUp, {passive:false});
        root.addEventListener('pointercancel', onUp);
        root.addEventListener('pointerleave', onUp);
      
        // Safety: release keys when the overlay hides or page loses focus
        window.addEventListener('blur', () => {
          ['ArrowLeft','ArrowRight','Space'].forEach(k => setKey(k,false));
          active.clear();
        });
      })();
      
    
      const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
      function rectsOverlap(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
      function updateHearts(){
        if (!player) return;
        heartsEl.innerHTML = '';
        for (let i=0;i<playerBase.maxHP;i++){
          const d = document.createElement('div');
          d.className = 'life' + (i < player.hp ? '' : ' ghost');
          heartsEl.appendChild(d);
        }
      }
      function updateCapacity(){ capacityFill.style.transform = `scaleX(${clamp(inbox,0,1)})`; }
      function getCampaignEntry(level){
        const idx = Math.min(CAMPAIGN.length, Math.max(1, level)) - 1;
        return CAMPAIGN[idx];
      }
      function applyPalette(entry){
        if (!entry) return;
        const root = document.documentElement;
        root.style.setProperty('--accent', entry.palette[0]);
        root.style.setProperty('--danger', entry.palette[1]);
        root.style.setProperty('--gold', entry.palette[0]);
        // No gradient; honor CSS body background
        document.body.style.background = ''; // or 'var(--bg)' if you prefer
      }
      function nextSubject(entry){
        if (!entry || !entry.subjects || !entry.subjects.length) return '';
        const idx = subjectCycle % entry.subjects.length;
        subjectCycle++;
        return entry.subjects[idx];
      }
      function updateLevelHUD(){
        const entry = currentEntry || getCampaignEntry(level);
        hudLevel.textContent = `${entry.title} (Lv ${String(level).padStart(2,'0')})`;
      }
      function updateHighScore(){ hudHigh.textContent = String(highScore).padStart(5,'0'); }
      function updateBossHUD(value){
        if (!hudBoss) return;
        hudBoss.textContent = value;
      }
      function refreshBossHUD(){
        if (!hudBoss) return;
        if (boss) {
          hudBoss.textContent = `${String(boss.hp).padStart(2,'0')}/${String(boss.maxHP).padStart(2,'0')}`;
        } else {
          hudBoss.textContent = '---';
        }
      }
      function setTicker(text){ if (tickerText) tickerText.innerHTML = text; }
      function addScore(n){
        score += n;
        hudScore.textContent = String(score).padStart(5,'0');
        if (score > highScore){
          highScore = score;
          updateHighScore();
          try { localStorage.setItem('spamInvadersHighScore', String(highScore)); } catch(err){}
        }
      }
      function showBossUI(r=1){
        if (bossLabel) bossLabel.style.display='block';
        if (bossBar) {
          bossBar.style.display='block';
          if (bossFill) bossFill.style.transform = `scaleX(${r})`;
        }
      }
      function hideBossUI(){
        if (bossLabel) bossLabel.style.display='none';
        if (bossBar) bossBar.style.display='none';
        updateBossHUD('---');
      }
    
      function triggerGameOver(){
        if (state === 'gameover') return;
        clearBossIntro();
        state='gameover';
        setTicker('MAILBOX LOST  -  PRESS START TO TRY AGAIN');
        setTimeout(()=>elGameOver.style.display='flex',60);
      }
      function loseLife(){
        if (!player || state !== 'play') return;
        if (player.hp <= 0) return;
        player.hp--;
        updateHearts();
        enemyBullets = [];
        bullets = [];
        if (player.hp > 0){
          inbox = 1;
          updateCapacity();
          setTicker(`SHIELD REBOOTED  -  LIVES x${player.hp}`);
        } else {
          inbox = 0;
          updateCapacity();
          triggerGameOver();
        }
      }
      function damageInbox(amount){
        if (state !== 'play' || !player || player.hp <= 0) return;
        inbox = clamp(inbox - amount, 0, 1);
        updateCapacity();
        if (inbox <= 0){
          loseLife();
        }
      }
      function forceShieldBreak(){
        if (state !== 'play' || !player || player.hp <= 0) return;
        inbox = 0;
        updateCapacity();
        loseLife();
      }
    
      try {
        highScore = Number(localStorage.getItem('spamInvadersHighScore') || 0);
      } catch(err){
        highScore = 0;
      }
      updateHighScore();
      applyPalette(getCampaignEntry(1));
      setTicker('PRESS START  -  DEFEND THE INBOX');
    
      addEventListener('keydown', e => {
        if ((state === 'menu' || state === 'gameover' || state === 'victory') && (e.code === 'Enter' || e.code === 'Space')){
          e.preventDefault();
          startNewRun();
          return;
        }
        if (state === 'interstitial' && (e.code === 'Enter' || e.code === 'Space')){
          e.preventDefault();
          nextLevel();
          return;
        }
        keys[e.code] = true;
        if (e.code === 'Space') e.preventDefault();
      }, {passive:false});
      addEventListener('keyup', e => keys[e.code] = false);
    
      function getLevelParams(lvl){
        const entry = getCampaignEntry(lvl);
        switch(entry.id){
          case 1: return { rows:4, cols:7, enemyHPBackRow:1, swarmDX:0.32, dropY:10, enemyFireBaseMs:1280, bossHP:36, bossSpeed:BOSSES[entry.boss].speed, maxDepth:210, rowDrop:110, behaviour:{flash:false, diagonalDrop:false, zigzag:false, courier:false} };
          case 2: return { rows:5, cols:8, enemyHPBackRow:2, swarmDX:0.58, dropY:8, enemyFireBaseMs:1080, bossHP:52, bossSpeed:BOSSES[entry.boss].speed, maxDepth:220, rowDrop:110, behaviour:{flash:true, diagonalDrop:true, diagInterval:[2200,3400], diagStep:5, zigzag:false, courier:false} };
          case 3: return { rows:5, cols:8, enemyHPBackRow:2, swarmDX:0.7, dropY:8, enemyFireBaseMs:940, bossHP:70, bossSpeed:BOSSES[entry.boss].speed, maxDepth:232, rowDrop:120, behaviour:{flash:true, diagonalDrop:false, zigzag:true, zigzagAmp:8, zigzagSpeed:0.045, courier:false}, bossFireScale: 1.6 };
          case 4:
          default: return { rows:5, cols:8, enemyHPBackRow:3, swarmDX:0.76, dropY:10, enemyFireBaseMs:900, bossHP:88, bossSpeed:BOSSES[entry.boss].speed, maxDepth:238, rowDrop:130, behaviour:{flash:true, diagonalDrop:false, zigzag:false, courier:true} };
        }
      }
    
      function startNewRun(){
        elStart.style.display='none'; elCleared.style.display='none'; elGameOver.style.display='none';
        if (btnNext) btnNext.style.display = ''; // restore for normal stage-clears
        clearBossIntro();
        player = { x: W/2-20, y: H-40, w:playerBase.w, h:playerBase.h, speed:playerBase.speed, hp:playerBase.maxHP, cooldown:0, invuln:0 };
        bullets = [];
        enemyBullets = [];
        powerUps = [];
        score = 0;
        hudScore.textContent = '00000';
        inbox = 1.0;
        level = 1;
        subjectCycle = 0;
        currentEntry = getCampaignEntry(level);
        currentEntryId = currentEntry.id;
        applyPalette(currentEntry);
        currentSubject = nextSubject(currentEntry);
        updateLevelHUD();
        updateBossHUD('---');
        spawnWave(level);
        updateHearts();
        updateCapacity();
        // After you set elStart.style.display='flex' anywhere, call:
        paintLegendIcons();
        boss = null;
        hideBossUI();
        princeFX = null;
        state='play';
        keys = {};
        setTicker(`${currentEntry.title.toUpperCase()} - ${currentSubject.toUpperCase()}`);
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    
      function continueNextLevel(){
        inbox = clamp(inbox + 0.25, 0, 1);
        if (level % 2 === 0 && player.hp < playerBase.maxHP) player.hp++;
        updateHearts(); updateCapacity();
    
        elCleared.style.display='none';
        bullets=[]; enemyBullets=[]; powerUps = [];
        boss=null; hideBossUI();
        clearBossIntro();
    
        const entry = getCampaignEntry(level);
        if (!currentEntry || entry.id !== currentEntryId){ subjectCycle = 0; }
        currentEntry = entry;
        currentEntryId = entry.id;
        applyPalette(entry);
        currentSubject = nextSubject(entry);
        updateLevelHUD();
    
        if (btnNext) btnNext.style.display = ''; // show for non-final levels
    
        spawnWave(level);
        state='play';
        keys = {};
        princeFX = null;
        setTicker(`${entry.title.toUpperCase()} - ${currentSubject.toUpperCase()}`);
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    
      function spawnWave(lvl){
        currentEntry = currentEntry || getCampaignEntry(lvl);
        currentEntryId = currentEntry.id;
        const bossDef = BOSSES[currentEntry.boss] || BOSSES.prince;
        currentBossDef = bossDef;
        if (!currentSubject) currentSubject = nextSubject(currentEntry);
        powerUps = [];
    
        const p = getLevelParams(lvl);
        const behaviour = p.behaviour || {};
        const diagRangeSrc = behaviour.diagInterval;
        const diagRange = (Array.isArray(diagRangeSrc) && diagRangeSrc.length >= 2)
          ? [Number(diagRangeSrc[0]) || 900, Number(diagRangeSrc[1]) || 1800]
          : [900, 1800];
        const diagStepDefault = (typeof behaviour.diagStep === 'number') ? behaviour.diagStep : p.dropY;
        const maxDepth = p.maxDepth ?? (H - 200);
        const rowDropAllowance = p.rowDrop ?? 140;
        const gapX = 6, gapY = 10;
        const ew = 34, eh = 20;
        const waveWidth = p.cols*ew + (p.cols-1)*gapX;
        const startX = Math.max(12, (W - waveWidth)/2);
        const startY = 46;
        const primary = currentEntry.palette[0];
        const secondary = currentEntry.palette[1];
        const list = [];
        for (let r=0;r<p.rows;r++){
          for (let c=0;c<p.cols;c++){
            const enemy = {
              x: startX + c*(ew+gapX),
              y: startY + r*(eh+gapY),
              baseY: startY + r*(eh+gapY),
              w: ew, h: eh,
              hp: 1 + (r>2?Math.min(1+p.enemyHPBackRow,3):0),
              color: (r % 2 === 0) ? primary : secondary,
              flash: behaviour.flash ? 0 : null,
              courier: behaviour.courier && r === 0 && (c % 2 === 0),
              diagTimer: behaviour.diagonalDrop ? diagRange[0] + Math.random() * Math.max(0, diagRange[1] - diagRange[0]) : 0,
              diagMin: diagRange[0],
              diagMax: diagRange[1],
              diagStep: diagStepDefault,
              diagDir: Math.random() < 0.5 ? -1 : 1,
              lifeDropped: false,
              maxY: Math.min(maxDepth, startY + r*(eh+gapY) + rowDropAllowance),
              zigzagPhase: behaviour.zigzag ? Math.random()*Math.PI*2 : 0,
              zigzagAmp: behaviour.zigzagAmp || 0,
              zigzagSpeed: behaviour.zigzagSpeed || 0
            };
            list.push(enemy);
          }
        }
        swarm = {
          list,
          dx: p.swarmDX,
          dir: 1,
          dropY: p.dropY,
          leftBound: 12,
          rightBound: W-12,
          shootTimer: p.enemyFireBaseMs,
          fireBase: p.enemyFireBaseMs,
          behaviour,
          entry: currentEntry,
          subject: currentSubject,
          maxDepth,
          bossSpec: {
            entryId: currentEntry.id,
            hp: p.bossHP,
            speed: p.bossSpeed,
            kind: bossDef.id,
            name: bossDef.displayName,
            tagline: bossDef.tagline,
            color: bossDef.color,
            accent: bossDef.accent,
            fireScale: p.bossFireScale || 1
          }
        };
      }
    
function spawnBoss(spec){
  const def = BOSSES[spec.kind] || BOSSES.prince;
  currentBossDef = def;
  const size = def.size || { w: 180, h: 90 };
  const targetY = spec.targetY || def.approachY || 110;
  const approachSpeed = spec.approachSpeed || def.approachSpeed || 0.055;
  boss = {
    x: W/2 - size.w/2,
    y: -size.h,
    w: size.w,
    h: size.h,
    dir: 1,
    maxHP: spec.hp,
    hp: spec.hp,
    fire: 0,
    speed: spec.speed,
    type: def.id,
    hurt: 0,
    name: def.displayName,
    color: spec.color || def.color,
    accent: spec.accent || def.accent,
    def,
    targetY,
    descendSpeed: approachSpeed,
    approach: true,
    fireScale: def.fireScale || spec.fireScale || 1
  };
  bossLabel.textContent = def.displayName;
  refreshBossHUD();
  showBossUI(1);
  setTicker(`${def.displayName} - ${def.tagline}`);
}

function spawnBossAfterIntro(spec){
  elBossIntro.style.display = 'none';
  state = 'play';
  spawnBoss(spec);
  pendingBossSpec = null;
  bossIntroTimeout = null;
  requestAnimationFrame(loop);
}

function showBossIntro(spec){
  if (!spec) return;
  pendingBossSpec = spec;
  if (bossIntroTimeout){
    clearTimeout(bossIntroTimeout);
    bossIntroTimeout = null;
  }
  enemyBullets = [];
  bullets = [];
  const def = BOSSES[spec.kind] || BOSSES.prince;
  bossIntroTitle.textContent = def.displayName;
  bossIntroName.textContent  = def.tagline;
  elBossIntro.style.display  = 'flex';
  state = 'bossIntro';
  setTicker(`${def.displayName} - STAND BY`);

  bossIntroTimeout = setTimeout(() => {
    if (state !== 'bossIntro' || pendingBossSpec !== spec) return;
    spawnBossAfterIntro(spec);
  }, BOSS_INTRO_MS);
}

// Hook up the "Proceed" button if available
if (typeof btnIntroOk !== 'undefined' && btnIntroOk){
  btnIntroOk.onclick = () => {
    if (pendingBossSpec){
      if (bossIntroTimeout){ clearTimeout(bossIntroTimeout); bossIntroTimeout = null; }
      spawnBossAfterIntro(pendingBossSpec);
    } else {
      elBossIntro.style.display = 'none';
      state = 'play';
      requestAnimationFrame(loop);
    }
  };
}

function clearBossIntro(){
  if (bossIntroTimeout){
    clearTimeout(bossIntroTimeout);
    bossIntroTimeout = null;
  }
  elBossIntro.style.display = 'none';
  pendingBossSpec = null;
  if (state === 'bossIntro') state = 'play';
}

function shootPlayer(){
  if (player.cooldown <= 0){
    bullets.push({ x: player.x + player.w/2 - 2, y: player.y - 10, w:4, h:10, vy:-7 });
    player.cooldown = 12;
  }
}

function enemyTryShoot(dt){
  if (!swarm.list.length) return;
  swarm.shootTimer -= dt;
  if (swarm.shootTimer <= 0){
    const alive = swarm.list.length;
    const behaviour = swarm.behaviour || {};
    let rate = swarm.fireBase - alive * (behaviour.flash ? 12 : 8);
    rate = clamp(rate, 240, 1400);
    swarm.shootTimer = rate;

    const byCol = {};
    for (const e of swarm.list){
      const colKey = Math.round(e.x/48);
      if (!byCol[colKey] || e.y > byCol[colKey].y) byCol[colKey] = e;
    }
    const shooters = Object.values(byCol);
    if (shooters.length){
      const s = shooters[Math.floor(Math.random()*shooters.length)];
      if (behaviour.flash && s){ s.flash = 140; }
      const bulletColor = (swarm.entry && swarm.entry.palette[1]) || '#ff9a9a';
      const baseVy = 3.0 + Math.min(level*0.25, 3.4);
      if (behaviour.courier && s.courier){
        const seal = createRoyalSeal(s.x + s.w/2 - 4, s.y + s.h + 2, 0, baseVy);
        seal.scale = 1.5;
        enemyBullets.push(seal);
      } else if (swarm.entry && swarm.entry.id === 3){
        const offsets = [-1.4, 0, 1.4];
        offsets.forEach(off => {
          enemyBullets.push({
            x: s.x + s.w/2 - 3,
            y: s.y + s.h + 2,
            w:6, h:12,
            vy: baseVy + Math.random()*0.6,
            vx: off * 0.8,
            color: bulletColor,
            kind: 'spread'
          });
        });
      } else {
        enemyBullets.push({
          x: s.x + s.w/2 - 2,
          y: s.y + s.h + 2,
          w:4, h:10,
          vy: baseVy,
          vx: 0,
          color: bulletColor,
          kind: 'spam'
        });
      }
    }
  }
}

    
      function drawHeartProjectile(ctx, proj){
        const size = proj.size || 12;
        const x = proj.x;
        const y = proj.y;
        ctx.fillStyle = proj.color || '#ff6ad5';
        ctx.beginPath();
        ctx.moveTo(x + size/2, y + size);
        ctx.bezierCurveTo(x + size, y + size*0.6, x + size*0.85, y, x + size*0.5, y + size*0.35);
        ctx.bezierCurveTo(x + size*0.15, y, x, y + size*0.6, x + size/2, y + size);
        ctx.fill();
      }
      function drawCoinProjectile(ctx, proj){
        const size = proj.size || 10;
        const radius = size/2;
        const x = proj.x + radius;
        const y = proj.y + radius;
        ctx.fillStyle = proj.color || '#ffd24a';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#1b1f24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.6, 0, Math.PI*2);
        ctx.stroke();
      }
      function drawPhishProjectile(ctx, proj){
        const w = proj.w || 10;
        const h = proj.h || 12;
        const x = proj.x;
        const y = proj.y;
        ctx.fillStyle = '#fff2dd';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = proj.color || '#ff8a33';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.moveTo(x, y);
        ctx.lineTo(x + w/2, y + h/2);
        ctx.lineTo(x + w, y);
        ctx.stroke();
      }
      function drawSpreadProjectile(ctx, proj){
        const w = proj.w || 6;
        const h = proj.h || 12;
        const x = proj.x;
        const y = proj.y;
        ctx.fillStyle = proj.color || '#ff00aa';
        ctx.beginPath();
        ctx.moveTo(x + w/2, y);
        ctx.lineTo(x + w, y + h/2);
        ctx.lineTo(x + w/2, y + h);
        ctx.lineTo(x, y + h/2);
        ctx.closePath();
        ctx.fill();
      }
        // === Power-up icon helpers (reused by legend and gameplay) ===
    function drawLifeDiamondShape(ctx, x, y, w, h, glow=0){
        const pulse = 0.6 + 0.3 * Math.sin(glow);
        ctx.beginPath();
        ctx.moveTo(x + w/2, y);
        ctx.lineTo(x + w,   y + h/2);
        ctx.lineTo(x + w/2, y + h);
        ctx.lineTo(x,       y + h/2);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 255, 180, ${0.7 + 0.2 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 215, 120, 0.9)`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.lineWidth = 1;
    }
    
    function drawVPNShape(ctx, x, y, w, h, glow=0){
        const pulse = 0.6 + 0.3 * Math.sin(glow);
        ctx.fillStyle = `rgba(120, 255, 230, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(x + w/2, y);
        ctx.lineTo(x + w,   y + h/2);
        ctx.lineTo(x + w/2, y + h);
        ctx.lineTo(x,       y + h/2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,60,70,0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.lineWidth = 1;
    }
    function paintLegendIcons(){
        const lifeCanvas = document.getElementById('iconLife');
        const vpnCanvas  = document.getElementById('iconVPN');
        if (!lifeCanvas || !vpnCanvas) return;
      
        const lc = lifeCanvas.getContext('2d');
        lc.clearRect(0,0,lifeCanvas.width,lifeCanvas.height);
        drawLifeDiamondShape(lc, 2, 2, lifeCanvas.width-4, lifeCanvas.height-4, 0);
      
        const vc = vpnCanvas.getContext('2d');
        vc.clearRect(0,0,vpnCanvas.width,vpnCanvas.height);
        drawVPNShape(vc, 2, 3, vpnCanvas.width-4, vpnCanvas.height-6, 0);
      }
      
      // call once on load, and again if you ever rebuild the Start popup dynamically
      document.addEventListener('DOMContentLoaded', paintLegendIcons);
      // also call when you open the Start overlay (in case of SPA transitions)
      if (elStart) elStart.addEventListener('transitionend', paintLegendIcons);
      
    
      function spawnVPNPowerUp(x, y){ powerUps.push({ x: x - 10, y, w: 20, h: 12, vy: 1.5, glow: 0, type: 'vpn' }); }
      function spawnLifeDiamond(x, y){ powerUps.push({ x: x - 9, y, w: 18, h: 18, vy: 1.25, glow: 0, type: 'life' }); }
    
      function updatePowerUps(dt, frameScale){
        powerUps = powerUps.filter(p => {
          p.y += p.vy * frameScale;
          p.glow = (p.glow + dt * 0.01) % (Math.PI * 2);
          if (p.y > H + 24) return false;
          if (player && player.hp > 0 && rectsOverlap(p, player) && (player.invuln || 0) <= 0){
            if (p.type === 'vpn'){
              inbox = clamp(inbox + 0.6, 0, 1);
              updateCapacity();
              player.invuln = Math.max(player.invuln || 0, 1800);
              setTicker('VPN SHIELD ONLINE  -  INBOX HARDENED');
            } else if (p.type === 'life'){
              let msg = 'LIFE DIAMOND  -  SHIELD BOOST';
              if (player.hp < playerBase.maxHP){
                player.hp = Math.min(playerBase.maxHP, player.hp + 1);
                updateHearts();
                msg = 'LIFE DIAMOND ACQUIRED  -  EXTRA HEART';
                addScore(40);
              } else {
                inbox = clamp(inbox + 0.45, 0, 1);
                updateCapacity();
                addScore(20);
              }
              setTicker(msg);
            }
            return false;
          }
          return true;
        });
      }
    
      function drawPowerUps(){
        for (const p of powerUps){
          const g = p.glow || 0;
          if (p.type === 'life'){
            drawLifeDiamondShape(ctx, p.x, p.y, p.w, p.h, g);
          } else {
            drawVPNShape(ctx, p.x, p.y, p.w, p.h, g);
          }
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000';
      }
    
      function bossFire(dt) {
        if (!boss) return;
        boss.fire -= dt;
        if (boss.fire <= 0) {
          const cx = boss.x + boss.w / 2;
          const cy = boss.y + boss.h;
          const def = boss.def || BOSSES.prince;
          const hpRatio = boss.hp / boss.maxHP;
          let cooldown = clamp(560 - level * 16, 340, 640);
    
          if (boss.type === 'coinlord') {
            const streams = hpRatio > 0.65 ? 3 : hpRatio > 0.35 ? 5 : 6;
            const spreadWidth = boss.w - (hpRatio > 0.35 ? 32 : 20);
            const baseVy = hpRatio > 0.65 ? 2.5 : hpRatio > 0.35 ? 2.9 : 3.3;
            const wobble = hpRatio > 0.35 ? 0.45 : 0.7;
            for (let i = 0; i < streams; i++) {
              const offset = streams === 1 ? 0 : (i / (streams - 1) - 0.5) * spreadWidth;
              enemyBullets.push({
                x: boss.x + boss.w / 2 + offset,
                y: cy - 6,
                size: 12,
                w: 12, h: 12,
                vx: (Math.random() - 0.5) * wobble,
                vy: baseVy + Math.random() * 0.6,
                kind: 'coin',
                color: def.color
              });
            }
            cooldown = hpRatio > 0.65 ? 620 : hpRatio > 0.35 ? 520 : 440;
            boss.fire = cooldown * (boss.fireScale || 1);
            return;
          }
    
          if (boss.type === 'prince') {
            if (hpRatio < 0.2) {
              const spokes = 5;
              for (let i = 0; i < spokes; i++) {
                const angle = (i / spokes) * Math.PI * 2;
                enemyBullets.push({
                  x: cx - 3,
                  y: cy - 3,
                  w: 6, h: 6,
                  vx: Math.cos(angle) * 1.9,
                  vy: Math.sin(angle) * 1.9,
                  kind: 'royalSpark',
                  color: '#ffd24a'
                });
              }
              cooldown = 420;
            } else if (hpRatio < 0.45) {
              const startY = boss.y + boss.h - 10;
              const spawnSeal = (vx) => {
                const seal = createRoyalSeal(cx - 4, startY, vx, 3.1);
                seal.scale = 2;
                enemyBullets.push(seal);
              };
              spawnSeal(-1.0);
              spawnSeal(0);
              spawnSeal(1.0);
              cooldown = 480;
            } else if (hpRatio < 0.75) {
              const startY = boss.y + boss.h - 6;
              const spawnSeal = (vx) => {
                const seal = createRoyalSeal(cx - 4, startY, vx, 2.8);
                seal.scale = 2;
                enemyBullets.push(seal);
              };
              spawnSeal(-0.9);
              spawnSeal(0);
              spawnSeal(0.9);
              cooldown = 500;
            } else {
              const seal = createRoyalSeal(cx - 4, boss.y + boss.h - 6, 0, 2.6);
              seal.scale = 2;
              enemyBullets.push(seal);
              cooldown = 520;
            }
            boss.fire = cooldown * (boss.fireScale || 1);
            return;
          }
    
          switch (def.attack) {
            case 'heartFan': {
              const offsets = [-1, 0, 1];
              offsets.forEach((off, i) => {
                enemyBullets.push({
                  x: cx - 6,
                  y: cy - 6,
                  size: 14,
                  w: 14, h: 14,
                  vx: off * 0.9,
                  vy: 2.6 + i * 0.05,
                  kind: 'heart',
                  color: def.color
                });
              });
              cooldown = 620;
              break;
            }
            case 'aimedShot': {
              if (player) {
                const px = player.x + player.w / 2;
                const py = player.y + player.h / 2;
                const dx = px - cx;
                const dy = py - cy;
                const mag = Math.hypot(dx, dy) || 1;
                const speed = 3.2;
                enemyBullets.push({
                  x: cx - 4,
                  y: cy - 6,
                  w: 8, h: 14,
                  vx: (dx / mag) * speed,
                  vy: (dy / mag) * speed,
                  kind: 'phish',
                  color: def.color
                });
              }
              cooldown = 560;
              break;
            }
            case 'coinRain': {
              const streams = 4;
              for (let i = 0; i < streams; i++) {
                const offset = (i / (streams - 1) - 0.5) * (boss.w - 20);
                enemyBullets.push({
                  x: boss.x + boss.w / 2 + offset,
                  y: cy - 4,
                  size: 12,
                  w: 12, h: 12,
                  vx: (Math.random() - 0.5) * 0.35,
                  vy: 2.6 + Math.random() * 0.6,
                  kind: 'coin',
                  color: def.color
                });
              }
              cooldown = 620;
              break;
            }
            case 'royalSeal': {
              const startY = boss.y + boss.h - 6;
              const base = 2.6 + Math.min(level * 0.1, 1.3);
              const spawnSeal = (vx) => {
                const seal = createRoyalSeal(cx - 4, startY, vx, base);
                seal.scale = 2;
                enemyBullets.push(seal);
              };
              spawnSeal(0);
              spawnSeal(-0.9);
              spawnSeal(0.9);
              cooldown = clamp(500 - level * 14, 320, 520);
              break;
            }
            default: {
              const base = 2.6 + Math.min(level * 0.06, 1.0);
              enemyBullets.push({ x: cx - 2, y: cy, w: 4, h: 10, vy: base, vx: 0, color: def.color, kind: 'spam' });
              enemyBullets.push({ x: cx - 2, y: cy, w: 4, h: 10, vy: base, vx: -1.1, color: def.color, kind: 'spam' });
              enemyBullets.push({ x: cx - 2, y: cy, w: 4, h: 10, vy: base, vx: 1.1, color: def.color, kind: 'spam' });
            }
          }
          boss.fire = cooldown * (boss.fireScale || 1);
        }
      }
    
      function loop(t){
        const dt = Math.min(50, t - lastTime);
        lastTime = t;
    
        // After victory, we only tick the death FX and stop requesting new frames when done
        if (state !== 'play'){
          updateDeathBurst(princeFX, dt);
          if (princeFX && !princeFX.alive) princeFX = null;
          if (princeFX && princeFX.alive){
            render();
            requestAnimationFrame(loop);
          }
          return;
        }
    
        const frameScale = dt / 16.67;
    
        if (keys['ArrowLeft']) player.x -= player.speed * frameScale;
        if (keys['ArrowRight']) player.x += player.speed * frameScale;
        if (keys['Space']) shootPlayer();
        player.cooldown = Math.max(0, player.cooldown - frameScale);
        player.invuln = Math.max(0, (player.invuln || 0) - dt);
        player.x = clamp(player.x, 8, W - 8 - player.w);
    
        for (const b of bullets) b.y += b.vy * frameScale;
        bullets = bullets.filter(b => b.y + b.h > 0);
    
        for (const eb of enemyBullets){
          eb.y += eb.vy * frameScale;
          eb.x += (eb.vx || 0) * frameScale;
          if (eb.kind === 'royalSeal') eb.t = (eb.t || 0) + dt;
          if (eb.y > H - 40) eb.y = H + 999;
        }
        enemyBullets = enemyBullets.filter(eb => eb.y < H + 20);
    
        updatePowerUps(dt, frameScale);
    
        if (swarm.list.length){
          const behaviour = swarm.behaviour || {};
          if (typeof swarm.dir !== 'number' || !swarm.dir) swarm.dir = 1;
          const stepX = swarm.dx * swarm.dir * frameScale;
          let hitEdge = false;
          const clampEnemyX = (enemy) => {
            if (enemy.x <= swarm.leftBound){
              enemy.x = swarm.leftBound;
              hitEdge = true;
            } else if (enemy.x + enemy.w >= swarm.rightBound){
              enemy.x = swarm.rightBound - enemy.w;
              hitEdge = true;
            }
          };
          for (const e of swarm.list){
            if (behaviour.zigzag){
              e.zigzagPhase += (e.zigzagSpeed || 0.045) * dt;
              e.y = e.baseY + Math.sin(e.zigzagPhase) * (e.zigzagAmp || 6);
            }
            e.x += stepX;
            clampEnemyX(e);
            if (behaviour.diagonalDrop){
              e.diagTimer -= dt;
              if (e.diagTimer <= 0){
                const min = (typeof e.diagMin === 'number') ? e.diagMin : 900;
                const max = (typeof e.diagMax === 'number') ? e.diagMax : 1800;
                const span = Math.max(0, max - min);
                e.diagTimer = min + Math.random() * span;
                e.x += 8 * e.diagDir;
                const dropStep = (typeof e.diagStep === 'number') ? e.diagStep : swarm.dropY;
                const floorLimit = player ? (player.y - e.h - 48) : (H - 110);
                const clampLimit = Math.min(floorLimit, e.maxY ?? floorLimit);
                const nextY = Math.min(e.y + dropStep, clampLimit);
                const appliedDrop = Math.max(0, nextY - e.y);
                e.y = nextY;
                e.baseY += appliedDrop;
                if (appliedDrop === 0 && e.y >= clampLimit) {
                  e.baseY = clampLimit;
                }
                e.diagDir *= -1;
                clampEnemyX(e);
              }
            }
            if (e.flash && e.flash > 0) e.flash = Math.max(0, e.flash - dt);
            e.x = clamp(e.x, swarm.leftBound, swarm.rightBound - e.w);
          }
          if (hitEdge){
            swarm.dir *= -1;
            for (const e of swarm.list){
              const floorLimit = player ? (player.y - e.h - 48) : (H - 110);
              const drop = Math.min(swarm.dropY, Math.max(0, floorLimit - e.y));
              e.y += drop;
              e.baseY += drop;
              if (behaviour.zigzag) e.baseY = e.y;
              if (drop === 0 && e.y >= floorLimit){
                e.baseY = floorLimit;
              }
              e.x = clamp(e.x, swarm.leftBound, swarm.rightBound - e.w);
            }
          }
          enemyTryShoot(dt);
        } else if (!boss && !pendingBossSpec){
          showBossIntro(swarm.bossSpec);
        }
    
        if (boss){
          if (boss.approach){
            const step = (boss.descendSpeed || 0.055) * dt;
            boss.y = Math.min(boss.y + step, boss.targetY);
            if (boss.y >= boss.targetY){
              boss.y = boss.targetY;
              boss.approach = false;
              boss.fire = Math.max(boss.fire, 720);
            }
          } else {
            boss.x += boss.speed * boss.dir * frameScale;
            if (boss.x < 16 || boss.x + boss.w > W - 16) boss.dir *= -1;
            bossFire(dt);
          }
          bossFill.style.transform = `scaleX(${boss.hp / boss.maxHP})`;
          boss.hurt = Math.max(0, (boss.hurt || 0) - dt);
        }
    
        if (swarm.list.length && player.hp > 0 && (player.invuln || 0) <= 0){
          for (const e of swarm.list){
            if (rectsOverlap(e, player)){
              forceShieldBreak();
              break;
            }
          }
        }
        if (boss && player.hp > 0 && (player.invuln || 0) <= 0 && rectsOverlap(boss, player)){
          forceShieldBreak();
        }
    
        for (const b of bullets){
          for (const e of swarm.list){
            if (rectsOverlap(b, e)){
              e.hp--;
              b.y = -9999;
              if (e.hp <= 0){
                if (!e.lifeDropped){
                  e.lifeDropped = true;
                  spawnLifeDiamond(e.x + e.w/2, e.y + e.h/2);
                }
                e.dead = true;
                if (currentEntry && currentEntry.id === 2 && Math.random() < 0.12){
                  spawnVPNPowerUp(e.x + e.w/2, e.y);
                }
                addScore(20);
              }
            }
          }
          if (boss && rectsOverlap(b, boss)){
            boss.hp--;
            b.y = -9999;
            boss.hurt = 160;
            addScore(5);
            refreshBossHUD();
          }
        }
        swarm.list = swarm.list.filter(e => !e.dead);
    
        for (const eb of enemyBullets){
          if (rectsOverlap(eb, player) && (player.invuln || 0) <= 0){
            eb.y = H + 999;
            damageInbox(0.34);
          }
        }
    
        if (boss && boss.hp <= 0){
          clearBossIntro();
          const defeatedBoss = boss;
    
          if (defeatedBoss.type === 'prince'){
            // FINAL VICTORY — end the run, show apocalyptic-office message, stop loop after FX
            princeFX = spawnPrinceDeathBurst(defeatedBoss.x + defeatedBoss.w/2, defeatedBoss.y + defeatedBoss.h/2, 3);
            boss = null;
            hideBossUI();
            state = 'victory';
    
            if (btnNext) btnNext.style.display = 'none';
            elCleared.querySelector('h1').textContent = `[ INBOX PURGED ]`;
            elCleared.querySelector('p').innerHTML =
              "The fluorescent sun flickers. The HR printer screams once, then sleeps. " +
              "Calendar invites pass overhead like sirens and keep going. " +
              "The last <em>URGENT WIRE TRANSFER</em> evaporates into office ozone. " +
              "You sip cold coffee. It tastes like <strong>victory</strong>.<br><br>" +
              "Press <kbd>Enter</kbd> to clock back in.";
            elCleared.style.display = 'flex';
    
            setTicker('ZERO UNREAD  -  COFFEE RESERVES CRITICALLY LOW');
            return;
          }
    
          // Non-final bosses: keep the interstitial but make it linger longer
          boss = null;
          hideBossUI();
          state = 'interstitial';
          elCleared.querySelector('h1').textContent = `[ INBOX SECURED ]`;
          elCleared.querySelector('p').textContent = 'Threat neutralized. System rebooting..';
          elCleared.style.display = 'flex';
          setTicker('INBOX SECURED  -  SYSTEM REBOOTING');
          const currentLevel = level;
          setTimeout(() => {
            if (state === 'interstitial' && currentLevel === level){
              nextLevel();
            }
          }, INTERSTITIAL_MS); // <-- longer readability window
          return;
        }
    
        if (inbox <= 0 || player.hp <= 0){
          triggerGameOver();
          return;
        }
    
        updateDeathBurst(princeFX, dt);
        if (princeFX && !princeFX.alive) princeFX = null;
    
        render();
        requestAnimationFrame(loop);
      }
    
      function nextLevel(){
        elCleared.style.display='none';
        level++;
        continueNextLevel();
      }
    
      function clear(){ ctx.fillStyle='#020409'; ctx.fillRect(0,0,W,H); }
      function drawPlayer(){
        ctx.fillStyle = '#6dff97';
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.fillRect(player.x+player.w/2-3, player.y-6, 6, 6);
      }
      function drawSwarm(){
        for (const e of swarm.list){
          const flashing = e.flash && e.flash > 0;
          ctx.fillStyle = flashing ? '#ff5d5d' : e.color;
          ctx.fillRect(e.x, e.y, e.w, e.h);
          ctx.fillStyle = flashing ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)';
          ctx.fillRect(e.x + 3, e.y + 3, e.w - 6, e.h - 6);
    
          if (e.courier){
            ctx.fillStyle = '#ffe6b5';
            ctx.fillRect(e.x + 6, e.y + 4, e.w - 12, e.h - 10);
            ctx.strokeStyle = '#d46a1f';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(e.x + 6, e.y + 4);
            ctx.lineTo(e.x + e.w / 2, e.y + e.h / 2);
            ctx.lineTo(e.x + e.w - 6, e.y + 4);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        }
        ctx.strokeStyle = '#000';
      }
      function drawBoss(animTime){
        if (!boss) return;
    
        if (boss.type === 'prince'){
          renderPrinceBoss32(ctx, boss, animTime, boss.hurt || 0, 3);
          return;
        }
    
        const spriteOk = renderCharBoss(ctx, boss, animTime);
        if (spriteOk) return;
    
        const def = boss.def || {};
        const x = boss.x, y = boss.y, w = boss.w, h = boss.h;
        ctx.fillStyle = boss.color || '#ffd24a';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = boss.accent || '#0f1a1f';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000';
      }
    
      function drawBullets(){ ctx.fillStyle = '#ff6b6b'; for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h); }
      function drawEnemyBullets(){
        for (const eb of enemyBullets){
          switch (eb.kind){
            case 'royalSeal': drawRoyalSeal(ctx, eb, eb.scale || 2); break;
            case 'heart':     drawHeartProjectile(ctx, eb); break;
            case 'coin':      drawCoinProjectile(ctx, eb); break;
            case 'phish':     drawPhishProjectile(ctx, eb); break;
            case 'spread':    drawSpreadProjectile(ctx, eb); break;
            case 'royalSpark': ctx.fillStyle = eb.color || '#ffd24a'; ctx.fillRect(eb.x, eb.y, eb.w || 6, eb.h || 6); break;
            default:          ctx.fillStyle = eb.color || '#9ad0ff'; ctx.fillRect(eb.x, eb.y, eb.w, eb.h);
          }
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000';
        ctx.globalAlpha = 1;
      }
    
      function render(){
        clear();
        const animTime = performance.now();
        drawSwarm();
        drawBoss(animTime);
        drawPowerUps();
        drawEnemyBullets();
        drawBullets();
        drawPlayer();
        if (princeFX && princeFX.alive) drawDeathBurst(ctx, princeFX);
        ctx.fillStyle = 'rgba(109,255,151,.1)';
        ctx.fillRect(0, player.y + player.h + 2, W, 1);
      }
    })();
