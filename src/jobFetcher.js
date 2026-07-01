import axios from 'axios';
import * as cheerio from 'cheerio';
import { DATA_ROLE_KEYWORDS, DATA_ROLE_BLOCKLIST, DATA_MANAGEMENT_PATTERNS } from './config.js';

// ── Sources ────────────────────────────────────────────────────────────────

const SOURCES = [
  { url: 'https://jobs.jvpvc.com',                     name: 'JVP',               type: 'consider', boardId: 'jvp' },
  { url: 'https://jobs.f2vc.com',                      name: 'F2 Venture Capital', type: 'consider', boardId: 'f2-venture-capital' },
  { url: 'https://jobs.vertexventures.co.il', name: 'Vertex Ventures IL', type: 'getro', collectionId: 238 },
  { url: 'https://careers.viola-group.com',   name: 'Viola Group',        type: 'getro', collectionId: 6263 },
  { url: 'https://team8.vc/careers/',                 name: 'Team8',              type: 'browser' },
  { url: 'https://glilotcapital.com/companies/',      name: 'Glilot Capital',     type: 'portfolio' },
  { url: 'https://entreecap.com/companies',           name: 'Entree Capital',     type: 'portfolio' },
  { url: 'https://www.aleph.vc/companies',            name: 'Aleph VC',           type: 'portfolio-browser' },
  { url: 'https://jobs.techaviv.com',                  name: 'TechAviv',           type: 'consider', boardId: 'techaviv' },
  { url: 'https://www.pitango.com/portfolio/',         name: 'Pitango',            type: 'pitango' },
];

// ── Filters ────────────────────────────────────────────────────────────────

function isDataRole(title) {
  const lower = (title || '').toLowerCase();
  if (DATA_ROLE_BLOCKLIST.some(kw => lower.includes(kw))) return false;
  return DATA_ROLE_KEYWORDS.some(kw => lower.includes(kw)) ||
         DATA_MANAGEMENT_PATTERNS.some(re => re.test(title));
}

// ── Utilities ──────────────────────────────────────────────────────────────

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'src', 'via', 'trk', 'refId'].forEach(p => u.searchParams.delete(p));
    return (u.origin + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return raw.toLowerCase().trim();
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function httpGet(url, opts = {}) {
  return axios.get(url, { headers: HTTP_HEADERS, timeout: 20000, maxRedirects: 5, ...opts });
}

function tryNextData(html) {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  return null;
}

function findJobsInJson(obj, depth = 0) {
  if (depth > 7 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
      const s = obj[0];
      if (s.title || s.position || s.job_title || s.name) return obj;
    }
    return obj.flatMap(item => findJobsInJson(item, depth + 1));
  }
  return Object.values(obj).flatMap(v => findJobsInJson(v, depth + 1));
}

function toJob(raw, source) {
  const title = raw.title || raw.position || raw.job_title || raw.name || '';
  if (!title) return null;
  const href = raw.url || raw.apply_url || raw.hostedUrl || raw.absolute_url || raw.link || '';
  const url = href.startsWith('http') ? href : href ? new URL(href, source.url).href : '';
  const location = typeof raw.location === 'object'
    ? (raw.location?.name || raw.location?.city || '')
    : (raw.location || raw.city || '');
  const rawDate = raw.updated_at || raw.created_at || raw.date_posted || raw.publishedAt;
  return {
    id: `${source.name}:${normalizeUrl(url || title)}`,
    title,
    company: raw.company || raw.company_name || raw.employer || source.name,
    location,
    url,
    jobType: raw.employment_type || raw.type || '',
    postedAt: rawDate ? new Date(rawDate) : new Date(),
    source: source.name,
  };
}

// ── Browser (Puppeteer) ────────────────────────────────────────────────────

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    const { default: puppeteer } = await import('puppeteer');
    _browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) { try { await _browser.close(); } catch {} _browser = null; }
}

async function newPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.5' });
  return page;
}

// ── Consider (JVP, F2) ─────────────────────────────────────────────────────
// Direct API call to the Consider talent platform — no browser needed.
// Filters to Israel locations at the API level so we only process relevant jobs.

