// Fungred 规则引擎 —— 前五人 1:1 移植自原版 GameManager.cs / AsheroController.cs / SummonJadeController.cs；
// 后五人、召唤战术牌与物品卡按 Illustrator 设计稿 fungred3.0.ai 实装。
// 逻辑与表现分离：规则函数只改状态并向 fxQueue 推送表现事件，由 main.js 顺序播放。

import { HEROES, JADES, CARDS, DECK_LIST, HAND_START, HAND_LIMIT } from './data.js';

export const fxQueue = [];
const fx = {
  bullet(from, to, color) { fxQueue.push({ t: 'bullet', from, to, color }); },
  hp(h, val) { fxQueue.push({ t: 'hpdec', h, val }); },
  show(h, text, color = '#ffffff', ms = 1100) { fxQueue.push({ t: 'show', h, text, color, ms }); },
  die(h) { fxQueue.push({ t: 'die', h }); },
  summon(h) { fxQueue.push({ t: 'summon', h }); },
  peek(side, ids) { fxQueue.push({ t: 'peek', side, ids }); },
  attack(sub, ob, dec, color) { this.bullet(sub, ob, color); this.hp(ob, dec); },
};

let nextUid = 1, nextCardUid = 1;

export const game = {
  turn: 0,
  over: false,
  overWinner: -1, // 0 你赢 / 1 敌方赢
  you: null,
  ene: null,
  lastDiscards: [], // 玩家本回合结束时因手牌上限被弃掉的牌
};

export const LANES = 4;      // 战线数
export const LANE_CAP = 1;   // 每条战线最多英雄数

