const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
  const defaultURL =
    'https://www.nseindia.com/market-data/52-week-high-equity-market';
  const targetURL = req.query.url || defaultURL;
  // We won’t do file saving on Vercel serverless (no persistent disk)
  try {
    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
    });

    // Initial visit to set cookies etc
    await page.goto('https://www.nseindia.com', {
      waitUntil: 'domcontentloaded',
    });
    await delay(2000);

    await page.goto(targetURL, { waitUntil: 'networkidle2' });

    const allData = [];
    let currentPage = 1;
    let totalPages = 1;

    while (true) {
      await page.waitForSelector('table tbody tr');

      const pageData = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        const result = [];
        rows.forEach((row) => {
          const cols = row.querySelectorAll('td');
          if (cols.length >= 5) {
            result.push({
              symbol: cols[0].innerText.trim(),
              company: cols[1].innerText.trim(),
              high: cols[2].innerText.trim(),
              low: cols[3].innerText.trim(),
              lastPrice: cols[4].innerText.trim(),
            });
          }
        });
        return result;
      });

      allData.push(...pageData);

      if (currentPage === 1) {
        const totalPageText = await page.$eval(
          '#displayTotalPageText52weekh',
          (el) => el.innerText.replace('of', '').trim()
        );
        totalPages = parseInt(totalPageText, 10);
      }

      if (currentPage >= totalPages) break;

      await Promise.all([
        page.click('#next'),
        delay(1500),
        page.waitForFunction(
          (pageNum) =>
            document
              .querySelector('#displayTotalRecordText52weekh')
              ?.innerText.includes(`Displaying ${(pageNum - 1) * 50 + 1}`),
          {},
          currentPage + 1
        ),
      ]);

      currentPage++;
    }

    await browser.close();

    res.status(200).json({
      success: true,
      count: allData.length,
      data: allData,
    });
  } catch (err) {
    console.error('Scraping error:', err);
    res
      .status(500)
      .json({ success: false, message: 'Scraping failed', error: err.message });
  }
};