const ISRAEL_LOCATIONS = [
  'israel',
  'tel aviv', 'tel-aviv', 'tlv',
  'jerusalem', 'haifa', 'rishon', 'petah tikva', 'petah-tikva',
  'ashdod', 'netanya', 'beersheba', 'beer sheva', 'be\'er sheva',
  'bnei brak', 'holon', 'ramat gan', 'rehovot', 'bat yam',
  'herzliya', 'kfar saba', 'modiin', 'modi\'in', 'raanana', 'ra\'anana',
  'lod', 'ramla', 'ashkelon', 'nazareth', 'eilat', 'givatayim',
  'rosh haayin', 'hod hasharon', 'ramat hasharon', 'yehud', 'kiryat',
  'beit shemesh', 'or yehuda', 'nes ziona',
];

function isIsraeliLocation(location) {
  if (!location) return false;
  const l = location.toLowerCase();
  return ISRAEL_LOCATIONS.some(city => l.includes(city));
}

async function scrapeConsiderBoard(source) {
  try {
    const { data } = await axios.post(
      `${source.url}/api-boards/search-jobs`,
      {
        meta: { size: 500 },
        board: { id: source.boardId, isParent: true },
        query: { promoteFeatured: true },
        grouped: false,
      },
      { headers: { ...HTTP_HEADERS, 'Content-Type': 'application/json', Referer: `${source.url}/` }, timeout: 20000 }
    );

    const jobs = data.jobs || [];
    return jobs
      .filter(j => isDataRole(j.title) && isIsraeliLocation(j.locations?.[0]))
      .map(j => ({
        id: `${source.name}:${j.jobId || normalizeUrl(j.url || j.applyUrl || j.title)}`,
        title: j.title,
        company: j.companyName || source.name,
        location: j.locations?.[0] || 'Israel',
        url: j.url || j.applyUrl || '',
        jobType: j.jobTypes?.[0]?.label || '',
        postedAt: j.timeStamp ? new Date(j.timeStamp) : new Date(),
        source: source.name,
      }));
  } catch (err) {
    console.error(`[jobFetcher] ${source.name} (consider): ${err.message}`);
    return [];
  }
}

// ── Getro boards (Vertex Ventures IL, Viola Group) ────────────────────────
// Getro's /search/jobs API requires Accept-Language to avoid 406.
// Paginates 20 jobs per page (server enforces this limit).

const GETRO_HEADERS = {
  ...HTTP_HEADERS,
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
};

async function scrapeGetroBoard(source) {
  const allJobs = [];
  try {
    for (let page = 1; page <= 25; page++) {
      const { data } = await axios.post(
        `https://api.getro.com/api/v2/collections/${source.collectionId}/search/jobs`,
        { hitsPerPage: 20, page, filters: { page }, query: '' },
        { headers: { ...GETRO_HEADERS, referer: `${source.url}/jobs` }, timeout: 15000 }
      );
      const jobs = data.results?.jobs || [];
      if (jobs.length === 0) break;
      allJobs.push(...jobs);
      if (jobs.length < 20) break;
    }

    return allJobs
      .filter(j => {
        const ilLoc = j.searchable_locations?.find(l => isIsraeliLocation(l));
        return isDataRole(j.title) && ilLoc;
      })
      .map(j => ({
        id: `${source.name}:${j.id || normalizeUrl(j.url || j.title)}`,
        title: j.title,
        company: j.company_name || j.organization?.name || source.name,
        location: j.searchable_locations?.find(l => isIsraeliLocation(l)) || 'Israel',
        url: j.url || '',
        jobType: j.work_mode || '',
        postedAt: j.created_at ? new Date(j.created_at * 1000) : new Date(),
        source: source.name,
      }));
  } catch (err) {
    console.error(`[jobFetcher] ${source.name} (getro): ${err.message}`);
    return [];
  }
}

// ── Direct Next.js boards ──────────────────────────────────────────────────
// These are curated Israeli VC portfolio boards. Location is not embedded
// in their Next.js data, so we accept all data-role matches from them.