function makeSide(side) {
  return {
    side, pts: 5, lanes: Array.from({ length: LANES }, () => []), base: null, jades: [],
    deck: [], hand: [], discard: [], handLimit: HAND_LIMIT, ptsNext: 0, freeSummon: 0,
  };
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

function heroState() {
  return {
    addgp: 0, addfp: 0, addgpPrep: 0, addfpPrep: 0,
    mpToAdd: [], sacrifice: null, dead: false,
    marks: 0, pierce: 0, tiangong: false, skillsUsed: 0, sealed: false, mpDrain: 0, noExpNext: false,
  };
}

export function createHero(defId, side, lane, jade) {
  const def = HEROES[defId];
  const list = (side === 0 ? game.you : game.ene).lanes[lane];
  const h = Object.assign({
    uid: nextUid++, defId, def, name: def.name, kei: def.kei, side, lane, jd: list.length,
    isBase: false,
    hp: def.hp, hpShow: def.hp, gp: def.gp, fp: def.fp,
    oriCosts: [...def.costs], costs: [...def.costs],
    usableA: 1, usable: [1, 1, 1],
    jade: jade || null,
    exp: jade ? jade.exp : 0,
    maxexp: jade ? jade.maxexp : 0,
    mp: 0,
  }, heroState());
  h.mp = h.maxexp;
  list.push(h);
  return h;
}

function makeBase(side) {
  return Object.assign({
    uid: nextUid++, defId: null, def: null,
    name: side === 0 ? '我方基地' : '敌方基地',
    kei: null, side, lane: -1, jd: 0, isBase: true,
    hp: 150, hpShow: 150, gp: 0, fp: 0, // 300→150：把对局压进约15回合
    oriCosts: [0, 0, 0], costs: [0, 0, 0],
    usableA: 0, usable: [0, 0, 0], jade: null,
    exp: 0, maxexp: 0, mp: 0,
  }, heroState());
}

export function initGame() {
  game.turn = 0;
  game.over = false;
  game.overWinner = -1;
  game.lastDiscards = [];
  game.you = makeSide(0);
  game.ene = makeSide(1);
  game.you.base = makeBase(0);
  game.ene.base = makeBase(1);
  game.you.jades = JADES.map((j, i) => ({
    idx: i, defId: j.hero, def: HEROES[j.hero],
    oriCost: j.cost, cost: j.cost,
    cool: 0, deadTimes: 0, exp: 0, maxexp: 0,
  }));
  for (const s of [game.you, game.ene]) {
    s.deck = shuffle([...DECK_LIST]);
    drawCards(s, HAND_START);
  }
}

// ---------- 牌库 ----------

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillDeck(s) {
  if (s.deck.length === 0 && s.discard.length) {
    s.deck = shuffle(s.discard);
    s.discard = [];
  }
}

export function drawCards(s, n) {
  for (let i = 0; i < n; i++) {
    refillDeck(s);
    if (!s.deck.length) break;
    s.hand.push({ uid: nextCardUid++, id: s.deck.pop() });
  }
}

const countInHand = (s, id) => s.hand.filter(c => c.id === id).length;

// 超出手牌上限时，先弃最早获得的非被动牌，再弃被动牌
function enforceHandLimit(s) {
  const out = [];
  while (s.hand.length > s.handLimit) {
    let i = s.hand.findIndex(c => !CARDS[c.id].passive);
    if (i < 0) i = 0;
    const [c] = s.hand.splice(i, 1);
    s.discard.push(c.id);
    out.push(CARDS[c.id].name);
  }
  return out;
}

// 回合开始的收入：基础 + 资本 - 垄断 + 上回合投资/按揭结算，再结算监管；然后摸牌
function income(s, base) {
  const gain = Math.max(0, base + countInHand(s, 'capital') - countInHand(s, 'monopoly'));
  s.pts = Math.max(0, s.pts + gain + s.ptsNext);
  s.ptsNext = 0;
  const reg = countInHand(s, 'regulate');
  if (reg && s.pts > 0 && s.pts % 3 === 0) {
    s.pts += 2 * reg;
    fx.show(s.base, '监管  召唤点 + ' + (2 * reg), '#f6c445', 1400);
  }
  drawCards(s, 1 + countInHand(s, 'monopoly'));
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

function addMpLater(h, plan) { // 在之后的若干回合开始时分别获得 plan[i] 点魔力
  for (let i = 0; i < plan.length; i++) {
    if (h.mpToAdd.length < i + 1) h.mpToAdd.push(plan[i]);
    else h.mpToAdd[i] += plan[i];
  }
}

export function preparePhase(h) {
  h.usableA = 1; h.usable = [1, 1, 1];
  h.mp = h.maxexp;
  h.costs = [...h.oriCosts];
  h.skillsUsed = 0; h.sealed = false;
  if (h.mpToAdd.length > 0) {
    const preview = [...h.mpToAdd];
    const first = h.mpToAdd.shift();
    h.mp += first;
    let s = 'MP + [' + preview[0] + ']';
    if (preview.length > 1) s += ',' + preview.slice(1).join(',');
    fx.show(h, s, '#5b8cff', 1600);
  }
  if (h.mpDrain) { // 「无烬之梦」
    h.mp = Math.max(0, h.mp - h.mpDrain);
    fx.show(h, 'MP - ' + h.mpDrain, '#b8c0d8', 1400);
    h.mpDrain = 0;
  }
  h.gp -= h.addgpPrep; h.addgpPrep = 0;
  h.fp -= h.addfpPrep; h.addfpPrep = 0;
  h.sacrifice = null;
}

function prepHero(h) {
  if (h.noExpNext) h.noExpNext = false; // 「无烬之梦」：放弃这次经验增长
  else gainExp(h, 1);
  preparePhase(h);
}

export function endPhase(h) {
  h.gp -= h.addgp; h.fp -= h.addfp;
  h.addgp = 0; h.addfp = 0;
  h.costs = [...h.oriCosts];
  h.pierce = 0; h.tiangong = false;
}

// ---------- 战斗 ----------

const SIDE_BULLET = [0x8b9cff, 0xff5265]; // 我方 / 敌方弹道色

// 返回造成的伤害（0 = 未击穿防御）
export function attack(sub, ob) {
  const markBonus = (sub.defId === 'Missli' && ob.side !== sub.side) ? ob.marks : 0;
  const atk = sub.gp + markBonus;
  const def = Math.max(0, ob.fp - sub.pierce);
  if (atk <= def) return 0;
  const d = atk - def;
  ob.hp -= d;
  fx.attack(sub, ob, d, SIDE_BULLET[sub.side]);
  if (markBonus) { ob.marks = 0; fx.show(ob, '林间标记 ×' + markBonus + ' 引爆', '#9fcb3c'); }
  checkDie(ob);
  sub.usableA--;
  if (sub.tiangong) { // 「天工再现」
    sub.addgp += d; sub.gp += d;
    fx.show(sub, 'ATK + ' + d, '#e08a2c');
  }
  return d;
}

// 施放前的额外限制（魔力与使用次数由 UI 检查）；返回 null 表示可行
export function skillPrecheck(sub, cmd) {
  if (sub.sealed) return '海尔本莉亚正在秘密航线中，本回合不能再使用技能';
  const s = sideOf(sub);
  const hasEmptyLane = s.lanes.some(l => l.length < LANE_CAP);
  if (sub.defId === 'Heilbenlia') {
    if (cmd === 'S1' && sub.skillsUsed > 0) return '秘密航线必须是本回合使用的第一个技能';
    if (cmd === 'S3') {
      if (!hasEmptyLane) return '没有空闲的战线';
      if (s.side === 0 && !s.jades.some(j => j.cool === 0)) return '没有就绪的召唤玉';
    }
  }
  if (sub.defId === 'Price' && cmd === 'S2') {
    if (!s.hand.length) return '手中没有召唤战术牌';
    if (s.side === 0 && !s.jades.some(j => j.cool !== -1)) return '没有不在场的召唤玉';
  }
  return null;
}

// ext：生命平等的第二目标 { ob2 }；图书稽查的 { cardIdx, jade }
export function castSkill(defId, cmd, sub, ob, ext = {}) {
  sub.skillsUsed++;
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
      // 设计稿明文："黎萪特可以在一回合中任意多次使用本技能" —— 不消耗使用次数，只扣魔力
      sub.mp -= sub.costs[2];
      ob.usable = [1, 1, 1];
      fx.show(ob, '技能已全部恢复', '#f6c445');
    }
  } else if (defId === 'Faros') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '魔法涨落', '#5b8cff');
      addMpLater(sub, [1, 2, 1]);
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
  } else if (defId === 'Simendes') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      sub.pierce += 1;
      fx.show(sub, '精英锤手  穿透 ' + sub.pierce, '#e08a2c');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '合金转轴', '#e08a2c');
      sub.usableA++;
      const d = attack(sub, ob);
      if (d > 0) {
        const b = foeOf(sub).base;
        b.hp -= d;
        fx.attack(sub, b, d, 0xe08a2c);
        checkDie(b);
      }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      sub.tiangong = true;
      sub.usableA++;
      fx.show(sub, '天工再现', '#e08a2c', 1400);
    }
  } else if (defId === 'Heilbenlia') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      sub.sealed = true;
      sub.usable = [0, 0, 0];
      addMpLater(sub, [3]);
      fx.show(sub, '秘密航线', '#38c8e8', 1400);
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '生命平等', '#38c8e8');
      const a = ob, b = ext.ob2;
      const low = a.hp <= b.hp ? a : b, high = low === a ? b : a;
      const heal = Math.min(5, high.hp - low.hp);
      if (heal > 0) { low.hp += heal; fx.show(low, 'HP + ' + heal, '#38c8e8'); }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '海蕴生机', '#38c8e8', 1400);
      const s = sideOf(sub);
      if (s.side === 0) s.freeSummon++;
      else aiFreeSummon();
    }
  } else if (defId === 'Price') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '夜观天象', '#8f8cf8');
      sub.hp += 1;
      fx.show(sub, 'HP + 1', '#8f8cf8');
      const s = sideOf(sub);
      refillDeck(s);
      fx.peek(s.side, s.deck.slice(-2).reverse());
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '图书稽查', '#8f8cf8');
      const s = sideOf(sub);
      const [c] = s.hand.splice(ext.cardIdx, 1);
      if (c) s.discard.push(c.id);
      const j = ext.jade;
      if (j) {
        j.cool = Math.max(0, j.cool - 2);
        j.cost = Math.max(0, j.cost - 2);
        fx.show(sub, j.def.name + '  冷却-2 费用-2', '#8f8cf8', 1500);
      }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '知能展现', '#8f8cf8');
      gainExp(sub, 1);
      for (const t of allHeroes(sideOf(sub))) {
        t.mp += 1;
        fx.show(t, 'MP + 1', '#8f8cf8');
      }
    }
  } else if (defId === 'Missli') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '林间传哨', '#9fcb3c');
      ob.marks++;
      fx.show(ob, '林间标记 ×' + ob.marks, '#9fcb3c');
    } else if (cmd === 'S2') {
      sub.usable[1]--; sub.mp -= sub.costs[1];
      fx.show(sub, '旷野洞察', '#9fcb3c');
      for (const t of [...allHeroes(game.you), ...allHeroes(game.ene)]) {
        if (t.marks > 0) { t.marks++; fx.show(t, '林间标记 ×' + t.marks, '#9fcb3c'); }
      }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '动物百科全书', '#9fcb3c');
      if (ob.side === sub.side) {
        const v = 4 + ob.marks; // 强化友方时，效果提高林间标记数
        ob.marks = 0;
        if (ob.gp <= ob.fp) {
          const d = Math.max(0, v - ob.gp);
          ob.gp += d; ob.addgpPrep += d;
          fx.show(ob, 'ATK → ' + ob.gp, '#9fcb3c');
        } else {
          const d = Math.max(0, v - ob.fp);
          ob.fp += d; ob.addfpPrep += d;
          fx.show(ob, 'DEF → ' + ob.fp, '#9fcb3c');
        }
      } else {
        const d = Math.max(0, ob.fp - 4);
        ob.fp -= d; ob.addfpPrep -= d;
        fx.show(ob, 'DEF → ' + ob.fp, '#9fcb3c');
      }
    }
  } else if (defId === 'Ailee') {
    if (cmd === 'S1') {
      sub.usable[0]--; sub.mp -= sub.costs[0];
      fx.show(sub, '残破之刃', '#b8c0d8');
      sub.hp -= 2;
      fx.hp(sub, 2);
      ob.hp -= 2; // 真实伤害
      fx.attack(sub, ob, 2, 0xb8c0d8);
      checkDie(ob);
      checkDie(sub);
    } else if (cmd === 'S2') {
      sub.usable[1]--;
      const c = sub.costs[1];
      if (sub.mp >= c + 1) { sub.mp -= c + 1; sub.usableA += 3; fx.show(sub, '夜战疾行  攻击 +3', '#b8c0d8'); }
      else { sub.mp -= c; sub.usableA += 2; fx.show(sub, '夜战疾行  攻击 +2', '#b8c0d8'); }
    } else if (cmd === 'S3') {
      sub.usable[2]--; sub.mp -= sub.costs[2];
      fx.show(sub, '无烬之梦', '#b8c0d8', 1400);
      sub.noExpNext = true;
      ob.mpDrain += 4;
      fx.show(ob, '下回合 MP - 4', '#b8c0d8', 1400);
    }
  }
}

