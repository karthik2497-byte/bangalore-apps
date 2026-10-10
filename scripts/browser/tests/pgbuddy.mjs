const URL_ = 'http://localhost:8811/3_pg_buddy/index.html';
export default async (t) => {
  await t.goto(URL_);
  await t.sleep(800);
  const a = await t.evaluate(() => ({
    splash: document.getElementById('splash').classList.contains('hide'),
    banner: !document.getElementById('sampleBanner').hidden && document.getElementById('sampleBanner').textContent,
    names: pgData.map(p => p.name),
    badges: document.querySelectorAll('.card-badge').length,
    bell: !!document.querySelector('.header-btn'),
    seeAll: document.querySelectorAll('.see-all').length,
    photos: !!document.querySelector('.photo-upload-box'),
    profile: document.querySelector('.profile-info h3').textContent,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    swipeLabels: [...document.querySelectorAll('.swipe-btn')].map(b => b.getAttribute('aria-label')),
    viewport: document.querySelector('meta[name=viewport]').content
  }));
  t.check('splash hides once listings render', a.splash);
  t.check('sample banner shown', /Sample listings/.test(a.banner || ''), a.banner);
  t.check('no real brand names on invented listings', !a.names.some(n => /Zolo|CoLive/i.test(n)), a.names);
  t.check('no unbacked Verified badges', a.badges === 0, a.badges);
  t.check('toast-only bell, See all and fake photo upload are gone', !a.bell && a.seeAll === 0 && !a.photos, a);
  t.check('profile is the user, not a stranger', a.profile === 'Your PG hunt', a.profile);
  t.check('primary passes contrast with white text', a.primary.toUpperCase() === '#C2410C', a.primary);
  t.check('swipe buttons are named', JSON.stringify(a.swipeLabels) === '["Skip","Details","Save"]', a.swipeLabels);
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport), a.viewport);

  // List view hides the Verified section when nothing is verified.
  const lv = await t.evaluate(() => {
    setViewMode('list', document.querySelectorAll('.view-toggle button')[1]);
    return { featuredHidden: document.getElementById('featuredHeader').style.display === 'none', all: document.querySelectorAll('#recentList .pg-card-list').length };
  });
  t.check('"Verified PGs" section hidden when none are verified', lv.featuredHidden && lv.all > 0, lv);

  // Listing data from a future publish cannot run script.
  const x = await t.evaluate(() => {
    window.__pwned = 0;
    const evil = JSON.parse(JSON.stringify(pgData[0]));
    evil.id = 999; evil.name = '<img src=x onerror="window.__pwned=1">Evil';
    evil.grad = 'x" onmouseover="window.__pwned=2';
    evil.tags = ['<b onclick="window.__pwned=3">t</b>'];
    evil.reviews = [{ name: '<img src=y onerror="window.__pwned=4">', initials: 'E', color: 'red;background:url(javascript:alert(1))', date: 'now', rating: 4, text: '<script>window.__pwned=5</script>' }];
    pgData.push(evil); filteredPGs = [...pgData];
    swipeIndex = pgData.length - 1; renderSwipeCards(); renderRecentList(); openDetail(999);
    const shown = document.getElementById('modalScroll').innerText;
    closeDetail(); pgData.pop(); applyFilters();
    return { pwned: window.__pwned, literal: shown.includes('<img src=x onerror') };
  });
  await t.sleep(200);
  t.check('listing fields render as text, never as markup', x.pwned === 0 && x.literal, x);

  // Detail sheet: sample chip, Escape closes.
  const d = await t.evaluate(() => {
    openDetail(pgData[0].id);
    const chip = !!document.querySelector('#modalScroll .sample-chip');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { chip, open: document.getElementById('detailModal').classList.contains('open') };
  });
  t.check('detail sheet marks a sample listing', d.chip);
  t.check('Escape closes the detail sheet', !d.open);

  // Preferred areas + budget actually filter and persist.
  await t.evaluate(() => {
    document.querySelector('#areaChips .chip[data-area="Koramangala"]').click();
    const s = document.getElementById('budgetSlider'); s.value = 10000; updateBudget();
  });
  const f = await t.evaluate(() => ({ areas: [...new Set(filteredPGs.map(p => p.area))], maxPrice: Math.max(...filteredPGs.map(p => p.price), 0) }));
  t.check('Preferred Areas filters the deck', JSON.stringify(f.areas) === '["Koramangala"]', f);

  // Review: saved locally, Send opens a prefilled message.
  const r = await t.evaluate(() => {
    let opened = null; const o = window.open; window.open = (u) => { opened = u; return null; };
    document.getElementById('reviewPgSelect').value = String(pgData[0].id);
    setStarRating('food', 4, document.getElementById('ratingFood'));
    document.getElementById('reviewBest').value = 'Great sambar';
    submitReview();
    const toast = [...document.querySelectorAll('.toast')].pop().textContent;
    document.querySelector('.review-send').click();
    window.open = o;
    return { toast, opened };
  });
  t.check('review toast says it is saved on this phone', /saved on this phone/.test(r.toast), r.toast);
  t.check('Send to PG Buddy opens a prefilled message', r.opened && r.opened.startsWith('https://wa.me/') && decodeURIComponent(r.opened).includes('Great sambar'), r.opened);

  await t.reload(); await t.sleep(800);
  const p = await t.evaluate(() => ({
    chip: document.querySelector('#areaChips .chip[data-area="Koramangala"]').classList.contains('active'),
    budget: document.getElementById('budgetSlider').value,
    areas: [...new Set(filteredPGs.map(x => x.area))],
    reviews: JSON.parse(localStorage.getItem('pgbuddy_reviews')).length
  }));
  t.check('area preference, budget and review survive reload', p.chip && p.budget === '10000' && JSON.stringify(p.areas) === '["Koramangala"]' && p.reviews === 1, p);

  const tabs = await t.evaluate(() => {
    const out = {};
    for (const tab of ['tabExplore', 'tabReviews', 'tabCompare', 'tabProfile']) { switchTab(tab); out[tab] = document.getElementById(tab).offsetHeight > 0; }
    document.getElementById('compareA').value = String(pgData[0].id); document.getElementById('compareB').value = String(pgData[1].id);
    switchTab('tabCompare');
    out.compare = /cheaper/i.test(document.getElementById('comparisonResult').innerText);
    return out;
  });
  t.check('all 4 tabs render and Compare works', Object.values(tabs).every(Boolean), tabs);
};