async function scrapeDirectBoard(source) {
  const { data: html } = await httpGet(source.url);
  const jobs = [];

  // 1. Try embedded Next.js data first
  const nextData = tryNextData(html);
  if (nextData) {
    const candidates = findJobsInJson(nextData);
    for (const raw of candidates) {
      const job = toJob(raw, source);
      if (job && isDataRole(job.title)) jobs.push(job);
    }
    if (jobs.length > 0) {
      console.log(`[jobFetcher] ${source.name}: parsed via Next.js data`);
      return jobs;
    }
  }

  // 2. Cheerio HTML selectors
  const $ = cheerio.load(html);
  const SELECTORS = [
    '.position', '[class*="position-item"]', '[class*="job-item"]',
    '[class*="job-card"]', '[class*="job-listing"]', '[class*="opening"]',
    'li[class*="job"]', 'div[class*="job"]', 'article',
  ];

  for (const sel of SELECTORS) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const title =
        $el.find('[class*="title"], [class*="name"], h2, h3, h4').first().text().trim() ||
        $el.find('a').first().text().trim();
      if (!title || !isDataRole(title)) return;

      const location = $el.find('[class*="location"], [class*="city"]').text().trim();
      const href = $el.find('a').first().attr('href') || '';
      const url = href.startsWith('http') ? href : href ? new URL(href, source.url).href : source.url;
      jobs.push({
        id: `${source.name}:${normalizeUrl(url)}`,
        title,
        company: $el.find('[class*="company"], [class*="employer"]').text().trim() || source.name,
        location,
        url,
        jobType: '',
        postedAt: new Date(),
        source: source.name,
      });
    });
    if (jobs.length > 0) break;
  }

  return jobs;
}

// ── Team8 (WordPress, Puppeteer) ──────────────────────────────────────────

