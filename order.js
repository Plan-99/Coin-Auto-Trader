//ENTRY =
// 1)MARKET BUY ORDER
//EXIT =
// 1) FIXED SELL %
// 3) OCO - FIXED SELL AND STOP LOSS %

const { log, error } = console;
const binance = require('./binance');
const NP = require('number-precision');
NP.enableBoundaryChecking(false);
const scientificToDecimal = require('scientific-to-decimal');
const axios = require("axios");
const moment = require("moment");
let { discord_link } = process.env;
const { XCoinAPI } = require("./bithumb")

const loadeInfo = async ({ symbol }) => {
  try {
    let eInfo = {};
    const resp = await binance({
      method: 'GET',
      path: '/api/v3/exchangeInfo',
    });
    if (resp?.statusCode !== 200) throw resp;
    const einfoSymbol = resp.body.symbols.find((s) => s?.symbol === symbol);
    if (!einfoSymbol) throw 'Symbol missing in Exchange Info API';
    eInfo[symbol] = { ...einfoSymbol };
    return eInfo;
  } catch (err) {
    throw err;
  }
};

const getQty = ({ symbol, price, usdt }) => {
  const qty = usdt / price;
  const qstep = Math.log10(1 / eInfo[symbol]['filters'][1]['stepSize']);
  return NP.strip(Math.floor(qty * 10 ** qstep) / 10 ** qstep);
};

const buy = async ({ keys, symbol, usdt }) => {
  try {
    // keys: { api, sec }, quantity, symbol
    const resp = await binance({
      method: 'POST',
      path: '/api/v3/order',
      keys,
      params: {
        // quantity: scientificToDecimal(qty),
        symbol,
        side: 'BUY',
        type: 'MARKET',
        newOrderRespType: 'FULL',
        quoteOrderQty: usdt,
      },
    });
    if (resp?.statusCode !== 200) throw resp;
    const price = resp.fills.reduce((a, d) => a + d.price * d.qty, 0) / resp.fills.reduce((a, d) => a + d.qty * 1, 0)
    const qty = resp.body.executedQty
    logAndSend(`Buy price is ${price} at ${getTime()} and qty is ${qty}`)
    return {
      qty,
      price,
    };
  } catch (err) {
    throw err;
  }
};