// ---------- 召唤战术牌 / 物品卡 ----------

function totalMp(s) { return allHeroes(s).reduce((a, h) => a + Math.max(0, h.mp), 0); }

// 打出前检查；返回 null 表示可以打出
export function cardPrecheck(s, idx) {
  const c = s.hand[idx];
  if (!c) return '没有这张牌';
  const d = CARDS[c.id];
  if (d.passive) return '「' + d.name + '」持有时自动生效，无需打出';
  if (c.id === 'invest' && s.pts < 2) return '召唤点不足 2 点';
  if (c.id === 'relief' && s.pts >= 4) return '召唤点少于 4 时才能打出';
  if (c.id === 'charity' && s.pts <= 9) return '召唤点多于 9 时才能打出';
  if (c.id === 'allin' && game.turn < 1) return '第 1 回合起才能全押';
  if (c.id === 'forge' && !s.hand.some((x, i) => i !== idx && x.id !== 'forge' && CARDS[x.id].kind === 'tac')) return '手中没有可复制的战术牌';
  if (c.id === 'oath' && totalMp(s) < 8) return '我方英雄魔力合计不足 8 点';
  if (d.target === 'ally' || d.target === 'hero') {
    const any = d.target === 'ally' ? allHeroes(s).length : allHeroes(game.you).length + allHeroes(game.ene).length;
    if (!any) return '场上没有可选的英雄';
  }
  return null;
}