async function scrapeWithBrowser(source) {
  const page = await newPage();
  try {
    await page.goto(source.url, { waitUntil: 'networkidle0', timeout: 30000 });

    // 1. Try ATS detection on the fully-rendered HTML (catches embedded Greenhouse/Lever/etc.)
    const renderedHtml = await page.content();
    const fromATS = await detectATS(renderedHtml, source.url, source.name);
    if (fromATS && fromATS.length > 0) {
      console.log(`[jobFetcher] ${source.name}: found via ATS in rendered page`);
      return fromATS;
    }

    // 2. Generic DOM scraping fallback
    const jobs = await page.evaluate((sourceName, sourceUrl) => {
      const results = [];

      const candidates = [
        ...document.querySelectorAll('[class*="job"], [class*="career"], [class*="position"], [class*="opening"]'),
      ].filter(el => el.querySelector('a'));

      for (const el of candidates) {
        const titleEl = el.querySelector('h2, h3, h4, [class*="title"], a');
        const title = titleEl?.textContent?.trim() || '';
        if (!title || title.length > 120) continue;

        const link = el.querySelector('a');
        const href = link?.href || '';
        const url = href || sourceUrl;

        const locEl = el.querySelector('[class*="location"], [class*="city"]');
        const location = locEl?.textContent?.trim() || '';

        results.push({ title, url, location, company: sourceName });
      }

      // Always scan anchors too — the first pass may find category headers
      // instead of jobs (e.g. WordPress sites with class="position-row").
      // Use seenUrls to avoid duplicating anything already captured above.
      const seenUrls = new Set(results.map(r => r.url));
      for (const a of document.querySelectorAll('a')) {
        const href = a.href;
        if (!href || href === '#' || href.startsWith('mailto:')) continue;
        if (seenUrls.has(href)) continue;

        const headingEl = a.querySelector('h1, h2, h3, h4, h5');
        let title = headingEl
          ? headingEl.textContent.trim()
          : a.textContent.trim();

        // Derive title from URL slug when DOM text is empty
        // e.g. /career/claroty/director-of-strategic-alliances/ → "Director Of Strategic Alliances"
        if (!title) {
          try {
            const parts = new URL(href).pathname.replace(/\/$/, '').split('/').filter(Boolean);
            if (parts.length >= 2) {
              const companySlug = parts[parts.length - 2];
              let jobSlug = parts[parts.length - 1];
              if (jobSlug.startsWith(companySlug + '-')) jobSlug = jobSlug.slice(companySlug.length + 1);
              title = jobSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }
          } catch {}
        }

        if (!title || title.length > 120 || title.length < 5) continue;

        const ps = [...a.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean);
        let company = ps[0] || '';
        // Extract company from URL path: /career/{company-slug}/{job-slug}/
        if (!company || company === sourceName) {
          try {
            const parts = new URL(href).pathname.replace(/\/$/, '').split('/').filter(Boolean);
            const GENERIC = new Set(['career', 'careers', 'jobs', 'openings', 'positions', 'apply']);
            if (parts.length >= 3 && !GENERIC.has(parts[parts.length - 2])) {
              company = parts[parts.length - 2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }
          } catch {}
        }
        company = company || sourceName;
        const location = ps[1] || '';

        seenUrls.add(href);
        results.push({ title, url: href, location, company });
      }
      return results;
    }, source.name, source.url);

    return jobs
      .filter(j => isDataRole(j.title))
      .map(j => ({
        id: `${source.name}:${normalizeUrl(j.url)}`,
        title: j.title,
        company: j.company,
        location: j.location || 'Israel',
        url: j.url,
        jobType: '',
        postedAt: new Date(),
        source: source.name,
      }));
  } catch (err) {
    console.error(`[jobFetcher] ${source.name} (browser): ${err.message}`);
    return [];
  } finally {
    await page.close();
  }
}

// ── ATS detectors ─────────────────────────────────────────────────────────

async function tryGreenhouse(boardToken, companyName) {
  if (!boardToken || /^(embed|v1|v2|js|widget|api)$/.test(boardToken)) return [];
  try {
    const { data } = await httpGet(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
      { timeout: 8000 }
    );
    return (data.jobs || [])
      .filter(j => isDataRole(j.title))
      .map(j => ({
        id: `greenhouse:${j.id}`,
        title: j.title,
        company: companyName,
        location: j.location?.name || '',
        url: j.absolute_url || '',
        jobType: '',
        postedAt: j.updated_at ? new Date(j.updated_at) : new Date(),
        source: companyName,
      }));
  } catch { return []; }
}

async function tryLever(companyId, companyName) {
  try {
    const { data } = await httpGet(`https://api.lever.co/v0/postings/${companyId}?mode=json`);
    return (Array.isArray(data) ? data : [])
      .filter(j => isDataRole(j.text))
      .map(j => ({
        id: `lever:${j.id}`,
        title: j.text,
        company: j.team || companyName,
        location: j.categories?.location || '',
        url: j.hostedUrl || '',
        jobType: j.categories?.commitment || '',
        postedAt: j.createdAt ? new Date(j.createdAt) : new Date(),
        source: companyName,
      }));
  } catch { return []; }
}

async function tryWorkable(subdomain, companyName) {
  try {
    const { data } = await httpGet(
      `https://apply.workable.com/api/v3/accounts/${subdomain}/jobs?state=published`,
      { headers: { ...HTTP_HEADERS, Accept: 'application/json' } }
    );
    return (data.results || [])
      .filter(j => isDataRole(j.title))
      .map(j => ({
        id: `workable:${j.shortcode}`,
        title: j.title,
        company: companyName,
        location: j.location || '',
        url: `https://apply.workable.com/${subdomain}/j/${j.shortcode}/`,
        jobType: j.type || '',
        postedAt: j.published_on ? new Date(j.published_on) : new Date(),
        source: companyName,
      }));
  } catch { return []; }
}

async function tryAshby(boardToken, companyName) {
  try {
    const { data } = await httpGet(
      `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`,
      { headers: { ...HTTP_HEADERS, Accept: 'application/json' } }
    );
    return (data.jobPostings || data.jobs || [])
      .filter(j => isDataRole(j.title))
      .map(j => ({
        id: `ashby:${j.id}`,
        title: j.title,
        company: companyName,
        location: j.isRemote ? 'Remote' : (j.locationName || j.location?.locationSummary || j.location?.name || ''),
        url: `https://jobs.ashbyhq.com/${boardToken}/${j.id}`,
        jobType: j.employmentType || '',
        postedAt: j.publishedDate ? new Date(j.publishedDate) : new Date(),
        source: companyName,
      }));
  } catch { return []; }
}

async function tryBambooHR(subdomain, companyName) {
  try {
    const { data } = await httpGet(
      `https://${subdomain}.bamboohr.com/careers/list?format=json`
    );
    return (data.result || [])
      .filter(j => isDataRole(j.jobOpeningName || ''))
      .map(j => ({
        id: `bamboohr:${j.id}`,
        title: j.jobOpeningName,
        company: companyName,
        location: j.location?.city ? `${j.location.city}, ${j.location.country || ''}`.trim().replace(/,$/, '') : '',
        url: `https://${subdomain}.bamboohr.com/careers/${j.id}`,
        jobType: j.employmentStatusLabel || '',
        postedAt: new Date(),
        source: companyName,
      }));
  } catch { return []; }
}

// Extract Greenhouse board token from various URL formats in page HTML
function extractGreenhouseToken(html) {
  // embed format: greenhouse.io/embed/job_board?for={token}
  const embedM = html.match(/greenhouse\.io\/embed\/job_board[^"'\s]*[?&]for=([a-zA-Z0-9_-]+)/i);
  if (embedM) return embedM[1];
  // boards.greenhouse.io/{token}
  const boardsM = html.match(/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/i);
  if (boardsM && !/^(embed|v1|v2|js|widget|api)$/.test(boardsM[1])) return boardsM[1];
  // boards-api.greenhouse.io/v1/boards/{token}
  const apiM = html.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/i);
  if (apiM && !/^(embed|v1|v2|js|widget|api)$/.test(apiM[1])) return apiM[1];
  return null;
}

// Try multiple career page paths on a company domain
const CAREER_PATHS = ['/careers', '/jobs', '/about/careers', '/company/careers', '/about-us/careers', '/join', '/join-us', '/work-with-us'];

async function detectATS(html, companyUrl, companyName) {
  // Greenhouse
  const ghToken = extractGreenhouseToken(html);
  if (ghToken) return tryGreenhouse(ghToken, companyName);

  // Lever
  const lvM = html.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/i);
  if (lvM) return tryLever(lvM[1], companyName);

  // Workable
  const wbM = html.match(/apply\.workable\.com\/([a-zA-Z0-9_-]+)/i) ||
               html.match(/([a-zA-Z0-9_-]+)\.workable\.com/i);
  if (wbM) return tryWorkable(wbM[1], companyName);

  // Ashby
  const ashM = html.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i) ||
                html.match(/app\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/i) ||
                html.match(/([a-zA-Z0-9_-]+)\.ashbyhq\.com/i);
  if (ashM) return tryAshby(ashM[1], companyName);

  // BambooHR
  const bbM = html.match(/([a-zA-Z0-9_-]+)\.bamboohr\.com/i);
  if (bbM) return tryBambooHR(bbM[1], companyName);

  return null;
}

