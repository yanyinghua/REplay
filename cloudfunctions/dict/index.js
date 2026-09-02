// cloudfunctions/dict/index.js —— 在线查词 / 自由翻译
// 用法：客户端 wx.cloud.callFunction({ name:'dict', data:{ text } })
//   text 是纯英文单词 → 有道词典返回 音标/中文释义/词形/双语例句
//   中文或句子/短语   → MyMemory 中英互译
// 云函数出网不受小程序 request 合法域名白名单限制，故正式版也可用
const https = require('https');

exports.main = async (e) => {
  const text = String((e && e.text) || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return { ok: false, error: '请输入要查的内容' };

  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const isSingleWord = /^[A-Za-z][A-Za-z'’-]*$/.test(text);

  // 纯英文单词 → 词典释义
  if (isSingleWord && !hasCjk) {
    const dictRes = await lookupDict(text).catch(() => null);
    if (dictRes && dictRes.senses && dictRes.senses.length) {
      return Object.assign({ ok: true, mode: 'dict' }, dictRes);
    }
    // 词典没查到该词 → 用翻译兜底（也能拿到大意）
  }

  // 中文 / 句子 / 短语 → 翻译
  const dir = hasCjk ? 'zh-CN|en' : 'en|zh-CN';
  const tr = await translate(text, dir).catch(() => null);
  if (tr && normKey(tr) !== normKey(text)) {
    return {
      ok: true, mode: 'translate',
      text,
      translated: tr,
      from: hasCjk ? 'zh' : 'en',
      to: hasCjk ? 'en' : 'zh'
    };
  }
  if (isSingleWord && !hasCjk) {
    return { ok: false, error: '词典和翻译都没有找到这个词，换个拼写试试？' };
  }
  return { ok: false, error: '在线服务暂时不可用，请稍后重试' };
};

// ---------- 有道词典 ----------
async function lookupDict(word) {
  const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word);
  const json = await httpGetJson(url);
  const w = json && json.ec && json.ec.word && json.ec.word[0];
  if (!w) return null;

  const senses = [];
  (w.trs || []).forEach((t) => {
    (t.tr || []).forEach((r) => {
      const l = (r && r.l) || {};
      (l.i || []).forEach((s) => {
        const v = String(s || '').trim();
        if (v) senses.push(v);
      });
    });
  });

  const pairs = (json.blng_sents_part && json.blng_sents_part['sentence-pair']) || [];
  const examples = pairs.slice(0, 3).map((p) => ({
    en: String(p.sentence || p['sentence-eng'] || '').trim(),
    zh: String(p['sentence-translation'] || '').trim()
  })).filter((p) => p.en);

  const forms = (w.wfs || []).map((f) => ({
    name: String((f.wf && f.wf.name) || '').trim(),
    value: String((f.wf && f.wf.value) || '').trim()
  })).filter((f) => f.name && f.value);

  return {
    word: word,
    ukPhonetic: String(w.ukphone || '').trim(),
    usPhonetic: String(w.usphone || '').trim(),
    senses,
    forms,
    examples,
    source: '有道词典'
  };
}

// ---------- MyMemory 免费翻译（中英互译） ----------
async function translate(text, langpair) {
  const url = 'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) + '&langpair=' + encodeURIComponent(langpair);
  const json = await httpGetJson(url);
  if (!json || json.responseStatus !== 200) return null;
  let out = json.responseData && json.responseData.translatedText;
  if (typeof out !== 'string' || !out.trim()) return null;
  // 免费额度耗尽时的提示串视为失败
  if (out.indexOf('MYMEMORY WARNING') >= 0) return null;
  return out.replace(/\s*\n\s*/g, '\n').trim();
}

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

// ---------- HTTP GET → JSON ----------
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReadEnglish/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('http ' + res.statusCode));
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.setTimeout(9000, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}
