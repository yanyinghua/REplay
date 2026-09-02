// data/novels.js —— 内置样书（双语阅读）：伊索寓言 · 4 则经典
// 英文为公共领域原典简写，中文为原创编译对照，无版权风险。
// 说明：云端可发布同名(novelId)更高 version 的内容 → 客户端自动提示/下载更新。
// 数据结构：
//   meta: { novelId, title, enTitle, author, desc, emoji, color, wordCount, chapterCount, version }
//   chapters: [{ seq, title, segments: [{ en, zh }] }]
const SAMPLE_NOVELS = [
  {
    meta: {
      novelId: 'aesop-fables',
      title: '伊索寓言 · 双语精选',
      enTitle: 'Aesop’s Fables · Selections',
      author: 'Aesop · 公版',
      desc: '内置样书：狐狸与葡萄、龟兔赛跑等 4 则经典寓言，中英对照',
      emoji: '🦊',
      color: '#e26d5a',
      wordCount: 620,
      chapterCount: 4,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'The Fox and the Grapes',
        segments: [
          { en: 'One hot day, a hungry fox saw some ripe grapes hanging high on a vine.', zh: '炎热的一天，一只饥饿的狐狸看到藤蔓高处挂着一串串熟透的葡萄。' },
          { en: 'He jumped again and again, but the grapes were too high for him to reach.', zh: '他跳了又跳，可葡萄挂得太高，他怎么也够不着。' },
          { en: 'At last he gave up and walked away, saying, "Those grapes must be sour anyway."', zh: '最后他只好放弃，边走边说：“那些葡萄反正一定是酸的。”' },
          { en: 'Moral: It is easy to despise what you cannot have.', zh: '寓意：得不到的东西，人们往往容易说它不好。' }
        ]
      },
      {
        seq: 1,
        title: 'The Tortoise and the Hare',
        segments: [
          { en: 'A hare once made fun of a tortoise for being so slow.', zh: '一只兔子嘲笑乌龟走路太慢。' },
          { en: 'The tortoise smiled and said, "Let us run a race and see who wins."', zh: '乌龟微笑着说：“那我们来赛跑，看谁先到终点。”' },
          { en: 'The hare ran fast, then grew proud and slept beside the road.', zh: '兔子跑得飞快，可它骄傲起来，便在路边睡着了。' },
          { en: 'The tortoise kept walking slowly and steadily, and passed the sleeping hare.', zh: '乌龟不紧不慢、一刻不停地向前走，超过了熟睡的兔子。' },
          { en: 'When the hare woke up, the tortoise had already reached the finish line.', zh: '兔子醒来时，乌龟早已到达了终点。' },
          { en: 'Moral: Slow and steady wins the race.', zh: '寓意：稳扎稳打，持之以恒，才能赢得最后的胜利。' }
        ]
      },
      {
        seq: 2,
        title: 'The North Wind and the Sun',
        segments: [
          { en: 'The North Wind and the Sun argued about which of them was stronger.', zh: '北风和太阳争论谁的力量更大。' },
          { en: 'They saw a traveler wearing a warm coat, and agreed to test their power on him.', zh: '它们看见一个穿着厚外套的旅人，便约定拿他来比试。' },
          { en: 'The North Wind blew as hard as he could, but the traveler only held his coat tighter.', zh: '北风拼命地刮，可旅人反而把外套裹得更紧了。' },
          { en: 'Then the Sun shone gently and warmly. Soon the traveler took off his coat gladly.', zh: '这时太阳温柔地照耀着。不一会儿，旅人就愉快地脱下了外套。' },
          { en: 'Moral: Persuasion is stronger than force.', zh: '寓意：温和的劝说，往往比强硬的逼迫更有力量。' }
        ]
      },
      {
        seq: 3,
        title: 'The Ant and the Grasshopper',
        segments: [
          { en: 'All summer long, the ant worked hard, storing food for winter.', zh: '整个夏天，蚂蚁都在辛勤劳作，为冬天储备粮食。' },
          { en: 'Meanwhile, the grasshopper sang and played all day in the warm sun.', zh: '而蚱蜢却在温暖的阳光下，整天唱歌玩耍。' },
          { en: 'When winter came, the grasshopper had nothing to eat.', zh: '冬天来了，蚱蜢什么吃的也没有。' },
          { en: 'The kind ant shared some grain and said, "Prepare today for what you need tomorrow."', zh: '善良的蚂蚁分给它一些谷粒，并说：“今天就要为明天做准备。”' },
          { en: 'Moral: There is a time for work and a time for play.', zh: '寓意：该工作的时候工作，该玩的时候玩，要先安身再享乐。' }
        ]
      }
    ]
  },
  {
    meta: {
      novelId: 'alice-wonderland',
      title: '爱丽丝漫游奇境 · 双语精选',
      enTitle: 'Alice’s Adventures in Wonderland · Selections',
      author: 'Lewis Carroll · 公版',
      desc: '好奇心爆棚的爱丽丝掉进兔子洞，遇见柴郡猫、疯帽匠……经典开篇三章',
      emoji: '🐇',
      color: '#7b5cf0',
      wordCount: 380,
      chapterCount: 3,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'Down the Rabbit-Hole',
        segments: [
          { en: 'Alice was beginning to get very tired of sitting by her sister on the river bank, with nothing to do.', zh: '爱丽丝坐在姐姐身旁的河岸上，无事可做，渐渐觉得非常无聊。' },
          { en: 'Suddenly a White Rabbit with pink eyes ran close by her.', zh: '忽然，一只长着粉红眼睛的白兔从她身边跑过。' },
          { en: 'It took a watch out of its waistcoat pocket and cried, "Oh dear! I shall be late!"', zh: '它从背心口袋里掏出一只怀表，叫道：“哎呀！我要迟到了！”' },
          { en: 'Alice jumped up and ran after it, never once thinking how she would get out again.', zh: '爱丽丝跳起来追了上去，压根没想过自己还怎么出来。' },
          { en: 'She saw it pop down a large rabbit-hole under the hedge, and in she went after it.', zh: '她看见兔子钻进篱笆下的大兔子洞，也紧跟了进去。' },
          { en: 'Down, down, down she fell, past shelves and cupboards, past maps and pictures.', zh: '她不停地往下掉，经过架子、碗柜，经过地图和图画。' },
          { en: 'At last she landed softly on a heap of dry leaves, and the fall was over.', zh: '最后她轻轻地落在一堆枯叶上，坠落终于结束了。' }
        ]
      },
      {
        seq: 1,
        title: 'The Pool of Tears',
        segments: [
          { en: 'In the hall at the bottom she found a tiny golden key on a glass table.', zh: '洞底的厅堂里，她发现玻璃小桌上放着一把金钥匙。' },
          { en: 'The key opened a tiny door only fifteen inches high.', zh: '这把钥匙打开了一扇只有十五英寸高的小门。' },
          { en: 'Through the door she saw a lovely garden, but she was far too big to squeeze through.', zh: '门那边是一座可爱的花园，可她个子太大，怎么也钻不过去。' },
          { en: 'On the table she now found a little bottle with a paper label: "DRINK ME".', zh: '这时桌上出现了一个小瓶子，瓶上标签写着“喝我”。' },
          { en: 'Alice tasted it, and she began to shrink until she was only ten inches tall.', zh: '爱丽丝尝了一口，便开始缩小，一直缩到只有十英寸高。' },
          { en: '"What a curious feeling!" she said. "I am opening out like the largest telescope that ever was!"', zh: '“这种感觉真奇怪！”她说，“我正像一架最大的望远镜那样展开来！”' }
        ]
      },
      {
        seq: 2,
        title: 'A Mad Tea-Party',
        segments: [
          { en: 'Later she met a Cheshire Cat sitting in a tree, grinning from ear to ear.', zh: '后来，她遇见一只坐在树上的柴郡猫，它咧着嘴笑得合不拢。' },
          { en: '"Would you tell me, please, which way I ought to go from here?" asked Alice.', zh: '爱丽丝问：“请问，从这里我该往哪条路走呢？”' },
          { en: '"That depends a good deal on where you want to get to," said the Cat.', zh: '猫说：“那得看你想去哪儿。”' },
          { en: 'At a little house, the March Hare and the Hatter were having tea at a long table.', zh: '在一座小屋前，三月兔和疯帽匠正围着一张长桌喝茶。' },
          { en: '"No room! No room!" they cried out as soon as they saw Alice coming.', zh: '他们一看到爱丽丝走来，就大声喊道：“没位子！没位子！”' },
          { en: 'It was the strangest tea-party Alice had ever seen, and every moment grew curiouser and curiouser.', zh: '这是爱丽丝见过的最奇怪的茶会，而且每一刻都越来越奇妙。' }
        ]
      }
    ]
  },
  {
    meta: {
      novelId: 'wizard-oz',
      title: '绿野仙踪 · 双语精选',
      enTitle: 'The Wonderful Wizard of Oz · Selections',
      author: 'L. Frank Baum · 公版',
      desc: '多萝西与小狗托托被龙卷风带到奥兹国，沿黄砖路去寻找回家的方法',
      emoji: '🦁',
      color: '#ff9d5c',
      wordCount: 350,
      chapterCount: 3,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'The Cyclone',
        segments: [
          { en: 'Dorothy lived in the middle of the great Kansas prairies, with Uncle Henry and Aunt Em.', zh: '多萝西和亨利叔叔、埃姆婶婶住在堪萨斯州中部广袤的大草原上。' },
          { en: 'One day a great cyclone came, and the little house was lifted high up into the air.', zh: '一天，一场巨大的龙卷风袭来，小房子被卷到了高高的空中。' },
          { en: 'The house spun around for a long time, until at last it came down with a bump.', zh: '房子在空中旋转了很久，最后砰的一声落回地面。' },
          { en: 'Dorothy ran outside and found herself in a lovely land of green fields and blue skies.', zh: '多萝西跑出屋子，发现自己落在一片绿野蓝天的美丽土地上。' },
          { en: '"You are welcome, most noble Sorceress! You have killed the Wicked Witch of the East!" cried the little people.', zh: '小人们喊道：“欢迎您，尊贵的女魔法师！您杀死了东方恶女巫！”' }
        ]
      },
      {
        seq: 1,
        title: 'The Road of Yellow Bricks',
        segments: [
          { en: 'Dorothy asked how she could ever get back home to Kansas.', zh: '多萝西问，她怎样才能回到堪萨斯的家。' },
          { en: 'The little people told her to follow the yellow brick road to the Emerald City.', zh: '小人们告诉她，沿着黄砖路就能走到翡翠城。' },
          { en: '"Only the great Wizard of Oz can help you," they said.', zh: '他们说：“只有伟大的奥兹魔法师才能帮你。”' },
          { en: 'So Dorothy put on the silver shoes of the dead witch and began her long journey.', zh: '于是，多萝西穿上已死女巫留下的银鞋，开始了漫长的旅程。' },
          { en: 'She took her little dog Toto with her, and off they went down the yellow road.', zh: '她带上她的小狗托托，一起沿着那条黄砖路出发了。' }
        ]
      },
      {
        seq: 2,
        title: 'The Three Friends',
        segments: [
          { en: 'On the way she met a Scarecrow who wished for a brain.', zh: '路上，她遇见一个渴望得到大脑的稻草人。' },
          { en: '"Come with me to the Emerald City," said Dorothy, "and the Wizard may give you one."', zh: '多萝西说：“跟我一起去翡翠城吧，也许魔法师能给你一个。”' },
          { en: 'Then they met a Tin Woodman who wished for a heart, and a Cowardly Lion who wished to be brave.', zh: '接着，他们遇到想要一颗心的铁皮人，以及想要变得勇敢的胆小狮子。' },
          { en: 'The five of them walked together along the yellow brick road.', zh: '他们五个一起沿着黄砖路前行。' },
          { en: 'They hoped that the great Wizard could send Dorothy home, and help each of them too.', zh: '他们希望伟大的魔法师能送多萝西回家，也能帮到每一个人。' }
        ]
      }
    ]
  },
  {
    meta: {
      novelId: 'secret-garden',
      title: '秘密花园 · 双语精选',
      enTitle: 'The Secret Garden · Selections',
      author: 'Frances Hodgson Burnett · 公版',
      desc: '孤僻的小玛丽住进叔叔的大庄园，发现一座被锁十年的秘密花园',
      emoji: '🌸',
      color: '#3fae6e',
      wordCount: 360,
      chapterCount: 3,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'The Little Girl Nobody Wanted',
        segments: [
          { en: 'Mary Lennox was born in India, where her father worked for the government.', zh: '玛丽·伦诺克斯出生在印度，她的父亲在那里为政府工作。' },
          { en: 'She was a sickly, cross little girl, because everyone had always done everything for her.', zh: '她是个体弱又爱生气的小女孩，因为人人都惯着她。' },
          { en: 'One day a terrible sickness swept through the house, and both her parents died.', zh: '一天，一场可怕的瘟疫席卷了她家，父母双双去世。' },
          { en: 'Mary was sent to England, to live with her uncle at Misselthwaite Manor.', zh: '玛丽被送回英国，住到叔叔的米塞尔斯韦特庄园。' },
          { en: 'It was a huge, old house on the edge of a moor, with close to a hundred rooms.', zh: '那是荒野边上的一座古老的大宅，有上百个房间。' }
        ]
      },
      {
        seq: 1,
        title: 'The Key to the Garden',
        segments: [
          { en: 'Mary heard stories of a garden that her uncle had kept locked for ten years.', zh: '玛丽听说有一座被叔叔锁了十年的花园。' },
          { en: 'One morning, a friendly robin showed her a key lying half-buried in the earth.', zh: '一天清晨，一只友善的知更鸟让她发现了一把半埋在土里的钥匙。' },
          { en: 'She tried the key in the old garden door, and it turned with a click.', zh: '她把钥匙插进花园旧门上的锁孔，咔哒一声，门开了。' },
          { en: 'Inside, bare rose vines climbed the walls, but the branches were still alive.', zh: '园里，光秃秃的玫瑰藤蔓爬满围墙，可枝条还活着。' },
          { en: '"I shall bring this garden back to life," Mary whispered to herself.', zh: '玛丽轻声对自己说：“我要让这座花园重新活过来。”' }
        ]
      },
      {
        seq: 2,
        title: 'The Magic of Spring',
        segments: [
          { en: 'Day by day, Mary dug the dark earth and pulled out the tangled weeds.', zh: '玛丽日复一日地翻松泥土，拔除纠缠的杂草。' },
          { en: 'She even helped her cousin Colin, who believed he could never walk, to come into the garden.', zh: '她甚至把自认永远站不起来的表弟柯林带进了花园。' },
          { en: 'Then spring came, and the garden burst into fresh green leaves and bright blossoms.', zh: '春天来了，花园一下子冒出嫩绿的新叶和明艳的花朵。' },
          { en: 'Colin grew stronger every day, and at last he stood up and walked.', zh: '柯林一天天强壮起来，最后他终于站起来，迈开了步子。' },
          { en: '"It is magic!" he cried. "The magic of growing things, and of believing."', zh: '他喊道：“这是魔法！是万物生长的魔法，也是信念的魔法。”' }
        ]
      }
    ]
  },
  {
    meta: {
      novelId: 'pride-prejudice',
      title: '傲慢与偏见 · 双语精选',
      enTitle: 'Pride and Prejudice · Selections',
      author: 'Jane Austen · 公版',
      desc: '伊丽莎白初遇傲慢的达西先生，一段关于偏见与真心的故事由此开始',
      emoji: '💍',
      color: '#c96f8c',
      wordCount: 360,
      chapterCount: 3,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'A Truth Universally Acknowledged',
        segments: [
          { en: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.', zh: '凡是有钱的单身汉，总想娶位太太，这已经成了一条举世公认的真理。' },
          { en: 'When a rich young man called Mr Bingley came to live at Netherfield Park, the whole neighbourhood talked of nothing else.', zh: '一位名叫彬格莱的富家青年搬进尼日斐花园后，附近的邻居们议论纷纷。' },
          { en: 'Mrs Bennet had five unmarried daughters, and she hoped that one of them would marry him.', zh: '班纳特太太有五个待嫁的女儿，她盼着其中能有一位嫁给彬格莱先生。' },
          { en: '"Netherfield is taken by a young man of large fortune!" she told her husband.', zh: '她兴冲冲地对丈夫说：“尼日斐花园被一个家产丰厚的年轻人租下啦！”' },
          { en: '"It is the truth," she added, "that he is to be in possession of it before Michaelmas."', zh: '她又补充道：“听说他在米迦勒节前就要搬进来住了，这可是千真万确的。”' }
        ]
      },
      {
        seq: 1,
        title: 'The Ball at Meryton',
        segments: [
          { en: 'At the ball, Mr Bingley danced twice with the eldest Miss Bennet, and was thought very agreeable.', zh: '舞会上，彬格莱先生与大女儿简跳了两支舞，大家都觉得他十分和蔼可亲。' },
          { en: 'His friend Mr Darcy was tall and handsome, but proud and cold in his manners.', zh: '他的朋友达西先生高大英俊，却神情傲慢、态度冷淡。' },
          { en: 'He danced only twice, with the two ladies of his own party, and seemed unwilling to speak to anyone else.', zh: '他只和自己的两位女伴跳舞，似乎不愿理会旁人。' },
          { en: 'Elizabeth Bennet sat nearby, lively and clever, and overheard every word.', zh: '活泼聪慧的伊丽莎白·班纳特就坐在附近，把他们的谈话听得清清楚楚。' },
          { en: '"She is tolerable; but not handsome enough to tempt me," said Darcy of her.', zh: '达西谈起她时说：“她还可以，但还没漂亮到能打动我的心。”' }
        ]
      },
      {
        seq: 2,
        title: 'A Growing Prejudice',
        segments: [
          { en: 'Elizabeth heard his rude words and took a strong dislike to him.', zh: '伊丽莎白听到他无礼的话，对他生出了深深的反感。' },
          { en: '"A man who has no feeling for others can never be truly great," she thought.', zh: '她想：“一个对他人毫无感情的人，绝不会真正了不起。”' },
          { en: 'Some weeks later, a charming officer named Mr Wickham told her that Darcy had once treated him very cruelly.', zh: '几周后，一位迷人的军官威克姆告诉她，达西曾经待他十分刻薄。' },
          { en: 'Elizabeth believed the story at once, and her dislike of Darcy grew even stronger.', zh: '伊丽莎白立刻信了这番话，对达西的反感又深了一层。' },
          { en: 'Little did she know that the proud gentleman had already begun to admire her.', zh: '她哪里知道，那位傲慢的绅士其实已经开始悄悄欣赏她了。' }
        ]
      }
    ]
  },
  {
    meta: {
      novelId: 'wind-willows',
      title: '柳林风声 · 双语精选',
      enTitle: 'The Wind in the Willows · Selections',
      author: 'Kenneth Grahame · 公版',
      desc: '鼹鼠第一次离开地洞，与水鼠、蟾蜍和獾在河畔开启田园冒险',
      emoji: '🦡',
      color: '#5a6ea8',
      wordCount: 370,
      chapterCount: 3,
      version: 1
    },
    chapters: [
      {
        seq: 0,
        title: 'The River Bank',
        segments: [
          { en: 'The Mole had been working very hard all the morning, cleaning his little underground home.', zh: '鼹鼠整个上午都在忙着清扫他那小小的地下之家。' },
          { en: 'Spring was moving in the air above and in the earth below, and he suddenly threw down his brush.', zh: '春的气息弥漫在空气里，也渗进了泥土里，他忽然扔下刷子。' },
          { en: 'Up he climbed, out of his dark hole, and stood blinking in the warm sunshine.', zh: '他爬出昏暗的地洞，站在暖融融的阳光里，眨了眨眼睛。' },
          { en: 'It was the first time in his whole life that he had ever left his home.', zh: '这是他一生中头一回离开家。' },
          { en: 'Along the river bank he came upon the Water Rat, who was sitting in a little boat.', zh: '在河岸边，他遇见了坐在一条小船上的水鼠。' }
        ]
      },
      {
        seq: 1,
        title: 'Mess About in Boats',
        segments: [
          { en: '"There is nothing — absolutely nothing — half so much worth doing as simply messing about in boats," said the Rat.', zh: '水鼠说：“没什么——绝对没什么——比在河上划着小船闲逛更值得做的事了。”' },
          { en: 'The Mole rested his chin on his paws and listened, quite taken with the river life.', zh: '鼹鼠托着下巴听得入神，完全被河上的生活迷住了。' },
          { en: 'For many days the two friends rowed, picnicked and fished together.', zh: '一连许多天，两个朋友一起划船、野餐、钓鱼。' },
          { en: 'Then the Rat led the Mole across the meadow to meet their rich friend Mr Toad.', zh: '后来，水鼠带着鼹鼠穿过草地，去拜访他们有钱的朋友蟾蜍先生。' },
          { en: 'Toad was kind and full of ideas, and he was completely mad about motor-cars.', zh: '蟾蜍善良又满脑子主意，还对汽车疯狂着迷。' }
        ]
      },
      {
        seq: 2,
        title: 'The Wild Wood',
        segments: [
          { en: 'One winter night, the Mole wandered alone into the Wild Wood in search of the kind Badger.', zh: '一个冬夜，鼹鼠独自走进野树林，想去找好心的獾先生。' },
          { en: 'The wood grew dark, and strange faces seemed to peer out from every hole.', zh: '树林越来越暗，仿佛每个洞口都有怪异的脸在窥视。' },
          { en: 'Poor Mole ran this way and that, until at last he hid trembling in the hollow of an old tree.', zh: '可怜的鼹鼠东奔西跑，最后躲进一棵老树的树洞里，瑟瑟发抖。' },
          { en: 'The Rat searched until he found him, and comforted him with warm words.', zh: '水鼠一路寻找，终于找到了他，用温暖的话安慰他。' },
          { en: 'Sure enough, the kind Badger soon came and led them both into his snug underground home.', zh: '果然，好心的獾先生很快就来了，把他们俩领进自己温暖舒适的地下之家。' }
        ]
      }
    ]
  }
]

module.exports = { SAMPLE_NOVELS }
