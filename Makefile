
VERSION=`git tag | tail -1`
ALLOW_DB_RESET=0
PAYMENT_BOT_HOST='ws://nem-nodejs-bot.herokuapp.com:29081'
APP_NAMESPACE='pacnem'
CREDITS_SINK='TBQBOBWEJWU3KDFJWSCNHJW4VFIYRZ5Y7UYAHK3Y'
MONGODB_URI='mongodb://localhost/pacNEM'
NODE_ENV='production'

set-env:
        @export ALLOW_DB_RESET
        @export PAYMENT_BOT_HOST
        @export APP_NAMESPACE
        @export CREDITS_SINK
        @export MONGODB_URI
        @export NODE_ENV

install:
        echo "Now building and installing PacNEM ${VERSION}.."
        npm install

start: set-env
        echo "Now building and deploying PacNEM ${VERSION}.."
        npm start