// 目标合法性（打出需要目标的牌时）
export function validateCardTarget(s, idx, ob) {
  const d = CARDS[s.hand[idx].id];
  if (ob.isBase) return '不能选择基地';
  if (d.target === 'ally' && ob.side !== s.side) return '目标必须是友方英雄';
  if (s.hand[idx].id === 'fruit' && ob.kei === 'shinrei') return '禁果不能用于心灵系角色';
  return null;
}

// target：英雄对象，或（伪造）手中另一张牌的下标
export function playCard(s, idx, target) {
  const [c] = s.hand.splice(idx, 1);
  const d = CARDS[c.id];
  s.discard.push(c.id);
  const say = (t) => fx.show(s.base, d.name + '  ' + t, d.kind === 'item' ? '#f6d365' : '#8b9cff', 1500);
  switch (c.id) {
    case 'estate': s.handLimit++; say('手牌上限 ' + s.handLimit); break;
    case 'invest': s.pts -= 2; s.ptsNext += 4; say('-2，下回合 +4'); break;
    case 'forge': {
      const src = s.hand[target > idx ? target - 1 : target];
      if (src) { s.hand.push({ uid: nextCardUid++, id: src.id }); say('复制「' + CARDS[src.id].name + '」'); }
      break;
    }
    case 'mortgage': s.pts += 4; s.ptsNext -= 2; say('+4，下回合 -2'); break;
    case 'welfare': s.pts += 2; say('召唤点 +2'); break;
    case 'relief': s.pts += 3; say('召唤点 +3'); break;
    case 'charity': drawCards(s, 2); say('抽 2 张'); break;
    case 'chance': { const g = Math.random() < 0.5 ? 1 : 3; s.pts += g; say('召唤点 +' + g); break; }
    case 'allin': {
      for (const x of s.hand) s.discard.push(x.id);
      s.hand = [];
      s.pts += game.turn;
      say('召唤点 +' + game.turn);
      break;
    }
    case 'nectar': target.mp += 1; say(''); fx.show(target, 'MP + 1', '#f6d365'); break;
    case 'oath': {
      let need = 8;
      const pool = allHeroes(s).sort((a, b) => b.mp - a.mp);
      for (const h of pool) { const t = Math.min(need, Math.max(0, h.mp)); h.mp -= t; need -= t; if (!need) break; }
      target.maxexp += 1; target.exp = 0;
      say(''); fx.show(target, '升级！Lv ' + target.maxexp, '#f6d365', 1500);
      break;
    }
    case 'eerie': target.gp += 1; say(''); fx.show(target, 'ATK + 1（永久）', '#f6d365'); break;
    case 'fruit': target.hp += 3; say(''); fx.show(target, 'HP + 3', '#f6d365'); break;
  }
}

