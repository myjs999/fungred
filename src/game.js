// Fungred 规则引擎 —— 1:1 移植自原版 GameManager.cs / AsheroController.cs / SummonJadeController.cs
// 逻辑与表现分离：规则函数只改状态并向 fxQueue 推送表现事件，由 main.js 顺序播放。

import { HEROES, JADES } from './data.js';

export const fxQueue = [];
const fx = {
  bullet(from, to, color) { fxQueue.push({ t: 'bullet', from, to, color }); },
  hp(h, val) { fxQueue.push({ t: 'hpdec', h, val }); },
  show(h, text, color = '#ffffff', ms = 1100) { fxQueue.push({ t: 'show', h, text, color, ms }); },
  die(h) { fxQueue.push({ t: 'die', h }); },
  summon(h) { fxQueue.push({ t: 'summon', h }); },
  attack(sub, ob, dec, color) { this.bullet(sub, ob, color); this.hp(ob, dec); },
};

let nextUid = 1;

export const game = {
  turn: 0,
  over: false,
  overWinner: -1, // 0 你赢 / 1 敌方赢
  you: null,
  ene: null,
};

export const LANES = 4;      // 战线数
export const LANE_CAP = 1;   // 每条战线最多英雄数

function makeSide(side) {
  return { side, pts: 5, lanes: Array.from({ length: LANES }, () => []), base: null, jades: [] };
}

export function sideOf(h) { return h.side === 0 ? game.you : game.ene; }
export function foeOf(h) { return h.side === 0 ? game.ene : game.you; }

export function allHeroes(sideObj) {
  return sideObj.lanes.flat();
}

export function opposite(h) {
  if (h.isBase) return null;
  const l = foeOf(h).lanes[h.lane];
  return l.length ? l[0] : null;
}

export function createHero(defId, side, lane, jade) {
  const def = HEROES[defId];
  const list = (side === 0 ? game.you : game.ene).lanes[lane];
  const h = {
    uid: nextUid++, defId, def, name: def.name, kei: def.kei, side, lane, jd: list.length,
    isBase: false,
    hp: def.hp, hpShow: def.hp, gp: def.gp, fp: def.fp,
    oriCosts: [...def.costs], costs: [...def.costs],
    usableA: 1, usable: [1, 1, 1],
    addgp: 0, addfp: 0, addgpPrep: 0, addfpPrep: 0,
    mpToAdd: [], sacrifice: null, dead: false, stacks: 0,
    jade: jade || null,
    exp: jade ? jade.exp : 0,
    maxexp: jade ? jade.maxexp : 0,
    mp: 0,
  };
  h.mp = h.maxexp;
  list.push(h);
  return h;
}

function makeBase(side) {
  return {
    uid: nextUid++, defId: null, def: null,
    name: side === 0 ? '我方基地' : '敌方基地',
    kei: null, side, lane: -1, jd: 0, isBase: true,
    hp: 150, hpShow: 150, gp: 0, fp: 0, // 300→150：把对局压进约15回合
    oriCosts: [0, 0, 0], costs: [0, 0, 0],
    usableA: 0, usable: [0, 0, 0],
    addgp: 0, addfp: 0, addgpPrep: 0, addfpPrep: 0,
    mpToAdd: [], sacrifice: null, dead: false, jade: null,
    exp: 0, maxexp: 0, mp: 0,
  };
}

export function initGame() {
  game.turn = 0;
  game.over = false;
  game.overWinner = -1;
  game.you = makeSide(0);
  game.ene = makeSide(1);
  game.you.base = makeBase(0);
  game.ene.base = makeBase(1);
  game.you.jades = JADES.map((j, i) => ({
    idx: i, defId: j.hero, def: HEROES[j.hero],
    oriCost: j.cost, cost: j.cost,
    cool: 0, deadTimes: 0, exp: 0, maxexp: 0,
  }));
}

// ---------- 伤害与死亡 ----------

