// Fungred 数据定义 —— 数值与技能全部取自原版 Unity 工程 (GameManager.cs / SampleScene.unity)

export const KEI = {
  seimei:  { name: '生命系', color: '#ff5265' },
  mahou:   { name: '魔法系', color: '#5b8cff' },
  shinrei: { name: '心灵系', color: '#43d9ad' },
  kikai:   { name: '机械系', color: '#f6c445' },
  shi:     { name: '死系',   color: '#b8c0d8' },
};

// 前五人取自原版 Unity 代码；后五人取自 Illustrator 设计稿 fungred3.0.ai（2022-09-05），当年未实装
export const HEROES = {
  Licott: {
    id: 'Licott', name: '黎萪特', title: '天才公主', kei: 'seimei', color: 0xff5265, cost: 4,
    hp: 19, gp: 4, fp: 3, costs: [1, 2, 4],
    skills: [
      { name: '悠扬之箭', desc: '选定一个目标，造成 2 点真实伤害。' },
      { name: '猎物锁定', desc: '选定一个目标，进行一次额外攻击，若造成伤害则对该目标重复此过程。最多重复 3 次。' },
      { name: '不渝之心', desc: '将一位生命系或魔法系英雄的技能全部置为可用状态。黎萪特可以在一回合中任意多次使用本技能。' },
    ],
  },
  Faros: {
    id: 'Faros', name: '法罗斯', title: '黑猫与帽子的主人', kei: 'mahou', color: 0x5b8cff, cost: 5,
    hp: 14, gp: 5, fp: 2, costs: [2, 3, 5],
    skills: [
      { name: '魔法涨落', desc: '在之后的三个回合开始时，分别获得 1、2、1 点魔力。', instant: true },
      { name: '魔力友谊', desc: '将自身的所有魔力给予另一名友方英雄，并在本回合中自身攻击力增加等于该友方英雄的攻击力。' },
      { name: '魔能大炮', desc: '造成 10 点伤害，溢出伤害给予敌方基地。本回合法罗斯的所有技能消耗变为 0。' },
    ],
  },
  Milanky: {
    id: 'Milanky', name: '未兰琪', title: '萝莉麻烦', kei: 'shinrei', color: 0x4ade80, cost: 3,
    hp: 15, gp: 3, fp: 3, costs: [1, 2, 3],
    skills: [
      { name: '五色花', desc: '选择一名非魔法系角色，造成 4 点伤害，再为自己回复 1 点生命。' },
      { name: '心萤草', desc: '为一位非机械系友方角色增加 2 点防御值，直到你的下一回合开始。' },
      { name: '夏日莲', desc: '本回合中，令一名角色的所有技能 -1 魔力消耗。' },
    ],
  },
  Vagro: {
    id: 'Vagro', name: '瓦格罗', title: '熔炉甜心', kei: 'kikai', color: 0xf6c445, cost: 4,
    hp: 17, gp: 4, fp: 2, costs: [2, 3, 6],
    skills: [
      { name: '北方锻造', desc: '使一名友方英雄在本回合获得 +1 攻击力、+1 防御力。' },
      { name: '哇！这是糖浆吗？', desc: '对敌方全体英雄造成 5 点伤害。', instant: true },
      { name: '饱和防御', desc: '使一名友方英雄在本回合获得 +4 防御力，并对其对面的角色造成 8 点伤害。' },
    ],
  },
  Shirley: {
    id: 'Shirley', name: '雪莉', title: '纯洁之心', kei: 'shinrei', color: 0x9fd8ff, cost: 3,
    hp: 11, gp: 1, fp: 1, costs: [0, 0, 0],
    skills: [
      { name: '寒天热粥', desc: '令一名角色恢复 2 点生命值。' },
      { name: '雪之祈愿', desc: '消耗所有魔力，令一名友方英雄的防御力上升这么多点，直到你的下一回合开始。' },
      { name: '一隅天涯', desc: '选定一名友方英雄：本回合中若该角色将被杀死，以雪莉之死代替，并为其恢复 10 点生命值。' },
    ],
  },
  Simendes: {
    id: 'Simendes', name: '席门德斯', title: '天工机巧', kei: 'kikai', color: 0xe08a2c, cost: 5,
    hp: 20, gp: 4, fp: 3, costs: [1, 3, 5],
    skills: [
      { name: '精英锤手', desc: '本回合攻击时，将目标的防御视为低 1 点。', instant: true },
      { name: '合金转轴', desc: '对一名敌方英雄进行一次额外攻击；若造成伤害，同时对敌方基地造成等额伤害。' },
      { name: '天工再现', desc: '本回合中，普攻每造成 1 点伤害，自身攻击力 +1。获得一次额外攻击机会。', instant: true },
    ],
  },
  Heilbenlia: {
    id: 'Heilbenlia', name: '海尔本莉亚', title: '人鱼之恋', kei: 'mahou', color: 0x38c8e8, cost: 5,
    hp: 15, gp: 4, fp: 2, costs: [1, 3, 6],
    skills: [
      { name: '秘密航线', desc: '必须是本回合使用的第一个技能。本回合不能再使用技能，下一回合开始时获得 3 点魔力。', instant: true },
      { name: '生命平等', desc: '选择两名角色，令生命值较低者恢复到与另一者相同，但最多恢复 5 点。', targets: 2 },
      { name: '海蕴生机', desc: '立即召唤一名不在场、且不在冷却中的英雄，不消耗召唤点。', instant: true },
    ],
  },
  Price: {
    id: 'Price', name: '波利亚', title: '书虫', kei: 'mahou', color: 0x8f8cf8, cost: 4,
    hp: 13, gp: 5, fp: 2, costs: [1, 2, 5],
    skills: [
      { name: '夜观天象', desc: '查看牌堆顶的 2 张召唤战术牌，恢复 1 点生命值。', instant: true },
      { name: '图书稽查', desc: '弃置一张手中的召唤战术牌，令一颗不在场的召唤玉冷却 -2、召唤费用 -2。', pick: ['card', 'jade'] },
      { name: '知能展现', desc: '获得 1 点经验，我方每位英雄获得 1 点魔力。', instant: true },
    ],
  },
  Missli: {
    id: 'Missli', name: '蜜斯莉', title: '守林先锋', kei: 'shinrei', color: 0x9fcb3c, cost: 4,
    hp: 15, gp: 3, fp: 3, costs: [1, 2, 4],
    passive: { name: '林间标记', desc: '蜜斯莉攻击敌方角色时，攻击力提高其林间标记数；强化友方角色时，效果提高其林间标记数。随后清除该角色的所有标记。' },
    skills: [
      { name: '林间传哨', desc: '使一名角色获得 1 枚林间标记。' },
      { name: '旷野洞察', desc: '场上所有带林间标记的角色，标记数再 +1。', instant: true },
      { name: '动物百科全书', desc: '直到目标的下一回合开始：友方——攻击或防御（取较低者）变为 4，林间标记可加成；敌方——防御力降为 4。' },
    ],
  },
  Ailee: {
    id: 'Ailee', name: '艾利', title: '无光之瞳', kei: 'shi', color: 0xb8c0d8, cost: 5,
    hp: 17, gp: 4, fp: 4, costs: [0, 1, 4], costLabel: [null, '1/2', null],
    skills: [
      { name: '残破之刃', desc: '自身损失 2 点生命，对一个目标造成 2 点真实伤害。' },
      { name: '夜战疾行', desc: '获得 2 次额外攻击机会；若魔力足够，改为消耗 2 点、获得 3 次。', instant: true },
      { name: '无烬之梦', desc: '本回合放弃经验增长。选定一名敌方英雄，令其下回合开始时失去 4 点魔力。' },
    ],
  },
};

