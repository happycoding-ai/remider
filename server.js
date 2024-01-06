require('dotenv').config();
const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const encrypt = require("mongoose-encryption");
const bodyParser = require('body-parser');
const _ = require("lodash");
const cron = require("node-cron");
const moment = require("moment-timezone");
const date = require('date-and-time');
const app = express();
const { sendMessage, moreFilterTaskTime, extractClientNumber, curretTimeAsPerTimezone } = require("./utils/utils.js");
const asyncHandler = require('express-async-handler')

const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
if (process.env.USE_TWILIO != "no") {
    client = new twilio(SID, AUTH_TOKEN);
}
const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');
const nlp = winkNLP(model);
const its = nlp.its;
const as = nlp.as;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connecting to database
mongoose.connect(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: true })

var encKey = process.env.SOME_32BYTE_BASE64_STRING;
var sigKey = process.env.SOME_64BYTE_BASE64_STRING;

// Database schema
const reminderSchema = new mongoose.Schema({
    taskName: String,
    taskTime: Date,
    mobile: String
});

const clientSchema = new mongoose.Schema({
    mobile: { type: String, index: { unique: true }, required: true },
    name: String,
    timezone: String,
    Status: String
});

//reminderSchema.plugin(encrypt, {
//  encryptionKey: encKey,
//  signingKey: sigKey,
//  encryptedFields: ['taskName']
//});
const Reminder = mongoose.model('Reminder', reminderSchema);
const ClientInfo = mongoose.model('CleintTB', clientSchema);


