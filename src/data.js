// Fungred 数据定义 —— 数值与技能全部取自原版 Unity 工程 (GameManager.cs / SampleScene.unity)

export const KEI = {
  seimei:  { name: '生命系', color: '#ff5265' },
  mahou:   { name: '魔法系', color: '#5b8cff' },
  shinrei: { name: '心灵系', color: '#43d9ad' },
  kikai:   { name: '机械系', color: '#f6c445' },
};

export const HEROES = {
  Licott: {
    id: 'Licott', name: '利科特', kei: 'seimei', color: 0xff5265, cost: 4,
    hp: 19, gp: 4, fp: 3, costs: [1, 2, 4],
    skills: [
      { name: '悠扬之箭', desc: '选定一个目标，造成 2 点真实伤害。' },
      { name: '猎物锁定', desc: '选定一个目标，进行一次额外攻击，若造成伤害则对该目标重复此过程。最多重复 3 次。' },
      { name: '不渝之心', desc: '将一位生命系或魔法系英雄的技能全部置为可用状态。' },
    ],
  },
  Faros: {
    id: 'Faros', name: '法罗斯', kei: 'mahou', color: 0x5b8cff, cost: 5,
    hp: 14, gp: 5, fp: 2, costs: [2, 3, 5],
    skills: [
      { name: '魔法涨落', desc: '在之后的三个回合开始时，分别获得 1、2、1 点魔力。', instant: true },
      { name: '魔力友谊', desc: '将自身的所有魔力给予一名友方英雄，并在本回合中自身攻击力增加等于该友方英雄的攻击力。' },
      { name: '魔能大炮', desc: '造成 10 点伤害，溢出伤害给予敌方基地。本回合法罗斯的所有技能消耗变为 0。' },
    ],
  },
  Milanky: {
    id: 'Milanky', name: '米兰琪', kei: 'shinrei', color: 0x4ade80, cost: 3,
    hp: 15, gp: 3, fp: 3, costs: [1, 2, 3],
    skills: [
      { name: '五色花', desc: '选择一名非魔法系角色，造成 3 点伤害。' },
      { name: '心萤草', desc: '为一位非机械系友方角色增加 2 点防御值，直到你的下一回合开始。' },
      { name: '夏日莲', desc: '本回合中，令一名角色的所有技能 -1 魔力消耗。' },
    ],
  },
  Vagro: {
    id: 'Vagro', name: '瓦格罗', kei: 'kikai', color: 0xf6c445, cost: 4,
    hp: 17, gp: 4, fp: 2, costs: [2, 3, 6],
    skills: [
      { name: '北方锻造', desc: '使一名友方英雄在本回合获得 +1 攻击力、+1 防御力。' },
      { name: '哇！这是糖浆吗？', desc: '对敌方全体英雄造成 5 点伤害。', instant: true },
      { name: '饱和防御', desc: '使一名友方英雄在本回合获得 +4 防御力，并对其对面的角色造成 8 点伤害。' },
    ],
  },
  Shirley: {
    id: 'Shirley', name: '雪莉', kei: 'shinrei', color: 0x9fd8ff, cost: 3,
    hp: 11, gp: 1, fp: 1, costs: [0, 0, 0],
    skills: [
      { name: '寒天热粥', desc: '令一名角色恢复 2 点生命值。' },
      { name: '雪之祈愿', desc: '消耗所有魔力，令一名友方英雄的防御力上升这么多点，直到你的下一回合开始。' },
      { name: '一隅天涯', desc: '选定一名友方英雄：本回合中若该角色将被杀死，以雪莉之死代替，并为其恢复 10 点生命值。' },
    ],
  },
  // ---------- 复刻版新增五人 ----------
  Orwen: {
    id: 'Orwen', name: '奥尔文', kei: 'seimei', color: 0xa3e635, cost: 4,
    hp: 24, gp: 3, fp: 4, costs: [1, 3, 4],
    skills: [
      { name: '荆棘缠绕', desc: '使一名敌方英雄攻击力 -2，直到其下个回合。' },
      { name: '木灵庇护', desc: '为一名友方英雄恢复 4 点生命，并 +1 防御力，直到你的下一回合开始。' },
      { name: '千棘绽放', desc: '对敌方全体英雄造成 3 点真实伤害。', instant: true },
    ],
  },
  Vermeil: {
    id: 'Vermeil', name: '薇尔梅', kei: 'mahou', color: 0xb388ff, cost: 4,
    hp: 12, gp: 4, fp: 1, costs: [1, 2, 6],
    skills: [
      { name: '星轨记录', desc: '获得一层星轨。', instant: true },
      { name: '引力汲取', desc: '夺取一名敌方英雄 2 点魔力。' },
      { name: '坠星', desc: '造成 6 + 3×星轨层数 点伤害并清空星轨，溢出伤害给予敌方基地。' },
    ],
  },
  Kulom: {
    id: 'Kulom', name: '库洛姆', kei: 'kikai', color: 0xff8a3c, cost: 4,
    hp: 18, gp: 2, fp: 3, costs: [2, 4, 5],
    skills: [
      { name: '装填', desc: '本回合自身攻击力 +2。', instant: true },
      { name: '轰击', desc: '无视战线阻挡，对敌方基地造成等于自身攻击力的伤害。', instant: true },
      { name: '过载弹头', desc: '对一个目标造成 10 点伤害，自身受到 3 点真实伤害。' },
    ],
  },
  Tio: {
    id: 'Tio', name: '缇欧', kei: 'seimei', color: 0x63e0c2, cost: 2,
    hp: 13, gp: 2, fp: 2, costs: [0, 2, 4],
    skills: [
      { name: '新芽', desc: '获得 1 点召唤点。', instant: true },
      { name: '回甘', desc: '使一名友方英雄获得 2 点魔力。' },
      { name: '春宴', desc: '我方全体英雄恢复 3 点生命并获得 1 点魔力。', instant: true },
    ],
  },
  Nocti: {
    id: 'Nocti', name: '诺克提', kei: 'shinrei', color: 0xd946ef, cost: 5,
    hp: 14, gp: 6, fp: 0, costs: [1, 3, 5],
    skills: [
      { name: '蛾翼斩', desc: '选定一个目标，进行一次额外攻击。' },
      { name: '磷粉', desc: '使一名敌方英雄防御力归零，直到其下个回合。' },
      { name: '无声猎杀', desc: '若目标生命值低于 8，直接将其杀死；否则造成 5 点伤害。' },
    ],
  },
};

