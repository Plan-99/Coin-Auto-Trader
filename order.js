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
    return resp.body;
  } catch (err) {
    throw err;
  }
};

const sellWithTime = async ({ keys, symbol, qty, timegap, buyPrice, sloss, immediate = false }) => {
  try {
    let resp;
    if (!immediate) {
      const eInfo = await loadeInfo({ symbol });
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


      if (resp?.statusCode !== 200) {
        console.error(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
      }

      const orderId = resp.body.orderId;
      let countdown = timegap; //time constant
      const timerId = setInterval(() => {
        console.log(`Selling in ${countdown--} seconds... Press Enter to cancel the sell order.`);
        if (countdown < 1) {
          clearInterval(timerId);
        }
      }, 1000);

      await new Promise((resolve, reject) => {
        setTimeout(resolve, timegap * 1000); //time constant
      });
      
      await binance({
        method: 'DELETE',
        path: '/api/v3/order',
        keys,
        data: {
          symbol,
          orderId,
          originClientOrderId: null,
        },
      });
    }

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
      console.error(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
      throw new Error(`Error occurred while selling: ${resp.statusCode}`);
    }

    const soldPrice = resp.body.fills.reduce((total, fill) => total + (+fill.price * fill.qty), 0) / resp.body.fills.reduce((total, fill) => total + (+fill.qty), 0);

    console.log(`Successfully sold ${qty} ${symbol} at an average price of ${soldPrice}.`);

    return resp.body;
  } catch (err) {
    console.error(`Error occurred while selling: ${err.message}`);
    if (qty > 0) {
      console.log("Reducing quantity by 1 and retrying sell operation...");
      return sellWithTime({ keys, symbol, qty: qty - 1, timegap, buyPrice, sloss, immediate: true });
    } else {
      throw err;
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

module.exports = { loadeInfo, getQty, buy, sellWithPrice, sellWithTime };