const sellWithTime = async ({ keys, symbol, qty, timegap, buyPrice, sloss, immediate = false }) => {
  let resp;
  let slossSell = false;
  let slossSellDelete = false;
  let orderId = '';
  let isOrderFilled = false;
  if (!immediate) {
    const eInfo = await loadeInfo({symbol});
    try {
      const pstep = Math.log10(1 / eInfo[symbol]['filters'][0]['tickSize']);
      const stopPrice = NP.strip(
          Math.floor(buyPrice * (1 - sloss / 100) * 10 ** pstep) / 10 ** pstep
      );
      resp = await binance({
        method: 'POST',
        path: '/api/v3/order',
        keys,
        params: {
          quantity: scientificToDecimal(qty),
          symbol,
          side: 'SELL',
          type: 'STOP_LOSS_LIMIT',
          newOrderRespType: 'FULL',
          stopPrice,
          timeInForce: 'GTC',
          price: stopPrice,
        },
      });
      orderId = resp.body.orderId;
      slossSell = true;
    } catch (err) {
      logAndSend(`Error while SLOSS Selling: ${err.message}`);
      if (qty > 1) {
        return sellWithTime({ keys, symbol, qty: qty - 1, timegap, buyPrice, sloss, immediate: false });
      } else {
        logAndSend(`Error while SLOSS Selling: qty = 0`);
      }
    }
    let countdown = timegap; //time constant
    let orderResp = {};
    const timerId = setInterval(async() => {
      orderResp = await binance({
        method: 'GET',
        path: `/api/v3/order`,
        keys,
        params: {
          symbol,
          orderId,
        },
      });
      if (orderResp.body.status === 'FILLED') {
        isOrderFilled = true;
        logAndSend(`Order filled: ${symbol} has been sold.`);
        logAndSend(`Successfully sold ${orderResp.body.origQty} ${symbol} at an average price of ${orderResp.body.price}.`);
        clearInterval(timerId);
        return orderResp.body;
      } else {
        logAndSend(`Selling ${symbol} in ${countdown--} seconds... Press Enter to cancel.`);
        if (countdown < 1) {
          clearInterval(timerId);
        }
      }
    }, 1000);

    if (isOrderFilled) {
      return orderResp.body
    }

    await new Promise((resolve, reject) => {
      setTimeout(resolve, timegap * 1000); //time constant
    });
    if (slossSell) {
      try {
        await binance({
          method: 'DELETE',
          path: '/api/v3/order',
          keys,
          params: {
            symbol,
            orderId,
          },
        });
        slossSellDelete = true;
      } catch (err) {
        logAndSend(`Error while Delete SLOSS Order: ${err.message}`);
      }
    }
  }


  if (slossSell && slossSellDelete) {
    try {
      resp = await binance({
        method: 'POST',
        path: '/api/v3/order',
        keys,
        params: {
          quantity: scientificToDecimal(qty),
          symbol,
          side: 'SELL',
          type: 'MARKET',
          newOrderRespType: 'FULL',
        },
      });

      if (resp?.statusCode !== 200) {
        logAndSend(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
        throw new Error(`Error occurred while selling: ${resp.statusCode}`);
      }

      const soldPrice = resp.body.fills.reduce((total, fill) => total + (+fill.price * fill.qty), 0) / resp.body.fills.reduce((total, fill) => total + (+fill.qty), 0);

      logAndSend(`Successfully sold ${qty} ${symbol} at an average price of ${soldPrice}.`);

      return resp.body;
    } catch (err) {
      logAndSend(`Error occurred while selling: ${err.message}`);
      if (qty > 0) {
        logAndSend("Reducing quantity by 1 and retrying sell operation...");
        return sellWithTime({ keys, symbol, qty: qty - 1, timegap, buyPrice, sloss, immediate: true });
      } else {
        throw err;
      }
    }
  }
};

const sellWithPrice = async ({ keys, buyPrice, symbol, qty, profit, sloss }) => {
  try {
    if (sloss) {
      //OCO order
      const pstep = Math.log10(1 / eInfo[symbol]['filters'][0]['tickSize']);
      const price = NP.strip(
        Math.floor(buyPrice * (1 + profit / 100) * 10 ** pstep) / 10 ** pstep
      );
      const stopPrice = NP.strip(
        Math.floor(buyPrice * (1 - sloss / 100) * 10 ** pstep) / 10 ** pstep
      );
      log(`Sell Price is ${price}`);
      log(`Stop-Loss Price is ${stopPrice}`);
      const resp = await binance({
        method: 'POST',
        path: '/api/v3/order/oco',
        keys,
        params: {
          symbol,
          side: 'SELL',
          quantity: scientificToDecimal(qty),
          price: scientificToDecimal(price),
          stopPrice: scientificToDecimal(stopPrice),
          stopLimitPrice: scientificToDecimal(stopPrice),
          stopLimitTimeInForce: 'GTC',
        },
      });
      if (resp?.statusCode !== 200) throw resp;
      return resp.body;
    } else {
      //limit sell order
      const pstep = Math.log10(1 / eInfo[symbol]['filters'][0]['tickSize']);
      const price = NP.strip(
        Math.floor(buyPrice * (1 + profit / 100) * 10 ** pstep) / 10 ** pstep
      );
      log(`Sell Price is ${price}`);
      const resp = await binance({
        method: 'POST',
        path: '/api/v3/order',
        keys,
        params: {
          quantity: scientificToDecimal(qty),
          symbol,
          side: 'SELL',
          type: 'LIMIT',
          price: scientificToDecimal(price),
          newOrderRespType: 'RESULT',
          timeInForce: 'GTC',
        },
      });
      if (resp?.statusCode !== 200) throw resp;
      return resp.body;
    }
  } catch (err) {
    throw err;
  }
};

const buyBithumb = async ({ keys, symbol, krw }) => {
  try {
    const bithumbApi = new XCoinAPI(keys.api_key, keys.api_secret)
    const resp1 = await axios.get(`https://api.bithumb.com/public/transaction_history/${symbol}_KRW`)
    const bidData = resp1.data.data.filter((e) => e.type === 'bid')
    const price = bidData[bidData.length - 1].price
    const qty = Math.floor(krw / price)
    // keys: { api, sec }, quantity, symbol
    const resp = await bithumbApi.xcoinApiCall('/trade/market_buy', {
      units: String(qty),
      order_currency: symbol,
      payment_currency: 'KRW',
    });
    logAndSend(`Buy price is ${price} at ${getTime()} and qty is ${qty}`)
    return {
      qty, price
    };
  } catch (err) {
    throw err;
  }
};


function logAndSend(message) {
  console.log(message, getTime());
  axios.post(discord_link, {
    content: `${message}, ${getTime()}`
  })
      .catch(err => {
        console.error(`Error sending Discord notification: message: ${message}`, err);
      });
}

function getTime() {
  return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}


module.exports = { loadeInfo, getQty, buy, sellWithPrice, sellWithTime, buyBithumb };
