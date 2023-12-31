require('dotenv').config();
const { log, error } = console;
const { detectE, startWS } = require('./detect');
const { startBithumbDetect } = require('./detectBithumbNotice');
const { loadeInfo, getQty, buy, sellWithPrice, sellWithTime } = require('./order');
const validate = require('./validate');
const axios = require('axios');
const moment = require('moment');
require('moment-timezone');

const { usdt, api, sec, profit, sloss, sell_option, timegap, discord_link, detection_type } = process.env;
const discordWebhookUrl = discord_link;

axios.post(discordWebhookUrl, {
  content: `NewCoinListings bot is running... ${getTime()}`
})
.catch(err => {
  console.error('Error sending Discord notification', err);
});

log('NewCoinListings bot is running...');
validate();
log('The bot is waiting for a new coin to be listed in the USDT market.');
log('When detected, the bot automatically trades as per the configuration.');

if (detection_type === 'new_coin') {
  startWS();
} else if (detection_type === 'notice') {
  startBithumbDetect();
}
detectE.on('NEWLISTING', async (data) => {
  try {
    const nStart = new Date().getTime();
    const { s: symbol, c: closePrice } = { ...data };
    log(`New symbol ${symbol} detected with price ${closePrice}`);

    axios.post(discordWebhookUrl, {
      content: `New symbol ${symbol} detected with price ${closePrice} at ${getTime()}`
    })
    .catch(err => {
      console.error('Error sending Discord notification', err);
    });

    const bresp = await buy({ keys: { api, sec }, usdt, symbol });
    const nEnd =  new Date().getTime();
    const nDiff = nEnd - nStart
    log(`Time gap: ${nDiff}ms`)
    const buyPrice =
      bresp.fills.reduce((a, d) => a + d.price * d.qty, 0) /
      bresp.fills.reduce((a, d) => a + d.qty * 1, 0);
    const qty = bresp.executedQty;
    log(`Buy price is ${buyPrice} and qty is ${qty}`);

    axios.post(discordWebhookUrl, {
      content: `Buy price is ${buyPrice} at ${getTime()} and qty is ${qty}`
    })
    .catch(err => {
      console.error('Error sending Discord notification', err);
    });

    let sellResponse
    if (sell_option === 'PRICE') {
      sellResponse = sellWithPrice({
        keys: { api, sec },
        buyPrice,
        symbol,
        qty,
        profit,
        sloss,
      });
    } else {
      sellResponse = await sellWithTime({
        keys: { api, sec },
        symbol,
        qty,
        timegap,
      });
    }

    if (sellResponse !== null) {
      const sellPrice =
          sellResponse.fills.reduce((a, d) => a + d.price * d.qty, 0) /
          sellResponse.fills.reduce((a, d) => a + d.qty, 0);
      log(`Sell price is ${sellPrice} and sell quantity is ${qty} at ${getTime()}`);

      axios.post(discordWebhookUrl, {
        content: `Sell price is ${sellPrice} and sell quantity is ${qty} at ${getTime()}`
      })
          .catch(err => {
            console.error('Error sending Discord notification', err);
          });
    }
  } catch (err) {
    log(err, getTime());
    axios.post(discordWebhookUrl, {
      content: `Error Buying New Coin: ${err.message}`
    })
        .catch(() => {
          console.error('Error sending Discord notification');
        });
  }
});

process.on('SIGINT', () => {
  axios.post(discordWebhookUrl, {
    content: `Process was interrupted at ${getTime()}`
  })
  .catch(err => {
    console.error('Error sending Discord notification', err);
  });
  process.exit(1);
});

process.on('exit', (code) => {
  axios.post(discordWebhookUrl, {
    content: `Process exited with code: ${code} at ${getTime()}`
  })
  .catch(err => {
    console.error('Error sending Discord notification', err);
  });
});

process.on('uncaughtException', (err) => {
  axios.post(discordWebhookUrl, {
    content: `Process terminated due to uncaught exception: ${err.message} at ${getTime()}`
  })
  .catch(error => {
    console.error('Error sending Discord notification', error);
  });
});

function getTime() {
  return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}

setInterval(() => {
  log(`Bot is running... ${getTime()}`);
  axios.post(discordWebhookUrl, {
    content: `Bot is running... ${getTime()}`
  })
  .catch(err => {
    console.error('Error sending Discord notification', err);
  });
}, 300000); // 300000 milliseconds is equal to 5 minutes