async function fetchCompanyJobs(companyUrl, companyName) {
  try {
    const { data: html } = await httpGet(companyUrl, { timeout: 10000 });

    // 1. Detect ATS from homepage HTML
    const fromHome = await detectATS(html, companyUrl, companyName);
    if (fromHome) return fromHome;

    // 2. Follow careers link from DOM or try common paths
    const $ = cheerio.load(html);
    let careersUrl = null;

    $('a[href]').each((_, el) => {
      if (careersUrl) return;
      const href = $(el).attr('href') || '';
      const text = $(el).text().toLowerCase();
      if (/career|job|join|work with us|hiring/i.test(text) || /\/career|\/job|\/join/i.test(href)) {
        try {
          const url = href.startsWith('http') ? href : new URL(href, companyUrl).href;
          if (new URL(url).hostname === new URL(companyUrl).hostname) careersUrl = url;
        } catch {}
      }
    });

    // If no careers link in DOM, try just /careers
    if (!careersUrl) {
      try {
        const url = new URL('/careers', companyUrl).href;
        const { data: ph } = await httpGet(url, { timeout: 7000 });
        const r = await detectATS(ph, url, companyName);
        if (r) return r;
      } catch {}
    } else {
      const { data: careersHtml } = await httpGet(careersUrl, { timeout: 7000 });
      const fromCareers = await detectATS(careersHtml, careersUrl, companyName);
      if (fromCareers) return fromCareers;
    }
  } catch { /* silently skip unreachable companies */ }
  return [];
}

// ── Portfolio scraper (axios, for Glilot / Entree / TechAviv) ─────────────

function extractPortfolioCompanies(html, baseUrl) {
  const $ = cheerio.load(html);
  const companies = new Map();
  const baseHost = new URL(baseUrl).hostname;

  const SELECTORS = [
    '[class*="company"] a', '[class*="portfolio"] a', '[class*="startup"] a',
    '[class*="member"] a', '[class*="partner"] a',
    '.card a', 'article a', '[class*="logo"] a', '[class*="item"] a',
  ];

  for (const sel of SELECTORS) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      try {
        const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        const host = new URL(absUrl).hostname;
        if (host === baseHost) return;
        const name = $el.attr('aria-label') || $el.find('img').attr('alt') || $el.text().trim();
        if (!companies.has(host)) companies.set(host, { name: name || host, url: absUrl });
      } catch {}
    });
    if (companies.size > 3) break;
  }

  return [...companies.values()];
}

