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

let eInfo = {};

const loadeInfo = async ({ symbol }) => {
  try {
    const resp = await binance({
      method: 'GET',
      path: '/api/v3/exchangeInfo',
    });
    if (resp?.statusCode !== 200) throw resp;
    const einfoSymbol = resp.body.symbols.find((s) => s?.symbol === symbol);
    if (!einfoSymbol) throw 'Symbol missing in Exchange Info API';
    eInfo[symbol] = { ...einfoSymbol };
  } catch (err) {
    throw err;
  }
};

const getQty = ({ symbol, price, usdt }) => {
  const qty = usdt / price;
  const qstep = Math.log10(1 / eInfo[symbol]['filters'][1]['stepSize']);
  return NP.strip(Math.floor(qty * 10 ** qstep) / 10 ** qstep);
};

const buy = async ({ keys, symbol, qty }) => {
  try {
    // keys: { api, sec }, quantity, symbol
    const resp = await binance({
      method: 'POST',
      path: '/api/v3/order',
      keys,
      params: {
        quantity: scientificToDecimal(qty),
        symbol,
        side: 'BUY',
        type: 'MARKET',
        newOrderRespType: 'FULL',
      },
    });
    if (resp?.statusCode !== 200) throw resp;
    return resp.body;
  } catch (err) {
    throw err;
  }
};


let timerId = null;

const sellRequest = async ({ keys, symbol, qty }) => {
  try {
    const resp = await binance({
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
      console.error(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
    }

    const soldPrice = resp.body.fills.reduce((total, fill) => total + (+fill.price * fill.qty), 0) / resp.body.fills.reduce((total, fill) => total + (+fill.qty), 0);

    console.log(`Successfully sold ${qty} ${symbol} at an average price of ${soldPrice}.`);

  } catch (err) {
    log(`Error: Sell ${qty} ${symbol} is impossible`)
    await sellRequest({
      keys,
      symbol,
      qty: qty - 1
    })
  }
}

const sellWithTime = ({ keys, symbol, qty, timegap }) => {
  return new Promise((resolve, reject) => {
    let countdown = timegap;
    timerId = setInterval(() => {
      log(`Selling in ${countdown--} seconds... Press Enter to cancel the sell order.`);
      if (countdown < 0) {
        clearInterval(timerId);
      }
    }, 1000);

    setTimeout(async () => {
      // Check if the timer has been cleared
      if (!timerId) {
        resolve();
        return;
      }

      clearInterval(timerId);

      await sellRequest({ keys, symbol, qty })
    }, seconds * 1000);
  });
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

module.exports = { loadeInfo, getQty, buy, sellWithPrice, sellWithTime };