// 召唤玉栏顺序（费用取自各英雄 cost）
export const JADES = ['Licott', 'Faros', 'Milanky', 'Vagro', 'Shirley', 'Simendes', 'Heilbenlia', 'Price', 'Missli', 'Ailee']
  .map(id => ({ hero: id, cost: HEROES[id].cost }));

// ---------- 召唤战术牌与物品卡（fungred3.0.ai「Summoning Strategy」） ----------
// target: 'hero' 任一角色 / 'ally' 友方英雄 / 'card' 手中另一张牌 / 省略 = 直接生效
export const CARDS = {
  capital:  { name: '资本', en: 'Capital',    kind: 'tac', passive: true, desc: '持有时，每回合多获得 1 点召唤点。' },
  estate:   { name: '地产', en: 'Estate',     kind: 'tac', desc: '你可保留的召唤战术牌上限永久 +1。' },
  invest:   { name: '投资', en: 'Investment', kind: 'tac', desc: '失去 2 点召唤点，下一回合获得 4 点。' },
  forge:    { name: '伪造', en: 'Forgery',    kind: 'tac', target: 'card', desc: '复制你手中另一张非「伪造」的召唤战术牌。' },
  mortgage: { name: '按揭', en: 'Mortgage',   kind: 'tac', desc: '获得 4 点召唤点，下一回合失去 2 点。' },
  welfare:  { name: '福利', en: 'Welfare',    kind: 'tac', desc: '获得 2 点召唤点。' },
  relief:   { name: '救济', en: 'Subsidy',    kind: 'tac', desc: '若你的召唤点少于 4，获得 3 点召唤点。' },
  charity:  { name: '慈善', en: 'Charity',    kind: 'tac', desc: '若你的召唤点多于 9，抽 2 张召唤战术牌。' },
  monopoly: { name: '垄断', en: 'Monopoly',   kind: 'tac', passive: true, desc: '持有时，每回合获得的召唤点 -1，但多抽 1 张牌。' },
  chance:   { name: '机会', en: 'Chance',     kind: 'tac', desc: '50% 获得 1 点召唤点，50% 获得 3 点。' },
  allin:    { name: '全押', en: 'All-In',     kind: 'tac', desc: '弃掉所有召唤战术牌，获得等于当前回合数的召唤点。' },
  regulate: { name: '监管', en: 'Regulatory', kind: 'tac', passive: true, desc: '持有时，若回合开始时你的召唤点是 3 的倍数，额外获得 2 点。' },
  nectar:   { name: '甘露',     en: 'Nectar',          kind: 'item', target: 'ally', desc: '令一名友方英雄获得 1 点魔力。' },
  oath:     { name: '誓约之剑', en: 'Oath Blade',      kind: 'item', target: 'ally', desc: '从我方英雄合计扣除 8 点魔力，令一名友方英雄立刻升一级。' },
  eerie:    { name: '诡异之剑', en: 'Eerie Blade',     kind: 'item', target: 'ally', desc: '令一名友方英雄攻击力永久 +1。' },
  fruit:    { name: '禁果',     en: 'Forbidden Fruit', kind: 'item', target: 'hero', desc: '令一名非心灵系角色恢复 3 点生命值。' },
};
export const DECK_LIST = Object.keys(CARDS).flatMap(id => [id, id]); // 每种两张，共 32 张
export const HAND_START = 4, HAND_LIMIT = 4;

