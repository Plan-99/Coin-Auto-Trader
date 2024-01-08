require('dotenv').config();

const axios = require("axios");
const cheerio = require("cheerio");
const {detectE} = require("./detect");
const moment = require("moment");
let { is_test } = process.env;
is_test = is_test === 'true'

const getLastNoticeInfo = async (test = false) => {
    try {
        const res = await axios.get('https://cafe.bithumb.com/view/boards/43', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
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
                    title: test ? '[마켓 추가] 엑셀라(WAXL), 일드길드게임즈(YGGVSBDV) 원화 마켓 추가' : title,
                    id: test ? 100 : id,
                }
            }
        }
    } catch (error) {
        console.error(`Error occurred while checking Bithumb notices: ${error.message}`, getTime());
    }
};

const getLastNoticeInfoMobile = async (test = false) => {
    try {
        const res = await axios.get('https://m-feed.bithumb.com/notice');
        const $ = cheerio.load(res.data);
        const notices = $('.noticeList_notice-item-list__link__rVBKl');

        for (let i = 1; i < notices.length; i++) {
            const el = notices[i];
            const classList = $(el).attr('class');
            // console.log(classList);

            if (!classList || !classList.includes('noticeList_notice-list__link--fixed__5EvPe')) {
                const script = $(el).attr('href');
                const id = script.replace("/notice/", "")
                const title = $('p', el).text().trim();
                // 현재 시간 (UTC)에 9시간 더하기
                return {
                    title: test ? '[마켓 추가] 엑셀라(WAXL), 일드길드게임즈(YGGVSBDV) 원화 마켓 추가' : title,
                    id: test ? 100 : id,
                }
            }
        }
    } catch (error) {
        console.error(`Error occurred while checking Bithumb notices Mobile: ${error.message}`, getTime());
    }
};

const startBithumbDetect = async(mobile = false) => {
    let lastNoticeInfo
    if (mobile) {
        lastNoticeInfo = await getLastNoticeInfoMobile()
    } else {
        lastNoticeInfo = await getLastNoticeInfo()
    }
    console.log(`Last Notice title is ${lastNoticeInfo.title}`, getTime())
    setInterval(async () => {
        console.log(`network: ${mobile ? 'mobile ' : ''}bithumb`, getTime())
        let noticeInfo
        if (mobile) {
            noticeInfo = await getLastNoticeInfoMobile(is_test)
        } else {
            noticeInfo = await getLastNoticeInfo(is_test)
        }
        if (lastNoticeInfo.id === noticeInfo.id) {
            return;
        }
        if (!noticeInfo.title.includes('[마켓 추가]')) {
            return;
        }
        console.log(`New Notice title is ${noticeInfo.title}`, getTime())
        const new_listing_symbol = noticeInfo.title.match(/\(([^)]+)\)/g);
        new_listing_symbol.forEach((e) => {
            detectE.emit('NEWLISTING', {
                s: e + 'USDT',
                c: null,
            });
        })
        lastNoticeInfo = noticeInfo
    }, 1000)
}

function getTime() {
    return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}

module.exports = { startBithumbDetect };
