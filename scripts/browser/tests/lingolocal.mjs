const URL_ = 'http://localhost:8811/5_lingo_local/index.html';
export default async (t) => {
  await t.goto(URL_);
  await t.sleep(600);
  const a = await t.evaluate(() => {
    window.__played = [];
    const RealAudio = window.Audio;
    window.Audio = function (src) { window.__played.push(src); const a = new RealAudio(src); a.play = () => Promise.resolve(); return a; };
    return {
      splash: document.getElementById('splash').classList.contains('hide'),
      viewport: document.querySelector('meta[name=viewport]').content,
      streak: document.getElementById('streakCount').textContent,
      textLight: getComputedStyle(document.documentElement).getPropertyValue('--text-light').trim(),
      barTransform: document.getElementById('overallProgressBar').style.transform,
      cardRole: document.querySelector('.scenario-card').getAttribute('role')
    };
  });
  t.check('renders without the fixed splash delay', a.splash);
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport), a.viewport);
  t.check('no streak before any practice', a.streak === '0', a.streak);
  t.check('faint text token passes AA', a.textLight.toUpperCase() === '#6F6863', a.textLight);
  t.check('progress bars animate transform, not width', /scaleX/.test(a.barTransform), a.barTransform);
  t.check('scenario cards are keyboard buttons', a.cardRole === 'button');

  // Search -> play -> bookmark.
  const s = await t.evaluate(() => {
    const box = document.getElementById('phraseSearch');
    box.value = 'stop'; renderSearch();
    const hits = [...document.querySelectorAll('.search-hit .saved-en')].map(x => x.textContent);
    const listHidden = document.getElementById('scenariosList').hidden;
    const i = searchHits.findIndex(h => h.p.en === 'Stop here');
    playHit(i);
    const btn = document.querySelectorAll('.search-hit')[i].querySelectorAll('.hit-btn')[1];
    btn.click();
    const none = (box.value = 'zzzz', renderSearch(), document.getElementById('searchResults').textContent.trim());
    box.value = ''; renderSearch();
    return { hits, listHidden, played: window.__played.slice(-1)[0], star: btn.textContent, none, restored: !document.getElementById('scenariosList').hidden };
  });
  t.check('search finds "Stop here" and hides the scenario grid', s.hits.includes('Stop here') && s.listHidden, s.hits);
  t.check('search result plays the bundled clip', /audio\/auto_stand_4\.opus$/.test(s.played || ''), s.played);
  t.check('search result can be bookmarked', s.star === '★', s.star);
  t.check('no-match message, and clearing restores the grid', /No phrase matches/.test(s.none) && s.restored, s);

  // Saved list shows transliteration and plays.
  const sv = await t.evaluate(() => {
    switchTab('saved', document.querySelectorAll('.nav-btn')[2]);
    const item = document.querySelector('#savedList .saved-item');
    item.querySelector('.hit-btn').click();
    return { tr: (item.querySelector('.saved-tr') || {}).textContent, played: window.__played.slice(-1)[0] };
  });
  t.check('saved phrase shows its transliteration', sv.tr === 'Illi nillisi', sv.tr);
  t.check('saved phrase plays', /auto_stand_4\.opus$/.test(sv.played || ''), sv.played);

  // Quiz: beginner sees the transliteration and can listen; script-only hides it.
  const q = await t.evaluate(() => {
    switchTab('learn', document.querySelectorAll('.nav-btn')[1]);
    const tr = document.getElementById('quizTranslit').textContent;
    const expect = quizPhrase.tr;
    playQuiz();
    const played = window.__played.slice(-1)[0];
    const onclick = document.querySelector('.quiz-option').getAttribute('onclick');
    const right = quizOptions.indexOf(quizPhrase.en);
    document.querySelectorAll('.quiz-option')[right].click();
    const correct = document.querySelectorAll('.quiz-option')[right].classList.contains('correct');
    setDifficulty('intermediate', document.querySelectorAll('.diff-btn')[1]);
    const hidden = document.getElementById('quizTranslit').textContent;
    setDifficulty('beginner', document.querySelectorAll('.diff-btn')[0]);
    return { tr, expect, played, quizKey, onclick, correct, hidden, streak: document.getElementById('streakCount').textContent };
  });
  t.check('beginner quiz shows the transliteration', q.tr && q.tr === q.expect, q);
  t.check('quiz can play the phrase', q.played && q.played.endsWith(q.quizKey + '.opus'), q.played);
  t.check('quiz answers are passed by index', /^answerQuiz\(this, \d+\)$/.test(q.onclick), q.onclick);
  t.check('a correct answer is marked correct', q.correct);
  t.check('script-only mode hides the transliteration', q.hidden === '', q.hidden);
  t.check('practising starts the streak', q.streak === '1', q.streak);

  const d = await t.evaluate(() => { playDaily(); return window.__played.slice(-1)[0]; });
  t.check('phrase of the day plays', /audio\/[a-z_]+_\d+\.opus$/.test(d || ''), d);

  // Keyboard: Enter opens a scenario, Enter flips the card, Escape closes.
  const k = await t.evaluate(() => {
    switchTab('scenarios', document.querySelectorAll('.nav-btn')[0]);
    const card = document.querySelector('.scenario-card');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const open = document.getElementById('modalOverlay').classList.contains('show');
    const fc = document.getElementById('flashcard');
    fc.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const flipped = fc.classList.contains('flipped');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { open, flipped, closed: !document.getElementById('modalOverlay').classList.contains('show') };
  });
  t.check('Enter opens a scenario, Space flips, Escape closes', k.open && k.flipped && k.closed, k);

  // Transliteration now agrees with the script.
  const tr = await t.evaluate(() => {
    const all = SCENARIOS.flatMap(s => s.phrases);
    return { leak: all.find(p => p.en === 'The tap is leaking').tr, go: all.find(p => p.en === 'I need to go to [place]').tr };
  });
  t.check('transliteration fixes applied', tr.leak === 'Tap soruttide' && tr.go === 'Nanage [place] ge hogbeku', tr);

  await t.reload(); await t.sleep(500);
  const r = await t.evaluate(() => ({ streak: document.getElementById('streakCount').textContent, bookmarks: Object.keys(state.bookmarks) }));
  t.check('streak and bookmark survive reload', r.streak === '1' && r.bookmarks.includes('auto_stand_4'), r);
};