export function realDamage(h, dmg) { // 返回溢出量
  h.hp -= dmg;
  return h.hp <= 0 ? -h.hp : 0;
}

export function damage(h, dmg) { // 穿透防御的部分造成真实伤害
  if (dmg > h.fp) return realDamage(h, dmg - h.fp);
  return 0;
}

export function checkDie(h) {
  if (h.hp <= 0) die(h);
}

export function die(h) {
  // 「一隅天涯」：以雪莉之死代替（标记本回合不清除 => 本回合近乎不死，忠实原版）
  if (h.sacrifice && h.sacrifice !== h) {
    h.hp = 10;
    fx.show(h, '已复活', '#9fd8ff', 1400);
    dieForReal(h.sacrifice);
    return;
  }
  if (h.sacrifice === h) h.sacrifice = null; // 原版此处会死循环，兜底
  dieForReal(h);
}

function dieForReal(h) {
  if (h.dead) return;
  h.dead = true;
  const line = (!h.isBase && h.def && h.def.lines) ? '「' + h.def.lines.die + '」' : 'Sayonara ~';
  fx.show(h, line, '#dfe4ff', 1600);
  fx.die(h);
}

// 死亡动画播完后由 main.js 调用：真正移除 + 召唤玉回收
export function heroDieCleanup(h) {
  if (h.isBase) {
    game.over = true;
    game.overWinner = 1 - h.side;
    return;
  }
  const list = sideOf(h).lanes[h.lane];
  const idx = list.indexOf(h);
  if (idx >= 0) {
    list.splice(idx, 1);
    list.forEach((x, i) => { x.jd = i; });
  }
  if (h.side === 0 && h.jade) {
    const j = h.jade;
    j.deadTimes++;
    j.cool = 3 + j.deadTimes - 1;
    j.cost += j.oriCost;   // 每死一次，费用增加一份原价
    j.exp = h.exp;         // 经验由玉保留
    j.maxexp = h.maxexp;
  }
}

// ---------- 回合阶段 ----------

export function gainExp(h, a) {
  h.exp += a;
  while (h.exp > h.maxexp) { h.exp -= h.maxexp; h.maxexp++; }
}

export function preparePhase(h) {
  h.usableA = 1; h.usable = [1, 1, 1];
  h.mp = h.maxexp;
  h.costs = [...h.oriCosts];
  if (h.mpToAdd.length > 0) {
    const preview = [...h.mpToAdd];
    const first = h.mpToAdd.shift();
    h.mp += first;
    let s = 'MP + [' + preview[0] + ']';
    if (preview.length > 1) s += ',' + preview.slice(1).join(',');
    fx.show(h, s, '#5b8cff', 1600);
  }
  h.gp -= h.addgpPrep; h.addgpPrep = 0;
  h.fp -= h.addfpPrep; h.addfpPrep = 0;
  h.sacrifice = null;
}

export function endPhase(h) {
  h.gp -= h.addgp; h.fp -= h.addfp;
  h.addgp = 0; h.addfp = 0;
  h.costs = [...h.oriCosts];
}

// ---------- 战斗 ----------

const SIDE_BULLET = [0x8b9cff, 0xff5265]; // 我方 / 敌方弹道色

export function attack(sub, ob) {
  if (sub.gp > ob.fp) {
    const d = sub.gp - ob.fp;
    ob.hp -= d;
    fx.attack(sub, ob, d, SIDE_BULLET[sub.side]);
    checkDie(ob);
    sub.usableA--;
    return true;
  }
  return false;
}

