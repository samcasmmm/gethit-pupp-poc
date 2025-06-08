import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  const {
    target = 'https://www.nseindia.com/market-data/52-week-high-equity-market',
    save = false,
  } = req.query;

  let browser = null;

  try {
    browser = await puppeteer.launch({
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

    await page.goto('https://www.nseindia.com', {
      waitUntil: 'domcontentloaded',
    });

    await new Promise((r) => setTimeout(r, 2000));
    await page.goto(target, { waitUntil: 'networkidle2' });

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
        new Promise((r) => setTimeout(r, 1500)),
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

    // Save option disabled for Vercel (read-only file system)
    return res.status(200).json({
      total: allData.length,
      records: allData,
    });
  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ error: err.toString() });
  }
}