async function scrapePortfolio(source) {
  const { data: html } = await httpGet(source.url);
  const companies = extractPortfolioCompanies(html, source.url);
  console.log(`[jobFetcher] ${source.name}: found ${companies.length} portfolio companies`);

  const allJobs = [];
  const BATCH = 12;
  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(c => fetchCompanyJobs(c.url, c.name))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') allJobs.push(...r.value);
    }
  }
  return allJobs;
}

// ── Portfolio scraper with Puppeteer (Aleph VC — Webflow SPA) ─────────────
// The /companies page links to internal /companies/{slug} pages.
// Each slug page has the company's external website URL.
// We fetch those via axios (Webflow is SSR), extract the external URL, then ATS-detect.

async function resolveAlephCompanyUrl(alephPageUrl, baseHost) {
  try {
    const { data: html } = await httpGet(alephPageUrl, { timeout: 10000 });
    const $ = cheerio.load(html);
    // Find first external link that is not social/aleph
    const SOCIAL = /linkedin|twitter|x\.com|instagram|facebook|youtube|medium/i;
    let website = null;
    $('a[href]').each((_, el) => {
      if (website) return;
      const href = $(el).attr('href') || '';
      try {
        const u = new URL(href);
        if (u.hostname === baseHost) return;
        if (SOCIAL.test(u.hostname)) return;
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
        website = href;
      } catch {}
    });
    return website;
  } catch {
    return null;
  }
}

async function scrapePortfolioBrowser(source) {
  const page = await newPage();
  let slugLinks = [];
  try {
    await page.goto(source.url, { waitUntil: 'networkidle0', timeout: 30000 });
    const baseHost = new URL(source.url).hostname;
    slugLinks = await page.evaluate((baseUrl) => {
      const baseHost = new URL(baseUrl).hostname;
      const seen = new Set();
      const results = [];
      for (const a of document.querySelectorAll('a[href]')) {
        try {
          const u = new URL(a.href);
          if (u.hostname !== baseHost) continue;
          const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
          // Only /companies/{slug} — not /companies itself
          if (parts.length === 2 && parts[0] === 'companies' && !seen.has(parts[1])) {
            seen.add(parts[1]);
            results.push({ slug: parts[1], alephUrl: a.href });
          }
        } catch {}
      }
      return results;
    }, source.url);
  } catch (err) {
    console.error(`[jobFetcher] ${source.name} (portfolio-browser): ${err.message}`);
  } finally {
    await page.close();
  }

  console.log(`[jobFetcher] ${source.name}: found ${slugLinks.length} portfolio companies`);
  if (slugLinks.length === 0) return [];

  // Resolve each internal Aleph page → external company website (axios, batched)
  const baseHost = new URL(source.url).hostname;
  const companies = [];
  const RESOLVE_BATCH = 10;
  for (let i = 0; i < slugLinks.length; i += RESOLVE_BATCH) {
    const batch = slugLinks.slice(i, i + RESOLVE_BATCH);
    const resolved = await Promise.allSettled(
      batch.map(s => resolveAlephCompanyUrl(s.alephUrl, baseHost).then(url => url ? { name: s.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), url } : null))
    );
    for (const r of resolved) {
      if (r.status === 'fulfilled' && r.value) companies.push(r.value);
    }
  }

  console.log(`[jobFetcher] ${source.name}: resolved ${companies.length} company websites`);

  const allJobs = [];
  const BATCH = 5;
  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(c => fetchCompanyJobs(c.url, c.name)));
    for (const r of results) {
      if (r.status === 'fulfilled') allJobs.push(...r.value);
    }
    if (i + BATCH < companies.length) await sleep(200);
  }
  return allJobs;
}

// ── Pitango (WordPress + AJAX modal) ──────────────────────────────────────
// 1. Puppeteer loads /portfolio/ to extract company slugs from onclick attrs
// 2. axios POSTs to /wp-admin/admin-ajax.php for each slug to get company website
// 3. fetchCompanyJobs does ATS detection on each website

const PITANGO_AJAX = 'https://www.pitango.com/wp-admin/admin-ajax.php';
const PITANGO_SKIP = /pitango|linkedin|twitter|facebook|instagram|youtube|cookiebot|google|globes|w3\.org|gmpg|icx\.|accessibe/i;

