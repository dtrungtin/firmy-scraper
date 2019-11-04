const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.firmy.cz/Remesla-a-sluzby/Pocitacove-a-internetove-sluzby/Webdesignove-sluzby?x=14.4266722222&y=50.0814916667&rt=adresa&platba-kartou', userData: { label: 'list' } });

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
                    await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item' } },
                        { forefront: true });
                }

                // if (result.nextPageUrl) {
                //     await requestQueue.addRequest({ url: `${result.nextPageUrl}`, userData: { label: 'list' } });
                // }
            } else if (request.userData.label === 'item') {
                await page.waitFor(5000); // to wait for 1000ms
                const pageResult = await page.evaluate(() => {
                    return {
                        title: document.querySelector('[itemprop=name]') ? document.querySelector('[itemprop=name]').textContent.trim() : '',
                        address: document.querySelector('[itemprop=address]') ? document.querySelector('[itemprop=address]').textContent.trim() : '',
                        latitude: document.querySelector('[itemprop=latitude]') ? document.querySelector('[itemprop=latitude]').content.trim() : '',
                        longitude: document.querySelector('[itemprop=longitude]') ? document.querySelector('[itemprop=longitude]').content.trim() : '',
                        description: document.querySelector('[itemprop=description]') ? document.querySelector('[itemprop=description]').textContent.trim() : '',
                        category: document.querySelector('.category') ? document.querySelector('.category').textContent.trim() : '',
                        rating: document.querySelector('[itemprop=ratingValue]') ? document.querySelector('[itemprop=ratingValue]').content.trim() : '',
                        ratingCount: document.querySelector('[itemprop=ratingCount]') ? document.querySelector('[itemprop=ratingCount]').textContent.trim() : '',
                        phone: document.querySelector('[itemprop=telephone]') ? document.querySelector('[itemprop=telephone]').textContent.trim() : '',
                        email: document.querySelector('.companyMail') ? document.querySelector('.companyMail').textContent.trim() : '',
                        website: document.querySelector('.companyUrl') ? document.querySelector('.companyUrl').textContent.trim() : '',
                    };
                });

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
    });

    await crawler.run();
});
