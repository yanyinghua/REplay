// fallback.js —— 当外部 RSS/翻译全部不可用时，作为云端每日热点的兜底双语短句池
// 与 miniprogram/data/trending.js 内容保持一致，保证无网/外网不通时首页仍有内容可滚动。
// 句子为常青型科普/生活话题，不虚构新闻事实。
const OFFLINE_ITEMS = [
  { cat: 'tech', en: 'Electric cars are getting cheaper, and more charging stations are being built every year.', zh: '电动汽车越来越便宜，各地每年都在新建更多充电站。' },
  { cat: 'tech', en: 'Artificial intelligence now helps doctors read X-rays and find problems faster.', zh: '人工智能如今正帮医生更快地读取X光片、发现问题。' },
  { cat: 'tech', en: 'Many schools are teaching children to code, because computers are everywhere.', zh: '许多学校开始教孩子编程，因为电脑已无处不在。' },
  { cat: 'tech', en: 'Robots now help pack boxes in warehouses, while workers learn how to fix and manage them.', zh: '如今机器人在仓库里帮忙打包，而工人们学着维修和管理它们。' },
  { cat: 'tech', en: 'Video calls make it easy for families and friends to stay in touch across long distances.', zh: '视频通话让相隔千里的家人朋友也能轻松保持联系。' },
  { cat: 'business', en: 'More young people today start their own small online businesses.', zh: '如今，越来越多年轻人创办自己的小型线上生意。' },
  { cat: 'business', en: 'When shipping costs rise, the price of goods in shops often rises too.', zh: '航运成本上涨时，商店里商品的价格往往也会跟着上涨。' },
  { cat: 'business', en: 'Good companies listen to their customers before they design new products.', zh: '优秀的企业在设计新产品之前，会先倾听顾客的声音。' },
  { cat: 'business', en: 'Many small shops now take orders through chat apps instead of phone calls.', zh: '如今许多小店通过聊天软件而不是打电话来接单。' },
  { cat: 'business', en: 'Reading financial news regularly helps people make wiser buying decisions.', zh: '经常阅读财经资讯，能帮人们做出更明智的消费决定。' },
  { cat: 'science', en: 'Scientists grow new skin cells in the lab to help people with burns.', zh: '科学家在实验室里培育新的皮肤细胞，用来帮助烧伤患者。' },
  { cat: 'science', en: 'Small daily habits can change how the brain stores and recalls memories.', zh: '每天的小习惯，能改变大脑储存和回忆记忆的方式。' },
  { cat: 'science', en: 'The world’s oceans are becoming warmer, and sea levels are rising slowly.', zh: '全球海洋正逐渐变暖，海平面也在缓慢上升。' },
  { cat: 'science', en: 'Astronomers keep finding distant planets that might hold water or air.', zh: '天文学家不断发现遥远的行星，它们可能含有水或空气。' },
  { cat: 'science', en: 'Migrating birds fly thousands of miles and still manage to find their way home.', zh: '迁徙的鸟类飞行数千英里，依然能找到回家的路。' },
  { cat: 'health', en: 'Walking for thirty minutes a day can greatly improve heart health.', zh: '每天步行三十分钟，能显著改善心脏健康。' },
  { cat: 'health', en: 'Getting enough sleep helps the brain clean out waste proteins at night.', zh: '充足的睡眠能帮助大脑在夜间清除废弃的蛋白质。' },
  { cat: 'health', en: 'Eating more vegetables and fewer sugary drinks is a simple way to feel better.', zh: '多吃蔬菜、少喝含糖饮料，是让身体感觉更好的一种简单方法。' },
  { cat: 'health', en: 'Drinking enough water during the day keeps your body and mind working well.', zh: '白天喝够水，能让你的身心保持良好运转。' },
  { cat: 'health', en: 'Short breaks during long study sessions help you remember more of what you learn.', zh: '长时间学习中间穿插短暂休息，能帮你记住更多学过的内容。' },
  { cat: 'sport', en: 'Marathon runners usually train for months before race day arrives.', zh: '马拉松选手通常在比赛日到来前，要训练好几个月。' },
  { cat: 'sport', en: 'Team sports teach children how to cooperate and how to accept defeat.', zh: '团队运动教会孩子如何合作，也教会他们如何接受失败。' },
  { cat: 'sport', en: 'Warming up before exercise can prevent many small injuries.', zh: '运动前热身，可以避免许多小伤小痛。' },
  { cat: 'sport', en: 'Swimming is a full-body exercise that is gentle on the knees.', zh: '游泳是全身运动，而且对膝盖很友好。' },
  { cat: 'sport', en: 'Many runners keep a training diary to record their times and how they feel.', zh: '许多跑者会写训练日记，记录用时和身体感受。' },
  { cat: 'entertainment', en: 'Animation studios now mix traditional drawing with computer effects.', zh: '动画工作室如今常把传统手绘与电脑特效结合在一起。' },
  { cat: 'entertainment', en: 'Streaming platforms have changed the way people watch films and shows.', zh: '流媒体平台改变了人们看电影、追剧的方式。' },
  { cat: 'entertainment', en: 'A good story can teach us more than a hundred lessons at school.', zh: '一个好故事教给我们的，往往比学校的上百节课还多。' },
  { cat: 'entertainment', en: 'Some films are adapted from popular books, and fans love comparing the two.', zh: '有些电影改编自热门图书，粉丝们最爱把电影和原著拿来比较。' },
  { cat: 'entertainment', en: 'Podcasts let people listen to stories and news while doing housework.', zh: '播客让人们在做家务时也能收听故事和新闻。' }
]

module.exports = { OFFLINE_ITEMS }