// ---------- 敌方 AI：按局势选线选人，会打战术牌，每个英雄有自己的连招 ----------

const AI_POOL = Object.keys(HEROES);

function pickWeighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [id, w] of pairs) { r -= w; if (r <= 0) return id; }
  return pairs[pairs.length - 1][0];
}

function emptyLanes(s) {
  const out = [];
  for (let l = 0; l < LANES; l++) if (s.lanes[l].length < LANE_CAP) out.push(l);
  return out;
}

function aiPickLane(empty) {
  // 选线：优先堵住对面攻击力最高的玩家英雄；全空则随机
  let lane = empty[0], best = -1;
  for (const l of empty) {
    const opp = game.you.lanes[l][0];
    const score = opp ? opp.gp : -1;
    if (score > best) { best = score; lane = l; }
  }
  if (best < 0) lane = empty[Math.floor(Math.random() * empty.length)];
  return lane;
}

function aiSummonPhase() {
  let summoned = 0;
  while (summoned < 2) { // 每回合最多召两个
    const empty = emptyLanes(game.ene);
    if (!empty.length) break;
    const lane = aiPickLane(empty);
    const opp = game.you.lanes[lane][0];
    // 选人：对面高攻→重甲；对面残血→连击；空线→输出；否则加权随机
    let id;
    if (opp && opp.gp >= 5) id = 'Simendes';
    else if (opp && opp.hp <= 8) id = 'Ailee';
    else if (!opp) id = pickWeighted([['Licott', 30], ['Faros', 25], ['Ailee', 25], ['Price', 20]]);
    else id = pickWeighted([['Licott', 24], ['Ailee', 14], ['Vagro', 14], ['Missli', 12], ['Simendes', 10], ['Milanky', 10], ['Heilbenlia', 8], ['Price', 5], ['Shirley', 3]]);
    if (game.ene.pts < HEROES[id].cost) {
      const afford = AI_POOL.filter(p => HEROES[p].cost <= game.ene.pts);
      if (!afford.length) break;
      id = afford[Math.floor(Math.random() * afford.length)];
    }
    game.ene.pts -= HEROES[id].cost;
    fx.summon(createHero(id, 1, lane, null));
    summoned++;
  }
}