export function castSkill(defId, cmd, sub, ob) {
  if (defId === 'Licott') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '悠扬之箭', '#ff5265');
      ob.hp -= 2; // 真实伤害
      fx.attack(sub, ob, 2, 0xff5265);
      checkDie(ob);
    } else if (cmd === 'S2') {
      fx.show(sub, '猎物锁定', '#ff5265');
      sub.usable[1]--; sub.mp -= sub.costs[1];
      sub.usableA++;
      let ok = attack(sub, ob);
      if (ok) {
        sub.usableA++;
        ok = attack(sub, ob);
        if (ok) { sub.usableA++; attack(sub, ob); }
      }
    } else if (cmd === 'S3') {
      fx.show(sub, '不渝之心', '#ff5265');
      // 原版特性：不消耗自身使用次数，只扣魔力
      sub.mp -= sub.costs[2];
      ob.usable = [1, 1, 1];
      fx.show(ob, '技能已全部恢复', '#f6c445');
    }
  } else if (defId === 'Faros') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '魔法涨落', '#5b8cff');
      const plan = [1, 2, 1];
      for (let i = 0; i < 3; i++) {
        if (sub.mpToAdd.length < i + 1) sub.mpToAdd.push(plan[i]);
        else sub.mpToAdd[i] += plan[i];
      }
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '魔力友谊', '#5b8cff');
      ob.mp += sub.mp;
      sub.mp = 0;
      sub.addgp += ob.gp; sub.gp += ob.gp;
      fx.show(sub, 'ATK + ' + ob.gp, '#e0913c');
    } else if (cmd === 'S3') {
      fx.show(sub, '魔能大炮', '#5b8cff');
      sub.usable[2]--; sub.mp -= sub.costs[2];
      const dec = Math.max(0, 10 - ob.fp);
      const over = damage(ob, 10);
      fx.attack(sub, ob, dec, 0x5b8cff);
      checkDie(ob);
      if (over > 0) {
        const dbase = foeOf(sub).base;
        dbase.hp -= over;
        fx.attack(sub, dbase, over, 0x5b8cff);
        checkDie(dbase);
      }
      sub.costs = [0, 0, 0];
      fx.show(sub, 'Strengthened', '#f6c445');
    }
  } else if (defId === 'Milanky') {
    if (cmd === 'S1') {
      fx.show(sub, '五色花', '#4ade80');
      sub.usable[0]--; sub.mp -= sub.costs[0];
      if (ob.fp < 4) {
        const d = 4 - ob.fp;
        ob.hp -= d;
        fx.attack(sub, ob, d, 0x4ade80);
        checkDie(ob);
      }
      sub.hp++;
      fx.show(sub, 'HP + 1', '#4ade80');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      ob.addfpPrep += 2; ob.fp += 2;
      fx.show(ob, 'DEF + 2', '#3c9ce0');
    } else if (cmd === 'S3') {
      fx.show(sub, '夏日莲', '#4ade80');
      sub.usable[2]--; sub.mp -= sub.costs[2];
      ob.costs = ob.costs.map(c => c - 1);
      fx.show(ob, '技能消耗 -1', '#f6c445');
    }
  } else if (defId === 'Vagro') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '北方锻造', '#f6c445');
      ob.addgpPrep += 1; ob.gp += 1;
      ob.addfpPrep += 1; ob.fp += 1;
      fx.show(ob, '+1 ATK +1 DEF', '#f6c445');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '哇！这是糖浆吗？', '#f6c445');
      for (const t of allHeroes(foeOf(sub))) {
        const dec = Math.max(0, 5 - t.fp);
        damage(t, 5);
        fx.attack(sub, t, dec, 0xf6c445);
        checkDie(t);
      }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '饱和防御', '#f6c445');
      ob.addfpPrep += 4; ob.fp += 4;
      fx.show(ob, '+4 DEF', '#f6c445');
      const opp = opposite(ob);
      if (opp) {
        const dec = Math.max(0, 8 - opp.fp);
        damage(opp, 8);
        fx.attack(sub, opp, dec, 0xf6c445);
        checkDie(opp);
      }
    }
  } else if (defId === 'Orwen') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '荆棘缠绕', '#a3e635');
      ob.addgpPrep -= 2; ob.gp -= 2;
      fx.show(ob, 'ATK - 2', '#a3e635');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '木灵庇护', '#a3e635');
      ob.hp += 4;
      ob.addfpPrep += 1; ob.fp += 1;
      fx.show(ob, 'HP + 4  DEF + 1', '#a3e635', 1400);
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '千棘绽放', '#a3e635');
      for (const t of allHeroes(foeOf(sub))) {
        t.hp -= 3; // 真实伤害
        fx.attack(sub, t, 3, 0xa3e635);
        checkDie(t);
      }
    }
  } else if (defId === 'Vermeil') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      sub.stacks++;
      fx.show(sub, '星轨 ×' + sub.stacks, '#b388ff');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '引力汲取', '#b388ff');
      const steal = Math.min(2, Math.max(0, ob.mp));
      ob.mp -= steal; sub.mp += steal;
      fx.show(ob, 'MP - ' + steal, '#b388ff');
      fx.show(sub, 'MP + ' + steal, '#b388ff');
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '坠星', '#b388ff', 1400);
      const dmg = 6 + 3 * sub.stacks;
      sub.stacks = 0;
      const dec = Math.max(0, dmg - ob.fp);
      const over = damage(ob, dmg);
      fx.attack(sub, ob, dec, 0xb388ff);
      checkDie(ob);
      if (over > 0) {
        const dbase = foeOf(sub).base;
        dbase.hp -= over;
        fx.attack(sub, dbase, over, 0xb388ff);
        checkDie(dbase);
      }
    }
  } else if (defId === 'Kulom') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      sub.addgp += 2; sub.gp += 2;
      fx.show(sub, '装填  ATK + 2', '#ff8a3c');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '轰击', '#ff8a3c');
      const b = foeOf(sub).base;
      b.hp -= sub.gp;
      fx.attack(sub, b, sub.gp, 0xff8a3c);
      checkDie(b);
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '过载弹头', '#ff8a3c');
      const dec = Math.max(0, 10 - ob.fp);
      damage(ob, 10);
      fx.attack(sub, ob, dec, 0xff8a3c);
      checkDie(ob);
      sub.hp -= 3;
      fx.hp(sub, 3);
      checkDie(sub);
    }
  } else if (defId === 'Tio') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      sideOf(sub).pts += 1;
      fx.show(sub, '新芽  召唤点 + 1', '#63e0c2', 1400);
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '回甘', '#63e0c2');
      ob.mp += 2;
      fx.show(ob, 'MP + 2', '#63e0c2');
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '春宴', '#63e0c2', 1400);
      for (const t of allHeroes(sideOf(sub))) {
        t.hp += 3; t.mp += 1;
        if (t !== sub) fx.show(t, 'HP+3 MP+1', '#63e0c2');
      }
    }
  } else if (defId === 'Nocti') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '蛾翼斩', '#d946ef');
      sub.usableA++;
      attack(sub, ob);
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '磷粉', '#d946ef');
      const d = ob.fp;
      ob.fp -= d; ob.addfpPrep -= d;
      fx.show(ob, 'DEF → 0', '#d946ef', 1400);
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '无声猎杀', '#d946ef', 1400);
      if (ob.hp < 8) {
        const d = Math.max(0, ob.hp);
        ob.hp = 0;
        fx.attack(sub, ob, d, 0xd946ef);
      } else {
        const dec = Math.max(0, 5 - ob.fp);
        damage(ob, 5);
        fx.attack(sub, ob, dec, 0xd946ef);
      }
      checkDie(ob);
    }
  } else if (defId === 'Shirley') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '寒天热粥', '#9fd8ff');
      ob.hp += 2;
      fx.show(ob, 'HP + 2', '#9fd8ff');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '雪之祈愿', '#9fd8ff');
      const t = sub.mp;
      sub.mp = 0;
      ob.addfpPrep += t; ob.fp += t;
      fx.show(ob, 'DEF + ' + t, '#9fd8ff', 1400);
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      ob.sacrifice = sub;
      fx.show(ob, '?', '#9fd8ff', 1400);
      fx.show(sub, '一隅天涯', '#9fd8ff');
    }
  }
}

