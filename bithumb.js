const request = require("request");
const hmacSHA512 = require("crypto-js/hmac-sha512");

const XCoinAPI = class {
    constructor(api_key, api_secret) {
        this.apiUrl = "https://api.bithumb.com";
        this.api_key = api_key;
        this.api_secret = api_secret;
    }
    xcoinApiCall(endPoint, params) {
        let rgParams = {
            endPoint: endPoint,
        };

        if (params) {
            for (let o in params) {
                rgParams[o] = params[o];
            }
        }

        const api_host = this.apiUrl + endPoint;
        const httpHeaders = this._getHttpHeaders(
            endPoint,
            rgParams,
            this.api_key,
            this.api_secret
        );

        const options = {
            method: "POST",
            url: api_host,
            headers: httpHeaders,
            form: rgParams,
        };
        return new Promise(function (resolve, reject) {
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    resolve(response);
                } else {
                    reject(error);
                }
            });
        });
    }
    _getHttpHeaders(endPoint, rgParams, api_key, api_secret) {
        let strData = http_build_query(rgParams);
        let nNonce = this.usecTime();
        return {
            "Api-Key": api_key,
            "Api-Sign": base64_encode(
                hmacSHA512(
                    endPoint + chr(0) + strData + chr(0) + nNonce,
                    api_secret
                ).toString()
            ),
            "Api-Nonce": nNonce,
        };
    }
    usecTime() {
        let rgMicrotime = microtime().split(" "),
            usec = rgMicrotime[0],
            sec = rgMicrotime[1];

        usec = usec.substr(2, 3);
        return Number(String(sec) + String(usec));
    }
};

const microtime = (get_as_float) => {
    //  discuss at: http://phpjs.org/functions/microtime/
    //	original by: Paulo Freitas
    //  example 1: timeStamp = microtime(true);
    //  example 1: timeStamp > 1000000000 && timeStamp < 2000000000
    //  returns 1: true
    const now = new Date().getTime() / 1000;
    const s = parseInt(now, 10);

    return get_as_float ? now : Math.round((now - s) * 1000) / 1000 + " " + s;
};

const http_build_query = (obj) => {
    let output_string = [];
    Object.keys(obj).forEach((val) => {
        let key = val;
        key = encodeURIComponent(key.replace(/[!'()*]/g, escape));

        if (typeof obj[val] === "object") {
            let query = build_query(obj[val], null, key);
            output_string.push(query);
        } else {
            let value = encodeURIComponent(obj[val].replace(/[!'()*]/g, escape));
            output_string.push(key + "=" + value);
        }
    });

    return output_string.join("&");
};

const base64_encode = (data) => {
    // discuss at: http://phpjs.org/functions/base64_encode/
    // original by: Tyler Akins (http://rumkin.com)
    // improved by: Bayron Guevara
    // improved by: Thunder.m
    // improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // improved by: Rafał Kukawski (http://kukawski.pl)
    // bugfixed by: Pellentesque Malesuada
    // example 1: base64_encode('Kevin van Zonneveld');
    // returns 1: 'S2V2aW4gdmFuIFpvbm5ldmVsZA=='
    // example 2: base64_encode('a');
    // returns 2: 'YQ=='

    const b64 =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let o1,
        o2,
        o3,
        h1,
        h2,
        h3,
        h4,
        bits,
        i = 0,
        ac = 0,
        enc = "",
        tmp_arr = [];

    if (!data) {
        return data;
    }

    do {
        // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = (o1 << 16) | (o2 << 8) | o3;

        h1 = (bits >> 18) & 0x3f;
        h2 = (bits >> 12) & 0x3f;
        h3 = (bits >> 6) & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] =
            b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join("");

    const r = data.length % 3;

    return (r ? enc.slice(0, r - 3) : enc) + "===".slice(r || 3);
};

const chr = (codePt) => {
    //  discuss at: http://phpjs.org/functions/chr/
    // original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // improved by: Brett Zamir (http://brett-zamir.me)
    //   example 1: chr(75) === 'K';
    //   example 1: chr(65536) === '\uD800\uDC00';
    //   returns 1: true
    //   returns 1: true

    if (codePt > 0xffff) {
        // Create a four-byte string (length 2) since this code point is high
        //   enough for the UTF-16 encoding (JavaScript internal use), to
        //   require representation with two surrogates (reserved non-characters
        //   used for building other characters; the first is "high" and the next "low")
        codePt -= 0x10000;
        return String.fromCharCode(
            0xd800 + (codePt >> 10),
            0xdc00 + (codePt & 0x3ff)
        );
    }
    return String.fromCharCode(codePt);
};

module.exports.XCoinAPI = XCoinAPI;
