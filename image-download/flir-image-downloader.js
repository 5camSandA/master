'use strict';
/*---------------------------------------------------------------------------*/
// This script handles downloading the image data from the Camera device.
// 
// https://en.wikipedia.org/wiki/YUV
// Y stands for the luminosity component (the brightness)
// U and V are the chrominance (color) components
// 
// TODOs
//      after logging in, send date/time command to set the time
//      error handling
//      pace out according to mesh depth
//      automate all of this, based on eg a variable
//          eg, a running script monitors devices for eg s.image-command
//          when =="run", we run this script to take a picture
/*---------------------------------------------------------------------------*/
// sequence of events
//      power cycle PSU, if called for
//      
//      log in:
//      wait for the login prompt
//          login:
//      send
//          pi
//          
//      wait for the password prompt
//          Password:
//      send
//          raspberry
//          
//      wait for the shellprompt
//          pi@raspberrypi:~$
// 
//      take picture with either, numbers being the dimensions in pixels
//          ./camgo.sh 1024 1024
//          ./camgo.sh 512 512
//          ./camgo.sh 256 256
//          ./camgo.sh 128 128
// 
//      wait for prompt again
//          pi@raspberrypi:~$
// 
//      after a while, read out the picture number,
//          4
//          Y.jpg = 24071
//          U.jpg = 15885
//          Z.jpg = 20080
//      or by looking at the last created file,
//          ls -lt *_Y.jpg | head -n 1
//      will result in eg,
//          -rw-r--r-- 1 pi pi  8868 Jul  3 18:20 7_V.jpg
// const splat = output.split('\n')[0].split(' ');
// const image = {
//   size: splat[5],
//   name: splat[10],
// };
// console.log(image);
/*---------------------------------------------------------------------------*/
let thsq = require('thsq');
let os = require('os');
let fs = require('fs')
let uu = require('./uudecode.js')

const winston = require('winston');
const { createLogger, format, transports } = require('winston');
let logger = {}; // logging handle; created when we have the unique
logger.info = console.log; // temporary until we have created a logger
logger.warn = console.log; // temporary until we have created a logger
/*---------------------------------------------------------------------------*/
// handle options
var getopts = require('getopts');

var options = getopts(process.argv.slice(2), {
    alias: {
        user: 'u',
        device: 'd',
        frontend: 'f',
        server: 's',
        width: 'w',
        help: 'h',
        action: 'a',
        powercycle: 'c',
        patch: 'p',
        quit: 'q',
        list: 'l',
    },

    default: {
        // patch default: require rpi to be patched, and patch if not. No effect
        // at all on already patched devices.
        patch: false,
        action: true,
        frontend: '5d68fb3b-2270-430e-a413-ec6fdfe24ff3',
        help: false,
        list: false,
    }
});

const token = options.user;
const frontend = options.frontend;
const camuniq = options.device;

const image_iso = 200; // needed? seems so, on latest pis, and older seem to accept it
/*---------------------------------------------------------------------------*/
if (options.help || !token || (camuniq && typeof camuniq !== "string")) {
    logger.info('USAGE: node image-downloader.js');
    logger.info('OPTIONS:');
    logger.info('  [-u|--user=TOKEN]:\t user API token.');
    logger.info('  [-d|--device=UNIQUE]:\t camera device unique; if absent, script will list devices');
    logger.info('  [-f|--frontend=FRONTEND_ID]:\t frontend, default: 5d68fb3b-2270-430e-a413-ec6fdfe24ff3');
    logger.info('  [-s|--server=SERVER_URL]:\t server, default: thsq beta');
    logger.info('  [-w|--width=IMAGE_WIDTH]:\t set image dimension (if A, will be A x A)');
    logger.info('  [--no-action]:\t just enter to logged in device, no PSU power-cycle, image-taking, or downloading');
    logger.info('  [--no-powercycle]:\t no PSU powercycle');
    logger.info("  [--no-patch]:\t don't require patched rpi");
    logger.info("  [--no-quit]:\t don't quit after downloading, ie stay in interactive mode");
    logger.info('  [-h|--help]:\t show help');
    process.exit(1);
}
/*---------------------------------------------------------------------------*/
// the image taken will be in this size, squared. Ie, 512 -> 512 x 512 pixels
let image_size;
let ow = parseInt(options.width);
if (Number.isInteger(ow)) {
    image_size = ow;
} else {
    image_size = 256;
}

