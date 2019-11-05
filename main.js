const Apify = require('apify');
const _ = require('underscore');
const safeEval = require('safe-eval');

const { puppeteer } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getInput();

    console.log('Input:');
    console.log(input);

    if (!input || !Array.isArray(input.startUrls) || input.startUrls.length === 0) {
        throw new Error("Invalid input, it needs to contain at least one url in 'startUrls'.");
    }

    let extendOutputFunction;
    if (typeof input.extendOutputFunction === 'string' && input.extendOutputFunction.trim() !== '') {
        try {
            extendOutputFunction = safeEval(input.extendOutputFunction);
        } catch (e) {
            throw new Error(`'extendOutputFunction' is not valid Javascript! Error: ${e}`);
        }
        if (typeof extendOutputFunction !== 'function') {
            throw new Error('extendOutputFunction is not a function! Please fix it or use just default ouput!');
        }
    }

    const requestQueue = await Apify.openRequestQueue();

    for (let index = 0; index < input.startUrls.length; index++) {
        const startUrl = input.startUrls[index].url;

        if (startUrl.includes('https://www.firmy.cz')) {
            if (startUrl.includes('/detail/')) {
                await requestQueue.addRequest({ url: input.startUrls[index].url, userData: { label: 'item' } });
            } else {
                await requestQueue.addRequest({ url: input.startUrls[index].url, userData: { label: 'list' } });
            }
        }
    }

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            if (request.userData.label === 'list') {
                await page.waitFor(10000); // to wait for 1000ms

                const result = await page.evaluate(() => {
                    const data = {};
                    data.items = [];
                    const itemLinks = document.querySelectorAll('.companyPhoto > a');

                    for (let index = 0; index < itemLinks.length; index++) {
                        data.items.push(itemLinks[index].href);
                    }

                    const nextPageUrl = document.querySelector('.btnActualPage').nextElementSibling.href;
                    if (nextPageUrl) {
                        data.nextPageUrl = nextPageUrl;
                    }

                    return data;
                });

                for (let index = 0; index < result.items.length; index++) {
                    const itemUrl = result.items[index];

                    if (itemUrl.includes('https://www.firmy.cz/detail/')) {
                        await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item' } },
                            { forefront: true });
                    }
                }

                if (result.nextPageUrl) {
                    await requestQueue.addRequest({ url: `${result.nextPageUrl}`, userData: { label: 'list' } });
                }
            } else if (request.userData.label === 'item') {
                await page.waitFor(5000); // to wait for 1000ms
                // Inject jQuery into a page
                await puppeteer.injectJQuery(page);
                const pageResult = await page.evaluate(() => {
                    return {
                        title: $('[itemprop=name]') ? $('[itemprop=name]').text().trim() : '',
                        address: $('[itemprop=address]') ? $('[itemprop=address]').text().trim() : '',
                        latitude: $('[itemprop=latitude]') ? $('[itemprop=latitude]').attr('content').trim() : '',
                        longitude: $('[itemprop=longitude]') ? $('[itemprop=longitude]').attr('content').trim() : '',
                        description: $('[itemprop=description]') ? $('[itemprop=description]').text().trim() : '',
                        category: $('.category') ? $('.category').text().trim() : '',
                        rating: $('[itemprop=ratingValue]') ? $('[itemprop=ratingValue]').attr('content').trim() : '',
                        ratingCount: $('[itemprop=ratingCount]') ? $('[itemprop=ratingCount]').text().trim() : '',
                        phone: $('[itemprop=telephone]') ? $('[itemprop=telephone]').text().trim() : '',
                        email: $('.companyMail') ? $('.companyMail').text().trim() : '',
                        website: $('.companyUrl') ? $('.companyUrl').text().trim() : '',
                    };
                });

                if (extendOutputFunction) {
                    const userResult = await page.evaluate((functionStr) => {
                        const f = eval(functionStr);
                        return f();
                    }, input.extendOutputFunction);
                    _.extend(pageResult, userResult);
                }

                pageResult.url = request.url;
                pageResult['#debug'] = Apify.utils.createRequestDebugInfo(request);

                await Apify.pushData(pageResult);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        maxRequestRetries: 2,
        maxRequestsPerCrawl: 10000,
        maxConcurrency: 5,

        proxyConfiguration: input.proxyConfiguration,
    });

    await crawler.run();
});
