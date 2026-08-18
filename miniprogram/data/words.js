// data/words.js —— 内置示例词库（M1 用 emoji 占位插画）
// 字段：id, bookId, spell, phonetic, emoji, meaning, example, root, mnemonic, tags
// 后续可整体替换为云数据库 words 集合。

const BOOKS = [
  {
    bookId: 'daily',
    name: '日常高频词',
    desc: '生活场景必备 200 词（示例 30）',
    emoji: '🌞',
    color: '#4f6ef7'
  },
  {
    bookId: 'cet4',
    name: '四六级核心',
    desc: '考试高频词（示例 20）',
    emoji: '🎓',
    color: '#7b5cf0'
  }
]

const WORDS = [
  // ===== 日常高频词 =====
  { id: 'd01', bookId: 'daily', spell: 'apple', phonetic: '/ˈæpəl/', emoji: '🍎', meaning: '苹果', example: 'I eat an apple every morning.', root: 'a- (强调) + 古英语 æppel', mnemonic: 'a + pple 像红扑扑的苹果脸', tags: ['食物'] },
  { id: 'd02', bookId: 'daily', spell: 'cat', phonetic: '/kæt/', emoji: '🐱', meaning: '猫', example: 'The cat is sleeping.', root: '', mnemonic: 'cat 读音像“凯特”，想象凯特抱着猫', tags: ['动物'] },
  { id: 'd03', bookId: 'daily', spell: 'dog', phonetic: '/dɒɡ/', emoji: '🐶', meaning: '狗', example: 'A dog is a good friend.', root: '', mnemonic: 'dog 倒过来 god？不，狗是人类的好朋友', tags: ['动物'] },
  { id: 'd04', bookId: 'daily', spell: 'sun', phonetic: '/sʌn/', emoji: '☀️', meaning: '太阳', example: 'The sun rises in the east.', root: 'sol/sun (太阳)', mnemonic: 'sun 像“散”发光的太阳', tags: ['自然'] },
  { id: 'd05', bookId: 'daily', spell: 'moon', phonetic: '/muːn/', emoji: '🌙', meaning: '月亮', example: 'The moon is bright tonight.', root: 'mon (月)', mnemonic: 'moo 牛叫 + n，夜晚月亮下牛在叫', tags: ['自然'] },
  { id: 'd06', bookId: 'daily', spell: 'star', phonetic: '/stɑː/', emoji: '⭐', meaning: '星星', example: 'He is a rising star.', root: 'ster/star (星)', mnemonic: 'star 含“tar 塔”？想象塔顶的星星', tags: ['自然'] },
  { id: 'd07', bookId: 'daily', spell: 'tree', phonetic: '/triː/', emoji: '🌳', meaning: '树', example: 'Birds live in the tree.', root: '', mnemonic: 'tree 像三根树枝 tre', tags: ['自然'] },
  { id: 'd08', bookId: 'daily', spell: 'water', phonetic: '/ˈwɔːtə/', emoji: '💧', meaning: '水', example: 'Please drink more water.', root: 'wat (水)', mnemonic: 'wa(哇)+ter，哇渴了要喝水', tags: ['自然'] },
  { id: 'd09', bookId: 'daily', spell: 'fire', phonetic: '/ˈfaɪə/', emoji: '🔥', meaning: '火', example: 'Fire is dangerous.', root: 'pyr (火)', mnemonic: 'fire 像“发”火烧得很旺', tags: ['自然'] },
  { id: 'd10', bookId: 'daily', spell: 'book', phonetic: '/bʊk/', emoji: '📖', meaning: '书', example: 'This is a good book.', root: 'bibl (书)', mnemonic: 'book 谐音“布克”，布克爱读书', tags: ['学习'] },
  { id: 'd11', bookId: 'daily', spell: 'happy', phonetic: '/ˈhæpi/', emoji: '😊', meaning: '快乐的', example: 'I am happy today.', root: 'hap (运气/机会)', mnemonic: 'hap(好运)+py → 好运就 happy', tags: ['情绪'] },
  { id: 'd12', bookId: 'daily', spell: 'angry', phonetic: '/ˈæŋɡri/', emoji: '😠', meaning: '生气的', example: 'Don’t be angry.', root: 'ang (痛苦)', mnemonic: 'ang(昂)+ry，气得昂起头', tags: ['情绪'] },
  { id: 'd13', bookId: 'daily', spell: 'love', phonetic: '/lʌv/', emoji: '❤️', meaning: '爱', example: 'I love you.', root: '', mnemonic: 'love 谐音“辣舞”，辣舞很有爱', tags: ['情绪'] },
  { id: 'd14', bookId: 'daily', spell: 'friend', phonetic: '/frend/', emoji: '👫', meaning: '朋友', example: 'She is my friend.', root: 'fried (和平/自由)', mnemonic: 'fri(自由)+end，自由相处到尽头是朋友', tags: ['人'] },
  { id: 'd15', bookId: 'daily', spell: 'school', phonetic: '/skuːl/', emoji: '🏫', meaning: '学校', example: 'I go to school by bus.', root: 'schol (闲暇/学习)', mnemonic: 'school 谐音“斯库”，斯库去学校', tags: ['学习'] },
  { id: 'd16', bookId: 'daily', spell: 'teacher', phonetic: '/ˈtiːtʃə/', emoji: '👩‍🏫', meaning: '老师', example: 'Our teacher is kind.', root: 'teach + -er (人)', mnemonic: 'teach(教)+er(人)=教人的人', tags: ['人'] },
  { id: 'd17', bookId: 'daily', spell: 'student', phonetic: '/ˈstjuːdənt/', emoji: '🎓', meaning: '学生', example: 'He is a good student.', root: 'stud (学习) + -ent', mnemonic: 'stud(学)+ent → 学的人', tags: ['人'] },
  { id: 'd18', bookId: 'daily', spell: 'computer', phonetic: '/kəmˈpjuːtə/', emoji: '💻', meaning: '电脑', example: 'I work on a computer.', root: 'compute (计算) + -er', mnemonic: 'compute(算)+er=算东西的机器', tags: ['科技'] },
  { id: 'd19', bookId: 'daily', spell: 'phone', phonetic: '/fəʊn/', emoji: '📱', meaning: '电话', example: 'Call me on my phone.', root: 'phon (声音)', mnemonic: 'phon(声音)+e → 传声音的东西', tags: ['科技'] },
  { id: 'd20', bookId: 'daily', spell: 'music', phonetic: '/ˈmjuːzɪk/', emoji: '🎵', meaning: '音乐', example: 'I like music.', root: 'mus (缪斯/艺术)', mnemonic: 'mus(缪斯)+ic → 缪斯之神的艺术', tags: ['艺术'] },
  { id: 'd21', bookId: 'daily', spell: 'food', phonetic: '/fuːd/', emoji: '🍔', meaning: '食物', example: 'The food is delicious.', root: 'food (饲养/食物)', mnemonic: 'food 谐音“福的”，有食物是福', tags: ['食物'] },
  { id: 'd22', bookId: 'daily', spell: 'eat', phonetic: '/iːt/', emoji: '🍽️', meaning: '吃', example: 'Let’s eat lunch.', root: '', mnemonic: 'eat 谐音“伊特”，伊特在吃东西', tags: ['动作'] },
  { id: 'd23', bookId: 'daily', spell: 'sleep', phonetic: '/sliːp/', emoji: '😴', meaning: '睡觉', example: 'I sleep at 10 p.m.', root: 'sleep (松/软弱)', mnemonic: 's(轻声)+leep 像闭眼睡觉', tags: ['动作'] },
  { id: 'd24', bookId: 'daily', spell: 'run', phonetic: '/rʌn/', emoji: '🏃', meaning: '跑', example: 'He can run fast.', root: '', mnemonic: 'run 像人在“润”地跑', tags: ['动作'] },
  { id: 'd25', bookId: 'daily', spell: 'jump', phonetic: '/dʒʌmp/', emoji: '🦘', meaning: '跳', example: 'The rabbit can jump.', root: '', mnemonic: 'jump 谐音“酱普”，酱普跳一下', tags: ['动作'] },
  { id: 'd26', bookId: 'daily', spell: 'read', phonetic: '/riːd/', emoji: '📚', meaning: '读', example: 'I read a book.', root: 'read (理解/读)', mnemonic: 'read 谐音“瑞德”，瑞德在读书', tags: ['动作'] },
  { id: 'd27', bookId: 'daily', spell: 'write', phonetic: '/raɪt/', emoji: '✍️', meaning: '写', example: 'Please write your name.', root: 'writ (写)', mnemonic: 'write 谐音“瑞特”，瑞特写名字', tags: ['动作'] },
  { id: 'd28', bookId: 'daily', spell: 'speak', phonetic: '/spiːk/', emoji: '🗣️', meaning: '说', example: 'Can you speak English?', root: 'spec/speak (说)', mnemonic: 's(丝)+peak(峰) → 丝峰上演讲', tags: ['动作'] },
  { id: 'd29', bookId: 'daily', spell: 'listen', phonetic: '/ˈlɪsən/', emoji: '👂', meaning: '听', example: 'Listen to the music.', root: 'list (听/边缘)', mnemonic: 'lis(立思)+ten → 立着思考在听', tags: ['动作'] },
  { id: 'd30', bookId: 'daily', spell: 'think', phonetic: '/θɪŋk/', emoji: '💭', meaning: '思考', example: 'I think it is right.', root: 'think (思想)', mnemonic: 'think 谐音“星克”，星克在思考', tags: ['动作'] },

  // ===== 四六级核心 =====
  { id: 'c01', bookId: 'cet4', spell: 'abandon', phonetic: '/əˈbændən/', emoji: '📘', meaning: '放弃', example: 'He abandoned the plan.', root: 'a- (离开) + bandon (控制)', mnemonic: 'a(离开)+bandon(班登) → 离开班登放弃了', tags: ['动词'] },
  { id: 'c02', bookId: 'cet4', spell: 'ability', phonetic: '/əˈbɪləti/', emoji: '📘', meaning: '能力', example: 'She has the ability to lead.', root: 'able (能) + -ity (名词)', mnemonic: 'able(能)+ity → 能力', tags: ['名词'] },
  { id: 'c03', bookId: 'cet4', spell: 'absolute', phonetic: '/ˈæbsəluːt/', emoji: '📘', meaning: '绝对的', example: 'It is an absolute truth.', root: 'ab- (完全) + solute (松开)', mnemonic: 'ab(完全)+solute(松开) → 完全确定的', tags: ['形容词'] },
  { id: 'c04', bookId: 'cet4', spell: 'accept', phonetic: '/əkˈsept/', emoji: '📘', meaning: '接受', example: 'I accept your gift.', root: 'ac- (朝向) + cept (拿)', mnemonic: 'ac(朝)+cept(拿) → 朝前拿=接受', tags: ['动词'] },
  { id: 'c05', bookId: 'cet4', spell: 'access', phonetic: '/ˈækses/', emoji: '📘', meaning: '接近；入口', example: 'Access to the data is limited.', root: 'ac- (朝向) + cess (走)', mnemonic: 'ac(朝)+cess(走) → 走向=接近', tags: ['名词'] },
  { id: 'c06', bookId: 'cet4', spell: 'accident', phonetic: '/ˈæksɪdənt/', emoji: '📘', meaning: '事故', example: 'A car accident happened.', root: 'ac- (朝向) + cid (落下)', mnemonic: 'ac+cid(落)+ent → 突然落下=事故', tags: ['名词'] },
  { id: 'c07', bookId: 'cet4', spell: 'accomplish', phonetic: '/əˈkʌmplɪʃ/', emoji: '📘', meaning: '完成', example: 'We accomplished the task.', root: 'ac- + com- + plish (满)', mnemonic: 'a+com+plish(满) → 做满=完成', tags: ['动词'] },
  { id: 'c08', bookId: 'cet4', spell: 'accurate', phonetic: '/ˈækjərət/', emoji: '📘', meaning: '准确的', example: 'Give an accurate answer.', root: 'ac- + cur (关心/精确)', mnemonic: 'ac+cur(精确)+ate → 精确的', tags: ['形容词'] },
  { id: 'c09', bookId: 'cet4', spell: 'achieve', phonetic: '/əˈtʃiːv/', emoji: '📘', meaning: '达成', example: 'He achieved his dream.', root: 'a- + chief (头/结束)', mnemonic: 'a+chieve(头) → 到头了=达成', tags: ['动词'] },
  { id: 'c10', bookId: 'cet4', spell: 'acquire', phonetic: '/əˈkwaɪə/', emoji: '📘', meaning: '获得', example: 'She acquired new skills.', root: 'ac- + quir (寻求)', mnemonic: 'ac+quir(寻求)+e → 寻得=获得', tags: ['动词'] },
  { id: 'c11', bookId: 'cet4', spell: 'adapt', phonetic: '/əˈdæpt/', emoji: '📘', meaning: '适应', example: 'Plants adapt to change.', root: 'ad- (朝向) + apt (适合)', mnemonic: 'ad(朝)+apt(适合) → 变得适合=适应', tags: ['动词'] },
  { id: 'c12', bookId: 'cet4', spell: 'adequate', phonetic: '/ˈædɪkwət/', emoji: '📘', meaning: '足够的', example: 'We have adequate food.', root: 'ad- + equ (相等) + -ate', mnemonic: 'ad+equ(等)+ate → 等同所需=足够', tags: ['形容词'] },
  { id: 'c13', bookId: 'cet4', spell: 'adjust', phonetic: '/əˈdʒʌst/', emoji: '📘', meaning: '调整', example: 'Adjust the seat.', root: 'ad- + just (正确)', mnemonic: 'ad+just(正) → 调正=调整', tags: ['动词'] },
  { id: 'c14', bookId: 'cet4', spell: 'admire', phonetic: '/ədˈmaɪə/', emoji: '📘', meaning: '钦佩', example: 'I admire your courage.', root: 'ad- + mir (惊奇)', mnemonic: 'ad+mir(奇)+e → 惊奇=钦佩', tags: ['动词'] },
  { id: 'c15', bookId: 'cet4', spell: 'admit', phonetic: '/ədˈmɪt/', emoji: '📘', meaning: '承认', example: 'He admitted his mistake.', root: 'ad- + mit (送)', mnemonic: 'ad+mit(送) → 送上门=承认', tags: ['动词'] },
  { id: 'c16', bookId: 'cet4', spell: 'adopt', phonetic: '/əˈdɒpt/', emoji: '📘', meaning: '采纳；收养', example: 'They adopted a child.', root: 'ad- + opt (选择)', mnemonic: 'ad+opt(选) → 选过来=采纳', tags: ['动词'] },
  { id: 'c17', bookId: 'cet4', spell: 'advance', phonetic: '/ədˈvɑːns/', emoji: '📘', meaning: '前进', example: 'Science advances fast.', root: 'ad- + vanc (前)', mnemonic: 'ad+vance(前) → 向前=前进', tags: ['动词'] },
  { id: 'c18', bookId: 'cet4', spell: 'advantage', phonetic: '/ədˈvɑːntɪdʒ/', emoji: '📘', meaning: '优势', example: 'It is an advantage.', root: 'ad- + vant (前) + -age', mnemonic: 'ad+vant(前)+age → 在前面的=优势', tags: ['名词'] },
  { id: 'c19', bookId: 'cet4', spell: 'advice', phonetic: '/ədˈvaɪs/', emoji: '📘', meaning: '建议', example: 'Give me some advice.', root: 'ad- + vis (看)', mnemonic: 'ad+vis(看)+e → 看透后给=建议', tags: ['名词'] },
  { id: 'c20', bookId: 'cet4', spell: 'affect', phonetic: '/əˈfekt/', emoji: '📘', meaning: '影响', example: 'Weather affects mood.', root: 'af- + fect (做)', mnemonic: 'af+fect(做) → 对…做=影响', tags: ['动词'] }
]

/* 把词库切成关卡，每关 LEVEL_SIZE 个词 */
const LEVEL_SIZE = 10
function getBooks() { return BOOKS }
function getWords(bookId) { return WORDS.filter(w => w.bookId === bookId) }
function getWord(id) { return WORDS.find(w => w.id === id) }
function getLevelWords(bookId, levelIdx) {
  const list = getWords(bookId)
  const start = levelIdx * LEVEL_SIZE
  return list.slice(start, start + LEVEL_SIZE)
}
function getLevelCount(bookId) {
  return Math.ceil(getWords(bookId).length / LEVEL_SIZE)
}

module.exports = {
  BOOKS, WORDS,
  getBooks, getWords, getWord, getLevelWords, getLevelCount, LEVEL_SIZE
}
