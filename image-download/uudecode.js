/*---------------------------------------------------------------------------*/
let fs = require('fs');
let uuencode = require('uuencode');
let getopts = require('getopts');

const running_as_script = require.main === module;
/*---------------------------------------------------------------------------*/
// uudecode
// expects a string, for now (perhaps better with a Buffer?)
// 
// This is pretty crude, we don't do much error checking, so just blindly
// dumping a buffer with lots of other crap in it, will not work well. Basically,
// give this one a nice, uuencoded, data chunk.
let uudecode_buffer = function(buf, callback) {
  let decoded;
  const lines = buf.split('\n');

  // except for beginning and end, decode data and store
  let decodedimage_arr = [];
  let finished = false;
  for (let i = 0; i < lines.length - 1 && !finished; i++) {
    if (lines[i].indexOf("begin") >= 0) {
        console.log(`uudecoder: found beginning`);

    } else if (lines[i].indexOf("end") >= 0) {
        console.log(`uudecoder: found end`);
        finished = true;

    } else {
        // middle part, encoded data
        decoded = uuencode.decode(lines[i]);
        if (decoded.length > 0) {
            decodedimage_arr.push(decoded);
        }
    }
  }

  let decodedimage_buff = Buffer.concat(decodedimage_arr);
  console.log(`uudecoder: decoded ${decodedimage_buff.length} bytes.`);

  if (callback) {
    callback(decodedimage_buff);
  }
}
/*---------------------------------------------------------------------------*/
// uudecode a file
// 
// reads it in, decodes, saves to new file.
// does not do much error checking of the contents, but relies on the uudecode_buffer
// function, which in turn also does not error check much.
let uudecode_file = function(inname, outname) {
  console.log(`uudecode: decoding`);
  console.log(`  input: ${inname}`);
  console.log(`  output: ${outname}`);
  fs.readFile(inname, 'utf8', function(err, contents) {
    if (!err) {
        uudecode_buffer(contents, (decoded_image) => {
            console.log(`uudecode: decode completed`);

            if (decoded_image) {
                // decoding good, now store to disk
                console.log(`uudecode: writing image file to disk as ${outname}.`);
                if (outname) {
                  fs.writeFileSync(outname, decoded_image, (err) => {
                    if (err) {
                      console.log(`uudecode: error writing to disk:`);
                      console.log(err);
                    } else {
                      console.log(`uudecode: file written to disk: ${outname}`);
                    }
                  });
                }
            } else {
                console.log(`uudecode: got error.`);
                console.log(decoded_image);
            }
        });
    } else {
        console.log(`uudecode: error reading file ${inname}`);
        console.log(err);
    }
  });
}
/*---------------------------------------------------------------------------*/
exports.uudecode_file = uudecode_file;
exports.uudecode_buffer = uudecode_buffer;
/*---------------------------------------------------------------------------*/
let help = function() {
  console.log(`usage:`);
  console.log(`node.js uudecode.js --input=INPUTFILE --output=OUTPUTFILE`);
  console.log(`notes:`);
  console.log(`   input and output cannot be the same file.`);
  console.log(`   output will be overwritten if existing.`);
}
/*---------------------------------------------------------------------------*/
// we allow running as a module for the downloader script, but we will also
// allow being called separately in order to uudecode a file

if (running_as_script) {
  let options = getopts(process.argv.slice(2), {
      alias: {
          input: 'i',
          output: 'o',
      }
  });

  // check input
  if (!options.input) {
    help();
    process.exit(0);
  }
  if(!fs.existsSync(options.input)) {
    console.error(`error: input file doesn't exist.`);
    help();
    process.exit(1);
  }

  // check output, we will overwrite if existing
  if (!options.output) {
    options.output = options.output + ".jpg";
  }
  if(fs.existsSync(options.output)) {
    console.error(`warning: output file exist and will be overwritten.`);
  }

  // do decode
  uudecode_file(options.input, options.output);
}
/*---------------------------------------------------------------------------*/