if (image_size < 64 || image_size > 2048) {
    logger.info(`error, small or large image size chosen, aborting: ${image_size}`);
    process.exit(1);
}
/*---------------------------------------------------------------------------*/
let camdevice;

// holds the username/password for local raspberry pi account

// keep track of when we started, used for dropping old data
const script_start_time = + new Date();
/*---------------------------------------------------------------------------*/
// sequence number, keeps track of how far into the data we are
let lastseqno;
let outgoing_data_queue = [];

// log mode, determines whether to write to file or not
let should_log_to_file = false;

// image file handler
let image_filehandle;
/*---------------------------------------------------------------------------*/
// store message listeners, used eg for jacking in and awaiting eg login prompt
let listeners = [];

let listener_add = function(callback) {
  const ix = listeners.indexOf(callback);
  if (ix > -1) {
    // already existing
  } else {
    listeners.push(callback);
  }
}
/*------------------------------------------------*/
let listener_remove = function(callback) {
  const ix = listeners.indexOf(callback);
  if (ix > -1) {
    listeners.splice(ix, 1);
  }
}
/*------------------------------------------------*/
let listeners_invoke_all = function(chunk) {
  for(let ix in listeners) {
    listeners[ix](chunk);
  }
}
/*---------------------------------------------------------------------------*/
// set up the terminal so we get whatever the user types.
process.stdin.resume();

process.stdin.setEncoding('utf8');