function aiFreeSummon() { // 「海蕴生机」
  const empty = emptyLanes(game.ene);
  if (!empty.length) return;
  const onField = new Set(allHeroes(game.ene).map(h => h.defId));
  const pool = AI_POOL.filter(id => !onField.has(id));
  const id = pool.sort((a, b) => HEROES[b].cost - HEROES[a].cost)[0];
  if (id) fx.summon(createHero(id, 1, aiPickLane(empty), null));
}

function aiMostHurtAlly(filter = () => true) {
  let best = null, worst = 1;
  for (const t of allHeroes(game.ene)) {
    const r = t.hp / t.def.hp;
    if (t.hp > 0 && r < worst && filter(t)) { worst = r; best = t; }
  }
  return worst < 1 ? best : null;
}

function aiPlayCards() {
  const s = game.ene;
  for (let guard = 0; guard < 12; guard++) {
    let played = false;
    for (let i = 0; i < s.hand.length && !played; i++) {
      const id = s.hand[i].id;
      if (cardPrecheck(s, i)) continue;
      const allies = allHeroes(s);
      const empty = emptyLanes(s).length > 0;
      let target;
      let ok = false;
      switch (id) {
        case 'estate': case 'welfare': case 'chance': case 'relief': case 'charity': ok = true; break;
        case 'mortgage': ok = empty && s.pts < 5; break;
        case 'invest': ok = !empty && s.pts >= 4; break;
        case 'allin': ok = game.turn >= 8 && !s.hand.some(c => CARDS[c.id].passive); break;
        case 'forge': {
          const want = ['welfare', 'mortgage', 'chance', 'estate'];
          const j = s.hand.findIndex((c, k) => k !== i && want.includes(c.id));
          if (j >= 0) { ok = true; target = j; }
          break;
        }
        case 'fruit': target = aiMostHurtAlly(t => t.kei !== 'shinrei' && t.def.hp - t.hp >= 3); ok = !!target; break;
        case 'eerie': case 'oath': case 'nectar':
          target = allies.sort((a, b) => b.gp - a.gp)[0]; ok = !!target; break;
      }
      if (ok) { playCard(s, i, target); played = true; }
    }
    if (!played) break;
  }
}

