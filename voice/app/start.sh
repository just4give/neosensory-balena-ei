#!/bin/bash
cat /proc/asound/cards
chmod +r /usr/src/app/noise.wav
amixer set Micro 50%
amixer set Master 80%
alsactl store

# Run below commands to test out speaker and microphone
# arecord -d4 --rate=44000 test.wav&
# speaker-test -l1 -c2 -t wav
# aplay test.wav

echo "starting nodejs voice inference engine ..."
npm start
echo "stopping nodejs voice inference engine ..."