process.stdin.on('end', function () {
    console.log('stdin ended, exiting program');
    process.exit(1);
});
/*---------------------------------------------------------------------------*/
// generate a filename based on unique ID, timestamp, and optional suffix
let get_file_name = function(unique, suffix) {
  return unique.toString() + "_" + script_start_time.toString() + suffix + ".txt";
}
/*---------------------------------------------------------------------------*/
// writes the uuencoded pic to file
// active while we are receiving a uuencoded file
let image_listener = function(input) {
  image_filehandle.write(input.data);
}
/*---------------------------------------------------------------------------*/
// sets up/tears down uuencoded image file to disk
let image_filehandle_logging = function(enabled, input) {
  if (enabled) {
    const filename_image = get_file_name(camuniq, "_image");
    image_filehandle = fs.createWriteStream(filename_image, {flags: 'a'});

    logger.info(`imagetaker: storing image to disk w filename ${filename_image}.`);
    image_listener({data: input}); // register first chunk
    listener_add(image_listener);

  } else {
    logger.info(`imagetaker: closing image file`);
    image_listener({data: input}); // register last chunk
    image_filehandle.end();
    listener_remove(image_listener);

    // now decode the file
    const filename_image = get_file_name(camuniq, "_image");
    uu.uudecode_file(filename_image, filename_image.replace(".txt", ".jpg"));
  }
}
/*---------------------------------------------------------------------------*/
// quit script
// does not affect the Camera device, just local on this machine
let finish_and_quit = function() {
    logger.info(`exiting.`);
    setTimeout(() => {
        // give time for disk and network operations to finish before bailing.
        process.exit();
    }, 1000);
}
/*---------------------------------------------------------------------------*/
// This will download a new shell script to the camera raspberry pi
// This new script will use the ImageCount.txt created by the camera script, to
// find out which picture is the latest, and download that one.
// 
// Notes:
//   will set a variable to indicate we have patched this pi, s.pi-patch
//          if s.pi-patch is missing or != 1, the pi doesn't have this patch
//   this download can fail, also partially, since it is a command
//   first command uses shell >, not >>, since we start fresh on beginning,
//          making it possible to re-run the patching in case it failed
//   we should perform a check of the script received ok before setting s.pi-patch
//          md5sum would be good for that, but it doesn't exist on the pi
//          for now, we just do a ls -l on the script to see that it got through ok
//   the below is nasty due to escaping both javascript and shell, but the contents are
//          ic=$(cat ImageCount.txt) ; sx="_Y.jpg" ; if=$ic$sx
//          size=$(ls -l $if | cut -d ' ' -f 5)
//          echo $size $if
//          uuencode \$if -
let patch_if_necessary = function() {
    logger.info(`pi-patch: Queueing Raspberry Pi patch download.`);

    outgoing_data_queue.push(
        "echo \"ic=\\\$(cat ImageCount.txt) ; sf=\"yuv.jpg\" ; if=\\\$ic\\\$sf\" > dl-latest.sh\n");
    outgoing_data_queue.push(
        "echo \"size=\\\$(ls -l \\\$if | cut -d ' ' -f 5)\" >> dl-latest.sh\n");
    outgoing_data_queue.push(
        "echo \"echo \\\$size \\\$if\" >> dl-latest.sh ; chmod +x ./dl-latest.sh\n");
    outgoing_data_queue.push(
        "echo \"uuencode \\\$if -\" >> dl-latest.sh ; ls -l ./dl-latest.sh\n");

    // we wait until we have at least given the device a chance to receive the script
    setTimeout(() => {
        thsq.setVariable(camuniq, 's', 'pi-patch', "1", (result) => {
            if (result === "device-ok") {
                logger.info(`pi-patch: set s.pi-patch returned ok`);
            } else {
                logger.warn(`pi-patch: set s.pi-patch failed. You can set this manually to 1 in the app.`);
            }
        });
    }, 20000);
}
/*---------------------------------------------------------------------------*/
let get_delay_for_outgoing = function() {
    // for now, hard-coded delay. If high network load or deepin the mesh, the delay
    // should be increased. This function is meant to be extended to adapt the
    // delay accordingly, but for now we just use a hard-coded value.
    return 5000;
}
/*---------------------------------------------------------------------------*/
// Handle the interactive CLI functionality, ie commands from the user
process.stdin.on('data', function (chunk) {
    // we got data on stdin
    if (chunk !== null) {
        logger.info(`got on stdin: ${chunk}`);
        
        if (chunk.length > 128) {
            // ensure that not too much is stored in each such
            // chunk, since we can't push too much in a d-variable
            // XXXX should divide into more segments and push those
            logger.info(`too much data on stdin (>128), dropping it`);
            return;
        }

        if(chunk.indexOf('on') == 0){
            // just turn off the PSU, nothing else
            turn_psu_to(1, () => {
                logger.info(`on: turned PSU on`);
            });
            return;

        } else if(chunk.indexOf('ison') == 0){
            thsq.getVariable(camuniq, 'd', 'ee5v', (res) => {
                let isacked = thsq.isacked(res);
                if (isacked && res.ackedvalue == 1) {
                    logger.info(`PSU: Power supply ON`);
                } else {
                    logger.info(`PSU: Power supply not on, or not yet acked.`);
                }
            });
            return;

        }else if(chunk.indexOf('off') == 0){
            // just turn off the PSU, nothing else
            turn_psu_to(0, () => {
                logger.info(`off: turned PSU off`);
            });
            return;

        } else if(chunk.indexOf('quit') == 0){
            // turn off the PSU, then quit
            if (options.action === true) {
                turn_psu_to(0, () => {
                    finish_and_quit();
                });
            } else {
                finish_and_quit();
            }
            return;

        } else if(chunk.indexOf('drop') == 0){
            // quit without turning off PSU
            finish_and_quit();
            return;

        } else if(chunk.indexOf('patch') == 0){
            // download to the pi, a new script that will just download the latest pic
            patch_if_necessary();
            return;

        } else if(chunk.indexOf('latest') == 0){
            // on patched rpis, we can get the latest picture by a single command
            outgoing_data_queue.push("./dl-latest.sh\n");
            return;

        } else if(chunk.indexOf('nl') == 0){
            // send a single newline
            logger.info('sending newline');
            outgoing_data_queue.push("\n");

        } else if(chunk.indexOf('declunk') == 0){
            // for debugging; sometimes the event log becomes clunked and needs
            // something extra
            logger.info('sending declunker');
            thsq.sendCommand(camuniq, "boutecho\n");

        } else if(chunk.indexOf('cancel') == 0){
            // send ctrl+c, eg aborting running command. So we doesn't need to
            // power cycle the whole pi if we accidently got stuck in something
            logger.info('sending ctrl+c');
            outgoing_data_queue.unshift(Buffer.from('\x03', 'ascii'));
            return;

        } else if(chunk.indexOf('send:') == 0){
            // something to send to the device we are working on
            // first remove the 'send:' and any leading spaces so we can handle
            // both "send:ls" and "send: ls"
            let sendtext = chunk.replace("send:", "").trimStart();
            if (sendtext.length === 0) {
                // empty. Just send a newline, it was likely the intention but got trimmed
                sendtext = "\n";
            }

            // enqueue this outgoing data
            // it will be sent to the device after a while, and thus out on the rpi
            // serial port
            outgoing_data_queue.push(sendtext);
            return;

        } else if(chunk.indexOf('help') == 0){
            logger.info(`available inline commands:`);
            logger.info(`\t send:TEXT - send TEXT to device; no TEXT sends a newline.`);
            logger.info(`\t nl - send a newline.`);
            logger.info(`\t declunk - debugging; send a declunker (empty echo to get reply from rpi).`);
            logger.info(`\t cancel - send ctrl+c.`);
            logger.info(`\t on - turn PSU on.`);
            logger.info(`\t patch - download dl-latest.sh to rpi.`);
            logger.info(`\t latest - on a patched rpi, get the latest picture.`);
            logger.info(`\t ison - check whether the PSU is on.`);
            logger.info(`\t off - turn PSU off.`);
            logger.info(`\t quit - turn off PSU and quit.`);
            logger.info(`\t drop - quit witout turning off PSU.`);
            return;
        }
    }
});
/*---------------------------------------------------------------------------*/
// handle data going to the device
// paced out so that it has time to propagate to the device in the mesh network
let start_listening_for_keyboard_input = function() {
    // set up the terminal so we get whatever the user types.
    process.stdin.resume();

    process.stdin.setEncoding('utf8');

    process.stdin.on('end', function () {
        logger.info('stdin ended, exiting program');
        process.exit(1);
    });

    // periocially check for any keyboard input that is to be sent to a device
    setInterval(function () {
        const data = outgoing_data_queue.shift();

        if (data) {
            const command_output = Buffer.concat([ Buffer.from('bout'), Buffer.from(data) ]);
            logger.info(`Outgoing data ${data.length} bytes to device: ${command_output.toString()}`);

            // send to the device
            thsq.sendCommand(camuniq, command_output.toString());

            // we also set s.bout to what we send to the device
            // XXX wanted to store in s.bout as well for easier traceability,
            // but seemed like it introduced some race condition which made history
            // listener work worse - pausing some s.bin events.
            // thsq.setVariable(camuniq, 's', 'bout', Buffer.from(data).toString(), () => {});
        }
    }, get_delay_for_outgoing());
}
/*---------------------------------------------------------------------------*/
let interesting_chunk = function(seq, lastseq) {
    // is this an interesting chunk?
    //        first chunk we hear (lastseqno is undefined)
    //        next chunk (diff is one)
    //        next chunk, with roll-over 127 -> 0
    if (lastseq === undefined) {return true;};
    if (seq === lastseq + 1) {return true;};
    if (seq === 0 && lastseq === 127) {return true;};
    return false;
}
/*---------------------------------------------------------------------------*/
let hist_listener = function (device, unique, type, varname, data) {
    if (!type || !varname || !data || !data.timestamp || !data.value) {
        return;
    }

    if (unique != camuniq) {
        // don't know why this happens, but we get a callback for a device
        // that we have not regged a listener for, so disregard that.
        logger.info(`histlist: wrong device ${unique} ${type}.${varname}`);
        return;
    }

    if (type === 'd' || varname === 'ee5v') {
        logger.info(`histlist: 5V PSU update: ${data.value}`);
        return;
    } else if (type != 's' || varname != 'bin') {
        logger.info(`histlist: wrong variable: ${type}.${varname}`);
        return;
    }

    if (data.timestamp < script_start_time) {
        // we will receive historical data, but we are not interested in that here
        // so we just disregard. For that, use batch mode or history span mode.
        return;
    }

    let incoming;
    if (typeof(data.value) === "string") {
        // shorter ones with no non-ascii chars comes as a string
        // XXX can also check whether data.value.data exists -> buffer
        incoming = Buffer.from(data.value);
    } else if (data.value.data) {
        incoming = Buffer.from(data.value.data);
    } else {
        logger.info(`histlist: don't understand this data`);
        logger.info(data);
        return;
    }

    if (incoming.length < 2) {
        logger.info(`histlist: too short: ${incoming.length}`);
        return;
    }

    // remove unprintable chars, but leave in eg tabs, newlines
    // ie we remove 0x00--0x07, 0x0e--0x1f, 0x80--0xff
    const data_treated = incoming.subarray(1).toString().replace(/[\x00-\x07\x0e-\x1f\x80-\xff]/g, "");
    let chunk = {
        seqno : incoming[0],
        data : data_treated,
        length : data_treated.length,
        timestamp : data.timestamp,
    };
    logger.info(`histlist: chunk seqno ${chunk.seqno}, ${chunk.length} B: ${chunk.data}`);

    if ((lastseqno != undefined) && chunk.seqno > (lastseqno + 1)) {
        // unexpected sequence number sanity check
        logger.info(`histlist: seqnos something wrong, ${chunk.seqno} > ${lastseqno} + 1, missed a chunk?`);
        return;
    }

    if (interesting_chunk(chunk.seqno, lastseqno)) {
        lastseqno = chunk.seqno;
        listeners_invoke_all(chunk);

    } else {
        logger.info(`histlist: skipped chunk ${chunk.seqno} ${lastseqno}`);
    }
};
/*---------------------------------------------------------------------------*/
let null_callback = function() {
  /* does nothing */
}
/*---------------------------------------------------------------------------*/
/* when we know the power supply is on, we can start working... */
let register_variable_listener = function() {
    let histlistkeeper = thsq.addHistoryListener(
        camuniq, "s", "bin",
        { num: 0 },
        hist_listener
    );

    // To be positively sure that we get the d.ee5v updates in time, we add a 
    // history listener to that variable too. It doesn't act on the data, we just
    // want to tell thsq.js that this is interesting data to us.
    let histlistkeeper_ee5v = thsq.addHistoryListener(
        camuniq, "d", "ee5v",
        { num: 0 },
        null_callback
    );
}
/*---------------------------------------------------------------------------*/
// this is the sequence of events to run on the rpi after we have booted it up.
// It consists mostly of a sequence of triggers, ie output from the rpi on the
// serial port, and our response.
// 
// Weak point: it will not handle if the trigger is divided into several chunks,
// eg if "Password:" is sent in two chunks of "Pass" then "word:".
// 
// Each sequence has,
//    trigger - what triggers this sequence event, ie is matched against rpi output
//    log - what to print to console
//    next_command - what to send to rpi on trigger
//    callback - on trigger, may do things here, and optionally return a command
//          to use _instead_ of next_command
// 
// Cronological order of .push().
//const prompt = require("prompt-sync")({ sigint: true });
//With readline
//const usrname = prompt("Please enter username for pi: ");

