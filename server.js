require('dotenv').config();
const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const encrypt = require("mongoose-encryption");
const bodyParser = require('body-parser');
const _ = require("lodash");
const cron = require("node-cron");
const moment = require("moment-timezone");
const app = express();
const { extractClientNumber, sendMessage, testInput } = require("./utils/utils.js");

const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
if(process.env.USE_TWILIO != "no") {
    client = new twilio(SID, AUTH_TOKEN);
}

const sugar = require('sugar')

const winkNLP = require( 'wink-nlp' );
const model = require( 'wink-eng-lite-web-model' );
const nlp = winkNLP( model );
const its = nlp.its;
const as = nlp.as;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connecting to database
mongoose.connect(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

var encKey = process.env.SOME_32BYTE_BASE64_STRING;
var sigKey = process.env.SOME_64BYTE_BASE64_STRING;

// Database schema
const reminderSchema = new mongoose.Schema({
    taskName: String,
    taskTime: Date,
    taskTimeOG: String,
    clientNumber: String
});

//reminderSchema.plugin(encrypt, {
  //  encryptionKey: encKey,
  //  signingKey: sigKey,
  //  encryptedFields: ['taskName']
//});
const Reminder = mongoose.model('Reminder', reminderSchema);

// Searches the database for reminders per minute
cron.schedule('* * * * *', () => {
    console.log("Checking database...");
    const currTime = new Date();
    console.log(currTime);
    Reminder.find({ taskTime: {$lte: currTime} }, (err, tasks) => {
        if (err) {
            console.log(err);
        } else {

            // Creating a throttled function that sends messages slowly
            var throttledFunction = _.throttle((task) => {
                if(process.env.USE_TWILIO != "no") {
                    client.messages
                        .create({
                            body: `Your Reminder *${task.taskName}*.`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + task.clientNumber
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!`+ response);
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

// Handles incoming messages
app.post("/incoming", (req, res) => {
    const clientNumber = extractClientNumber(req.body.From);
    const timezoneOffset = req.body.TimezoneOffset;

    if(typeof(timezoneOffset) !== "number") {
        sendMessage("timezoneOffset should be in minutes as number", res);
        return;
    }

    // View Reminders
    if (_.lowerCase(req.body.Body.split(' ')[0]) === "view") {
        console.log("view");
        Reminder.find(
            { clientNumber: clientNumber },
            (err, foundTasks) => {
                if (err) {
                    console.log(err);
                } else if (foundTasks.length) {
                    const upcomingTasks = [];
                    foundTasks.forEach((task) => {
                        var subMessage = `*${task.taskName}* at *${task.taskTimeOG}*`;
                        upcomingTasks.push(subMessage);
                    });
                    sendMessage(upcomingTasks.join('\n'), res);
                } else if (!foundTasks.length) {
                    sendMessage("You don't have any upcoming tasks. Create some first. To know how to create type *set* to get insight.", res);
                }
            }
        );
        return;
    } 

    const sentence = req.body.Body;
    const doc = nlp.readDoc(sentence);
    const entities = doc.entities().out(its.detail);
    const date_entity = entities.find(e => e.type == 'DATE')?.value;
    let time_entity = entities.find(e => e.type == 'TIME')?.value;

    if(date_entity == undefined && time_entity == undefined) {
        sendMessage("I don't know what that means. Please check with Help command to create proper reminder.", res);
        return
    }

    let taskName = sentence.replace(date_entity, '').replace(time_entity, '').trim();

    if(time_entity != undefined) {
        [/\d\d\d(am|pm|AM|PM)/g, /\d\d\d\d(am|pm|AM|PM)/g].forEach(regex => {
            const found = time_entity.match(regex);
            if(found) {
                part = found[0].substring(found[0].length, found[0].length-2).toUpperCase();
                hour = found[0].substring(0, found[0].length-4);
                minute = found[0].substring(found[0].length-2, found[0].length-4);
                time_entity = ("0" + hour).slice(-2)+":"+("0" + minute).slice(-2)+part;
            }
        });
    }

    if(time_entity == undefined) {
        let hour = "", minute = "";
        let part = "AM";
        let final_match = "";
        [/\d:\d\d/g, /\d\d:\d\d/g].forEach(regex => {
            found = sentence.match(regex);
            if(found) {
                final_match = found[0];
                [hour, minute] = found[0].split(":");
            }
        });

        taskName = taskName.replace(final_match, "");
        
        hour = parseInt(hour);
        minute = parseInt(minute);
        
        if(hour >= 12 && hour <= 24) {
            hour -= 12; 
            part = "PM";
        }
        
        if(hour >= 0 && hour < 12 && minute >= 0 && minute < 60) {
            time_entity = ("0" + hour).slice(-2)+":"+("0" + minute).slice(-2)+part;
        }   
    }
    
    let taskTime = moment(sugar.Date.create(date_entity +" "+ time_entity, { fromUTC: true })) 
        .add(timezoneOffset, "minutes").toDate();
    
    if(isNaN(taskTime)) {
        sendMessage("Please enter your date and time properly. Ex: Jan 30 at 2am or 30th Jan at 2am", res);
        return;
    }

    if(new Date() >= taskTime) {
        if(!date_entity.includes(taskTime.getFullYear().toString())) {
            taskTime = moment(taskTime).add(1, "year").toDate();
        } else {
            sendMessage("We cannot set your reminder at old date time.", res);
            return;
        }
    }

    
    // Creating reminders
    console.log(`Reminder created for: ${taskTime}`);
    const taskInfo = new Reminder({
        taskName: taskName,
        taskTime: taskTime,
        taskTimeOG: taskTime.toDateString().slice(0, 16) + " at " + taskTime.toTimeString().slice(0, 5),
        clientNumber: clientNumber,
        reminded: false
    });
    taskInfo.save((err) => {
        if (err) {
            console.log(err)
        } else {
            sendMessage(`Ok, will remind about *${taskName}*`, res);
        }
    });
});

app.get("/", (req, res) => {
    res.send("Hi! You've just found the server of Reminder. Welcome");
});

app.listen(process.env.PORT || 3070, () => {
    console.log("Server started.");
});
