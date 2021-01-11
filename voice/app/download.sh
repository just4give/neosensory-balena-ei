#!/bin/sh
#This script downloads WASM classifier using Edge Impulse API
# API Key and Project ID are defined as environment variables in BalenaCloud

# Download Autism Sound classifier 

# AUTISM_SOUND_EI_API_KEY=ei_07c6d2702563436d1388fa51320d90806a15c21ce960b165
# AUTISM_SOUND_EI_PROJECT_ID=15172

curl --request GET \
  --url "https://studio.edgeimpulse.com/v1/api/$AUTISM_SOUND_EI_PROJECT_ID/deployment/download?type=wasm" \
  --header "accept: application/zip" \
  --header "x-api-key: $AUTISM_SOUND_EI_API_KEY" --output wasm.zip

unzip -o wasm.zip && rm wasm.zip

mv ./edge-impulse-standalone.js ./autism-sound/edge-impulse-standalone.js
mv ./edge-impulse-standalone.wasm ./autism-sound/edge-impulse-standalone.wasm

# Download Snoring Sound classifier 

# SNORE_SOUND_EI_API_KEY=ei_350dcc0ea6481a22a4b969b08d4df19ac42b5b8522059d70
# SNORE_SOUND_EI_PROJECT_ID=15240

curl --request GET \
  --url "https://studio.edgeimpulse.com/v1/api/$SNORE_SOUND_EI_PROJECT_ID/deployment/download?type=wasm" \
  --header "accept: application/zip" \
  --header "x-api-key: $SNORE_SOUND_EI_API_KEY" --output wasm.zip

unzip -o wasm.zip && rm wasm.zip

mv ./edge-impulse-standalone.js ./snore-sound/edge-impulse-standalone.js
mv ./edge-impulse-standalone.wasm ./snore-sound/edge-impulse-standalone.wasm

curl --request GET \
  --url "https://studio.edgeimpulse.com/v1/api/$ASL_EI_PROJECT_ID/deployment/download?type=wasm" \
  --header "accept: application/zip" \
  --header "x-api-key: $ASL_EI_API_KEY" --output wasm.zip

unzip -o wasm.zip && rm wasm.zip

mv ./edge-impulse-standalone.js ./asl-image/edge-impulse-standalone.js
mv ./edge-impulse-standalone.wasm ./asl-image/edge-impulse-standalone.wasm


# default WASM classifier will be loaded if curl request fails
exit 0