//const passwrd = prompt("Please enter the password for pi: ");

const rpi_login = {username: "pi\n", password: "raspberry\n"};
//const rpi_login={username: `${usrname}\n`, password: `${passwrd}\n`}

let event_sequence = [];

event_sequence.push({
    // log in to rpi
    trigger: "login:", 
    log: `login: sending username`,
    next_command: rpi_login.username,
    callback: undefined,
  });

event_sequence.push({
    // logging in
    trigger: "Password:", 
    log: `login: sending password`,
    next_command: rpi_login.password,
    callback: undefined,
  });

event_sequence.push({
    // first prompt
    trigger: "pi@raspberrypi:~$", 
    log: `imagetaker: got shell; setting date`,
    next_command: undefined,
    callback: function(input) {
        // set time on the rpi
        // note, it's not crucial that it is exact, it's just to get a crude notion of
        // semi-accurate time on the device. The reason is that the rpi spends most time
        // off, and has internet connection, hence drifts a lot. This is simply to get
        // pictures with a kind-of-ok timestamp for eg sorting purposes.
        let tnow = + new Date();
        tnow = Math.floor(tnow / 1000, 0); // we get a timestamp in ms, but 'date' expects in secs.
        let set_date_command = `sudo date --set='@${tnow}'\n`;
        return set_date_command;
    },
  });

