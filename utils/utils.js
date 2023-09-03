const MessagingResponse = require('../node_modules/twilio/lib/twiml/MessagingResponse');
const moment = require("moment-timezone");
const _ = require("lodash");

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
		var curDate = new Date().toLocaleString("en-US", {timeZone: 'Asia/Singapore'});
		console.log("current....."+istString);
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
			console.log("user ::::"+userString);
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
    getTime: (query) => {
        let arr = query.filter(e=>{
            if(
                (_.lowerCase(e).indexOf('am')>-1 && e.length>1 && e.length<5)||
                (_.lowerCase(e).indexOf('pm')>-1 && e.length>1 && e.length<5)||
                (_.isInteger(parseInt(e)) && parseInt(e)>0 && parseInt(e)<13)){
                return true;
            }
        });
        let t_str = '';
        if(arr && arr.length>0){
            if(arr.length>1){
                if(_.lowerCase(arr[0]).indexOf('am')>-1 || _.lowerCase(arr[0]).indexOf('pm')>-1){

                }else{
                    let idx = query.findIndex(e=>e==arr[0]);
                    if(idx>0&&(_.lowerCase(query[idx-1])=='at')&&(_.lowerCase(query[idx]).indexOf('th')==-1)&&(_.lowerCase(query[idx]).indexOf('st')==-1)&&(_.lowerCase(query[idx]).indexOf('nd')==-1)&&(_.lowerCase(query[idx]).indexOf('rd')==-1)){

                    }else{
                        arr[0] = arr[1];
                        if(arr.length>2){
                            arr[1] = arr[2];
                            if(_.lowerCase(arr[0]).indexOf('am')>-1 || _.lowerCase(arr[0]).indexOf('pm')>-1){

                            }else{
                                let idx = query.findIndex(e=>e==arr[0]);
                                if(idx>0&&(_.lowerCase(query[idx-1])=='at')&&(_.lowerCase(query[idx]).indexOf('th')==-1)&&(_.lowerCase(query[idx]).indexOf('st')==-1)&&(_.lowerCase(query[idx]).indexOf('nd')==-1)&&(_.lowerCase(query[idx]).indexOf('rd')==-1)){
            
                                }else{
                                    arr[0] = arr[1];
                                }
                            }
                        }
                    }
                }
            }
            if(_.lowerCase(arr[0]).indexOf('am')>-1 || _.lowerCase(arr[0]).indexOf('pm')>-1){
                let time;
                let ampm;
                if(arr[0].length==2){
                    let idx = query.findIndex(e=>e==arr[0]);
                    if(idx>0 && (_.isInteger(parseInt(query[idx-1])) && parseInt(query[idx-1])>0 && parseInt(query[idx-1])<13)){
                        time = query[idx-1];
                        if(_.lowerCase(arr[0])=='am'){
                            ampm = 'am';
                        }else{
                            ampm = 'pm';
                        }
                        t_str = query[idx-1]+' '+query[idx];
                    }else{
                        return {status:0, message:'Invalid time'};
                    }
                }else{
                    if(_.lowerCase(arr[0]).indexOf('am')>-1){
                        time = arr[0].replace(/am/i,'');
                        ampm = 'am';
                    }else{
                        time = arr[0].replace(/pm/i,'');
                        ampm = 'pm';
                    }
                    t_str = arr[0];
                }
                if(ampm=='pm'){
                    time = parseInt(time)+12;
                }
                return {status:1, hours:time.toString(),minutes:'00',t_str:t_str};

            }else if(arr.length>1&&(_.lowerCase(arr[1]).indexOf('am')>-1 || _.lowerCase(arr[1]).indexOf('pm')>-1)){
                let time;
                let ampm;
                if(arr[1].length==2){
                    let idx = query.findIndex(e=>e==arr[1]);
                    if(idx>0 && (_.isInteger(parseInt(query[idx-1])) && parseInt(query[idx-1])>0 && parseInt(query[idx-1])<13)){
                        time = query[idx-1];
                        if(_.lowerCase(arr[1])=='am'){
                            ampm = 'am';
                        }else{
                            ampm = 'pm';
                        }
                        t_str = query[idx-1]+' '+query[idx];
                    }else{
                        return {status:0, message:'Invalid time'};
                    }
                }else{
                    if(_.lowerCase(arr[1]).indexOf('am')>-1){
                        time = arr[1].replace(/am/i,'');
                        ampm = 'am';
                    }else{
                        time = arr[1].replace(/pm/i,'');
                        ampm = 'pm';
                    }
                    t_str = arr[1];
                }
                if(ampm=='pm'){
                    time = parseInt(time)+12;
                }
                return {status:1, hours:time.toString(),minutes:'00',t_str:t_str};
            }else{
                let idx = query.findIndex(e=>e==arr[0]);
                if(idx>0&&_.lowerCase(query[idx-1])=='at'){
                    return {status:0, message:'Is the time am or pm?'}
                }else{
                    return {status:1, hours:'00',minutes:'00',t_str:t_str};
                }
            }
        }else{
            return {status:1,hours:'00',minutes:'00'};
        }
    },
    getDateMonth: (query) => {
        let months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        let mons = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        let arr = query.filter(e=>{
            if(
                months.includes(_.lowerCase(e))||
                mons.includes(_.lowerCase(e))){
                return true;
            }
        });
        let d_str = '';
        if(arr && arr.length>0){
            let idx = query.findIndex(e=>arr[0]==e);
            let date_idx;
            if(idx==0){
                date_idx = 1;
                d_str = query[0]+' '+query[1];
            }else{
                if(parseInt(query[idx-1])>0 && parseInt(query[idx-1])<32){
                    date_idx = idx-1;
                    d_str = query[idx-1]+' '+query[idx];
                }else{
                    date_idx = idx+1;
                    d_str = query[idx]+' '+query[idx+1];
                }
            }
            let date = parseInt(query[date_idx]);
            if(date>0 && date<32){
                let month = months.findIndex(e=>e==_.lowerCase(arr[0]));
                if(month==-1){
                    month = mons.findIndex(e=>e==_.lowerCase(arr[0]));
                }
                if(month>-1){
                    return {status:1,month:month,date:date,d_str:d_str};
                }else{
                    return {status:0,message:'Invalid date'};
                }
            }else{
                return {status:0,message:'Invalid date'};
            }
        }else{
            return {status:0,message:'Invalid date'};
        }
    },
    getDayMonth: (query) => {
        let fulldays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        let shortdays = ['sun','mon','tues','wednes','thurs','fri','satur'];
        let shortdays1 = ['sun','mon','tue','wed','thu','fri','sat'];
        let arr = query.filter(e=>{
            if(
                fulldays.includes(_.lowerCase(e))||
                shortdays.includes(_.lowerCase(e))||
                shortdays1.includes(_.lowerCase(e))){
                return true;
            }
        });
        let d_str = '';
        if(arr && arr.length>0){
            // const istString = moment.tz(new Date().toISOString(), "Asia/Singapore").format().slice(0, 16) + ":00.000Z";
            const curr_day = moment.tz(new Date().toISOString(), "Asia/Singapore").day();
            // console.log('istString',istString);
            let rm_day = fulldays.findIndex(e=>e==_.lowerCase(arr[0]));
            if(rm_day==-1){
                rm_day = shortdays.findIndex(e=>e==_.lowerCase(arr[0]));
            }
            if(rm_day==-1){
                rm_day = shortdays1.findIndex(e=>e==_.lowerCase(arr[0]));
            }
            if(rm_day==-1){
                return {status:0,message:'Invalid date'};
            }
            let day_diff = 0;
            if(rm_day>curr_day){
                day_diff = rm_day-curr_day;
            }else{
                day_diff = (7-curr_day)+rm_day;
            }
            let idx = query.findIndex(e=>arr[0]==e);
            d_str = query[idx];
            if(idx>0 && _.lowerCase(query[idx-1])=='next'){
                day_diff += 7;
                d_str = query[idx-1]+' '+query[idx];
            }
            // console.log('day_diff',day_diff);
            let date = moment.tz(new Date(),"Asia/Singapore").add(day_diff,'d');
            // console.log('date',date);
            let f_date = moment(date).date();
            let f_mon = moment(date).month();
            return {status:1,month:f_mon,date:f_date,d_str:d_str};
        }else{
            return {status:0,message:'Invalid date'};
        }
    },
    getTodayTomorrow: (query) => {
        let arr = query.filter(e=>{
            if(
                _.lowerCase(e)=='today'||_.lowerCase(e)=='tomorrow'
            ){
                return true;
            }
        });
        let d_str = '';
        if(arr && arr.length>0){
            d_str = arr[0];
            let date = moment.tz(new Date(),"Asia/Singapore");
            if(_.lowerCase(arr[0])=='tomorrow'){
                date = moment.tz(new Date(),"Asia/Singapore").add(1,'d');
            }
            // console.log('date',date);
            let f_date = moment(date).date();
            let f_mon = moment(date).month();
            return {status:1,month:f_mon,date:f_date,d_str:d_str};
        }else{
            return {status:0,message:'Invalid date'};
        }
    }
};