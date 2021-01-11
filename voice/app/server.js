// Load the inferencing WebAssembly module
const AutismSoundModule = require('./autism-sound/edge-impulse-standalone');
const SnoreSoundModule = require('./snore-sound/edge-impulse-standalone');
const WaveFile = require('wavefile').WaveFile;
const fs = require('fs');
// sharp module to retrieve image pixels information
const sharp = require('sharp');
const WebSocket = require('ws');
const { execSync } = require('child_process');
const { exec } = require('child_process');
const mqtt = require('mqtt');
const axios = require('axios');
const api = require('./api.json')
let labelMap = {};
const TelegramBot = require('telegram-bot-api'); 
const TG_TOKEN =  process.env.TG_TOKEN; 
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const bot = new TelegramBot({token: TG_TOKEN}); 
let fileCreated = false;
//read more about sox command and silence 
//http://sox.sourceforge.net/sox.html
//https://digitalcardboard.com/blog/2009/08/25/the-sox-of-silence/comment-page-2/
//const SOX_COMMAND ='sox -t alsa default -b 16 -r 16k ./request.wav silence 1 0.2 10% 1 0.5 10%  trim 0 2';
const SILENCE = process.env.SILENCE || 'silence 1 0.2 1% 1 0.3 1%  trim 0 2'
const SOX_COMMAND = `sox -t alsa default -b 16 -r 16k /var/data/request.wav ${SILENCE}`;
const client = mqtt.connect('mqtt://broker.hivemq.com');
var connected = false;
let lastAudioSent = new Date().getTime();
let inferenceMode=2;

// Classifier module
let classifierInitializedAutismSound = false;
AutismSoundModule.onRuntimeInitialized = function () {
    classifierInitializedAutismSound = true;
};

let classifierInitializedSnoreSound = false;
SnoreSoundModule.onRuntimeInitialized = function () {
    classifierInitializedSnoreSound = true;
};


class EdgeImpulseClassifierAutismSound {


    constructor() {
        this._initialized = false;
    }

    init() {
        if (classifierInitializedAutismSound === true) return Promise.resolve();

        return new Promise((resolve) => {
            AutismSoundModule.onRuntimeInitialized = () => {
                resolve();
                classifierInitializedAutismSound = true;
            };
        });
    }

    classify(rawData, debug = false) {
        if (!classifierInitializedAutismSound) throw new Error('Autism Module is not initialized');

        const obj = this._arrayToHeap(rawData);
        let ret = AutismSoundModule.run_classifier(obj.buffer.byteOffset, rawData.length, debug);
        AutismSoundModule._free(obj.ptr);

        if (ret.result !== 0) {
            throw new Error('Classification failed (err code: ' + ret.result + ')');
        }

        let jsResult = {
            anomaly: ret.anomaly,
            results: []
        };

        for (let cx = 0; cx < ret.classification.size(); cx++) {
            let c = ret.classification.get(cx);
            jsResult.results.push({ label: c.label, value: c.value });
        }

        return jsResult;
    }

    _arrayToHeap(data) {
        let typedArray = new Float32Array(data);
        let numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
        let ptr = AutismSoundModule._malloc(numBytes);
        let heapBytes = new Uint8Array(AutismSoundModule.HEAPU8.buffer, ptr, numBytes);
        heapBytes.set(new Uint8Array(typedArray.buffer));
        return { ptr: ptr, buffer: heapBytes };
    }
}

class EdgeImpulseClassifierSnoreSound {


    constructor() {
        this._initialized = false;
    }

    init() {
        if (classifierInitializedSnoreSound === true) return Promise.resolve();

        return new Promise((resolve) => {
            SnoreSoundModule.onRuntimeInitialized = () => {
                resolve();
                classifierInitializedSnoreSound = true;
            };
        });
    }

    classify(rawData, debug = false) {
        if (!classifierInitializedSnoreSound) throw new Error('Snore Module is not initialized');

        const obj = this._arrayToHeap(rawData);
        let ret = SnoreSoundModule.run_classifier(obj.buffer.byteOffset, rawData.length, debug);
        SnoreSoundModule._free(obj.ptr);

        if (ret.result !== 0) {
            throw new Error('Classification failed (err code: ' + ret.result + ')');
        }

        let jsResult = {
            anomaly: ret.anomaly,
            results: []
        };

        for (let cx = 0; cx < ret.classification.size(); cx++) {
            let c = ret.classification.get(cx);
            jsResult.results.push({ label: c.label, value: c.value });
        }

        return jsResult;
    }

    _arrayToHeap(data) {
        let typedArray = new Float32Array(data);
        let numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
        let ptr = SnoreSoundModule._malloc(numBytes);
        let heapBytes = new Uint8Array(SnoreSoundModule.HEAPU8.buffer, ptr, numBytes);
        heapBytes.set(new Uint8Array(typedArray.buffer));
        return { ptr: ptr, buffer: heapBytes };
    }
}

class Recorder {

    constructor() {
        this.classifierAutismSound = new EdgeImpulseClassifierAutismSound();
        this.classifierSnoreSound = new EdgeImpulseClassifierSnoreSound();
    }