// ---------- 角色百科：出身与语录 ----------
// src：正典 = D:\Raitingu 设定文档 / 设计稿 = fungred3.0.ai 卡面与批注 / 补写 = 复刻版按世界观补全
const LORE = {
  Licott: {
    src: '正典',
    lore: '拉文德市福格雷德家族的长女、公主，棕色长发，系一条绿色领巾。罕见的弓箭天才——世人传说她曾一箭飞过两个山头射中靶心；傍晚的练习场上，靶心常常插着七支箭。性格开朗直率、同理心强，总声称有某种「信念」推着她前行；但遇到挫折时，也会陷在其中很难自拔。',
    lines: {
      summon: '有我在，拉文德不会倒下。',
      die: '信念还在……就不算输……',
      extra: [
        { label: '日常', text: '弓箭是我的好朋友。我从来不担心她！' },
        { label: '独白', text: '明天，还能射中更多吗……' },
      ],
    },
  },
  Faros: {
    src: '正典',
    lore: '福格雷德家的次女，比黎萪特小一岁。天赋极高的法师，戴一顶蓝色巫师帽，却几乎从不把天赋当回事。小时候追一只黑猫误入无人之地，与猫共度数月，回来时已学会大量法术。爱睡觉——有人说，她睡着的时候错过过很重要的事。',
    lines: {
      summon: '……先让我睡五分钟。',
      die: '这次……可别让我一个人看着……',
      extra: [
        { label: '日常', text: '哈？我可没有孩子。' },
        { label: '得意', text: '当然，要不然是谁。' },
      ],
    },
  },
  Milanky: {
    src: '正典',
    lore: '福格雷德家最小的公主，九岁，家里人叫她兰琪。整天在外面玩，自己坚称是在工作——回家时口袋里总装满蘑菇。花草在她手里会安静下来：五色花、心萤草、夏日莲，都是她的朋友。',
    lines: {
      summon: '姐姐——我也来帮忙啦！',
      die: '花谢了……还会再开的……',
      extra: [{ label: '日常', text: '你要是再不回家，有人就要吃不上饭咯！' }],
    },
  },
  Vagro: {
    src: '正典',
    lore: '拉文德城外的铁匠，住在自己的铁匠铺里。北方锻造术的传人，糖浆爱好者。城里人的锅、犁与剑，都出自他的炉子。三位主角里唯一"不色"的那个。',
    lines: {
      summon: '炉子正热，来得正好。',
      die: '炉火……别让它灭了……',
      extra: [{ label: '得意', text: '哇！这是糖浆吗？' }],
    },
  },
  Shirley: {
    src: '正典',
    lore: '城里的普通女孩，十五岁。七岁那年父亲外出打工，至今未归；她与母亲相依为命。她的技能不需要魔力——寒天里的一碗热粥，本来就不需要什么代价。',
    lines: {
      summon: '我会照顾好大家的。',
      die: '爸爸……我等不到了……',
      extra: [{ label: '守护', text: '一隅天涯……换你活下去。' }],
    },
  },
  Simendes: {
    src: '设计稿 · 补写',
    lore: '拉文德的机巧匠人，被人称作「天工机巧」。和瓦格罗是老相识——一个打铁，一个造机关；瓦格罗说他的锤子太精，他说瓦格罗的锤子太甜。上阵时只带一柄合金转轴锤，据说每敲一下都比上一下更重。',
    lines: {
      summon: '转轴校准完毕。',
      die: '齿轮……还差最后一格……',
      extra: [{ label: '得意', text: '天工再现，一锤到底。' }],
    },
  },
  Heilbenlia: {
    src: '设计稿 · 补写',
    lore: '从海上来的人鱼，头衔「人鱼之恋」。设计时曾被叫作深海天籁、海的女儿、人鱼和谐——作者嫌这些名字太假，一个都没用。她走过一条只有自己知道的秘密航线来到拉文德；为什么上岸，她从来不说。',
    lines: {
      summon: '潮水带我来的。',
      die: '回到……海里去……',
      extra: [{ label: '施法', text: '生命本该是平等的。' }],
    },
  },
  Price: {
    src: '正典 · 设计稿',
    lore: '拉文德图书馆的常客，书虫，天文爱好者。夜里观星，白天稽查书目。蜜斯莉被天启选中的那一天，她早已预言了一切——但这不重要。原版 Unity 代码里她叫 Price，技能框架写好了，却一直空着。',
    lines: {
      summon: '星象说，今天会很热闹。',
      die: '这一页……还没读完……',
      extra: [{ label: '日常', text: '你想借的那本书，在第三排最上面。' }],
    },
  },
  Missli: {
    src: '正典',
    lore: '喜欢森林的女孩，经常在林子里打猎，父母为此头疼却也无可奈何。要命中三百米外的稻草人，黎萪特箭无虚发；可要在灌木和藤蔓间翻滚时精准射中一只兔子，还是蜜斯莉更胜一筹。十八岁生日那天恰逢天启仪式——被选中的是她。「为什么要选择我呢？」',
    lines: {
      summon: '林子里的动静，我都听得见。',
      die: '为什么……要选择我呢……',
      extra: [{ label: '得意', text: '兔子可比稻草人难打多了。' }],
    },
  },
  Ailee: {
    src: '设计稿 · 补写',
    lore: '全阵容里唯一的死系，头衔「无光之瞳」。她的眼睛看不见光，却看得见别人看不见的东西。设计稿上她还有第四个技能「命运重逢」——本回合受到的伤害全部视为生命回复——被作者用双斜线划掉了。',
    lines: {
      summon: '……天黑了吗？',
      die: '终于……重逢了……',
      extra: [{ label: '夜战', text: '看不见，也就不会怕。' }],
    },
  },
};
for (const id in LORE) Object.assign(HEROES[id], LORE[id]);

export const WORLD = {
  name: '拉文德市',
  sub: 'Lavender City · 世界观',
  lore: [
    '福雷恩（Frein）大陆上，海拉克塔自治领的属城。市中心那座醒目的城堡，属于世代掌权的福格雷德（Fungred）家族——黎萪特、法罗斯与未兰琪三位公主在此长大。',
    '城堡之外是居民的自建屋舍：瓦格罗的铁匠铺、雪莉与母亲相依为命的小屋、藏着预言者波利亚的拉文德图书馆。',
    '而在一切的暗处，是「天启」——每一个轮回，它选中一人赋予其全城最高的魔力、武力与体力，也把灾难引向这座城。被选中者带领居民抵御，失败，然后花上数年乃至数百年研究回溯的法术，抹去记忆，回到最开始的地方。据说这样的轮回已经发生过不止一次。',
    '打破循环的方法，还没有人找到。',
  ],
};