// ---------- 敌方 AI v2：按局势选线选人，每个英雄有自己的连招 ----------

const AI_POOL = ['Licott', 'Faros', 'Milanky', 'Vagro', 'Shirley', 'Orwen', 'Vermeil', 'Kulom', 'Tio', 'Nocti'];

function pickWeighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [id, w] of pairs) { r -= w; if (r <= 0) return id; }
  return pairs[pairs.length - 1][0];
}

function aiSummonPhase() {
  let summoned = 0;
  while (summoned < 2) { // 每回合最多召两个
    const empty = [];
    for (let l = 0; l < LANES; l++) if (game.ene.lanes[l].length < LANE_CAP) empty.push(l);
    if (!empty.length) break;
    // 选线：优先堵住对面攻击力最高的玩家英雄；全空则随机
    let lane = empty[0], best = -1;
    for (const l of empty) {
      const opp = game.you.lanes[l][0];
      const score = opp ? opp.gp : -1;
      if (score > best) { best = score; lane = l; }
    }
    if (best < 0) lane = empty[Math.floor(Math.random() * empty.length)];
    const opp = game.you.lanes[lane][0];
    // 选人：对面高攻→坦克；对面残血→刺客；空线→攻城/输出；否则加权随机
    let id;
    if (opp && opp.gp >= 5) id = 'Orwen';
    else if (opp && opp.hp <= 8) id = 'Nocti';
    else if (!opp) id = pickWeighted([['Kulom', 45], ['Licott', 30], ['Vermeil', 25]]);
    else id = pickWeighted([['Licott', 28], ['Nocti', 15], ['Vagro', 15], ['Vermeil', 14], ['Milanky', 10], ['Orwen', 8], ['Tio', 6], ['Shirley', 4]]);
    if (game.ene.pts < HEROES[id].cost) {
      const afford = AI_POOL.filter(p => HEROES[p].cost <= game.ene.pts);
      if (!afford.length) break;
      id = afford[Math.floor(Math.random() * afford.length)];
    }
    game.ene.pts -= HEROES[id].cost;
    const h = createHero(id, 1, lane, null);
    fx.summon(h);
    summoned++;
  }
}

