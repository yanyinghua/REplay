// cloudfunctions/pk/questionPool.js —— 题池生成（服务端权威，纯函数）
// 与 M3_PK_DETAIL.md §A 一致：共享题池、同词同序、正确项仅服务端保存
const words = require('./words.js');
const { shuffle } = require('./util.js');

// 从 bookId/level 抽取 count 个不重复词（不足补全书）
function pickWords(bookId, level, count) {
  const inLevel = words.getLevelWords(bookId, level);
  const all = words.getWords(bookId);
  let chosen = shuffle(inLevel).slice(0, count);
  if (chosen.length < count) {
    const rest = shuffle(all.filter((w) => !inLevel.some((x) => x.id === w.id)));
    chosen = chosen.concat(rest.slice(0, count - chosen.length));
  }
  return chosen;
}

// 生成题池：每个元素 { wordId, display{emoji,meaning,phonetic,options}, correct }
// display 不下发 correct；correct 由 pkStart 拆分存 pk_secrets
function buildPool(bookId, level, count) {
  count = count || 12;
  const source = pickWords(bookId, level, count);
  const allSpells = words.getWords(bookId).map((w) => w.spell);
  return source.map((w) => {
    const distract = shuffle(allSpells.filter((s) => s !== w.spell)).slice(0, 3);
    const options = shuffle([w.spell, ...distract]); // 服务端一次性洗牌并固定
    return {
      wordId: w.id,
      display: { emoji: w.emoji, meaning: w.meaning, phonetic: w.phonetic, options },
      correct: options.indexOf(w.spell),
    };
  });
}

module.exports = { buildPool, pickWords };