    async init(){
        await this.classifierAutismSound.init();
        await this.classifierSnoreSound.init();
        this.captureVoice();
        execSync("sox -t alsa default -b 16 -r 16k /var/data/noise.wav  trim 0 2");
        execSync("sox /var/data/noise.wav -n noiseprof /var/data/noise.prof");
    }

    captureVoice(){
        let that = this;
        fileCreated = false;
        console.log("Capturing voice ...");
        exec(SOX_COMMAND,(error, stdout, stderr)=>{
            if(!error){
                console.log("voice captured ...");
                execSync("sox /var/data/request.wav /var/data/clean.wav noisered /var/data/noise.prof 0.21");
                console.log("audio cured ...");
                fileCreated = true;
                setTimeout(()=>{
                    that.captureVoice();
                },500)
            }
        })
        
    }

    async run() {
        
      
        //console.log('waiting for sound to be recorded', new Date());
        //execSync(SOX_COMMAND).toString();

        if(fileCreated == true){
            console.log("contine inference...");
            let buffer = fs.readFileSync('/var/data/clean.wav');
    
            if (buffer.slice(0, 4).toString('ascii') !== 'RIFF') {
                throw new Error('Not a WAV file, first four bytes are not RIFF but ' +
                    buffer.slice(0, 4).toString('ascii'));
            }
            let wav = new WaveFile(buffer);
            wav.toBitDepth('16');
    
            let fmt = wav.fmt;
    
            let freq = fmt.sampleRate;
            console.log('Frequency', freq);
            console.log('Channel', fmt.numChannels);
            console.log('Length', wav.data.samples.length);
            console.log('Bits per sample', fmt.bitsPerSample);
    
            // tslint:disable-next-line: no-unsafe-any
            let totalSamples =  wav.data.samples.length / (fmt.bitsPerSample / 8);
            //let totalSamples = 32000;
    
            console.log('Total samples', totalSamples);
            let dataBuffers = [];
    
            for (let sx = 0; sx < totalSamples; sx += fmt.numChannels) {
                try {
                    let sum = 0;
    
                    for (let channelIx = 0; channelIx < fmt.numChannels; channelIx++) {
                        sum += wav.getSample(sx + channelIx);
                    }
    
                    dataBuffers.push(sum / fmt.numChannels);
                }
                catch (ex) {
                    console.error('failed to call getSample() on WAV file', sx, ex);
                    throw ex;
                }
            }
    
            console.log(dataBuffers.length);
            
            try {
    
                let result;
    
                if(inferenceMode == 1){
                    //autism mode
                    result = this.classifierAutismSound.classify(dataBuffers);
                }else if(inferenceMode == 2){
                    //snore mode
                    result = this.classifierSnoreSound.classify(dataBuffers);
                }
    
                console.log(`Inference Mode = ${inferenceMode}`);
                console.log(result);
    
                let maxvalue = 0.8;
                let maxlabel;
                result.results.forEach(item=>{
                    if(item.value>=maxvalue){
                        maxvalue = item.value;
                        maxlabel = item.label
                    }
                })
                //console.log(`Max label ${maxlabel} with confidence ${maxvalue}`);
                if(maxlabel!==undefined && maxlabel !=='unknown'){
                    let confidence = Math.round(maxvalue*100);
                    console.log('------------------------------------------------------');
                    console.log(`Label found ${maxlabel} with confidence ${confidence}  at ` , new Date());
                    console.log('------------------------------------------------------');
                    await bot.sendAudio({
                                        chat_id: TG_CHAT_ID,
                                        caption: `${maxlabel} with ${confidence}% confidence`,
                                        audio: fs.createReadStream(`/var/data/clean.wav`)
                                    })
                    let predictionStr ="";
                    if(inferenceMode === 1){
                        predictionStr = `${inferenceMode},2,${maxlabel}`;
                    }
                    client.publish('/neoosensory/boon/01/tx/predict',predictionStr);
                    let label = labelMap[`${maxlabel}-${inferenceMode}`];
                    if(label){
                        client.publish('/neoosensory/boon/01/rx/buzz',label.frequency);
                    }
                    
    
                }
                
    
      
                
            } catch (error) {
                console.log(error);
            }
        }else{
            //console.log("No voice file generated. Skip...");
        }
      
        

        //execSync('aplay request.wav');
        setTimeout(() => {
            this.run();
        }, 100);
    }



}

api.forEach(m=>{
  m.labels.forEach(n=>{
      labelMap[`${n.name}-${m.id}`]=n;
  })
});

client.on('connect', () => {
    console.log("Connected to MQTT ...");
    client.subscribe('/neoosensory/boon/01/rx/mode');
});

client.on('disconnect', () => {
    console.log("Disonnected from MQTT ...");
    
});
client.on('message', (topic, message) => {

    try {

        if (topic === '/neoosensory/boon/01/rx/mode') {
            inferenceMode = parseInt(message.toString());
            console.log(`Inference mode set to ${inferenceMode}`);
            if(inferenceMode == 2){
                execSync("amixer set Micro 50%");
            }else if(inferenceMode == 1){
                execSync("amixer set Micro 50%");
            }

        }

    } catch (error) {
        console.log("onMessage error: ", error.message);
    }

});


let recorder = new Recorder();
recorder.init();
recorder.run();