function aiMostHurtAlly() {
  let best = null, worst = 1;
  for (const t of allHeroes(game.ene)) {
    const r = t.hp / t.def.hp;
    if (t.hp > 0 && r < worst) { worst = r; best = t; }
  }
  return worst < 1 ? best : null;
}

function aiUseSkills(sub) {
  const u = () => sub.usable;
  const opp = () => { const o = opposite(sub); return o && o.hp > 0 ? o : null; };
  const targetOrBase = () => opp() || game.you.base;
  switch (sub.defId) {
    case 'Licott': { // 原版连招保留
      const ob = targetOrBase();
      for (;;) {
        if (sub.mp >= 2) castSkill('Licott', 'S2', sub, ob);
        if (sub.mp >= 1) castSkill('Licott', 'S1', sub, ob);
        else break;
        if (sub.mp >= 4) castSkill('Licott', 'S3', sub, sub);
      }
      break;
    }
    case 'Orwen': {
      const o = opp();
      if (u()[0] > 0 && sub.mp >= sub.costs[0] && o) castSkill('Orwen', 'S1', sub, o);
      const hurt = aiMostHurtAlly();
      if (u()[1] > 0 && sub.mp >= sub.costs[1] && hurt) castSkill('Orwen', 'S2', sub, hurt);
      if (u()[2] > 0 && sub.mp >= sub.costs[2] && allHeroes(game.you).length >= 3) castSkill('Orwen', 'S3', sub, null);
      break;
    }
    case 'Vermeil': {
      const o = opp();
      if (u()[1] > 0 && sub.mp >= sub.costs[1] && o && o.mp > 0) castSkill('Vermeil', 'S2', sub, o);
      if (u()[2] > 0 && sub.mp >= sub.costs[2] && sub.stacks >= 2) castSkill('Vermeil', 'S3', sub, targetOrBase());
      if (u()[0] > 0 && sub.mp >= sub.costs[0]) castSkill('Vermeil', 'S1', sub, null);
      break;
    }
    case 'Kulom': {
      if (u()[0] > 0 && sub.mp >= sub.costs[0] + sub.costs[1]) castSkill('Kulom', 'S1', sub, null);
      if (u()[1] > 0 && sub.mp >= sub.costs[1]) castSkill('Kulom', 'S2', sub, null);
      const o = opp();
      if (u()[2] > 0 && sub.mp >= sub.costs[2] && o) castSkill('Kulom', 'S3', sub, o);
      break;
    }
    case 'Tio': {
      if (u()[0] > 0) castSkill('Tio', 'S1', sub, null);
      const hurtCount = allHeroes(game.ene).filter(t => t.hp < t.def.hp).length;
      if (u()[2] > 0 && sub.mp >= sub.costs[2] && hurtCount >= 2) castSkill('Tio', 'S3', sub, null);
      if (u()[1] > 0 && sub.mp >= sub.costs[1]) {
        let best = null;
        for (const t of allHeroes(game.ene)) if (t !== sub && (!best || t.gp > best.gp)) best = t;
        if (best) castSkill('Tio', 'S2', sub, best);
      }
      break;
    }
    case 'Nocti': {
      const o = opp();
      if (o && u()[2] > 0 && sub.mp >= sub.costs[2] && o.hp < 8) castSkill('Nocti', 'S3', sub, o);
      const o2 = opp();
      if (o2 && u()[1] > 0 && sub.mp >= sub.costs[1] && o2.fp > 0) castSkill('Nocti', 'S2', sub, o2);
      if (u()[0] > 0 && sub.mp >= sub.costs[0]) castSkill('Nocti', 'S1', sub, targetOrBase());
      break;
    }
    case 'Vagro': {
      if (u()[1] > 0 && sub.mp >= sub.costs[1] && allHeroes(game.you).length >= 2) castSkill('Vagro', 'S2', sub, null);
      if (u()[0] > 0 && sub.mp >= sub.costs[0]) castSkill('Vagro', 'S1', sub, sub);
      if (u()[2] > 0 && sub.mp >= sub.costs[2]) castSkill('Vagro', 'S3', sub, sub);
      break;
    }
    case 'Milanky': {
      const o = opp();
      if (u()[0] > 0 && sub.mp >= sub.costs[0] && o && o.kei !== 'mahou') castSkill('Milanky', 'S1', sub, o);
      const hurt = aiMostHurtAlly();
      if (u()[1] > 0 && sub.mp >= sub.costs[1] && hurt && hurt.kei !== 'kikai') castSkill('Milanky', 'S2', sub, hurt);
      break;
    }
    case 'Shirley': {
      const hurt = aiMostHurtAlly();
      if (u()[0] > 0 && hurt) castSkill('Shirley', 'S1', sub, hurt);
      let guard = null;
      for (const t of allHeroes(game.ene)) if (t !== sub && !t.sacrifice && (!guard || t.gp > guard.gp)) guard = t;
      if (u()[2] > 0 && guard) castSkill('Shirley', 'S3', sub, guard);
      if (u()[1] > 0 && sub.mp > 0) {
        const front = allHeroes(game.ene).find(t => t !== sub && opposite(t)) || guard;
        if (front) castSkill('Shirley', 'S2', sub, front);
      }
      break;
    }
    case 'Faros': {
      if (u()[0] > 0 && sub.mp >= sub.costs[0] && sub.mp < 5) castSkill('Faros', 'S1', sub, null);
      if (u()[2] > 0 && sub.mp >= sub.costs[2]) castSkill('Faros', 'S3', sub, targetOrBase());
      break;
    }
  }
}