event_sequence.push({
    // after setting date, getting prompt again
    trigger: "pi@raspberrypi:~$", 
    log: `imagetaker: taking picture`,
    next_command: `./flircamgo.sh ${image_size} ${image_size} ${image_iso}\n`,
    //next_command: `./camgo.sh\n`,
    //next_command: `python3 /home/pi/Desktop/repo/master/flirsave.py\n`,
    callback: undefined,
  });


event_sequence.push({
    // after taking a picture, getting prompt again
    trigger: "pi@raspberrypi:~$", 
    log: `imagetaker: picture taken, finding last`,

    // list the last updated luminance picture
    // note, this only works well if the time is set properly on the device
    next_command: `ls -lt *irtest1.jpg | head -n 1\n`,
    callback: undefined,
  });

event_sequence.push({
    // after listing files, eg "-rw-r--r-- 1 pi pi     0 Jul  3  2018 12_Y.jpg"
    trigger: "pi pi",
    // trigger: "raspberrypi",
    log: `imagetaker: downloading picture`,
    next_command: `date\n`, // just a backup, the callback would give the right command
    callback: function(input) {
        // note: this step is a little sensitive and depends on the Camera device
        // not splitting the output in a bad place
        // It also depends on that the correct time has previously been set, and
        // never been run with "in the future"-time
        // from eg "-rw-r--r-- 1 pi pi     0 Jul  3  2018 12_Y.jpg\r\npi@raspberrypi"
        let splat = input.split(".jpg")[0].split(" ");
        let dl_filename = splat[splat.length - 1] + ".jpg";
        
        // XXX here we shouid/could log the filename, time, size separately somewhere
        
        return `uuencode ${dl_filename} -\n`;
    },
  });

