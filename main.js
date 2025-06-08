const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get('/api/scrape', async (req, res) => {
  const defaultURL =
    'https://www.nseindia.com/market-data/52-week-high-equity-market';
  const targetURL = req.query.url || defaultURL;
  const saveFile = req.query.save === 'true';

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
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

    if (saveFile) {
      const dir = path.join(__dirname, 'result');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);

      const today = new Date();
      let exchangeName = targetURL.includes('nse') ? 'NSE' : 'BSE';
      const formattedDate = `${String(today.getDate()).padStart(
        2,
        '0'
      )}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getFullYear()
      ).slice(-2)}`;

      const fileName = `${exchangeName}-${formattedDate}-stock.json`;
      const filePath = path.join(dir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
      console.log(`✅ Saved data locally: ${filePath}`);
    }

    res.json({
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
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