export function runEnemyTurnAndPrepare() {
  // 你的结束阶段
  for (const h of allHeroes(game.you)) endPhase(h);

  // 敌方准备阶段
  for (const h of allHeroes(game.ene)) { gainExp(h, 1); preparePhase(h); }
  if (game.turn > 0) game.ene.pts += 2;

  // 敌方主要阶段：召唤
  aiSummonPhase();

  // 敌方战斗阶段：先放技能再普攻（利科特保留原版"普攻后连招"）
  for (let lane = 0; lane < LANES; lane++) {
    for (const sub of [...game.ene.lanes[lane]]) {
      if (sub.hp <= 0) continue;
      const ob = opposite(sub) || game.you.base;
      if (sub.defId === 'Licott') {
        attack(sub, ob);
        aiUseSkills(sub);
      } else {
        aiUseSkills(sub);
        if (sub.hp > 0 && sub.usableA > 0) {
          const ob2 = opposite(sub) || game.you.base;
          attack(sub, ob2);
        }
      }
    }
  }

  // 敌方结束阶段
  for (const h of allHeroes(game.ene)) endPhase(h);

  game.turn++;

  // 你的准备阶段
  for (const h of allHeroes(game.you)) { gainExp(h, 1); preparePhase(h); }
  game.you.pts += 2 + Math.floor(game.turn / 10);
  for (const j of game.you.jades) if (j.cool > 0) j.cool--;
}