event_sequence.push({
    // start of a uuencoded file
   
    trigger: "begin ",
    log: `imagetaker: saving file to disk`,
    next_command: undefined,
    callback: function(input) {
        image_filehandle_logging(true, input);
    },
  });

event_sequence.push({
    // end of a uuencoded file
    trigger: "end",
    log: `imagetaker: image file downloaded`,
    next_command: undefined,
    callback: function(input) {
        image_filehandle_logging(false, input);
    },
  });
/*---------------------------------------------------------------------------*/
// sequence stepper
// this is given a set of conditions in the ´this´ object, based on each step
// in `event_sequence` array. It will check if a condition is fulfilled based on
// rpi output, and figure out what command to respond with in order to progress
// the sequence. It is the main mechanism to move from starting up the rpi,
// to downloading a picture taken.
let sequence_checker = function(chunk) {
  if (!chunk || !chunk.data) {return}

  let input = chunk.data;
  if (this.sequenceevent.trigger && input.indexOf(this.sequenceevent.trigger) >= 0) {
    // triggered!
    logger.info(this.sequenceevent.log);
    
    // here, we run any callback to perhaps adjust the command sent to the rpi
    // eg using output from 'ls' to decide file to download
    let adjusted_command;
    if (this.sequenceevent.callback) {
        adjusted_command = this.sequenceevent.callback(input);
    }
    if (adjusted_command) {
        outgoing_data_queue.push(adjusted_command);
    } else {
        // no, no callback wanted to adjust the command so we send the usual
        if (this.sequenceevent.next_command) {
            outgoing_data_queue.push(this.sequenceevent.next_command);
        }
    }

    // set up next sequence trigger etc
    let next_sequence_item = event_sequence.shift();
    if (next_sequence_item) {
      this.sequenceevent = next_sequence_item;

    } else {
      // this whole sequence affair is all over by now
      logger.info(`imagetaker: all done in sequence`);
      this.sequenceevent.trigger = undefined; // to stop from repeating this

      if (options.quit === false) {
            // user requested us to just stay in interactive mode, so we don't do
            // anything else now.
      } else {
            // turn off the PSU, then quit
            turn_psu_to(0, () => {
                finish_and_quit();
            });
      }
    }
  }
}
/*---------------------------------------------------------------------------*/
let register_basic_listeners = function() {
    logger.info(`login: registrering listeners`);
    logger.info(`login: interactive prompt active, type "help" for commands.`);
    register_variable_listener();
    start_listening_for_keyboard_input();
}
/*---------------------------------------------------------------------------*/
let login_to_pi = function() {
    // PSU is cycled and is on, will now await login prompt and perform login
    // bootup will take a little more than a minute.
    register_basic_listeners();

    logger.info(`login: checking pi-patch state...`);

    // check state of rpi patch before we continue, since we will (by default)
    // patch if unpatched
    if (options.patch) {
        thsq.getVariable(camuniq, 's', 'pi-patch', (res) => {
            if (res && res.value && res.value === '1') {
                // patched device
                logger.info(`login: patched device`);

            } else {
                logger.info(`login: non-patched device`);
                // XXX TODO login, run patched-download
                logger.info(`login: Now patching device.`);
            }
        });

    } else {
        logger.info(`login: not patching`);

        // start running the sequence of events for
        //    logging in
        //    setting up
        //    taking picture
        //    downloading the picture
        //    cleaning up and shutting down the pi
        logger.info(`login: waiting for login prompt`);

        // bind the first sequence environment, ie trigger, what to do next, etc
        let first_sequence_item = event_sequence.shift();
        sequence_checker = sequence_checker.bind({sequenceevent: first_sequence_item});

        // start listening to rpi output
        listener_add(sequence_checker);
        // XXX TODO login, patch device, then run download
    }
}
/*---------------------------------------------------------------------------*/
let turn_psu_to = function(on, cb) {
    if (isNaN(on) || (on != 0 && on != 1)) {
        logger.info(`error: argument to turn_psu_to is wrong: ${on}`);
        process.exit(0);
    }

    if (on) {
        logger.info(`PSU: turning on`);
    } else {
        logger.info(`PSU: turning off`);
    }

    /* reset seqno we are listening for, since the cc13xx will do that too */
    lastseqno = undefined;

    // set power to desired value, then periodically check to see that it has
    // been received.
    thsq.setVariable(camuniq, 'd', 'ee5v', on, (result) => {
        if (result === "device-ok") {
            logger.info(`PSU: set d.ee5v variable OK`);

            let variable_check_timer = setInterval(() => {
                thsq.getVariable(camuniq, 'd', 'ee5v', (res) => {
                    logger.info(`got ee5v,`);
                    logger.info(JSON.stringify(res));
                    let continue_wo_av = false;
                    if (res.ackedvalue === undefined) {
                        logger.info(`ee5v has no AckedValue, assuming ok and moving on.`);
                        continue_wo_av = true;
                    }

                    let isacked = thsq.isacked(res);
                    if (continue_wo_av || (isacked && res.ackedvalue == on)) {
                        logger.info(`PSU: Power supply OK`);
                        clearInterval(variable_check_timer);
                        cb();

                    } else {
                        logger.info(`PSU: waiting for OK (${on})... (ee5v == ${res.ackedvalue}, acked? ${isacked})`);
                    }
                });
            }, 5000);
        } else {
            logger.info(`PSU: setting d.ee5v variable failed. Aborting.`);
            finish_and_quit();
        }
    });
}
/*---------------------------------------------------------------------------*/
let power_cycle_psu = function() {
  logger.info(`Performing PSU power cycle to ensure we are in a known state`);

  turn_psu_to(0, () => {
    turn_psu_to(1, () => {
        login_to_pi();
    });
  });
}
/*---------------------------------------------------------------------------*/
let list_devices = function(devices) {
    let unique;
    let dlist = [];
    let onedayago = + new Date();
    onedayago = onedayago - 24*60*60*1000;

    for(unique in devices) {
        let lastact = devices[unique]["meta"]["lastactivity"]["value"];
        let name = thsq.devicename(devices[unique]);
        let eui = thsq.deviceEUI(devices[unique]);
        const devtype = thsq.deviceidstring(devices[unique], "platform");
        if (devtype === "camera_v4_us" || devtype === "camera_v5_us") {
            // we are only interested in cameras
            dlist.push({unique: unique,
                        name: name,
                        eui: eui,
                        lastactivity: lastact
                      });
        }
    }

    // sort with latest activity last, since we are interested in devices that do stuff
    dlist.sort((a,b) => {
        return b.lastactivity - a.lastactivity;
    });

    let i;
    let lineprinted = false;
    for(i = dlist.length - 1; i >= 0; i--) {
        if (!lineprinted && dlist[i].lastactivity > onedayago) {
            // print a line to indicate which devices have been active within a day
            logger.info(`-------------------------------------active last 24h:`);
            lineprinted = true;
        }
        logger.info(`${dlist[i].unique} ${dlist[i].eui} ${dlist[i].name}`);
    }
}
/*---------------------------------------------------------------------------*/
let start_logging = function(unique) {
    // set up logging to file and console

    logger = winston.createLogger({
      level: 'debug',

      format: format.combine(
        format.timestamp(),
        format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
      ),

      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: get_file_name(unique, "")}),
      ],
    });
}
/*---------------------------------------------------------------------------*/
thsq.init({ token: token, frontend: frontend, backend: options.s }, function (devices) {
    if (!devices) {
        logger.info(`log-in failed. Please retry.`);
        process.exit(1);
    }

    if (!camuniq || options.list) {
        // no device provided - list devices and exit
        list_devices(devices);
        process.exit(0);
    }

    // sanity check
    if (!devices[camuniq]) {
        logger.info(`error: device unique ${camuniq} not in list of devices`);
        process.exit(2);
    }

    // check that the AP is online, or we have no way of reaching it
    let masterdid = thsq.variablevaluestring(devices[camuniq], 'meta', 'master', undefined);
    let masterid;
    for(let ix in thsq.claimeduniqueids) {
      if (thsq.claimeduniqueids[ix] == masterdid) {
        masterid = ix;
      }
    }
    if (!masterid) {
        logger.info(`no AP found for this device (another account?), continuing anyway.`);
    } else {
        // we have the AP, but is it online?
        let mstates = JSON.parse(thsq.variablevaluestring(devices[masterid], 'meta', 'states', '[]'));
        let ap_is_online = mstates.includes("connected");
        logger.info(`master id is: ${masterid}, Online? ${ap_is_online}`);
        if (!ap_is_online) {
            logger.info(`AP is offline, exiting. Try again later.`);
            process.exit(3);
        }
    }

    // ok, we continue
    start_logging(camuniq);
    logger.info(`Working with "${thsq.devicename(devices[camuniq])}", unique: ${camuniq} EUI: ${thsq.deviceEUI(devices[camuniq])}`);
    camdevice = devices[camuniq];

    // show a warning if this device hasn't been seen within the hour
    const within = script_start_time - 60*60*1000;
    const lastact = devices[camuniq]["meta"]["lastactivity"]["value"];
    if (lastact < within) {
        logger.info(`WARNING, this device haven't been online in a while, double check that it is on`);
    }

    logger.info(`using selected image size: ${image_size} x ${image_size}`);

    // log that we are running scripts on this device
    thsq.getUser((data) => {
        if (data && data.login) {
            logger.info(`user: logged ${data.login}`);
            thsq.setVariable(camuniq, 's', 'scriptrun', data.login, (result) => {});
        } else {
            logger.info(`user: logged unknown`);
            thsq.setVariable(camuniq, 's', 'scriptrun', "unknown", (result) => {});
        }
    });

    if (options.action === false) {
        // assume the rpi is powered up, and we are logged in to the shell
        // 
        // the script basically does nothing but list whatever the device sends,
        // and sends whatever the user commands.
        logger.info(`login: only logging in, no PSU or other action taken.`);
        logging(true);
        register_basic_listeners();

    } else {
        // normal use-case.
        // logging is started when we have the prompt
        // start chain of steps to download an image
        if (options.powercycle === false) {
            // assume pi is already powered up
            // XXXX this will fail since the prompt is already sent, ie we will miss it
            logger.info(`Assuming Pi is already powered up and we've received login prompt.`);
            logger.info(`NOTE: d.ee5v must be 1, or this will fail.`);
            login_to_pi();

            // fake getting the login prompt so the procedure may continue
            // also need to reset the lastseq since the cc13xx will have an unknown
            // sequence number in use
            lastseqno = undefined;
            sequence_checker({data: "login:"});
        } else {
            // first step, power cycle the PSU
            power_cycle_psu();
        }
    }
});
/*---------------------------------------------------------------------------*/