function aiUseSkills(sub) {
  const u = () => sub.usable;
  const can = (i) => u()[i] > 0 && sub.mp >= sub.costs[i] && !skillPrecheck(sub, 'S' + (i + 1));
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
    case 'Faros': {
      if (can(0) && sub.mp < 5) castSkill('Faros', 'S1', sub, null);
      if (can(2)) castSkill('Faros', 'S3', sub, targetOrBase());
      break;
    }
    case 'Milanky': {
      const o = opp();
      if (can(0) && o && o.kei !== 'mahou') castSkill('Milanky', 'S1', sub, o);
      const hurt = aiMostHurtAlly(t => t.kei !== 'kikai');
      if (can(1) && hurt) castSkill('Milanky', 'S2', sub, hurt);
      break;
    }
    case 'Vagro': {
      if (can(1) && allHeroes(game.you).length >= 2) castSkill('Vagro', 'S2', sub, null);
      if (can(0)) castSkill('Vagro', 'S1', sub, sub);
      if (can(2)) castSkill('Vagro', 'S3', sub, sub);
      break;
    }
    case 'Shirley': {
      const hurt = aiMostHurtAlly();
      if (can(0) && hurt) castSkill('Shirley', 'S1', sub, hurt);
      let guard = null;
      for (const t of allHeroes(game.ene)) if (t !== sub && !t.sacrifice && (!guard || t.gp > guard.gp)) guard = t;
      if (can(2) && guard) castSkill('Shirley', 'S3', sub, guard);
      if (can(1) && sub.mp > 0) {
        const front = allHeroes(game.ene).find(t => t !== sub && opposite(t)) || guard;
        if (front) castSkill('Shirley', 'S2', sub, front);
      }
      break;
    }
    case 'Simendes': {
      if (can(0)) castSkill('Simendes', 'S1', sub, null);
      if (can(2)) castSkill('Simendes', 'S3', sub, null);
      const o = opp();
      if (can(1) && o) castSkill('Simendes', 'S2', sub, o);
      break;
    }
    case 'Heilbenlia': {
      if (can(2) && emptyLanes(game.ene).length) { castSkill('Heilbenlia', 'S3', sub, null); break; }
      const allies = allHeroes(game.ene).filter(t => t.hp > 0);
      if (can(1) && allies.length >= 2) {
        const lo = allies.reduce((a, b) => (a.hp < b.hp ? a : b));
        const hi = allies.reduce((a, b) => (a.hp > b.hp ? a : b));
        if (hi.hp - lo.hp >= 3) { castSkill('Heilbenlia', 'S2', sub, lo, { ob2: hi }); break; }
      }
      if (can(0) && sub.mp < 3) castSkill('Heilbenlia', 'S1', sub, null);
      break;
    }
    case 'Price': {
      if (can(2)) castSkill('Price', 'S3', sub, null);
      if (can(0) && sub.hp < sub.def.hp) castSkill('Price', 'S1', sub, null);
      break;
    }
    case 'Missli': {
      const o = opp();
      if (can(0) && o) castSkill('Missli', 'S1', sub, o);
      if (can(1) && [...allHeroes(game.you), ...allHeroes(game.ene)].some(t => t.marks > 0)) castSkill('Missli', 'S2', sub, null);
      const o2 = opp();
      if (can(2) && o2 && o2.fp > 4) castSkill('Missli', 'S3', sub, o2);
      break;
    }
    case 'Ailee': {
      if (can(1)) castSkill('Ailee', 'S2', sub, null);
      if (can(0) && sub.hp > 6) castSkill('Ailee', 'S1', sub, targetOrBase());
      const o = opp();
      if (can(2) && o && o.maxexp > 0) castSkill('Ailee', 'S3', sub, o);
      break;
    }
  }
}

export function runEnemyTurnAndPrepare() {
  // 你的结束阶段
  for (const h of allHeroes(game.you)) endPhase(h);
  game.you.freeSummon = 0;
  game.lastDiscards = enforceHandLimit(game.you);

  // 敌方准备阶段
  for (const h of allHeroes(game.ene)) prepHero(h);
  if (game.turn > 0) income(game.ene, 2);

  // 敌方主要阶段：先打战术牌凑召唤点，再召唤
  aiPlayCards();
  aiSummonPhase();

  // 敌方战斗阶段：先放技能再普攻（黎萪特保留原版"普攻后连招"）
  for (let lane = 0; lane < LANES; lane++) {
    for (const sub of [...game.ene.lanes[lane]]) {
      if (sub.hp <= 0 || sub.dead) continue;
      if (sub.defId === 'Licott') {
        attack(sub, opposite(sub) || game.you.base);
        aiUseSkills(sub);
      } else {
        aiUseSkills(sub);
        while (sub.hp > 0 && !sub.dead && sub.usableA > 0) {
          if (!attack(sub, opposite(sub) || game.you.base)) break;
        }
      }
      if (game.you.base.hp <= 0) break;
    }
  }

  // 敌方结束阶段
  for (const h of allHeroes(game.ene)) endPhase(h);
  enforceHandLimit(game.ene);

  game.turn++;

  // 你的准备阶段
  for (const h of allHeroes(game.you)) prepHero(h);
  income(game.you, 2 + Math.floor(game.turn / 10));
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
  if (id === 'Simendes' && cmd === 'S2' && !foeHero) {
    return '目标必须是敌方英雄';
  }
  if (id === 'Heilbenlia' && cmd === 'S2' && ob.isBase) {
    return '目标必须是英雄';
  }
  if (id === 'Missli' && ob.isBase) {
    return '目标必须是英雄';
  }
  if (id === 'Ailee' && cmd === 'S3' && !foeHero) {
    return '目标必须是敌方英雄';
  }
  return null;
}

export function playerSummon(jade, lane) {
  const s = game.you;
  if (s.freeSummon > 0) s.freeSummon--; // 「海蕴生机」
  else s.pts -= jade.cost;
  jade.cool = -1; // 出战中
  const h = createHero(jade.defId, 0, lane, jade);
  fx.summon(h);
  return h;
}
