const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.firmy.cz/Remesla-a-sluzby/Pocitacove-a-internetove-sluzby/Webdesignove-sluzby?x=14.4266722222&y=50.0814916667&rt=adresa&platba-kartou', userData: { label: 'list' } });

    const crawler = new Apify.CheerioCrawler({
        requestQueue,

        requestTimeoutSecs: 120,
        handlePageTimeoutSecs: 240,
        maxConcurrency: 5,

        handlePageFunction: async ({ request, response, $ }) => {
            console.log(request.url);
            if (request.userData.label === 'list') {
                const itemLinks = $('.companyPhoto > a');
                console.log($('body').text());
                if (itemLinks.length === 0) {
                    return;
                }

                for (let index = 0; index < itemLinks.length; index++) {
                    const itemUrl = $(itemLinks[index]).attr('href');
                    if (itemUrl) {
                        await requestQueue.addRequest({ url: `${itemUrl}`, userData: { label: 'item' } });
                    }
                }

                const nextPageUrl = $('.btnActualPage').next().attr('href');
                console.log('nextPageUrl=' + nextPageUrl);
                if (nextPageUrl) {
                    await requestQueue.addRequest({ url: `${nextPageUrl}`, userData: { label: 'list' } });
                }
            } else if (request.userData.label === 'item') {
                const pageResult = {
                    url: request.url,
                    title: $('[itemprop=name]').text(),
                    '#debug': Apify.utils.createRequestDebugInfo(request),
                };

                await Apify.pushData(pageResult);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#isFailed': true,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    await crawler.run();
});