// ---------- 玩家操作入口（校验规则移植自 HeroUISelectAsTarget） ----------

// 返回 null 表示可行，否则返回警告文案
export function validateTarget(sub, cmd, ob) {
  // 通用：己方战线对面有敌人时，不能直击敌方基地
  if (ob.isBase && ob.side !== sub.side && opposite(sub)) {
    return '对面有敌方角色阻挡，无法选择敌方基地';
  }
  if (cmd === 'A') return null;
  const id = sub.defId;
  const allyHero = ob.side === sub.side && !ob.isBase;
  const foeHero = ob.side !== sub.side && !ob.isBase;
  if (id === 'Licott' && cmd === 'S3' && ob.kei !== 'seimei' && ob.kei !== 'mahou') {
    return '目标必须是生命系或魔法系';
  }
  if (id === 'Faros' && cmd === 'S2') {
    if (!allyHero) return '目标必须是友方英雄';
    if (ob === sub) return '不能选择自己';
  }
  if (id === 'Milanky' && cmd === 'S1' && ob.kei === 'mahou') {
    return '目标不能是魔法系';
  }
  if (id === 'Milanky' && cmd === 'S2' && (!allyHero || ob.kei === 'kikai')) {
    return '目标必须是友方非机械系英雄';
  }
  if (id === 'Vagro' && (cmd === 'S1' || cmd === 'S3') && !allyHero) {
    return '目标必须是友方英雄';
  }
  if (id === 'Shirley' && (cmd === 'S2' || cmd === 'S3') && !allyHero) {
    return '目标必须是友方英雄';
  }
  if (id === 'Shirley' && cmd === 'S3' && ob === sub) {
    return '雪莉不能守护自己';
  }
  if (id === 'Orwen' && cmd === 'S1' && !foeHero) {
    return '目标必须是敌方英雄';
  }
  if (id === 'Orwen' && cmd === 'S2' && !allyHero) {
    return '目标必须是友方英雄';
  }
  if (id === 'Vermeil' && cmd === 'S2' && !foeHero) {
    return '目标必须是敌方英雄';
  }
  if (id === 'Tio' && cmd === 'S2' && !allyHero) {
    return '目标必须是友方英雄';
  }
  if (id === 'Nocti' && cmd === 'S2' && !foeHero) {
    return '目标必须是敌方英雄';
  }
  return null;
}

export function playerSummon(jade, lane) {
  game.you.pts -= jade.cost;
  jade.cool = -1; // 出战中
  const h = createHero(jade.defId, 0, lane, jade);
  fx.summon(h);
  return h;
}
