// data/trending.js —— 离线保底双语短句（无网 / 云内容流不可用时兜底）
// 说明：云端「今日热点」成功时会替换本内容；这里的句子是常青型科普/生活话题，
//       不虚构新闻事实，保证任何离线状态下首页热点卡都有内容可滚动。
// 结构：OFFLINE_ITEMS = [{ cat, en, zh }]
// cat ∈ tech / business / science / health / sport / entertainment
const OFFLINE_ITEMS = [
  { cat: 'tech', en: 'Electric cars are getting cheaper, and more charging stations are being built every year.', zh: '电动汽车越来越便宜，各地每年都在新建更多充电站。' },
  { cat: 'tech', en: 'Artificial intelligence now helps doctors read X-rays and find problems faster.', zh: '人工智能如今正帮医生更快地读取X光片、发现问题。' },
  { cat: 'tech', en: 'Many schools are teaching children to code, because computers are everywhere.', zh: '许多学校开始教孩子编程，因为电脑已无处不在。' },
  { cat: 'business', en: 'More young people today start their own small online businesses.', zh: '如今，越来越多年轻人创办自己的小型线上生意。' },
  { cat: 'business', en: 'When shipping costs rise, the price of goods in shops often rises too.', zh: '航运成本上涨时，商店里商品的价格往往也会跟着上涨。' },
  { cat: 'business', en: 'Good companies listen to their customers before they design new products.', zh: '优秀的企业在设计新产品之前，会先倾听顾客的声音。' },
  { cat: 'science', en: 'Scientists grow new skin cells in the lab to help people with burns.', zh: '科学家在实验室里培育新的皮肤细胞，用来帮助烧伤患者。' },
  { cat: 'science', en: 'Small daily habits can change how the brain stores and recalls memories.', zh: '每天的小习惯，能改变大脑储存和回忆记忆的方式。' },
  { cat: 'science', en: 'The world’s oceans are becoming warmer, and sea levels are rising slowly.', zh: '全球海洋正逐渐变暖，海平面也在缓慢上升。' },
  { cat: 'health', en: 'Walking for thirty minutes a day can greatly improve heart health.', zh: '每天步行三十分钟，能显著改善心脏健康。' },
  { cat: 'health', en: 'Getting enough sleep helps the brain clean out waste proteins at night.', zh: '充足的睡眠能帮助大脑在夜间清除废弃的蛋白质。' },
  { cat: 'health', en: 'Eating more vegetables and fewer sugary drinks is a simple way to feel better.', zh: '多吃蔬菜、少喝含糖饮料，是让身体感觉更好的一种简单方法。' },
  { cat: 'sport', en: 'Marathon runners usually train for months before race day arrives.', zh: '马拉松选手通常在比赛日到来前，要训练好几个月。' },
  { cat: 'sport', en: 'Team sports teach children how to cooperate and how to accept defeat.', zh: '团队运动教会孩子如何合作，也教会他们如何接受失败。' },
  { cat: 'sport', en: 'Warming up before exercise can prevent many small injuries.', zh: '运动前热身，可以避免许多小伤小痛。' },
  { cat: 'entertainment', en: 'Animation studios now mix traditional drawing with computer effects.', zh: '动画工作室如今常把传统手绘与电脑特效结合在一起。' },
  { cat: 'entertainment', en: 'Streaming platforms have changed the way people watch films and shows.', zh: '流媒体平台改变了人们看电影、追剧的方式。' },
  { cat: 'entertainment', en: 'A good story can teach us more than a hundred lessons at school.', zh: '一个好故事教给我们的，往往比学校的上百节课还多。' }
]

module.exports = { OFFLINE_ITEMS }
