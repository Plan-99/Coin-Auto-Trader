require('dotenv').config();

const axios = require("axios");
const cheerio = require("cheerio");
const {detectE} = require("./detect");
const moment = require("moment");
let { is_test, discord_link } = process.env;
is_test = is_test === 'true'


const getFromBithumb = async (test = false, alert = false) => {
    try {
        const res = await axios.get('https://cafe.bithumb.com/view/boards/43', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://cafe.bithumb.com/view/board-contents/1644396',
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
                    title: test ? '[마켓 추가] 엑셀라(WAXL), 일드길드게임즈(RWEWD) 원화 마켓 추가' : title,
                    id: test ? 100 : id,
                }
            }
        }
    } catch (error) {
        if (alert) {
            console.error(`Error occurred while checking Bithumb notices: ${error.message}`, getTime());
            axios.post(discord_link, {
                content: `Error occurred while checking Bithumb notices: ${error.message}, ${getTime()}`
            })
                .catch(err => {
                    console.error('Error sending Discord notification', err);
                });
        }
    }
};

const getFromBithumbMobile = async (test = false, alert = false) => {
    try {
        const res = await axios.get('https://m-feed.bithumb.com/notice', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://cafe.bithumb.com/view/board-contents/1644396',
            }
        });
        const $ = cheerio.load(res.data);
        const notices = $('.noticeList_notice-item-list__link__rVBKl');

        for (let i = 1; i < notices.length; i++) {
            const el = notices[i];
            const classList = $(el).attr('class');

            if (!classList || !classList.includes('noticeList_notice-list__link--fixed__5EvPe')) {
                const script = $(el).attr('href');
                const id = script.replace("/notice/", "")
                const title = $('p', el).text().trim();
                // 현재 시간 (UTC)에 9시간 더하기
                return {
                    title: test ? '[마켓 추가] 엑셀라(WAXL), 일드길드게임즈(RWEWD) 원화 마켓 추가' : title,
                    id: test ? 100 : id,
                }
            }
        }
    } catch (error) {
        if (alert) {
            console.error(`Error occurred while checking Bithumb notices Mobile: ${error.message}`, getTime());
            axios.post(discord_link, {
                content: `Error occurred while checking Bithumb notices Mobile: ${error.message}, ${getTime()}`
            })
                .catch(err => {
                    console.error('Error sending Discord notification', err);
                });
        }
    }
};

const startBithumbDetect = async() => {
    let lastNoticeInfoMobile = await getFromBithumbMobile()
    let lastNoticeInfo = await getFromBithumb()
    console.log(`Last Notice title for Bithumb PC is ${lastNoticeInfo.title}`, getTime())
    console.log(`Last Notice title for Bithumb Mobile is ${lastNoticeInfoMobile.title}`, getTime())
    const symbols = [];
    let i = 0
    setInterval(async () => {
        let noticeInfoMobile, noticeInfo
        noticeInfoMobile = await getFromBithumbMobile(is_test, i % 60 === 0)
        noticeInfo = await getFromBithumb(is_test, i % 60 === 0)
        if (lastNoticeInfo.id === noticeInfo.id && lastNoticeInfoMobile.id === noticeInfoMobile.id) {
            return;
        }
        if (!noticeInfoMobile.title.includes('[마켓 추가]') && !noticeInfo.title.includes('[마켓 추가]')) {
            return;
        }
        const newNoticeTitle = lastNoticeInfo.id !== noticeInfo.id ? noticeInfo.title : noticeInfoMobile.title
        const from = lastNoticeInfo.id !== noticeInfo.id ? 'pc' : 'mobile'
        console.log(`New Notice title is ${newNoticeTitle} from Bithumb ${from}`, getTime())
        const new_listing_symbol = newNoticeTitle.match(/\(([^)]+)\)/g);
        new_listing_symbol.forEach((e) => {
            const symbol = e.replace('(', '').replace(')', '');
            if (symbols.includes(symbol)) {
                return
            }
            symbols.push(symbol)
            detectE.emit('NEWLISTING', {
                s: e.replace('(', '').replace(')', '') + 'USDT',
                c: null,
            });
        })
        i++;
        lastNoticeInfo = noticeInfo
        lastNoticeInfoMobile = noticeInfoMobile
    }, 1000)
}

const getFromUpbit = async(test = false, alert = false) => {
    try {
        const res = await axios.get('https://api-manager.upbit.com/api/v1/notices?page=1&per_page=20&thread_name=general', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://cafe.bithumb.com/view/board-contents/1644396',
            }
        });
        const noticeObj = res.data.data.list[0]
        return {
            title: test ? '[거래] 엑셀라(XRP) 마켓 추가' : noticeObj.title,
            id: test ? 100 : noticeObj.id,
        }
    } catch (error) {
        if (alert) {
            console.error(`Error occurred while checking Upbit notices: ${error.message}`, getTime());
            axios.post(discord_link, {
                content: `Error occurred while checking Upbit notices: ${error.message}, ${getTime()}`
            })
                .catch(err => {
                    console.error('Error sending Discord notification', err);
                });
        }
    }
}

const startUpbitDetect = async() => {
    let lastNoticeInfo = await getFromUpbit()
    console.log(`Last Notice title for Upbit is ${lastNoticeInfo.title}`, getTime())
    const symbols = [];
    let i = 0
    setInterval(async () => {
        let noticeInfo
        noticeInfo = await getFromUpbit(is_test, i % 60 === 0)
        if (lastNoticeInfo.id === noticeInfo.id) {
            return;
        }
        if (!noticeInfo.title.includes('[거래]') || !noticeInfo.title.includes('추가')) {
            return;
        }
        console.log(`New Notice title is ${noticeInfo.title} from Upbit`, getTime())
        const new_listing_symbol = noticeInfo.title.match(/\(([^)]+)\)/g);
        new_listing_symbol.forEach((e) => {
            const symbol = e.replace('(', '').replace(')', '');
            if (symbols.includes(symbol)) {
                return
            }
            symbols.push(symbol)
            detectE.emit('NEWLISTING', {
                s: e.replace('(', '').replace(')', '') + 'USDT',
                c: null,
            });
        })
        i++;
        lastNoticeInfo = noticeInfo
    }, 5000)
}


function getTime() {
    return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}

module.exports = { startBithumbDetect, startUpbitDetect };