// 召唤玉栏顺序（费用取自各英雄 cost）
export const JADES = ['Licott', 'Faros', 'Milanky', 'Vagro', 'Shirley', 'Orwen', 'Vermeil', 'Kulom', 'Tio', 'Nocti']
  .map(id => ({ hero: id, cost: HEROES[id].cost }));

// ---------- 角色百科：出身与语录 ----------
// 前五人取自 D:\Raitingu 正典设定；后五人为复刻版按同一世界观补写。
const LORE = {
  Licott: {
    lore: '拉文德市福格雷德家族的长女、公主。罕见的弓箭天才——世人传说她曾一箭飞过两个山头射中靶心。性格开朗直率、同理心强，总声称有某种「信念」推着她前行；但遇到挫折时，也会陷在其中很难自拔。',
    lines: {
      summon: '有我在，拉文德不会倒下。',
      die: '信念还在……就不算输……',
      extra: [
        { label: '得意', text: '悠扬之箭，从不落空。' },
        { label: '失意', text: '为什么……射不中了……' },
      ],
    },
  },
  Faros: {
    lore: '福格雷德家的次女。天赋极高的法师，戴一顶蓝色巫师帽，却几乎从不把天赋当回事。小时候追一只黑猫误入无人之地，与猫共度数月，回来时已学会大量法术。爱睡觉——有人说，她睡着的时候错过过很重要的事。',
    lines: {
      summon: '……先让我睡五分钟。',
      die: '这次……可别让我一个人看着……',
      extra: [
        { label: '日常', text: '哈？我可没有孩子。' },
        { label: '得意', text: '要不然是谁。' },
      ],
    },
  },
  Milanky: {
    lore: '福格雷德家最小的公主，九岁。总跟在两位姐姐身后。花草在她手里会安静下来——五色花、心萤草、夏日莲，都是她的朋友。',
    lines: {
      summon: '姐姐，我也能帮上忙！',
      die: '花谢了……还会再开的……',
      extra: [{ label: '得意', text: '花儿都在为我加油。' }],
    },
  },
  Vagro: {
    lore: '拉文德城外的铁匠，住在自己的铁匠铺里。北方锻造术的传人，糖浆爱好者。城里人的锅、犁与剑，都出自他的炉子。',
    lines: {
      summon: '炉子正热，来得正好。',
      die: '炉火……别让它灭了……',
      extra: [{ label: '得意', text: '哇！这是糖浆吗？' }],
    },
  },
  Shirley: {
    lore: '城里的普通女孩，十五岁。七岁那年父亲外出打工，至今未归；她与母亲相依为命。她的技能不需要魔力——寒天里的一碗热粥，本来就不需要什么代价。',
    lines: {
      summon: '我会照顾好大家的。',
      die: '爸爸……我等不到了……',
      extra: [{ label: '守护', text: '一隅天涯……换你活下去。' }],
    },
  },
  Orwen: {
    lore: '拉文德森林边缘的荆棘守林人。传说他原是一棵被天启之雨浇醒的老山楂树。话很少，却记得每一个进过森林的孩子的名字。',
    lines: {
      summon: '森林与我同在。',
      die: '树倒了……根还在。',
      extra: [{ label: '得意', text: '荆棘不伤自己人。' }],
    },
  },
  Vermeil: {
    lore: '拉文德图书馆的占星学徒，预言者波利亚的学生。夜夜记录星轨，相信每一次坠星都是天启留下的注脚。老师早已预言了一切——但她想亲眼看看。',
    lines: {
      summon: '星轨已经记下了这一刻。',
      die: '把我的笔记……交给波利亚……',
      extra: [{ label: '施法', text: '坠星，落。' }],
    },
  },
  Kulom: {
    lore: '瓦格罗铁匠铺里最大的作品——一门会自己行走的攻城炮。瓦格罗坚称造它只是为了搬重物。没有人相信。',
    lines: {
      summon: '装填完毕。',
      die: '零件……尚可再利用……',
      extra: [{ label: '轰击', text: '目标：城墙。' }],
    },
  },
  Tio: {
    lore: '茶山上的小精灵，寄宿在拉文德每年春季的第一株新芽里。哪里有它，哪里的土地就攒得下力气。',
    lines: {
      summon: '新芽冒头啦。',
      die: '明年春天……还会发芽的……',
      extra: [{ label: '春宴', text: '大家都来喝茶吧。' }],
    },
  },
  Nocti: {
    lore: '只在灾祸临近时出现的暗影蛾。有人说它是天启的信使，也有人说，它在猎杀天启的信使。没有人见过它落地。',
    lines: {
      summon: '……',
      die: '翅膀……会记得路……',
      extra: [{ label: '猎杀', text: '无声。' }],
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