async function resolvePitangoCompanyUrl(slug) {
  try {
    const { data: html } = await axios.post(
      PITANGO_AJAX,
      `action=get_popup&slug=${encodeURIComponent(slug)}&paging=show`,
      { headers: { ...HTTP_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.pitango.com/portfolio/' }, timeout: 10000 }
    );
    const $ = cheerio.load(html);
    let website = null;
    $('a[href]').each((_, el) => {
      if (website) return;
      const href = $(el).attr('href') || '';
      try {
        const u = new URL(href);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
        if (PITANGO_SKIP.test(u.hostname)) return;
        // Prefer the root domain URL (not news/press articles which have long paths)
        if (u.pathname === '/' || u.pathname === '') website = href;
        else if (!website) website = href;
      } catch {}
    });
    return website ? { name: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), url: website } : null;
  } catch { return null; }
}

async function scrapePitango(source) {
  const page = await newPage();
  let slugs = [];
  try {
    await page.goto(source.url, { waitUntil: 'networkidle0', timeout: 30000 });
    slugs = await page.evaluate(() => {
      const seen = new Set();
      for (const el of document.querySelectorAll('[onclick]')) {
        const m = el.getAttribute('onclick').match(/openModal\('([\w-]+)'/);
        if (m && !seen.has(m[1])) seen.add(m[1]);
      }
      return [...seen];
    });
  } catch (err) {
    console.error(`[jobFetcher] ${source.name}: ${err.message}`);
  } finally {
    await page.close();
  }

  console.log(`[jobFetcher] ${source.name}: found ${slugs.length} portfolio companies`);
  if (slugs.length === 0) return [];

  // Resolve company websites via AJAX (batched)
  const companies = [];
  const BATCH = 10;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    const resolved = await Promise.allSettled(batch.map(slug => resolvePitangoCompanyUrl(slug)));
    for (const r of resolved) {
      if (r.status === 'fulfilled' && r.value) companies.push(r.value);
    }
  }
  console.log(`[jobFetcher] ${source.name}: resolved ${companies.length} company websites`);

  const allJobs = [];
  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(c => fetchCompanyJobs(c.url, c.name)));
    for (const r of results) {
      if (r.status === 'fulfilled') allJobs.push(...r.value);
    }
    if (i + BATCH < companies.length) await sleep(200);
  }
  return allJobs;
}

// ── Deduplication ──────────────────────────────────────────────────────────

function deduplicateJobs(jobs) {
  const seenKeys = new Set();
  const result = [];
  for (const job of jobs) {
    if (!job.title) continue;
    // Dedup by id, and by url+title (not url alone — generic careers pages share a URL across many jobs)
    const normUrl = job.url ? normalizeUrl(job.url) : null;
    const urlTitleKey = normUrl ? `${normUrl}|${job.title.toLowerCase()}` : null;
    if (seenKeys.has(job.id)) continue;
    if (urlTitleKey && seenKeys.has(urlTitleKey)) continue;
    seenKeys.add(job.id);
    if (urlTitleKey) seenKeys.add(urlTitleKey);
    result.push(job);
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchAllJobs({ sourceFilter } = {}) {
  const SCRAPER = {
    consider:            scrapeConsiderBoard,
    getro:               scrapeGetroBoard,
    direct:              scrapeDirectBoard,
    browser:             scrapeWithBrowser,
    portfolio:           scrapePortfolio,
    'portfolio-browser': scrapePortfolioBrowser,
    pitango:             scrapePitango,
  };

  const filters = Array.isArray(sourceFilter) ? sourceFilter.map(f => f.toLowerCase()) : null;
  const activeSources = filters
    ? SOURCES.filter(s => filters.includes(s.name.toLowerCase()))
    : SOURCES;

  if (filters && activeSources.length === 0) {
    const names = SOURCES.map(s => s.name).join(', ');
    throw new Error(`No matching sources for "${sourceFilter}". Available: ${names}`);
  }

  const results = await Promise.allSettled(
    activeSources.map(source => {
      const fn = SCRAPER[source.type];
      return fn(source).then(jobs => {
        console.log(`[jobFetcher] ${source.name}: ${jobs.length} data jobs found`);
        return jobs;
      });
    })
  );

  await closeBrowser();

  const all = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[jobFetcher] ${activeSources[i].name} failed:`, r.reason?.message);
    return [];
  });

  return deduplicateJobs(all);
}
