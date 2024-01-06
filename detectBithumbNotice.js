const axios = require("axios");
const cheerio = require("cheerio");
const {detectE} = require("./detect");
const getLastNoticeInfo = async (test = false) => {
    try {
        const res = await axios.get('https://cafe.bithumb.com/view/boards/43');
        const $ = cheerio.load(res.data);
        const notices = $('tr');

        for (let i = 1; i < notices.length; i++) {
            const el = notices[i];
            const style = $(el).attr('style');

            if (!style || !style.includes('background-color: papayawhip')) {
                const script = $(el).attr('onclick');
                const id = script.replace("toDetailOrUrl(event, '", "").replace("','')", "")
                const title = $('td.one-line a', el).text().trim();
                // 현재 시간 (UTC)에 9시간 더하기
                return {
                    title: test ? '[마켓 추가] 빅타임(XRP), 스톰엑스(STMX) 원화 마켓 추가' : title,
                    id: test ? 100 : id,
                }
            }
        }
    } catch (error) {
        console.error(`Error occurred while checking Bithumb notices: ${error.message}`);
    }
};

const startBithumbDetect = async() => {
    let lastNoticeInfo = await getLastNoticeInfo()
    console.log(`Last Notice title is ${lastNoticeInfo.title}`)
    setInterval(async () => {
        const noticeInfo = await getLastNoticeInfo()
        if (lastNoticeInfo.id === noticeInfo.id) {
            return;
        }
        if (!noticeInfo.title.includes('[마켓 추가]')) {
            return;
        }
        console.log(`New Notice title is ${noticeInfo.title}`)
        const new_listing_symbol = noticeInfo.title.match(/\((.*?)\)/)[1];
        detectE.emit('NEWLISTING', {
            s: new_listing_symbol + 'USDT',
            c: null,
        });
        lastNoticeInfo = noticeInfo
    }, 1000)
}

module.exports = { startBithumbDetect };