// Searches the database for reminders per minute
cron.schedule('* * * * *', () => {
    console.log("Checking database...");
    const currTime = new Date();
    console.log(currTime);
    Reminder.find({ taskTime: { $lte: currTime } }, (err, tasks) => {
        if (err) {
            console.log(err);
        } else {
            // Creating a throttled function that sends messages slowly
            var throttledFunction = _.throttle((task) => {
            const clnMobile = `${task.mobile}`;
            const clientInfo = ClientInfo.findOne({ mobile:{ $eq: clnMobile} }).exec();
            const taskTime= moment.tz(`${task.taskTime}`, clientInfo.timezone).format('MMMM D, YYYY H:mm:ss');
                if (process.env.USE_TWILIO != "no") {
                    client.messages
                        .create({
                            body: `*${task.taskName}* @ ${taskTime}`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + task.mobile
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!` + response);
                            }
                        }).then(message => console.log(message));
                } else {
                    console.log("[REMINDER SENT]", task.taskName);
                }
            }, 1000);

            // Calling throttled function to send message
            for (var i = 0; i < tasks.length; i++) {
                throttledFunction(tasks[i]);
            }

            // Removing reminded tasks
            tasks.forEach((task) => {
                task.remove();
            });
        }
    });
    console.log("Search complete");
});

app.post("/save", (req, res) => {
    const mobile = req.body.mobile;
    const name = req.body.name;
    const timezone = req.body.timezone;
    const status = req.body.status;
    console.log(mobile, name, timezone, status);
    if (mobile == undefined || name == undefined || timezone == undefined) {
        sendMessage(`mobile, name, timezone is missing`, res);
        return
    }

    const clientInfo = new ClientInfo({
        mobile,
        name,
        timezone,
        status
    });

    clientInfo.save((err) => {
        if (err) {
            if (err.message.split(" ")[0] === "E11000") {
                ClientInfo.findOneAndUpdate({ mobile }, { name, timezone, status }, (err) => {
                    if (err) {
                        console.log(err)
                    } else {
                        sendMessage(`Save the client information`, res);
                        
                        client.messages
                        .create({
                            body: `Welcome to *Whtsapp Reminders*. This is our first version, and we hope to continue to improve it with your support.  \n\nTo create a Reminder, just type it as you would write it to a person. For eg “dinner with friends next tue 730pm” or “730pm dinner with friends 12 oct”. \n\nMainly each reminder has a topic, a date or day, and time (in am/pm format), written in any order. Do note that a month or a day can be written in full form (”tuesday") or as 3 letters (”tue”). If you don't indicate a day or date, it will use today’s date.\n\nThe time zone you provide will be used to remind you, and we will send a message exactly at the time you requested the reminder.`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + mobile
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!` + response);
                            }
                        }).then(message => console.log(message));
                    }
                });
            } else {
                console.log(err)
            }
        } else {
            sendMessage(`Save the client information`, res);
        }
    });
});

// Handles incoming messages
app.post("/incoming", asyncHandler(async (req, res) => {
    const mobile = extractClientNumber(req.body.From);
    const sentence = req.body.Body;
    const clientInfo = await ClientInfo.findOne({ mobile }).exec();

    if (clientInfo == undefined) {
        sendMessage(`Please register with us for getting reminder.`, res);
        return;
    }
   // View Reminders
    if (sentence.match(/^\ *View all\ */i)) {
        console.log("view");
        Reminder.find(
            { mobile },
            (err, foundTasks) => {
                if (err) {
                    console.log(err);
                } else if (foundTasks.length) {
                    const upcomingTasks = [];
                    foundTasks.forEach((task) => {
                       // var subMessage = `*${task.taskName}* at *${moment.tz(task.taskTime, clientInfo.timezone).format('MMMM D, YYYY h:mm a')}* \n`;
                        client.messages
                        .create({
                            body: `*${task.taskName}* on ${moment.tz(task.taskTime, clientInfo.timezone).format('MMMM D YYYY H:mm:ss')}.`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + mobile
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!` + response);
                            }
                        }).then(message => console.log(message));
                    });
                } else if (!foundTasks.length) {
                    sendMessage("It appears you have no scheduled reminders", res);
                }
            }
        );
        return;
    }
    // If Delete Action
    if (sentence.match(/^\ *Delete\ */i)) {
        console.log('Delete'+req.body.OriginalRepliedMessageSid);
        var strFull ="";
        await client.messages(req.body.OriginalRepliedMessageSid)
        .fetch()
        .then(message => {
         strFull = message.body;
         });
         var strFull=strFull.split('on');
         if(strFull.length == 2){
         var taskNameDel=strFull[0].replace("Ok 👍, your reminder is set ", '').trim().replaceAll("*",'');
         var taskTimeDel=strFull[1].trim().replace(".",'');
         var taskTimeVar=new Date(taskTimeDel);
         console.log(taskNameDel + "   "+ taskTimeVar);
    
         Reminder.deleteMany({ taskTime: { $lte: taskTimeVar }, taskName: taskNameDel, mobile: mobile} ).then(function (data) {
            if (data.deletedCount > 0) {
                sendMessage("Noted! Reminder removed from list", res); // Success
            } else {
                sendMessage("No such reminder exists", res);
            }
        }).catch(function (error) {
            console.log(error); // Failure
        });
        }
        return;
    }

    // If cencel all action
    if (sentence.match(/^\ *cancel\ *all\ */i)) {
        console.log('cancel all');
        console.log({ mobile })
        Reminder.deleteMany({ mobile }).then(function (data) {
            if (data.deletedCount > 0) {
                sendMessage("Data deleted", res); // Success
            } else {
                sendMessage("No such reminder exists", res);
            }
        }).catch(function (error) {
            console.log(error); // Failure
        });
        return;
    }

    const doc = nlp.readDoc(sentence);
    const entities = doc.entities().out(its.detail);
    let date_entity = entities.find(e => e.type == 'DATE')?.value;
    let time_entity = entities.find(e => e.type == 'TIME')?.value;

    [time_entity, replace_text] = moreFilterTaskTime(time_entity, sentence);
    let taskName = sentence.replace(date_entity, '').replace(replace_text, '').trim();
    console.log(date_entity + "  "+ time_entity);
    if (date_entity == undefined && time_entity == undefined) {
        sendMessage("Sorry 🙃, we were unable to recognize your input, Here are some tips:- \n\n• We can only recognize limited responses related to scheduling, viewing, deleting Reminders \n\n• Each reminder has a subject, a day/date, and time \n\n Accepted options for day/date include “next tue” or “next tuesday”, “today”, “tomorrow”, “12 sept”, “sept 12” \n\n• Accepted options for time include “9:30pm”, “930 pm”. We don't accept 24hrs time format yet \n\n• If you have other issues or feedback, you may email us at whtsappt@gmail.com \n", res);
        return
    } else if (date_entity == undefined && time_entity != undefined) {
        date_entity = "";
    }

    const sugar = require('sugar');
    sugar.Date.setOption('newDateInternal', function () {
        return curretTimeAsPerTimezone(clientInfo.timezone);
    });

    let taskTime = sugar.Date.create(date_entity + " " + time_entity);

    if (curretTimeAsPerTimezone(clientInfo.timezone) >= taskTime) {
        if (!date_entity.includes(taskTime.getFullYear().toString()) &&
            curretTimeAsPerTimezone(clientInfo.timezone).toDateString() != taskTime.toDateString()) {
            taskTime = moment(taskTime).add(1, "year").toDate();
        } else {
            sendMessage("We cannot set your reminder at old date time", res);
            return;
        }
    }

    let tz = moment().tz(clientInfo.timezone).utcOffset();
    let offset = (taskTime.getTimezoneOffset() + tz) * 60 * 1000 * -1;
    taskTime.setTime(taskTime.getTime() + offset);

    if (isNaN(taskTime)) {
        sendMessage("Please enter your date and time properly. Ex: Jan 30 at 2am or 30th Jan at 2am", res);
        return;
    }

    // Creating reminders
    console.log('Reminder created for:', moment.tz(taskTime, clientInfo.timezone).format('YYYY-MM-DDTHH:mm'), clientInfo.timezone);
    const taskInfo = new Reminder({ taskName, taskTime, mobile });
    taskInfo.save((err) => {
        if (err) {
            console.log(err);
        } else {
            console.log(taskName);
            taskTime= moment.tz(taskTime, clientInfo.timezone).format('MMMM D, YYYY H:mm:ss');           
            sendMessage(`Ok 👍, your reminder is set \n*${taskName}* on \n${taskTime}`, res);
        }
    });
}));

app.get("/", (req, res) => {
    res.send("Hi! You've just found the server of Reminder. Welcome");
});

app.listen(process.env.PORT || 3070, () => {
    console.log("Server started."); 
});
