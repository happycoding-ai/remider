const MessagingResponse = require('../node_modules/twilio/lib/twiml/MessagingResponse');
const moment = require("moment-timezone");

module.exports = {
    extractClientNumber: (ogNumber) => {
        const number = ogNumber.split(':');
        return number[1];
    },
    sendMessage: (msg, res) => {
        const twiml = new MessagingResponse();
        twiml.message(msg);
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
    },
    testInput: (query) => {
        const istString = moment.tz(new Date().toISOString(), "Asia/Singapore").format().slice(0, 16) + ":00.000Z";
        var curDate = new Date().toLocaleString("en-US", { timeZone: 'Asia/Singapore' });
        console.log("current....." + istString);
        const currEpoch = Date.parse(istString);
        if (query[2].length !== 4) {    // Checking if time is not in HHMM format
            return false;
        }
        if (query[3] && query[3] !== "today") {     // Checking if date-month is not in DD/MM format
            if (query[3].split('/').length !== 2) {
                return false;
            }
        }
        const hour = query[2].slice(0, 2);
        const minutes = query[2].slice(2, 4);
        console.log(hour + minutes);
        if (!query[3] || query[3] === "today") {
            const year = istString.slice(0, 4);
            const month = istString.slice(5, 7) - 1;
            const date = istString.slice(8, 10);
            var userString = new Date(year, month, date, hour, minutes, 0, 0);//toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium', hour12: false});
            console.log("user ::::" + userString);
            const userEpoch = Date.parse(userString);
            console.log(userEpoch);
            console.log(currEpoch);
            if (new Date(userString).getTime() > new Date(curDate).getTime()) {    // Checking if user input not in past
                return true;
            }
        } else {
            const year = istString.slice(0, 4);
            const month = query[3].split('/')[1] - 1;
            const date = query[3].split('/')[0];
            const userString = new Date(year, month, date, hour, minutes, 0, 0).toISOString();
            const userEpoch = Date.parse(userString);
            console.log(userEpoch);
            console.log(currEpoch);
            if (userEpoch > currEpoch) {    // Checking if user input not in past
                return true;
            }
        }
        return false;
    },
    moreFilterTaskTime: (time_entity, sentence) => {
        let replace_text = null;
        let found = (time_entity != undefined) ? time_entity.match(/\d{3,4}\ {0,2}(am|pm|AM|PM)/g) :
            sentence.match(/\d{3,4}\ {0,2}(am|pm|AM|PM)/g);
        if (found) {
            replace_text = found[0];
            found[0] = found[0].replace(' ', '');
            part = found[0].substring(found[0].length, found[0].length - 2).toUpperCase();
            hour = found[0].substring(0, found[0].length - 4);
            minute = found[0].substring(found[0].length - 2, found[0].length - 4);
            time_entity = ("0" + hour).slice(-2) + ":" + ("0" + minute).slice(-2) + part;
        }

        if (time_entity == undefined) {
            let hour = "", minute = "";
            let part = "AM";
            let found = sentence.match(/\d{1,2}:\d\d/g);
            if (found) {
                replace_text = found[0];
                [hour, minute] = found[0].split(":");

                hour = parseInt(hour);
                minute = parseInt(minute);

                if (hour >= 12 && hour <= 24) {
                    hour -= 12;
                    part = "PM";
                }

                if (hour >= 0 && hour < 12 && minute >= 0 && minute < 60) {
                    time_entity = ("0" + hour).slice(-2) + ":" + ("0" + minute).slice(-2) + part;
                }
            }
        }

        if (replace_text == null) replace_text = time_entity;
        return [time_entity, replace_text]
    }
};